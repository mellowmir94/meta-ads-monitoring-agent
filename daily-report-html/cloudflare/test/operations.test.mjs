import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { scheduledOperations, OPERATIONS_LIMITS } from '../src/operations.js';
import { validateManualBackup } from '../src/manual-backup.js';
import { validManualReport } from '../src/manual-values.js';
import { harness, month, jobBody, manualCall, signedCookies } from './helpers/operations.mjs';

test('operations endpoints require dashboard and upload sessions and an active lease', async () => {
  const h = harness({ env: { ALLOW_LOCAL_API: 'false', SESSION_SIGNING_SECRET: 'local-fixture-only' } });
  const paths = ['/api/operations', '/api/operations/backups', '/api/operations/jobs', '/api/operations/jobs/example/resume', '/api/operations/check'];
  for (const path of paths) {
    assert.equal((await h.call(path)).status, 401);
    assert.equal((await h.call(path, 'GET', undefined, { cookie: await signedCookies('local-fixture-only', false) })).status, 403);
  }
  const headers = { cookie: await signedCookies('local-fixture-only') };
  assert.equal((await h.call('/api/operations', 'GET', undefined, headers)).status, 200);
  h.env.CONCURRENCY_LIMITER = null;
  assert.equal((await h.call('/api/operations', 'GET', undefined, headers)).status, 503);
});

test('missing operations binding fails explicitly without changing shared health semantics', async () => {
  const h = harness(); delete h.env.OPERATIONS_JOBS;
  const result = await h.call('/api/operations');
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'operations_unavailable');
  assert.deepEqual(await (await h.call('/api/health')).json(), {
    ok: true, storage: true, grafanaConfigured: false, loginConfigured: false, concurrencyHealthy: true, authMode: 'built-in-login'
  });
  assert.equal((await h.call('/api/pitstop-history', 'PUT', month('2026-01'))).status, 200);
});

test('archive alarms persist progress across restart and resume skips completed months', async () => {
  let failed = true;
  const h = harness({ beforeKvPut: key => { if (key.endsWith('2026-02') && failed) throw new Error('local outage'); } });
  const created = await h.call('/api/operations/jobs', 'POST', jobBody());
  assert.equal(created.status, 202);
  const { job } = await created.json();
  assert.equal(h.kv.size, 0, 'creation only stores a durable job');
  await h.alarm(); await h.alarm();
  let saved = (await (await h.call(`/api/operations/jobs/${job.id}`)).json()).job;
  assert.equal(saved.status, 'failed'); assert.equal(saved.completedMonths, 1);
  assert.equal(saved.months[0].status, 'completed');
  assert.equal(saved.months[1].attempts, 1);
  h.restart(); failed = false;
  const replies = await Promise.all(Array.from({ length: 8 }, () => h.call(`/api/operations/jobs/${job.id}/resume`, 'POST')));
  assert.ok(replies.every(response => response.status === 202));
  await Promise.all([h.alarm(), h.alarm(), h.alarm()]);
  saved = (await (await h.call(`/api/operations/jobs/${job.id}`)).json()).job;
  assert.equal(saved.status, 'completed'); assert.equal(saved.completedMonths, 3); assert.equal(saved.completedRows, 3);
  assert.equal(h.writes.filter(key => key.endsWith('2026-01')).length, 1);
  assert.equal(h.writes.filter(key => key.endsWith('2026-03')).length, 1);
  assert.deepEqual(h.kv.get('pitstop-history:manifest').months.map(item => item.month), ['2026-01', '2026-02', '2026-03']);
  assert.equal(h.kv.get('pitstop-history:month:2026-01').rows[0].channel, 'HQ');
  const before = h.writes.length;
  assert.equal((await h.call(`/api/operations/jobs/${job.id}/resume`, 'POST')).status, 200);
  await h.alarm(); assert.equal(h.writes.length, before);
  assert.equal(await h.storage.getAlarm(), null);
});

test('concurrent job creation is idempotent and rejects key reuse with different data', async () => {
  const h = harness(), headers = { 'idempotency-key': 'local-job-key' };
  const responses = await Promise.all([h.call('/api/operations/jobs', 'POST', jobBody(), headers), h.call('/api/operations/jobs', 'POST', jobBody(), headers)]);
  assert.deepEqual(responses.map(response => response.status), [202, 200]);
  const jobs = await Promise.all(responses.map(response => response.json()));
  assert.equal(jobs[0].job.id, jobs[1].job.id);
  h.restart();
  assert.equal((await h.call('/api/operations/jobs', 'POST', { months: [month('2026-04')] }, headers)).status, 409);
  assert.equal((await (await h.call('/api/operations')).json()).jobs.length, 1);
});

