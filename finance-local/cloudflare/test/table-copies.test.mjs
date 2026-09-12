import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const names = [
  'formatGrafanaTimestamp',
  'commissionPhoneColumnsRequired',
  'readTableCopies', 'tableCopyId', 'tableCopySnapshot', 'saveTableCopies', 'tableCopyContext', 'tableCopyRows',
  'tableDuplicateButtonMarkup', 'tableCopyHeaderMarkup', 'tableCopyRowMarkup', 'tableCopyFooterMarkup', 'tableCopyMarkup',
  'appendScrollableTableCopyRows', 'duplicateFinanceTable', 'deleteFinanceTableCopy', 'makeTableVisualId',
  'tableFilterId', 'tableColumnVisibilityId', 'visibleTableColumns', 'visibleColumnsFor', 'normalizedTableColumns', 'tableColumnMenuMarkup',
  'primaryTableValue', 'preExceptionFilteredRows', 'baseFilteredRows', 'filteredRows', 'primaryTableRows',
  'applyTableHeaderFilters', 'grafanaFilteredTableRows', 'grafanaTableValue', 'grafanaTableColumnMeta', 'grafanaFooterKeys',
  'grafanaTableDisplay', 'grafanaSourceRowMarkup', 'tableTotalValue', 'tableRowMarkup', 'tableHeaderCellMarkup',
  'tableFilterContext', 'tableFilterAvailableValues', 'tableFilterTriggerMarkup', 'tableFilterPopoverMarkup',
  'tableFilterSpec', 'hasActiveTableFilter', 'tableFilterDisplayValue', 'tableExportMenuMarkup',
  'financeTableExportPayload', 'financeExportPanelTitle', 'financeCommissionExportMeta', 'readVisualLayout',
  'financeDashboardLayoutPayload', 'hasSavedFinanceDashboardLayout', 'applySharedFinanceDashboardLayout',
  'captureFinanceLayoutStorageSnapshot', 'restoreFinanceLayoutStorageSnapshot', 'openRowDetail',
  'tableDashboardVisualsMarkup', 'queueFinanceDashboardSave', 'setTableJumpButtonState',
  'grafanaSourceTableView', 'grafanaSourceTablesMarkup', 'financeSummaryFooterMarkup', 'appendScrollableGrafanaRows'
];
function functionSource(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const end = html.indexOf('\n      }', start);
  return html.slice(start, end + '\n      }'.length);
}
const program = names.map(functionSource).join('\n');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('Commission phones retain required columns while optional operational columns stay hidden by default', () => {
  let phone = true;
  const state = { hiddenColumns: { 'commission-main': ['quantity', 'commission', 'delivery_service_option', 'sales_source', 'paymenttotal'], 'reimbursement-details': ['quantity'] }, compactTables: {} };
  const scope = vm.createContext({
    state,
    window: { matchMedia: () => ({ matches: phone }) },
    esc: (value) => String(value),
    tableDuplicateButtonMarkup: () => ''
  });
  vm.runInContext(['commissionPhoneColumnsRequired', 'visibleTableColumns', 'normalizedTableColumns', 'tableColumnMenuMarkup'].map(functionSource).join('\n'), scope);
  const columns = ['order_id', 'quantity', 'delivery_service_option', 'sales_source', 'paymenttotal', 'commission'].map(key => ({ key }));
  assert.equal(scope.visibleTableColumns({ id: 'commission-main', columns }).length, 3);
  ['delivery_service_option', 'sales_source', 'paymenttotal'].forEach((key) => {
    assert.equal(scope.visibleTableColumns({ id: 'commission-main', columns }).some(column => column.key === key), false);
    const input = scope.tableColumnMenuMarkup('commission-main', columns).match(new RegExp('<input[^>]+data-column-toggle-key="' + key + '"[^>]*>'))[0];
    assert.doesNotMatch(input, /checked|disabled/);
  });
  assert.equal(scope.visibleTableColumns({ id: 'reimbursement-details', columns }).length, 5);
  phone = false;
  assert.equal(scope.visibleTableColumns({ id: 'commission-main', columns }).length, 1);
  assert.deepEqual(state.hiddenColumns['commission-main'], ['quantity', 'commission', 'delivery_service_option', 'sales_source', 'paymenttotal']);
});

