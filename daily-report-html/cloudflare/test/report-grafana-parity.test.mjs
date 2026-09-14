import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePitstopPanelSql, savedPitstopBranchAreaSql, prepareOrderDailySql, normalizePitstopPanelRows, loadPitstopPerformance, loadEmailSales } from '../src/worker.js';
const panels = JSON.parse(fs.readFileSync(new URL('./fixtures/grafana-report-panels.json', import.meta.url)));
const evidence = JSON.parse(fs.readFileSync(new URL('./fixtures/grafana-live-verification.json', import.meta.url)));
const dailyResponse = JSON.parse(fs.readFileSync(new URL('./fixtures/order-daily-response-2026-09-02.json', import.meta.url)));

test('Order-Daily adapter reads all three actual Grafana references and normalized count fields', async () => {
  const previousFetch = globalThis.fetch, previousCaches = globalThis.caches;
  let results = structuredClone(dailyResponse.results);
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (url, options) => {
    if (new URL(url).pathname.includes('/api/dashboards/uid/')) return Response.json({ dashboard: panels.orders });
    const request = JSON.parse(options.body);
    assert.deepEqual(request.queries.map(q => q.refId), ['A', 'B', 'C']);
    assert.match(request.queries[1].rawSql, /'Pitstop', 'Warehouse\/Branch', 'Workshop', 'unlabeled'/);
    assert.match(request.queries[2].rawSql, /COALESCE\(branch_type, 'unlabeled'\) IN \('BP'\)/);
    return Response.json({ results });
  };
  const call = () => loadEmailSales(new Request('https://report.test/api/email-sales?from=2026-09-02&to=2026-09-02'), { GRAFANA_URL: 'https://grafana.test', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'test-token' }, { waitUntil() {} });
  try {
    const reply = await call();
    assert.equal(reply.status, 200, await reply.clone().text());
    assert.deepEqual((await reply.json()).rows, [{ date: '2026-09-02', all: 1934, b2c: 1082, b2b2c: 852, movingAverageAll: 1934 }]);
    results.B.frames[0].schema.fields[1].name = 'Different_metric';
    assert.equal((await call()).status, 502, 'unexpected schema still fails closed');
    results = structuredClone(dailyResponse.results); delete results.C;
    assert.equal((await call()).status, 502, 'missing BP frame cannot become zero sales');
  } finally { globalThis.fetch = previousFetch; globalThis.caches = previousCaches; }
});

for (const kind of ['hq', 'bp']) for (const [from, to] of [['2026-08-23', '2026-08-23'], ['2026-08-17', '2026-08-23'], ['2026-08-01', '2026-08-23']]) {
  test(`${kind}: selected-range SQL preserves the saved Grafana panel exactly (${from} to ${to})`, () => {
    const dashboard = panels[kind], raw = dashboard.panels[0].targets[0].rawSql;
    const all = dashboard.templating.list.find(v => v.name === 'branch_area').query.rawSql.trim().replace(/;$/, '');
    const expected = raw.replaceAll('${__from}', String(Date.parse(from + 'T00:00:00Z')))
      .replaceAll('${__to}', String(Date.parse(to + 'T00:00:00Z') + 86400000))
      .replaceAll('${branch_area}', all);
    assert.equal(preparePitstopPanelSql(raw, from, to, savedPitstopBranchAreaSql(dashboard)), expected);
  });
}

test('real Grafana rows keep every location and exact sales through normalization', () => {
  const totals = {};
  for (const sample of evidence.cases.filter(item => item.kind !== 'orders')) {
    const frame = sample.results.A.frames[0];
    const rows = frame.data.values[0].map((_, index) => Object.fromEntries(frame.schema.fields.map((field, column) => [field.name, frame.data.values[column][index]])));
    const result = normalizePitstopPanelRows(rows, { channel: sample.kind.toUpperCase() }, sample.from, sample.to);
    assert.equal(result.length, rows.length);
    result.forEach((row, index) => { assert.equal(row.pitstop, rows[index].Name.trim()); assert.equal(row.sales, rows[index].Total_Sales); });
    totals[sample.kind + '-' + sample.label] = result.reduce((sum, row) => sum + row.sales, 0);
  }
  assert.deepEqual(totals, { 'hq-day': 1119, 'bp-day': 822, 'hq-week': 7425, 'bp-week': 5701, 'hq-mtd': 23997, 'bp-mtd': 19310 });
});

test('Order-Daily keeps Grafana null handling, all dimension filters, and explicit channel scope', () => {
  const d = panels.orders, raw = d.panels[0].targets[0].rawSql;
  const sql = prepareOrderDailySql(raw, d, '2026-08-23', '2026-08-23', ['BP']);
  assert.match(sql, /COALESCE\(branch_type, 'unlabeled'\) IN \('BP'\)/);
  assert.match(sql, /AND promo_code_name != 'WARRANTY\(NEWBATTERY\)'/);
  assert.match(sql, /AND brand IN \(SELECT DISTINCT brand/);
  assert.match(sql, /AND partners_name IN \(SELECT DISTINCT partners_name/);
  assert.match(sql, /2026-08-24 00:00:00/);
  assert.doesNotMatch(sql, /\$[A-Za-z_{]/);
  const day = evidence.cases.find(item => item.kind === 'orders' && item.label === 'day');
  assert.equal(day.results.A.frames[0].data.values[1][0], 1950);
  assert.equal(day.results.B.frames[0].data.values[1][0] + day.results.C.frames[0].data.values[1][0], 1950);
});

test('live API neither reads archived sales nor retries a wider date window on empty data', async () => {
  const previousFetch = globalThis.fetch, previousCaches = globalThis.caches;
  const requests = [];
  let frame = { schema: { fields: [{ name: 'Name' }, { name: 'Total_Sales' }] }, data: { values: [[], []] } };
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/api/search') return Response.json([{ uid: '6YM7jesvz', title: 'Pitstop Performance - detailed copy' }, { uid: '-tqZjesvk', title: 'BP Performance - detailed copy' }]);
    if (path.includes('/api/dashboards/uid/')) return Response.json({ dashboard: path.endsWith('6YM7jesvz') ? panels.hq : panels.bp });
    const body = JSON.parse(options.body); requests.push(body);
    return Response.json({ results: { A: { frames: [frame] } } });
  };
  try {
    const result = await loadPitstopPerformance(new Request('https://report.test/api/pitstop-performance?from=2026-08-01&to=2026-08-07'), {
      GRAFANA_URL: 'https://grafana.test', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'test-token',
      DASHBOARD_DATA: { get() { throw new Error('Archive must not replace live Grafana'); } }
    }, { waitUntil() {} });
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).channelTotals, { hq: 0, bp: 0 });
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.from === String(Date.parse('2026-08-01T00:00:00Z'))));
    for (const malformed of [{}, { schema: frame.schema }, { schema: frame.schema, data: { values: [['HQ PERLING'], ['not-a-number']] } }]) {
      frame = malformed;
      const failed = await loadPitstopPerformance(new Request('https://report.test/api/pitstop-performance?from=2026-08-01&to=2026-08-07&refresh=1'), {
        GRAFANA_URL: 'https://grafana.test', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'test-token'
      }, { waitUntil() {} });
      assert.equal(failed.status, 502, 'bad source data must not become a successful zero-sales response');
    }
  } finally { globalThis.fetch = previousFetch; globalThis.caches = previousCaches; }
});