test('outbox recovery after publication and lost checkpoint never reruns the month publisher', async () => {
  const h = harness();
  const { job } = await (await h.call('/api/operations/jobs', 'POST', { months: [month('2026-01')] })).json();
  let publishes = 0, crash = true;
  const publish = h.instance.dependencies.publishArchive;
  h.instance.dependencies.publishArchive = (...args) => { publishes++; return publish(...args); };
  const put = h.storage.put;
  h.storage.put = async (key, value) => {
    if (key === `job:${job.id}` && value.status === 'completed' && crash) { crash = false; throw new Error('simulated checkpoint interruption'); }
    return put(key, value);
  };
  await h.alarm();
  assert.equal(publishes, 1);
  assert.ok(h.kv.get('pitstop-history:manifest'));
  h.restart();
  h.instance.dependencies.publishArchive = () => { throw new Error('must recover committed outbox'); };
  await h.call(`/api/operations/jobs/${job.id}/resume`, 'POST'); await h.alarm();
  assert.equal((await (await h.call(`/api/operations/jobs/${job.id}`)).json()).job.status, 'completed');
  assert.equal(h.kv.get('pitstop-history:manifest').totalRows, 1);
});

test('job and legacy archive writers share a consistent manifest even when KV reads lag', async () => {
  const h = harness();
  await h.call('/api/pitstop-history', 'PUT', month('2025-12'));
  h.env.DASHBOARD_DATA.get = async () => null;
  const a = await (await h.call('/api/operations/jobs', 'POST', { months: [month('2026-01')] })).json();
  await h.alarm();
  await h.call('/api/pitstop-history', 'PUT', month('2026-02'));
  assert.equal((await (await h.call(`/api/operations/jobs/${a.job.id}`)).json()).job.status, 'completed');
  assert.deepEqual(h.kv.get('pitstop-history:manifest').months.map(item => item.month), ['2025-12', '2026-01', '2026-02']);
  assert.equal((await h.call('/api/pitstop-history', 'DELETE')).status, 200);
  assert.equal(h.kv.has('pitstop-history:manifest'), false);
  await h.call('/api/pitstop-history', 'PUT', month('2026-03'));
  assert.deepEqual(h.kv.get('pitstop-history:manifest').months.map(item => item.month), ['2026-03']);
});

test('archive validation rejects invalid rows, duplicate months and oversized bodies before writes', async () => {
  const h = harness();
  for (const body of [null, [], {}, { months: [] }, { months: [month('2026-13')] }, { months: [month('2026-01'), month('2026-01')] },
    { months: [{ month: '2026-02', rows: [{ ...month('2026-02').rows[0], date: '2026-02-30' }] }] },
    { months: [month('2026-01', -1)] }, { months: [{ month: '2026-01', rows: Array(15001).fill(month('2026-01').rows[0]) }] }
  ]) assert.equal((await h.call('/api/operations/jobs', 'POST', body)).status, 400);
  const response = await h.call('/api/operations/jobs', 'POST', { extra: 'x'.repeat(OPERATIONS_LIMITS.requestBytes) });
  assert.equal(response.status, 413); assert.equal(h.kv.size, 0); assert.equal((await h.storage.list()).size, 0);
  assert.equal((await h.call('/api/operations/jobs/missing')).status, 404);
  assert.equal((await h.call('/api/operations/jobs', 'DELETE')).status, 405);
});

test('large archive documents are chunked and complete without exceeding DO value limits', async () => {
  const h = harness(), rows = Array.from({ length: 2500 }, (_, index) => ({ ...month('2026-01').rows[0], pitstop: `HQ ${index}` }));
  const response = await h.call('/api/operations/jobs', 'POST', { months: [{ month: '2026-01', rows }] });
  assert.equal(response.status, 202);
  await h.alarm(); assert.equal(h.kv.get('pitstop-history:manifest').totalRows, 2500);
});

test('manual snapshots roundtrip through the existing checksum and missing-only restore workflow', async () => {
  const legacy = { 'manual-rsa-values': { values: { '2026-08-01': { rsaFuel: 0, rsaJumpstart: 4 } } },
    'manual-b2w-values': { values: { '2026-08-01': 9 }, sharePointValues: { '2026-08-01': 10 }, manualOverrides: { '2026-08-01': 9 } } };
  const h = harness({ legacy });
  const response = await h.call('/api/operations/backups', 'POST', {});
  assert.equal(response.status, 201);
  const { backups } = await response.json(); assert.equal(backups.length, 4);
  assert.deepEqual(Object.fromEntries(h.kv), legacy, 'export must not change legacy or official records');
  for (const item of backups) {
    const download = await h.call(item.downloadUrl); assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition'), /attachment/);
    const backup = await download.json(); assert.equal(backup.checksum, item.checksum);
    await validateManualBackup(backup, item.kind, validManualReport);
    const destination = harness();
    const { preview } = await (await manualCall(destination, item.kind, { action: 'preview', backup })).json();
    const restore = await manualCall(destination, item.kind, { action: 'confirm', backup, expectedRevision: preview.revision });
    assert.equal(restore.status, 200);
    const saved = await (await manualCall(destination, item.kind, undefined, '/backup')).json();
    assert.deepEqual(saved.record.values, backup.record.values);
  }
});

