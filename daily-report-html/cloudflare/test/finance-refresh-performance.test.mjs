import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('one live commission request uses one fresh dashboard definition for dates, filters and all three queries', async () => {
  let definitions = 0;
  const queries = [];
  const dashboard = {
    time: { from: '2026-09-14T00:00:00Z', to: '2026-09-20T23:59:59Z' },
    templating: { list: [{ name: 'branch_name', current: { value: ['HQ A'] } }] },
    panels: [
      { id: 25, title: 'Main Table', type: 'table', targets: [{ rawSql: 'detail' }] },
      { id: 4, targets: [{ rawSql: 'count' }] },
      { id: 6, targets: [{ rawSql: 'total' }] }
    ]
  };
  const context = vm.createContext({
    URL, Map, Date, encodeURIComponent, FINANCE_PANEL_CACHE_SECONDS: 600,
    financePanelCache: new Map(), financeDashboardCache: new Map(), financeDashboardRequests: new Map(),
    FINANCE_GRAFANA_TABLES: {}, FINANCE_FILTER_VARIABLES: { 'commission-main': ['branch_name'] }, PENDING_PAYMENT_DEALER_LIMIT: 10000,
    parseFinanceFilterOverrides: () => null,
    normalizedGrafanaKey: value => value.toLowerCase(),
    normalizeFinanceFilterValues: values => Array.isArray(values) ? values : [],
    grafanaCurrentVariables: value => value.templating.list.map(item => ({ name: item.name, values: item.current.value })),
    resolveCommissionVariableOverrides: async () => ({}), buildFinanceQuery: target => ({ rawSql: target.rawSql }),
    frameRows: value => value.results.A.rows, normalizeFinanceRow: (_panel, row) => row,
    financeScopeFingerprint: (_panel, window, filters) => JSON.stringify([window.from, window.to, filters]), financeScopeHash: value => value,
    json: (value, status = 200, headers) => Response.json(value, { status, headers }),
    fetch: async (url, options) => {
      if (url.includes('/api/dashboards/')) { definitions++; return Response.json({ dashboard }); }
      const query = JSON.parse(options.body).queries[0]; queries.push(query.rawSql);
      return Response.json({ results: { A: { rows: [{ order_id: '1', commission: 35 }] } } });
    }
  });
  vm.runInContext(section('const FINANCE_PANEL_MAP =', '// Keep the Finance filter bar'), context);
  vm.runInContext(section('function nestedPanels(', 'function removeTemplateCondition('), context);
  vm.runInContext(section('async function financePanelTarget(', 'function buildFinanceQuery('), context);
  vm.runInContext(section('async function financeCurrentFilterState(', 'function applyGrafanaCurrentVariables('), context);
  vm.runInContext(section('function resolveGrafanaTimeExpression(', 'function financeSnapshotFreshSeconds('), context);
  vm.runInContext(section('async function queryCommissionPrimaryBundle(', 'async function queryCommissionFilterOptions('), context);
  vm.runInContext(section('async function financeLiveResponse(', 'async function internalFinanceApi('), context);
  const env = { GRAFANA_URL: 'https://grafana.test', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture' };
  const request = new Request('https://api.test/api/internal/finance-data?panel=commission-main&scope=grafana&part=primary');
  const response = await context.financeLiveResponse(request, env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(queries, ['detail', 'count', 'total']);
  assert.equal(payload.rows[0].commission, 35);
  assert.equal(payload.metricRows[0].total_commission, 35);
  assert.equal(payload.from, '2026-09-14 00:00:00');
  assert.deepEqual(payload.filterState.branch_name, ['HQ A']);
  assert.equal(definitions, 1, 'the request must not fetch the same dashboard again after resolving its saved time range');
  await context.financeLiveResponse(request, env);
  assert.equal(definitions, 2, 'a later live refresh must fetch current metadata, not a cached query definition');
});