test('published Finance markup matches the canonical source', () => {
  assert.equal(html, readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
});

function setup() {
  const storage = new Map();
  const sourceRows = [
    { order_id: '1', rider_name: 'Rider A', branch: 'KL', payment_status: 'Pending', quantity: 1, commission: 10 },
    { order_id: '2', rider_name: 'Rider A', branch: 'Johor', payment_status: 'Completed', quantity: 2, commission: 20 },
    { order_id: '3', rider_name: 'Rider A', branch: 'KL', payment_status: 'Pending', quantity: 3, commission: 30 }
  ];
  const panel = { id: 'commission-main', title: 'Commission Rider Main Table', chart: {}, columns: [
    { key: 'order_id', label: 'order_id', mobile: true }, { key: 'branch', label: 'Branch', mobile: true },
    { key: 'payment_status', label: 'Status', mobile: true }, { key: 'quantity', label: 'quantity', numeric: true, mobile: true },
    { key: 'commission', label: 'commission', numeric: true, money: true, mobile: true }
  ] };
  const native = { key: 'payment-types', title: 'Payment Type', columns: ['branch_name', 'typeofpayment', 'net_sales'], footer: ['net_sales'], rows: [
    { branch_name: 'HQ KL', typeofpayment: 'cash', net_sales: 100 },
    { branch_name: 'HQ KL', typeofpayment: 'online', net_sales: 50 },
    { branch_name: 'BP JB', typeofpayment: 'cash', net_sales: 25 }
  ] };
  const state = Object.fromEntries(['hiddenColumns', 'tableColumnFilters', 'tableColumnFilterDrafts', 'search', 'searchDraft', 'sort', 'compactTables', 'filters', 'dates', 'exceptionOnly'].map((key) => [key, {}]));
  state.grafanaTables = { [panel.id]: [native] };
  const chart = {};
  const c = vm.createContext({ state, panels: [panel], sourceRows, chart, structuredClone,
    TABLE_COPIES_KEY: 'copies', VISUAL_ORDER_KEY: 'orders', VISUAL_SIZE_KEY: 'sizes', TABLE_SCROLL_BATCH: 2, SOURCE_TABLE_SCROLL_BATCH: 2,
    TABLE_HEADER_FILTER_PANELS: new Set([panel.id]), panelScopeMemo: new Map(), grafanaSourceTableMemo: new WeakMap(), renderRowsCache: null,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: { querySelectorAll: () => [], getElementById: () => null },
    scopedRows: () => sourceRows, rows: () => sourceRows, chartState: () => chart,
    panelDimensionValue: (_panel, row) => row.branch, sameFilterValue: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
    rowControlStatus: () => 'Clear', rowControlOwner: () => '', rowDetailValue: (_column, value) => String(value),
    commissionPayoutStatusColor: (status) => ({ paid: '#1F9D62', pending: '#D99A00' })[status] || '#64748B',
    showFinanceDialog: (title, subtitle, body) => { c.detailBody = body; },
    numberValue: (value) => Number(value) || 0, formatMoney: (value) => `RM ${Number(value).toFixed(2)}`,
    formatNumber: (value) => String(value), formatPercent: (value) => `${value}%`, formatFinanceDate: (value) => String(value),
    esc: (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    normalizeFilterText: (value) => String(value).toLowerCase(), tableFieldAlignmentClass: () => '', chipClass: () => 'chip',
    cell: (_panel, column, row) => `<td>${row[column.key]}</td>`, periodLabel: () => '01/09/2026 - 02/09/2026', safeExportName: (value) => value,
    isExcludedPaymentProvider: (value) => value === 'excluded', finishTableCopyMutation: () => {},
    sharedDashboardLayoutApplied: false, tableCopySaveQueue: Promise.resolve(), REIMBURSEMENT_MATRIX_TABLE_KEY: 'matrix'
  });
  vm.runInContext(program, c);
  return { c, panel, native, state, sourceRows, chart, storage };
}

test('Commission chart status selection colours the left table-row indicator to match the selected bar', () => {
  const { c, panel, sourceRows, chart } = setup();
  chart.statusSelection = 'paid';
  const markup = c.tableRowMarkup(panel, sourceRows[1], 1, panel.columns, sourceRows);
  assert.match(markup, /class="is-chart-status-selected"/);
  assert.match(markup, /--commission-status-accent:#1F9D62/);
  chart.statusSelection = '';
  assert.doesNotMatch(c.tableRowMarkup(panel, sourceRows[1], 1, panel.columns, sourceRows), /is-chart-status-selected|commission-status-accent/);
  assert.match(html, /tr\.is-chart-status-selected td:first-child \{ box-shadow: inset 4px 0 0 var\(--commission-status-accent\); \}/);
});

test('Columns → Duplicate → Export controls support originals and unique copies', () => {
  const { c, panel } = setup();
  const controls = c.tableColumnMenuMarkup(panel.id, panel.columns) + c.tableExportMenuMarkup(panel.id);
  assert.ok(controls.indexOf('>Columns<') < controls.indexOf(' Duplicate<'));
  assert.ok(controls.indexOf(' Duplicate<') < controls.indexOf('>Export<'));
  assert.doesNotMatch(controls, /data-delete-table-copy/);
  const a = c.duplicateFinanceTable(panel.id), b = c.duplicateFinanceTable(panel.id);
  assert.notEqual(a.id, b.id);
  const markup = c.tableCopyMarkup(a);
  assert.match(markup, new RegExp(`data-delete-table-copy="${a.id}"`));
  assert.match(markup, /data-table-copy-id=/);
  assert.match(markup, /data-copy-search=/);
  assert.match(markup, /data-copy-jump-totals=/);
  assert.notEqual(c.tableCopyContext(a.id).tableId, c.tableCopyContext(b.id).tableId);
});

test('primary copies clone the view but isolate search, sorting, hidden columns and filters', () => {
  const { c, panel, state } = setup();
  state.search[panel.id] = 'KL';
  state.sort[panel.id] = { key: 'commission', dir: 'desc' };
  state.hiddenColumns[panel.id] = ['payment_status'];
  state.tableColumnFilters[c.tableFilterId(panel.id)] = { payment_status: { mode: 'include', values: ['Pending'] } };
  const copy = c.duplicateFinanceTable(panel.id);
  const instance = c.tableCopyContext(copy.id);
  assert.deepEqual(plain(c.tableCopyRows(instance).map((row) => row.order_id)), ['3', '1']);
  state.search[panel.id] = 'Johor';
  state.tableColumnFilters[c.tableFilterId(panel.id)].payment_status.values.push('Completed');
  assert.deepEqual(plain(c.tableCopyRows(c.tableCopyContext(copy.id)).map((row) => row.order_id)), ['3', '1']);
  state.search[instance.tableId] = '';
  state.tableColumnFilters[instance.tableId] = {};
  state.sort[instance.tableId] = { key: 'commission', dir: 'asc' };
  state.hiddenColumns[instance.tableId].push('branch');
  assert.equal(c.tableCopyRows(c.tableCopyContext(copy.id)).length, 3);
  assert.deepEqual(state.hiddenColumns[panel.id], ['payment_status']);
  assert.equal(state.search[panel.id], 'Johor');
});

test('copies remain linked to live rows and the active chart scope', () => {
  const { c, panel, sourceRows, chart } = setup();
  const copy = c.duplicateFinanceTable(panel.id);
  sourceRows.push({ order_id: '4', branch: 'KL', quantity: 1, commission: 40 });
  chart.selections = ['KL'];
  const instance = c.tableCopyContext(copy.id);
  assert.deepEqual(plain(c.tableCopyRows(instance).map((row) => row.order_id)), ['1', '3', '4']);
  assert.doesNotMatch(JSON.stringify(c.financeDashboardLayoutPayload()), /order_id|commission":40/);
});

test('duplicating a primary table preserves dormant hidden-column filter behavior', () => {
  const { c, panel, state } = setup();
  state.hiddenColumns[panel.id] = ['branch'];
  state.tableColumnFilters[c.tableFilterId(panel.id)] = { branch: { mode: 'include', values: ['KL'] } };
  const before = c.primaryTableRows(panel).map((row) => row.order_id);
  const copy = c.duplicateFinanceTable(panel.id);
  assert.deepEqual(plain(c.tableCopyRows(c.tableCopyContext(copy.id)).map((row) => row.order_id)), plain(before));
});

test('copy header options use their own rows and ignore only the open column filter', () => {
  const { c, panel, state } = setup();
  const copy = c.duplicateFinanceTable(panel.id), instance = c.tableCopyContext(copy.id);
  state.tableColumnFilters[instance.tableId] = { branch: { mode: 'include', values: ['KL'] } };
  const context = c.tableFilterContext({ panelId: panel.id, tableId: instance.tableId, copyId: copy.id, columnKey: 'branch' });
  assert.deepEqual(plain(c.tableFilterAvailableValues(context)), ['Johor', 'KL']);
  assert.equal(c.tableCopyRows(c.tableCopyContext(copy.id)).length, 2);
  assert.equal(c.primaryTableRows(panel).length, 3);
});

test('created_at ordering is chronological and shared with PDF and Excel payloads', () => {
  const { c, panel, state, sourceRows } = setup();
  panel.columns.push({ key: 'created_at', label: 'created_at' });
  sourceRows[0].created_at = '2026-09-03 00:00:00';
  sourceRows[1].created_at = Date.parse('2026-09-01T00:00:00Z');
  sourceRows[2].created_at = '2026-09-02T00:00:00Z';
  state.sort[panel.id] = { key: 'created_at', dir: 'asc' };
  assert.deepEqual(plain(c.financeTableExportPayload(panel.id).rows.map(row => row.order_id)), ['2', '3', '1']);
  state.sort[panel.id].dir = 'desc';
  assert.deepEqual(plain(c.financeTableExportPayload(panel.id).rows.map(row => row.order_id)), ['1', '3', '2']);
});

test('original PDF and Excel payloads export only the current visible columns', () => {
  const { c, panel, native, state } = setup();
  state.hiddenColumns[panel.id] = ['branch', 'payment_status'];
  const primary = c.financeTableExportPayload(panel.id);
  assert.deepEqual(plain(primary.columns.map(column => column.key)), ['order_id', 'quantity', 'commission']);
  assert.equal(primary.footer.length, primary.columns.length);
  state.hiddenColumns[c.tableColumnVisibilityId(panel.id, native.key)] = ['typeofpayment'];
  const source = c.financeTableExportPayload(panel.id, native.key);
  assert.deepEqual(plain(source.columns.map(column => column.key)), ['branch_name', 'net_sales']);
  assert.equal(source.columns[1].value(source.rows[0]), source.rows[0].net_sales);
  state.hiddenColumns[panel.id] = [];
  assert.equal(c.financeTableExportPayload(panel.id).columns.length, panel.columns.length);
});

test('native source copies keep their own filters, columns, totals and export', () => {
  const { c, panel, native, state } = setup();
  state.tableColumnFilters[c.tableFilterId(panel.id, native.key)] = { typeofpayment: { mode: 'include', values: ['cash'] } };
  const copy = c.duplicateFinanceTable(panel.id, native.key), instance = c.tableCopyContext(copy.id);
  assert.equal(c.tableCopyRows(instance).length, 2);
  state.tableColumnFilters[c.tableFilterId(panel.id, native.key)] = { typeofpayment: { mode: 'include', values: ['online'] } };
  assert.equal(c.tableCopyRows(c.tableCopyContext(copy.id)).length, 2);
  const footer = c.tableCopyFooterMarkup(instance, c.tableCopyRows(instance));
  assert.match(footer, /RM 125\.00/);
  const payload = c.financeTableExportPayload(panel.id, native.key, copy.id);
  assert.equal(payload.rows.length, 2);
  assert.equal(payload.columns.length, 3);
  assert.match(c.tableCopyMarkup(copy), /grafana-source-table/);
});

test('primary copy PDF/Excel totals reconcile all filtered rows, not the scroll batch', () => {
  const { c, panel, state } = setup();
  const copy = c.duplicateFinanceTable(panel.id), instance = c.tableCopyContext(copy.id);
  state.tableColumnFilters[instance.tableId] = { payment_status: { mode: 'include', values: ['Pending'] } };
  const payload = c.financeTableExportPayload(panel.id, '', copy.id);
  assert.equal(payload.panelTitle, 'Commission Rider');
  assert.equal(payload.rows.length, 2);
  assert.equal(payload.summary.value, 'RM 40.00');
  assert.deepEqual(plain(payload.footer.slice(-2)), ['4', 'RM 40.00']);
  state.tableColumnFilters[instance.tableId] = {};
  assert.equal(c.financeTableExportPayload(panel.id, '', copy.id).summary.value, 'RM 60.00');
  assert.match(c.tableCopyMarkup(copy), /data-rendered-rows="2" data-rows-complete="false"/);
});

test('all ledger totals are sticky and never hidden until scrolling finishes', () => {
  assert.match(html, /\.ledger-card \.table-wrap tfoot\s*\{\s*display: table-footer-group;/);
  assert.doesNotMatch(html, /[^{}]*tfoot[^{}]*\{[^{}]*display:\s*none/);
  assert.match(html, /\.ledger-card tfoot td\s*\{\s*position: sticky;\s*bottom: 0;/);
  assert.match(html, /<tfoot><tr>\$\{totals\}<\/tr><\/tfoot>/);
  assert.doesNotMatch(html, /View totals ↓/);
});

test('source totals are present before the last batch and reflect all filtered rows', () => {
  const { c, panel, native, state } = setup();
  const markup = c.grafanaSourceTablesMarkup(panel);
  assert.match(markup, /data-rendered-rows="2"/);
  assert.match(markup, /<tfoot><tr><td>Filtered total<\/td><td><\/td><td class="numeric">RM 175\.00/);
  state.tableColumnFilters[c.tableFilterId(panel.id, native.key)] = { typeofpayment: { mode: 'include', values: ['cash'] } };
  assert.match(c.grafanaSourceTablesMarkup(panel), /RM 125\.00/);
  state.tableColumnFilters[c.tableFilterId(panel.id, native.key)] = { typeofpayment: { mode: 'include', values: [] } };
  assert.match(c.grafanaSourceTablesMarkup(panel), /<tfoot>[\s\S]*Filtered total[\s\S]*RM 0\.00/);
});

test('copies keep a zero filtered total when no records match', () => {
  const { c, panel, state } = setup();
  const copy = c.duplicateFinanceTable(panel.id), instance = c.tableCopyContext(copy.id);
  assert.match(c.tableCopyMarkup(copy), /<tfoot>[\s\S]*RM 60\.00/);
  state.tableColumnFilters[instance.tableId] = { branch: { mode: 'include', values: [] } };
  assert.match(c.tableCopyMarkup(copy), /<tfoot>[\s\S]*Filtered total[\s\S]*RM 0\.00/);
});

test('summary totals stay under the correct columns without summing statuses or identifiers', () => {
  const { c } = setup();
  const markup = c.financeSummaryFooterMarkup(['order_ids', 'branch', 'reimbursement', 'payment_status', 'promo_codes'], { order_ids: '4', reimbursement: 'RM 50.00' }, 'branch');
  assert.equal(markup, '<tfoot><tr><td>4</td><td>Filtered total</td><td>RM 50.00</td><td></td><td></td></tr></tfoot>');
  assert.match(html, /\.reimbursement-matrix tfoot td \{\s*position: sticky;\s*bottom: 0;/);
});

test('row details use the copy ordered row set', () => {
  const { c, panel, state } = setup();
  const copy = c.duplicateFinanceTable(panel.id), instance = c.tableCopyContext(copy.id);
  state.sort[instance.tableId] = { key: 'commission', dir: 'desc' };
  c.openRowDetail(panel.id, 0, copy.id);
  assert.match(c.detailBody, /<span>order_id<\/span><strong>3<\/strong>/);
  c.openRowDetail(panel.id, 0);
  assert.match(c.detailBody, /<span>order_id<\/span><strong>1<\/strong>/);
});

test('progressive scrolling and Show filtered total append only the remaining copy rows', () => {
  const { c, panel } = setup();
  const copy = c.duplicateFinanceTable(panel.id);
  let appended = '';
  const count = {}, progress = {};
  const wrap = { dataset: { tableCopyId: copy.id, renderedRows: '2' },
    querySelector: () => ({ insertAdjacentHTML: (_where, markup) => { appended += markup; } }),
    closest: () => ({ querySelector: (selector) => selector === '[data-copy-row-count]' ? count : progress }) };
  c.appendScrollableTableCopyRows(wrap, true);
  assert.equal(wrap.dataset.renderedRows, '3');
  assert.equal(wrap.dataset.rowsComplete, 'true');
  assert.equal((appended.match(/<tr/g) || []).length, 1);
  assert.match(progress.textContent, /All 3/);
  c.appendScrollableTableCopyRows(wrap, true);
  assert.equal((appended.match(/<tr/g) || []).length, 1);
});

test('copy totals buttons have table-specific labels and participate in scroll synchronization', () => {
  const { c } = setup();
  const attributes = {};
  const button = { dataset: { copyJumpTotals: 'table-test' }, setAttribute: (name, value) => { attributes[name] = value; } };
  c.setTableJumpButtonState(button, true);
  assert.equal(button.textContent, 'Back to top ↑');
  assert.doesNotMatch(attributes['aria-label'], /Commission/);
  c.setTableJumpButtonState(button, false);
  assert.equal(button.textContent, 'Show filtered total ↓');
  assert.match(html, /querySelector\("\[data-table-jump-totals\], \[data-copy-jump-totals\], \[data-source-jump-totals\]"\)/);
  assert.match(html, /distanceFromBottom <= 6 && tableWrap\.dataset\.rowsComplete === "true"/);
});

test('all primary and native source tables expose Show filtered total', () => {
  const { c, panel } = setup();
  assert.match(c.grafanaSourceTablesMarkup(panel), /data-source-jump-totals[^>]*>Show filtered total ↓/);
  assert.doesNotMatch(html, /panel\.id === "commission-main" \? `<button class="table-jump-totals"/);
  assert.match(html, /data-table-jump-totals="\$\{esc\(panel\.id\)\}"/);
  assert.equal((html.match(/data-summary-jump-totals data-table-jump-position/g) || []).length, 2);
});

test('every totals button shares a centered footer layout on desktop and mobile', () => {
  assert.match(html, /\.table-controls:has\(> \.table-jump-totals\) \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);\s*align-items: center;/);
  assert.match(html, /\.table-controls > \.table-jump-totals \{\s*grid-column: 2;\s*grid-row: 1;\s*justify-self: center;\s*align-self: center;\s*margin: 0;/);
  assert.match(html, /@media \(max-width: 680px\) \{\s*\.table-controls:has\(> \.table-jump-totals\) \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(html, /\.table-controls > :is\(\.row-count, \.table-jump-totals, \.scroll-table-status\) \{\s*grid-column: 1;\s*grid-row: auto;\s*justify-self: center;\s*text-align: center;/);
  assert.match(html, /body\.arrange-finance-visuals \.ledger-card\.finance-visual \.table-controls \{\s*padding-inline: 58px;/);
  assert.doesNotMatch(html, /\.panel-commission-main \.table-jump-totals/);
});

test('native source Show filtered total loads the remaining filtered rows once', () => {
  const { c, panel, native } = setup();
  let appended = '';
  const progress = {};
  const wrap = { dataset: { scrollLedger: panel.id, scrollSource: native.key, renderedRows: '2' },
    querySelector: () => ({ insertAdjacentHTML: (_where, markup) => { appended += markup; } }),
    closest: () => ({ querySelector: () => progress }) };
  assert.equal(c.appendScrollableGrafanaRows(wrap, true), 3);
  assert.equal(wrap.dataset.rowsComplete, 'true');
  assert.match(progress.textContent, /All 3/);
  assert.equal((appended.match(/<tr/g) || []).length, 1);
  c.appendScrollableGrafanaRows(wrap, true);
  assert.equal((appended.match(/<tr/g) || []).length, 1);
});

test('duplicate a copy preserves its view and deletion cannot target originals', () => {
  const { c, panel, state } = setup();
  const first = c.duplicateFinanceTable(panel.id), firstContext = c.tableCopyContext(first.id);
  state.search[firstContext.tableId] = 'Johor';
  const second = c.duplicateFinanceTable(panel.id, '', first.id);
  assert.equal(c.tableCopyRows(c.tableCopyContext(second.id)).length, 1);
  assert.equal(c.deleteFinanceTableCopy(panel.id), false);
  assert.equal(c.deleteFinanceTableCopy(`${panel.id}:table`), false);
  assert.equal(c.deleteFinanceTableCopy(first.id), true);
  assert.equal(c.readTableCopies().length, 1);
  assert.equal(c.primaryTableRows(panel).length, 3);
  assert.equal(c.tableCopyContext(second.id).search, 'Johor');
});

test('shared layout persists copy references and accepts explicit deletion of every copy', () => {
  const { c, panel } = setup();
  const copy = c.duplicateFinanceTable(panel.id);
  const payload = plain(c.financeDashboardLayoutPayload());
  assert.equal(payload.tableCopies[0].id, copy.id);
  const next = setup();
  assert.equal(next.c.applySharedFinanceDashboardLayout(payload), true);
  assert.equal(next.c.tableCopyContext(copy.id).panel.id, panel.id);
  assert.equal(next.c.applySharedFinanceDashboardLayout({ order: {}, size: {}, tableCopies: [], updatedAt: '2026-09-03' }), true);
  assert.equal(next.c.readTableCopies().length, 0);
});

test('Arrange Cancel restores added/deleted copies and their original view settings', () => {
  const { c, panel, state } = setup();
  const first = c.duplicateFinanceTable(panel.id), instance = c.tableCopyContext(first.id);
  state.search[instance.tableId] = 'KL';
  const snapshot = c.captureFinanceLayoutStorageSnapshot();
  c.deleteFinanceTableCopy(first.id);
  c.duplicateFinanceTable(panel.id);
  c.restoreFinanceLayoutStorageSnapshot(snapshot);
  assert.deepEqual(plain(c.readTableCopies().map((copy) => copy.id)), [first.id]);
  assert.equal(c.tableCopyContext(first.id).search, 'KL');
});

test('missing native sources still render their saved copy with a delete control', () => {
  const { c, panel, native, state } = setup();
  const copy = c.duplicateFinanceTable(panel.id, native.key);
  state.grafanaTables[panel.id] = [];
  const markup = c.tableDashboardVisualsMarkup(panel);
  assert.match(markup, /not available in the current period/);
  assert.match(markup, new RegExp(`data-delete-table-copy="${copy.id}"`));
});

test('queued committed saves never publish a later unsaved Arrange draft', async () => {
  const { c, panel } = setup();
  c.duplicateFinanceTable(panel.id);
  const saved = [];
  let release;
  c.publishFinanceDashboardDefault = async (layout) => {
    saved.push(plain(layout));
    if (saved.length === 1) await new Promise((resolve) => { release = resolve; });
  };
  const firstSave = c.queueFinanceDashboardSave();
  await new Promise((resolve) => setImmediate(resolve));
  const second = c.duplicateFinanceTable(panel.id);
  const secondSave = c.queueFinanceDashboardSave();
  c.deleteFinanceTableCopy(second.id); // Unsaved edit made while the previous request is pending.
  release();
  await Promise.all([firstSave, secondSave]);
  assert.equal(saved[0].tableCopies.length, 1);
  assert.equal(saved[1].tableCopies.length, 2);
  assert.equal(c.readTableCopies().length, 1);
});

test('copy placement uses the dashboard grid and never imports control-summary keys', () => {
  const { c, panel, storage } = setup();
  let selector;
  c.document.querySelectorAll = (value) => { selector = value; return [{ dataset: { visualPanel: panel.id }, querySelectorAll: () => [{ dataset: { visualKey: `${panel.id}:table` } }] }]; };
  storage.set('sizes', JSON.stringify({ [panel.id]: { [`${panel.id}:table`]: { columns: 8, height: 500, rowStart: 10, columnStart: 1 } } }));
  const copy = c.duplicateFinanceTable(panel.id);
  assert.equal(selector, '.dashboard-chart-grid.finance-arrange-container');
  assert.deepEqual(JSON.parse(storage.get('orders'))[panel.id], [`${panel.id}:table`, c.tableCopyId(copy)]);
  const savedSize = JSON.parse(storage.get('sizes'))[panel.id][c.tableCopyId(copy)];
  assert.equal(savedSize.columns, 8);
  assert.equal(savedSize.height, 500);
  assert.equal(savedSize.rowStart, undefined);
});