test('backup retention enforces count and age and a failed export preserves good snapshots', async () => {
  const h = harness({ env: { OPERATIONS_BACKUP_MAX_PER_KIND: '2', OPERATIONS_BACKUP_RETENTION_DAYS: '1' } });
  let first;
  for (let index = 0; index < 3; index++) {
    const { backups } = await (await h.call('/api/operations/backups', 'POST', { kind: 'rsa' })).json();
    first ||= backups[0];
    if (index === 0) await h.storage.put(`backup:${first.id}`, { ...first, createdAt: '2020-01-01T00:00:00.000Z' });
  }
  const list = await (await h.call('/api/operations/backups')).json();
  assert.equal(list.items.length, 2); assert.equal((await h.call(first.downloadUrl)).status, 404);
  const before = await h.storage.list({ prefix: 'backup:' });
  h.env.MANUAL_VALUES = { idFromName: x => x, get: () => ({ fetch: async () => { throw new Error('token=secret SELECT * FROM private'); } }) };
  const failed = await h.call('/api/operations/backups', 'POST', { kind: 'rsa' });
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /secret|SELECT/);
  assert.deepEqual(await h.storage.list({ prefix: 'backup:' }), before);
  assert.ok((await (await h.call('/api/operations/backups')).json()).lastError);
});

test('corrupt backups are rejected and cannot be downloaded for restoration', async () => {
  const h = harness();
  const { backups } = await (await h.call('/api/operations/backups', 'POST', { kind: 'rsa' })).json();
  const key = `file:${backups[0].id}:part:0`;
  const stored = JSON.parse(await h.storage.get(key)); stored.record.values['2026-08-01'] = { rsaFuel: 8 };
  await h.storage.put(key, JSON.stringify(stored));
  assert.equal((await h.call(backups[0].downloadUrl)).status, 409);
});

test('backup storage failure rolls back the new snapshot and retention deletions atomically', async () => {
  const h = harness({ env: { OPERATIONS_BACKUP_MAX_PER_KIND: '1' } });
  const { backups } = await (await h.call('/api/operations/backups', 'POST', { kind: 'rsa' })).json();
  const before = await h.storage.list({ prefix: 'backup:' });
  const remove = h.storage.delete;
  h.storage.delete = async key => { if (key === `backup:${backups[0].id}`) throw new Error('local delete failure'); return remove(key); };
  assert.equal((await h.call('/api/operations/backups', 'POST', { kind: 'rsa' })).status, 503);
  assert.deepEqual(await h.storage.list({ prefix: 'backup:' }), before);
  assert.equal((await h.call(backups[0].downloadUrl)).status, 200);
});

test('job history retires oldest completed jobs and never discards unfinished jobs', async () => {
  const h = harness();
  for (let index = 0; index < 100; index++) await h.storage.put(`job:fixture-${index}`, { id: `fixture-${index}`, status: index ? 'failed' : 'completed', createdAt: new Date(index).toISOString() });
  await h.storage.put('idempotency:retired', { id: 'fixture-0', signature: 'fixture' });
  assert.equal((await h.call('/api/operations/jobs', 'POST', { months: [month('2026-01')] })).status, 202);
  assert.equal(await h.storage.get('job:fixture-0'), undefined);
  assert.equal(await h.storage.get('idempotency:retired'), undefined);
  assert.equal((await h.storage.list({ prefix: 'job:' })).size, 100);
  assert.equal((await h.call('/api/operations/jobs', 'POST', { months: [month('2026-02')] })).status, 409);
  assert.ok(await h.storage.get('job:fixture-1'));
});

test('daily snapshots are opt-in and retries only export missing collections for the current MY day', async () => {
  const h = harness();
  await h.internal('/scheduled'); assert.equal((await h.storage.list({ prefix: 'backup:' })).size, 0);
  h.env.OPERATIONS_SCHEDULED_BACKUPS = 'true';
  const original = h.env.MANUAL_VALUES.get;
  let fail = true;
  h.env.MANUAL_VALUES.get = kind => kind === 'b2w' && fail ? { fetch: async () => Response.json({ error: 'fixture' }, { status: 503 }) } : original(kind);
  assert.equal((await h.internal('/scheduled')).status, 503);
  assert.equal((await h.storage.list({ prefix: 'backup:' })).size, 3);
  h.restart(); fail = false;
  assert.equal((await h.internal('/scheduled')).status, 201);
  await Promise.all([h.internal('/scheduled'), h.internal('/scheduled')]);
  assert.equal((await h.storage.list({ prefix: 'backup:' })).size, 4);
  const status = await (await h.call('/api/operations/backups')).json(); assert.ok(status.lastScheduledAt); assert.equal(status.lastError, null);
});

