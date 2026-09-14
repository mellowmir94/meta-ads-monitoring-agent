import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

// This smoke test uses no Wrangler environment files, credentials, or remote
// bindings. Miniflare owns temporary persistence and disposes it after the run.
const config = JSON.parse(await readFile(new URL('../../wrangler.preview.jsonc', import.meta.url), 'utf8'));
const bundle = await build({ entryPoints: [new URL('../../src/index.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')], bundle: true, format: 'esm', write: false, platform: 'browser' });
const runtime = new Miniflare({
  workers: [{ name: 'operations-runtime',
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: config.compatibility_date,
  bindings: config.vars, kvNamespaces: ['DASHBOARD_DATA'],
  durableObjects: Object.fromEntries(config.durable_objects.bindings.map(binding => [binding.name, { className: binding.class_name, useSQLite: true }])),
  outboundService: () => new Response('Offline fixture: outbound access is disabled.', { status: 503 })
  }]
});

try {
  const call = (path, method = 'GET', body) => runtime.dispatchFetch(`http://localhost${path}`, {
    method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  assert.equal((await call('/api/concurrency/enter', 'POST', {})).status, 200);
  const created = await call('/api/operations/jobs', 'POST', { sourceName: 'runtime-fixture', months: [
    { month: '2026-01', rows: [{ date: '2026-01-01', channel: 'HQ', pitstop: 'HQ Fixture', sales: 20 }] },
    { month: '2026-02', rows: [{ date: '2026-02-01', channel: 'BP', pitstop: 'BP Fixture', sales: 30 }] }
  ] });
  assert.equal(created.status, 202, await created.clone().text());
  let { job } = await created.json();
  const deadline = Date.now() + 30000;
  while (job.status !== 'completed' && Date.now() < deadline) {
    await setTimeout(500);
    ({ job } = await (await call(`/api/operations/jobs/${job.id}`)).json());
    if (job.status === 'failed') assert.fail(job.error);
  }
  assert.equal(job.status, 'completed');
  const archive = await (await call('/api/pitstop-history')).json();
  assert.equal(archive.totalRows, 2); assert.equal(archive.totalSales, 50);
  assert.equal((await call('/api/operations/jobs/' + job.id + '/resume', 'POST')).status, 200);
  const snapshots = await call('/api/operations/backups', 'POST', {});
  assert.equal(snapshots.status, 201, await snapshots.clone().text());
  const { backups } = await snapshots.json(); assert.equal(backups.length, 4);
  for (const item of backups) {
    const backup = await (await call(item.downloadUrl)).json();
    const preview = await call(`/api/manual-values-restore?kind=${item.kind}`, 'POST', { action: 'preview', backup });
    assert.equal(preview.status, 200, await preview.clone().text());
  }
  const check = await (await call('/api/operations/check', 'POST', {})).json();
  assert.ok(check.sources.every(source => source.status === 'unconfigured'));
  console.log('Local Cloudflare runtime: durable alarms published 2 months; 4 checksum backups passed existing restore previews; auth, status, and unconfigured health passed.');
} finally { await runtime.dispose(); }
