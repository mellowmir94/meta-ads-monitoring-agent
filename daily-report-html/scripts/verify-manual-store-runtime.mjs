import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { randomBytes } from 'node:crypto';
import { makeArchive, makeManual, date as reportDate } from '../cloudflare/test/helpers/report-store.mjs';

const bundle = await build({ entryPoints: ['cloudflare/src/index.js'], bundle: true, format: 'esm', platform: 'browser', write: false });
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-08-11',
  kvNamespaces: ['DASHBOARD_DATA'],
  bindings: { DASHBOARD_ACCESS_PIN: 'test-dashboard-pin', UPLOAD_ACCESS_PIN: 'test-upload-pin', SESSION_SIGNING_SECRET: 'local-test-signing-secret-only' },
  durableObjects: { MANUAL_VALUES: { className: 'ManualValuesStore', useSQLite: true }, CONCURRENCY_LIMITER: { className: 'ConcurrencyLimiter', useSQLite: true }, REPORT_VERSIONS: { className: 'ReportVersionsStore', useSQLite: true } }
}));

try {
  const kv = await runtime.getKVNamespace('DASHBOARD_DATA');
  // An intentionally large legacy history exercises the per-value storage limit.
  const values = Object.fromEntries(Array.from({ length: 3000 }, (_, day) => {
    const date = new Date(Date.UTC(2018, 0, day + 1)).toISOString().slice(0, 10);
    return [date, { rsaJumpstart: 11, rsaTyrePatch: 5, rsaFuel: 1 }];
  }));
  await kv.put('manual-rsa-values', JSON.stringify({ values }));
  const namespace = await runtime.getDurableObjectNamespace('MANUAL_VALUES');
  const store = namespace.get(namespace.idFromName('rsa'));
  const call = (body, path = '/') => store.fetch(`https://manual.internal${path}?kind=rsa`, body ? {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  } : {});
  assert.equal(Object.keys((await (await call()).json()).values).length, 3000);
  const edit = { date: '2026-08-23', field: 'rsaFuel', value: 2, expectedRevision: 0 };
  const replies = await Promise.all([call(edit), call({ ...edit, value: 3 })]);
  assert.deepEqual(replies.map(response => response.status).sort(), [200, 409]);
  const current = await (await call()).json();
  assert.equal(current.revision, 1);
  assert.equal(current.values['2018-01-01'].rsaFuel, 1);
  assert.equal(current.values['2026-08-23'].rsaFuel, 2);
  const history = await (await call(null, '/history')).json();
  assert.equal(history.history.length, 1);
  assert.equal(history.history[0].changes[0].after, 2);
  assert.equal((await call({ ...edit, value: 4 })).status, 409);
  assert.equal((await call({ ...edit, value: 4, expectedRevision: 1 })).status, 200);
  assert.equal((await (await call()).json()).values['2026-08-23'].rsaFuel, 4);
  const updates = Object.keys(values).slice(0, 1500).map(date => ({ date, field: 'rsaFuel', value: 2, expectedRevision: 0 }));
  assert.equal((await call({ updates })).status, 200);
  const bulkHistory = await (await call(null, '/history')).json();
  assert.equal(bulkHistory.history[0].changes.length, 1500);
  let cookies = '';
  const api = async (path, body) => runtime.dispatchFetch('https://report.test' + path, { method: body ? 'POST' : 'GET', headers: { cookie: cookies, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await api('/api/manual-values-backup?kind=rsa')).status, 401);
  assert.equal((await api('/api/report-versions?date=' + reportDate)).status, 401);
  const login = await api('/api/auth/login', { pin: 'test-dashboard-pin' });
  cookies = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('/api/concurrency/enter', {})).status, 200);
  const denied = await api('/api/manual-values-backup?kind=rsa');
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /Unlock the Data Upload Centre/);
  const unlock = await api('/api/auth/upload-login', { pin: 'test-upload-pin' });
  cookies += '; ' + unlock.headers.get('set-cookie').split(';')[0];
  const exported = await api('/api/manual-values-backup?kind=rsa');
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  const backup = await exported.json();
  assert.equal(Object.keys(backup.record.values).length, 3001);
  const saved = await (await call()).json();
  assert.equal((await call({ date: '2018-01-01', field: 'rsaFuel', value: null, expectedRevision: saved.revisions['2018-01-01:rsaFuel'] })).status, 200);
  const preview = await (await api('/api/manual-values-restore?kind=rsa', { action: 'preview', backup })).json();
  assert.equal(preview.preview.missing, 1);
  assert.equal((await call({ date: '2018-01-02', field: 'rsaTyrePatch', value: 9, expectedRevision: 0 })).status, 200);
  assert.equal((await api('/api/manual-values-restore?kind=rsa', { action: 'confirm', backup, expectedRevision: preview.preview.revision })).status, 409);
  assert.equal('rsaFuel' in (await (await call()).json()).values['2018-01-01'], false);
  const reviewed = await (await api('/api/manual-values-restore?kind=rsa', { action: 'preview', backup })).json();
  const restored = await (await api('/api/manual-values-restore?kind=rsa', { action: 'confirm', backup, expectedRevision: reviewed.preview.revision })).json();
  assert.equal(restored.restored, 1);
  const after = await (await call()).json();
  assert.equal(after.values['2018-01-01'].rsaFuel, 2);
  assert.equal(after.values['2018-01-02'].rsaTyrePatch, 9, 'restore never replaces a newer value');
  const audit = await (await call(null, '/history')).json();
  assert.equal(audit.history[0].actor, 'backup-restore');
  const repeat = await (await api('/api/manual-values-restore?kind=rsa', { action: 'confirm', backup, expectedRevision: after.revision })).json();
  assert.equal(repeat.restored, 0);
  const reportManual = makeManual(), workbook = { data: { pitstopMaster: [{ Name: 'HQ TEST', Tier: 'Tier 1' }] } };
  await kv.put('current-workbook', JSON.stringify(workbook));
  for (const [kind, key] of Object.entries({ b2w: 'manual-b2w-values', bgarage: 'manual-bgarage-summary-values', indonesia: 'manual-indonesia-summary-values' })) await kv.put(key, JSON.stringify(reportManual[kind]));
  assert.equal((await call({ updates: ['rsaJumpstart', 'rsaTyrePatch'].map(field => ({ date: reportDate, field, value: 1, expectedRevision: 0 })) })).status, 200);
  reportManual.rsa = await (await call()).json();
  const report = await makeArchive(workbook, reportManual).payload();
  report.html += '<p>' + randomBytes(160000).toString('hex') + '</p>';
  const reportPath = '/api/report-versions?date=' + reportDate;
  const finalised = await api(reportPath, report);
  assert.equal(finalised.status, 201, await finalised.clone().text());
  const frozen = await (await api(reportPath + '&version=1')).json();
  assert.equal(frozen.snapshot.manual.rsa[reportDate].rsaFuel, 4);
  assert.ok(frozen.html.includes(report.html.slice(-1000)));
  assert.equal((await (await api(reportPath, report)).json()).repeated, true);
  const conflict = await api(reportPath, { ...report, requestId: crypto.randomUUID() });
  assert.equal(conflict.status, 409);
  assert.equal((await runtime.dispatchFetch('https://report.test' + reportPath, { method: 'DELETE', headers: { cookie: cookies } })).status, 405);
  assert.deepEqual(await (await api(reportPath + '&version=1')).json(), frozen);
  console.log('Cloudflare report archive: authentication, real sanitizer, compressed multi-chunk storage, immutable reads and retry/conflict handling passed.');
  console.log('Cloudflare runtime: migration, concurrent saves, large history, protected export, restore preview/conflicts, preserved newer values and idempotent recovery passed.');
} finally {
  await runtime.dispose();
}
