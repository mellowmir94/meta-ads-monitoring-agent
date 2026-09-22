const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), test = require('node:test');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'deductions.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function harness(respond) {
  const requests = [];
  const context = { URLSearchParams, AbortController, performance, panels: [{ id: 'commission-main' }],
    FINANCE_API_ENDPOINT: '/api/finance', financeInflightRequests: new Map(), financePanelControllers: new Map(), activePanel: () => null,
    fetch: async (url, options) => {
      const parsedUrl = new URL(url, 'https://test'); requests.push(parsedUrl);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10);
        options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
      const payload = await respond(parsedUrl);
      return { ok: true, json: async () => payload };
    }, canonicalizeFinancePayloadRows: async (_panel, payload) => payload.rows || [] };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('      async function requestFinancePayload('), html.indexOf('      function yieldFinanceFrame(')), context);
  const start = source.indexOf('const deductionStatementRowLoads') >= 0 ? source.indexOf('const deductionStatementRowLoads') : source.indexOf('async function deductionLoadStatementRows(');
  vm.runInContext(source.slice(start, source.indexOf('async function deductionFreshPaymentStatementPayload(')), context);
  return { context, requests, load: () => context.deductionLoadStatementRows(context.panels[0], '2026-09-14', '2026-09-20') };
}
test('simultaneous rider exports and previews share one request without aborting', async () => {
  const h = harness(() => ({ rows: [{ rider_name: 'Rider A', commission: 10 }, { rider_name: 'Rider B', commission: 20 }], rowCount: 2 }));
  const rows = await Promise.all([h.load(), h.load(), h.load()]);
  assert.equal(h.requests.length, 1);
  assert.ok(rows.every(result => result.length === 2));
  assert.equal(h.requests[0].searchParams.get('filters'), '{}');
  await h.load(); assert.equal(h.requests.length, 2, 'Later downloads fetch fresh data');
});
test('a malformed successful response cannot become zero commission', async () => {
  const h = harness(() => ({}));
  await assert.rejects(h.load, /incomplete|invalid/i);
});
test('declared row counts must match the loaded rows', async () => {
  const h = harness(() => ({ rows: [], rowCount: 12 }));
  await assert.rejects(h.load, /incomplete/i);
});
test('a real empty result stays valid', async () => {
  const h = harness(() => ({ rows: [], rowCount: 0 }));
  assert.equal((await h.load()).length, 0);
});
test('large packed responses are decoded and checked before export', async () => {
  const rows = Array.from({ length: 6000 }, (_, index) => ({ rider_name: 'Rider ' + index, commission: 10 }));
  const h = harness(() => ({ rows: [], rowCount: rows.length, packedRows: { version: 1, rowCount: rows.length, columns: [{ key: 'commission', values: rows.map(row => row.commission) }] } }));
  h.context.canonicalizeFinancePayloadRows = async () => rows;
  assert.equal((await h.load()).length, 6000);
});
test('a short packed column cannot silently lose rider rows', async () => {
  const h = harness(() => ({ rows: [], rowCount: 10, packedRows: { version: 1, rowCount: 10, columns: [{ key: 'commission', values: [10] }] } }));
  await assert.rejects(h.load, /incomplete/i);
});
test('failed loads can be retried successfully', async () => {
  let fail = true;
  const h = harness(() => { if (fail) throw new Error('Network unavailable'); return { rows: [], rowCount: 0 }; });
  await assert.rejects(h.load, /Network unavailable/);
  fail = false;
  assert.equal((await h.load()).length, 0);
});
