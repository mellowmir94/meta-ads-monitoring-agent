import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const panel = { id: 'commission-main', title: 'Commission Rider', chart: {}, columns: [{ key: 'order_id' }, { key: 'commission', numeric: true }] };
const plain = (value) => JSON.parse(JSON.stringify(value));
function declaration(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n      function ', start + 1));
}
function setup(source = []) {
  const state = {
    data: { [panel.id]: source }, api: { loading: {}, errors: {}, loaded: { [panel.id]: true } },
    imports: { [panel.id]: { uploadedAt: '2026-09-03T01:00:00Z', metricRowsScope: 'same-api-query' } }, metricRows: {},
    charts: { [panel.id]: { limit: 'all', selection: '', selections: [], statusSelection: '', branchSort: 'asc' } },
    search: {}, searchDraft: {}, exceptionMode: {}, exceptionOnly: {}, filters: {}, dates: {},
    sort: {}, pages: {}, tableColumnFilters: {}, tableColumnFilterDrafts: {}, grafanaTables: {},
  };
  const pill = { dataset: {} };
  const sandbox = {
    state, LOCAL_PREVIEW: false, SAMPLE_DATA_VERSION: 'sample', renderRowsCache: null,
    rows: (id) => state.data[id] || [], chartState: (p) => state.charts[p.id],
    applyPanelFilters: (_p, data) => data, panelQuality: () => ({ issues: 0 }),
    normalizeFilterText: (v) => String(v ?? '').trim().toLowerCase(),
    sameFilterValue: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
    panelDimensionValue: (_p, row) => row.state || '',
    visibleTableColumns: (p) => p.columns,
    primaryTableValue: (_p, col, row) => row[col.key],
    filtersForPanel: () => [{ key: 'branch_name', label: 'Branch' }],
    formatFinanceDate: (v) => v, formatFinanceDateTime: (v) => v,
    panelUsesGrafanaUtc: () => true,
    formatNumber: (v) => Number(v).toLocaleString('en-MY'),
    formatMoney: (v) => `RM ${Number(v).toFixed(2)}`,
    esc: (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    $: () => pill,
  };
  vm.createContext(sandbox);
  const names = ['parseFinanceNumber', 'numberValue', 'financeConnectionState', 'syncFinanceConnectionPill', 'financeDataConfidence',
    'commissionSourceContext', 'commissionPayoutStatus', 'canonicalCommissionPayoutStatus', 'commissionPayoutStatusLabel', 'commissionPayoutStatusColor',
    'financeQueueLabel', 'commissionQueueMatches', 'grafanaCommissionStats', 'rowControlStatus',
    'scopedRows', 'preExceptionFilteredRows', 'baseFilteredRows', 'filteredRows', 'tableFilterId', 'tableFilterSpec', 'hasActiveTableFilter', 'applyTableHeaderFilters', 'primaryTableRows',
    'commissionReviewQueuesMarkup', 'clearFinanceLocalView', 'applyFinanceQueue'];
  vm.runInContext(names.map(declaration).join('\n'), sandbox);
  return { ...sandbox, pill };
}
const row = (id, payment_status, commission = 10) => ({ order_id: id, payment_status, commission, state: 'Selangor' });

test('status normalization never labels unpaid as paid or an unrecognized status as pending', () => {
  const api = setup();
  for (const [raw, expected] of [['Pending', 'pending'], ['Unpaid', 'pending'], ['Not paid', 'pending'], ['Awaiting payment', 'pending'],
    ['Approved Unpaid', 'approved'], ['Approved', 'approved'], ['Reversed', 'reversed'], ['Failed', 'reversed'], ['Cancelled', 'cancelled'],
    ['Paid', 'paid'], ['Completed', 'paid'], ['Partially paid', 'pending'], ['Not settled', 'pending'],
    ['Not completed', 'unknown'], ['Not approved', 'unknown'], ['Unapproved', 'unknown'],
    ['', 'unknown'], ['unknown', 'unknown'], ['Custom status 9', 'unknown']]) {
    assert.equal(api.canonicalCommissionPayoutStatus(raw), expected, raw);
  }
});

test('calculated paid commissions do not inflate payment follow-up or data checks', () => {
  const source = [row('A', 'Pending', 20), row('B', 'Approved', 30), row('C', 'Failed', 5), row('D', 'Completed', 100),
    row('E', 'Cancelled', 15), row('F', 'Unknown', 10), row('G', 'Paid', 'bad')];
  const api = setup(source), context = api.commissionSourceContext(source);
  assert.equal(context.payoutStatusField, 'payment_status');
  assert.equal(context.payoutStatusIsOrderPayment, true);
  for (const [mode, ids] of [['payment-followup', ['A', 'B']], ['payment-issues', ['C']], ['data-checks', ['F', 'G']]]) {
    assert.deepEqual(source.filter((r) => api.commissionQueueMatches(r, mode, context)).map((r) => r.order_id), ids);
    api.state.exceptionMode[panel.id] = mode;
    assert.deepEqual(plain(api.baseFilteredRows(panel)).map((r) => r.order_id), ids);
  }
  const markup = api.commissionReviewQueuesMarkup(panel);
  assert.match(markup, /RM 50\.00/);
  assert.doesNotMatch(markup, /Basis:|order payment, not commission payout|Calculated commission alone|Queue counts follow/);
  assert.doesNotMatch(markup, /assigned|Calculated ·|Exposure in review queue/);
  api.state.exceptionMode[panel.id] = 'review';
  assert.deepEqual(plain(api.baseFilteredRows(panel)).map((r) => r.order_id), ['A', 'B', 'C', 'F', 'G']);
  assert.equal(api.rowControlStatus(panel, source[4]), 'Clear', 'cancelled excluded from critical payment issues');
});

test('payout-field precedence is consistent across a queue and absent source values go to data checks', () => {
  const source = [{ ...row('A', 'Paid'), commission_status: 'Pending' }, row('B', 'Paid')];
  const api = setup(source), context = api.commissionSourceContext(source);
  assert.equal(context.payoutStatusField, 'commission_status');
  assert.equal(api.commissionQueueMatches(source[0], 'payment-followup', context), true);
  assert.equal(api.commissionQueueMatches(source[1], 'data-checks', context), true);
  assert.equal(api.commissionQueueMatches(source[1], 'payment-followup', context), false);
});

test('queue drill-through replaces conflicting chart/column filters and preserves search, dates, other tables and official KPIs', () => {
  const api = setup([row('A', 'Pending'), row('B', 'Completed')]);
  const s = api.state, tableId = `${panel.id}:table`, nativeId = `${panel.id}:grafana:branch`;
  s.search[panel.id] = 'Selangor';
  s.searchDraft[panel.id] = 'not yet applied';
  s.dates[panel.id] = { start: '2026-09-01', end: '2026-09-02' };
  s.filters[panel.id] = { branch_name: ['HQ A'] };
  s.metricRows[panel.id] = [{ order_count: 2, total_commission: 20 }];
  s.charts[panel.id].statusSelection = 'paid';
  s.charts[panel.id].selections = ['Johor'];
  s.tableColumnFilters[tableId] = { order_id: { mode: 'include', values: ['B'] } };
  s.tableColumnFilters[nativeId] = { branch: { mode: 'include', values: ['HQ B'] } };
  const preserved = JSON.stringify([s.search, s.searchDraft, s.filters, s.dates, s.metricRows, s.tableColumnFilters[nativeId]]);
  assert.equal(api.applyFinanceQueue(panel, 'payment-followup'), true);
  assert.deepEqual(plain(api.primaryTableRows(panel)).map((r) => r.order_id), ['A']);
  assert.equal(JSON.stringify([s.search, s.searchDraft, s.filters, s.dates, s.metricRows, s.tableColumnFilters[nativeId]]), preserved);
  assert.equal(s.charts[panel.id].limit, 'all');
  assert.equal(s.charts[panel.id].branchSort, 'asc');
  assert.equal(api.applyFinanceQueue(panel, 'payment-followup'), false);
  assert.equal(api.primaryTableRows(panel).length, 2);
});

test('Clear local filters changes only main local state and individual column removal leaves other columns intact', () => {
  const api = setup(), s = api.state, tableId = `${panel.id}:table`, copyId = `${panel.id}:copy:one`;
  s.filters[panel.id] = { branch_name: ['HQ A'] }; s.dates[panel.id] = { start: '2026-09-01' };
  s.search[panel.id] = 'A'; s.searchDraft[panel.id] = 'draft'; s.search[copyId] = 'B';
  s.sort[panel.id] = { key: 'commission', dir: 'desc' };
  s.exceptionMode[panel.id] = 'review'; s.exceptionOnly[panel.id] = true;
  s.charts[panel.id].selection = 'Johor';
  s.tableColumnFilters[tableId] = { order_id: { mode: 'include', values: [] }, commission: { mode: 'exclude', values: ['5'] } };
  s.tableColumnFilters[copyId] = { order_id: { mode: 'include', values: ['B'] } };
  api.clearFinanceLocalView(panel, 'column', 'order_id');
  assert.equal(s.tableColumnFilters[tableId].order_id, undefined);
  assert.ok(s.tableColumnFilters[tableId].commission);
  const preserved = JSON.stringify([s.filters, s.dates, s.sort, s.tableColumnFilters[copyId]]);
  api.clearFinanceLocalView(panel);
  assert.equal(JSON.stringify([s.filters, s.dates, s.sort, s.tableColumnFilters[copyId]]), preserved);
  assert.equal(s.search[panel.id], ''); assert.equal(s.searchDraft[panel.id], ''); assert.equal(s.search[copyId], 'B');
  assert.equal(s.exceptionMode[panel.id], undefined); assert.equal(s.exceptionOnly[panel.id], undefined);
  assert.equal(s.charts[panel.id].selection, ''); assert.equal(s.charts[panel.id].branchSort, 'asc');
  assert.deepEqual(plain(s.tableColumnFilters[tableId]), {});
});

test('Commission reconciliation compares independent full-scope count and money, not filtered Details or trend availability', () => {
  const api = setup([row('A', 'Pending', 10), row('B', 'Paid', 20)]), s = api.state;
  s.metricRows[panel.id] = [{ order_count: 2, total_commission: 30 }];
  s.search[panel.id] = 'no records'; s.exceptionMode[panel.id] = 'payment-issues';
  assert.equal(api.financeDataConfidence(panel).label, 'Totals match');
  s.metricRows[panel.id][0].total_commission = 31;
  assert.equal(api.financeDataConfidence(panel).label, 'Totals differ');
  s.metricRows[panel.id][0] = { order_count: 3, total_commission: 30 };
  assert.equal(api.financeDataConfidence(panel).label, 'Totals differ');
  s.metricRows[panel.id] = [];
  assert.equal(api.financeDataConfidence(panel).label, 'Not reconciled', 'never compare a source to itself');
  s.metricRows[panel.id] = [{ order_count: null, total_commission: 'bad' }];
  assert.equal(api.financeDataConfidence(panel).label, 'Check source values');
});

test('loading, source errors, samples, incomplete data and missing summaries cannot report verified totals', () => {
  const api = setup([row('A', 'Paid', 10)]), s = api.state;
  s.metricRows[panel.id] = [{ order_count: 1, total_commission: 10 }];
  s.api.loading[panel.id] = true;
  assert.equal(api.financeDataConfidence(panel).label, 'Checking after refresh');
  s.api.loading[panel.id] = false; s.api.errors[panel.id] = 'Timeout';
  assert.equal(api.financeDataConfidence(panel).label, 'Refresh failed');
  delete s.api.errors[panel.id]; s.imports[panel.id].checksum = 'sample';
  assert.equal(api.financeDataConfidence(panel).label, 'Sample only');
  assert.equal(api.financeConnectionState(panel).label, 'Sample · not live');
  delete s.imports[panel.id].checksum; s.imports[panel.id].truncated = true;
  assert.equal(api.financeDataConfidence(panel).label, 'Partial detail');
  s.imports[panel.id].truncated = false; s.imports[panel.id].rejectedRows = 2;
  assert.equal(api.financeDataConfidence(panel).label, 'Partial detail');
  s.imports[panel.id].rejectedRows = 0; s.imports[panel.id].summaryError = 'Unavailable';
  assert.equal(api.financeDataConfidence(panel).label, 'Summary unavailable');
  s.imports[panel.id] = {};
  assert.equal(api.financeDataConfidence(panel).label, 'Not checked');
});

test('connection pill does not describe data as healthy and imported data is not claimed live', () => {
  const api = setup();
  api.syncFinanceConnectionPill(panel);
  assert.equal(api.pill.textContent, 'API: Connected');
  assert.match(api.pill.title, /Connection status only/);
  api.state.imports[panel.id].sourceKind = 'file';
  assert.equal(api.financeConnectionState(panel).label, 'Imported · not live', 'a later CSV import must not inherit a previous live connection');
  delete api.state.imports[panel.id].sourceKind;
  api.state.api.loaded[panel.id] = false;
  assert.equal(api.financeConnectionState(panel).label, 'Imported · not live');
  api.state.api.errors[panel.id] = 'Timeout';
  assert.equal(api.financeConnectionState(panel).label, 'API: Error');
  assert.doesNotMatch(html, /Status: Healthy/);
});

test('the unrequested Current view summary is not rendered or retained', () => {
  assert.doesNotMatch(html, /financeCurrentViewMarkup|finance-current-view|current-view-(?:heading|scope|chip|clear|health|data|note)/);
  assert.doesNotMatch(html, /data-current-view|data-finance-data-info|>Current view</);
});
