import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
function harness() {
  const definitions = [], queries = [];
  const context = {
    FINANCE_PANEL_MAP: { 'commission-main': 'detail', 'commission-order-source': 'count', 'commission-total-source': 'total' },
    financePanelTarget: async (_env, key) => { definitions.push(key); return { target: { key }, panel: {}, dashboard: {} }; },
    resolveCommissionVariableOverrides: async (_env, _dashboard, filters) => filters,
    buildFinanceQuery: target => ({ key: target.key }),
    frameRows: result => result.results.A.rows,
    normalizeFinanceRow: (_panel, row) => row,
    fetch: async (_url, options) => { const key = JSON.parse(options.body).queries[0].key; queries.push(key); return { ok: true, json: async () => ({ results: { A: { rows: [{ order_id: '1', commission: 45 }] } } }) }; }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function queryCommissionPrimaryBundle('), source.indexOf('async function queryCommissionFilterOptions(')), context);
  return { definitions, queries, run: options => context.queryCommissionPrimaryBundle({ GRAFANA_URL: 'https://fixture', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture' }, { fromMs: 0, toMs: 1 }, options) };
}
test('statement export runs just the Commission Rider detail query', async () => {
  const h = harness(), result = await h.run({ detailOnly: true });
  assert.deepEqual(h.queries, ['detail']);
  assert.deepEqual(h.definitions, ['detail']);
  assert.equal(result.rows[0].commission, 45);
  assert.equal(result.metricRows, null);
  assert.equal(result.summaryError, '');
});
test('normal Commission dashboard retains exact KPI queries', async () => {
  const h = harness(), pending = h.run({});
  assert.deepEqual(h.definitions, ['detail', 'count', 'total'], 'Definitions start together to share the dashboard request');
  const result = await pending;
  assert.deepEqual(h.queries, ['detail', 'count', 'total']);
  assert.equal(result.metricRows[0].order_count, 1);
  assert.equal(result.metricRows[0].total_commission, 45);
});