test('scheduled sync success and failure are recorded without raw exceptions or skipped snapshots', async () => {
  const h = harness({ env: { OPERATIONS_SCHEDULED_BACKUPS: 'true' } });
  await scheduledOperations(h.env, async () => ({ values: { '2026-08-01': 9 } }), true);
  let status = (await (await h.call('/api/operations')).json()).health.b2wSync;
  assert.equal(status.status, 'ok'); assert.equal(status.recordCount, 1); assert.ok(status.lastSuccessAt);
  await scheduledOperations(h.env, async () => { throw new Error('secret token SELECT private'); }, true);
  status = (await (await h.call('/api/operations')).json()).health.b2wSync;
  assert.equal(status.status, 'error'); assert.ok(status.lastErrorAt); assert.ok(status.lastSuccessAt);
  assert.doesNotMatch(JSON.stringify(status), /secret|token|SELECT/);
  assert.equal((await h.storage.list({ prefix: 'backup:' })).size, 4);
  let called = false; await scheduledOperations({}, async () => { called = true; }, true); assert.equal(called, false);
});

test('health defaults yesterday, validates dates, retains last success and redacts query errors', async () => {
  const h = harness({ env: { GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture-only' } });
  const source = h.instance.dependencies.sources[0];
  h.instance.dependencies.sources = [{ ...source, query: async (_env, from, to) => { assert.equal(from, to); return [{ value: 0 }]; } }];
  const result = await h.call('/api/operations/check', 'POST', {});
  const checked = await result.json(); assert.equal(result.status, 200); assert.equal(checked.sources[0].recordCount, 1);
  assert.equal(checked.from, new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10));
  h.instance.dependencies.sources[0].query = async () => { throw new Error('Bearer token SELECT SQL'); };
  const error = await (await h.call('/api/operations/check', 'POST', {})).json();
  assert.equal(error.sources[0].status, 'error'); assert.equal(error.sources[0].lastSuccessAt, checked.sources[0].lastSuccessAt);
  assert.ok(error.sources[0].lastErrorAt); assert.doesNotMatch(JSON.stringify(error), /Bearer|token|SELECT|SQL/);
  assert.equal((await h.call('/api/operations/check', 'POST', { from: '2026-02-30', to: '2026-03-01' })).status, 400);
  assert.equal((await h.call('/api/operations/check', 'POST', { from: '2026-01-01', to: '2026-01-15' })).status, 400);
});

test('source checks are de-duplicated while status reads remain responsive', async () => {
  const h = harness({ env: { GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture-only' } });
  let release, enter;
  const gate = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { enter = resolve; });
  h.instance.dependencies.sources = [{ id: 'fixture', label: 'Fixture', query: async () => { enter(); await gate; return []; } }];
  const first = h.call('/api/operations/check', 'POST', {}); await entered;
  assert.equal((await h.call('/api/operations/check', 'POST', {})).status, 409);
  assert.equal((await h.call('/api/operations')).status, 200);
  release(); assert.equal((await (await first).json()).sources[0].status, 'empty');
});

test('health routes invoke actual Grafana query functions using offline HTTP fixtures', async () => {
  const h = harness({ env: { GRAFANA_URL: 'https://grafana-fixture.invalid', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture-only' } });
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).endsWith('/api/ds/query')) {
      const request = JSON.parse(options.body);
      if (request.queries[0].rawSql.includes('orderdetail')) return Response.json({ results: { A: { frames: [{ schema: { fields: [{ name: 'report_date' }] }, data: { values: [['2026-08-01']] } }] } } });
    }
    return Response.json({ message: 'offline metadata fixture' }, { status: 503 });
  };
  try {
    const response = await h.call('/api/operations/check', 'POST', { from: '2026-08-01', to: '2026-08-01' });
    assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.sources.length, 5);
    assert.ok(calls.some(url => url.includes('/api/ds/query'))); assert.ok(calls.some(url => url.includes('/api/dashboards/uid/')));
    assert.ok(result.sources.some(source => source.status === 'ok'));
    assert.ok(result.sources.some(source => source.status === 'error'));
    assert.doesNotMatch(JSON.stringify(result), /fixture-only|rawSql|SELECT/);
  } finally { globalThis.fetch = originalFetch; }
});

test('existing scheduled hook records an unconfigured sync only when operations are bound', async () => {
  const h = harness(), pending = [];
  await worker.scheduled({}, h.env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.equal((await (await h.call('/api/operations')).json()).health.b2wSync.status, 'unconfigured');
});
