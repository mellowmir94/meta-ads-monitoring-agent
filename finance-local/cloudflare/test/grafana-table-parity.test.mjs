import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

test('Reimbursement defaults to all 14 saved Grafana order statuses', () => {
  const reimbursementFilters = html.match(/"reimbursement-details": \[([\s\S]*?)\n        \],\n        "daily-sales-branch-overview"/u)?.[1] || '';
  const definition = reimbursementFilters.match(/\{ key: "order_status", label: "order_status"[^\n]+/u)?.[0] || '';
  const active = definition.match(/active: \[(.*?)\], grafanaActive:/u)?.[1] || '';
  const values = [...active.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(values.length, 14);
  assert.deepEqual(values, ['arrived', 'cancelled', 'completed', 'dispatched', 'in_progress', 'pending', 'pending_scrap_receive', 'pending_stock_pickup', 'ready_to_dispatch', 'refunded', 'scrap_handover', 'unassigned', 'waiting_confirmation', 'waiting_payment']);
});

test('Reimbursement exposes only the three saved Grafana variables in source order', () => {
  const definition = html.match(/"reimbursement-details": \[([\s\S]*?)\n        \],\n        "daily-sales-branch-overview"/u)?.[1] || '';
  const keys = [...definition.matchAll(/key: "([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(keys, ['product', 'order_status', 'order_segment']);
  assert.doesNotMatch(definition, /key: "branch_name"|key: "payment_status"/u);
});

test('Branch and HQ Details use the native Grafana headers and companion tables render', () => {
  assert.match(html, /title: "Daily Sales Finance - Branch Overview"[\s\S]*?label: "orderID"[\s\S]*?label: "tally"/u);
  assert.match(html, /title: "Daily Sales Finance - HQ & Dealer Overview"[\s\S]*?label: "orderID"[\s\S]*?label: "tally"/u);
  assert.match(html, /function grafanaSourceTablesMarkup\(panel\)/u);
  assert.match(html, /tableExportMenuMarkup\(panel\.id, \{ sourceKey: table\.key, tableTitle: table\.title \}\)/u);
  assert.match(html, /panelUsesGrafanaUtc/u);
});

test('all tables in the four exact-match tabs offer complete Excel and PDF exports', () => {
  assert.match(html, /data-finance-export-format="excel"/u);
  assert.match(html, /data-finance-export-format="pdf"/u);
  assert.match(html, /function financeTableExportPayload\(panelId, sourceKey = "", copyId = ""\)/u);
  assert.match(html, /rows: grafanaFilteredTableRows\(panel, table\)/u);
  assert.match(html, /rows: primaryTableRows\(panel\)/u);
  assert.match(html, /function downloadExcelTable\(payload\)/u);
  assert.match(html, /function downloadPdfTable\(payload\)/u);
  assert.match(html, /vendor\/jszip\.min\.js/u);
  assert.match(html, /vendor\/jspdf\.umd\.min\.js/u);
  assert.match(html, /vendor\/jspdf\.plugin\.autotable\.min\.js/u);
});

test('the four exact-match tabs center table values while keeping only the first header left aligned', () => {
  assert.match(html, /:is\(\.panel-commission-main, \.panel-reimbursement-details, \.panel-daily-sales-branch-overview, \.panel-daily-sales-hq-dealer-overview\) \.ledger-card tbody td,/u);
  assert.match(html, /\.ledger-card tfoot td \{\s*text-align: center !important;/u);
  assert.match(html, /\.ledger-card thead th:first-child \{\s*text-align: left !important;/u);
  assert.match(html, /\.ledger-card thead th \{\s*text-align: center !important;/u);
  assert.match(html, /\.ledger-card td\.numeric \.bar-track \{\s*justify-content: center !important;/u);
});

test('Branch and HQ filters retain the exact saved Grafana sales scope', () => {
  const paymentScope = html.match(/const SALES_PAYMENT_GRAFANA_ACTIVE = \[(.*?)\];/u)?.[1] || '';
  const paymentValues = [...paymentScope.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(paymentValues.length, 22);
  assert.ok(paymentValues.includes('Claim Billing:(Atome)'));
  assert.ok(!paymentValues.includes('billplz'));
  assert.deepEqual(paymentValues.slice(0, 4), ['2C2P', 'Boost', 'Claim Billing:(Bateriku - Staff Purchase)', 'Claim Billing:(Grab)']);
  const branchFilters = html.match(/"daily-sales-branch-overview": \[([\s\S]*?)\n        \],\n        "daily-sales-hq-dealer-overview"/u)?.[1] || '';
  const hqFilters = html.match(/"daily-sales-hq-dealer-overview": \[([\s\S]*?)\n        \],\n        "job-booking"/u)?.[1] || '';
  for (const definition of [branchFilters, hqFilters]) {
    const keys = [...definition.matchAll(/key: "([^"]+)"/gu)].map((match) => match[1]);
    assert.deepEqual(keys, ['payment_method', 'brand', 'battery_size', 'branch_name', 'product_category']);
    assert.doesNotMatch(definition, /excludePaymentProvider|key: "channel"/u);
  }
  // Assert the scope definition, not retired explanatory UI copy.
  assert.match(branchFilters, /SALES_PAYMENT_GRAFANA_ACTIVE/u);
  assert.match(hqFilters, /SALES_PAYMENT_GRAFANA_ACTIVE/u);
});

test('value filters are attached to every table header in only the four requested Finance tabs', () => {
  const allowedSet = html.match(/const TABLE_HEADER_FILTER_PANELS = new Set\(\[([\s\S]*?)\]\);/u)?.[1] || '';
  const allowedPanels = [...allowedSet.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(allowedPanels, [
    'commission-main',
    'reimbursement-details',
    'daily-sales-branch-overview',
    'daily-sales-hq-dealer-overview'
  ]);
  assert.doesNotMatch(allowedSet, /job-booking|pending-job|pending-payment|quantity-pitstop/u);
  assert.match(html, /function tableHeaderCellMarkup\(panel, column, options = \{\}\)/u);
  assert.match(html, /columns\.map\(\(column\) => tableHeaderCellMarkup\(panel, column, \{ sourceKey: table\.key, table \}\)\)/u);
  assert.match(html, /tableColumns\.map\(\(column\) => tableHeaderCellMarkup\(panel, column\)\)/u);
  assert.match(html, /data-table-filter-select-all/u);
  assert.match(html, /data-table-filter-apply/u);
  assert.match(html, /data-table-filter-clear/u);
});

test('optional operational dashboards are hidden by default but remain available through Settings', () => {
  assert.match(html, /const HIDDEN_TABS_KEY = "ledger-local-finance-hidden-tabs-v1"/u);
  assert.match(html, /const OPTIONAL_TAB_IDS = \["jobbooking", "pendingjob", "pendingpayment", "quantity"\]/u);
  assert.match(html, /const DEFAULT_HIDDEN_TAB_IDS = new Set\(OPTIONAL_TAB_IDS\)/u);
  assert.match(html, /id="dashboardTabsButton"/u);
  assert.match(html, /data-tab-visibility-toggle/u);
  assert.match(html, /function dashboardTabsSettingsMarkup\(\)/u);
  assert.match(html, /function syncOptionalTabVisibility\(\)/u);
  assert.match(html, /if \(state\.hiddenTabs\.has\(state\.activeTab\)\)/u);
  for (const tabId of ['jobbooking', 'pendingjob', 'pendingpayment', 'quantity']) {
    assert.match(html, new RegExp(`data-tab="${tabId}" data-optional-tab="${tabId}"`, 'u'));
  }
  assert.match(html, /state\.activeTab = tabButton\.dataset\.tab;[\s\S]*?await loadActiveTabData\(\)/u);
});

test('first paint is not blocked by optional chart and export bundles', () => {
  assert.match(html, /<script data-finance-recharts><\/script>/u);
  assert.doesNotMatch(html, /<script[^>]+src="vendor\/(?:jszip|jspdf)/u);
  assert.match(html, /ensureFinanceVChartBundle/u);
  assert.match(html, /ensureFinanceExportBundle/u);
  assert.match(html, /finance-vchart-ready/u);
});

test('interactive filters avoid rebuilding hidden tabs and every checkbox click', () => {
  assert.match(html, /const activeHostId = visualHosts\[state\.activeTab\]/u);
  assert.match(html, /const activeTabChanged = lastRenderedActiveTab !== state\.activeTab/u);
  assert.match(html, /if \(host === activeHost && \(!activeTabChanged \|\| !host\.childElementCount\)\)/u);
  assert.match(html, /if \(host\.closest\("\[hidden\]"\)\) return;/u);
  assert.match(html, /function updateFilterMenuSelection\(panelId, key\)/u);
  assert.match(html, /updateFilterMenuSelection\(panelId, key\);\s*return;/u);
  assert.match(html, /data-filter-menu-done-panel[\s\S]*?reconcileChartSelection\(panel\)/u);
});

test('Grafana traffic uses the dedicated edge route with staged idle loading', () => {
  assert.match(html, /const FINANCE_API_ENDPOINT = "\/api\/grafana\/finance"/u);
  assert.match(worker, /url\.pathname === "\/api\/grafana\/finance"/u);
  assert.match(worker, /"panel", "from", "to", "scope", "part"/u);
  assert.match(html, /scheduleFinanceIdle\(\(\) => \{ void loadGrafanaSupplemental\(panel\); \}, 1200\)/u);
  assert.match(html, /const params = new URLSearchParams\(\{ panel: panelId, part \}\);[\s\S]*?params\.set\("scope", "grafana"\)/u);
});

test('edge and vendor caching use explicit freshness and immutable versioning', () => {
  assert.match(worker, /function financeCachePolicy\(/u);
  assert.match(worker, /stale-while-revalidate=/u);
  assert.match(worker, /max-age=31536000, immutable/u);
  assert.match(html, /const FINANCE_ASSET_VERSION = "\d{8}\.\d+"/u);
  assert.match(html, /versionedFinanceAsset\("vendor\/recharts-finance\.min\.js"\)/u);
});

test("large Finance scopes avoid quadratic filtering and preserve mounted charts", () => {
  assert.match(html, /const availableFields = new Map\(filters\.map/u);
  assert.match(html, /const panelFilterOptionsMemo = new Map\(\)/u);
  assert.match(html, /cached\?\.source === source && cached\.liveOptions === liveOptions/u);
  assert.match(html, /async function canonicalizeFinanceRows\(panel, sourceRows\)/u);
  assert.match(html, /if \(end < sourceRows\.length\) await yieldFinanceFrame\(\)/u);
  assert.doesNotMatch(html, /if \(!dateFilteredRows\.some\(\(candidate\) => rowHasFilterField\(candidate, filter\)\)\)/u);
  assert.match(html, /const panelScopeMemo = new Map\(\)/u);
  assert.match(html, /const TABLE_SCROLL_BATCH = 40/u);
  assert.match(html, /const SOURCE_TABLE_SCROLL_BATCH = 20/u);
  assert.match(html, /function reconcileVisualHost\(host, markup\)/u);
  assert.match(html, /data-vchart-key=/u);
  assert.match(html, /const renderChart = typeof api\.refresh === "function" \? api\.refresh : api\.mount/u);
  assert.match(html, /renderChart\(host, host\.dataset\.vchartKind, payload, colors\)/u);
  assert.match(html, /function appendScrollableGrafanaRows\(tableWrap, loadAll = false\)/u);
  assert.match(html, /data-scroll-source=/u);
  assert.match(html, /renderedRows\.map\(\(row\) => grafanaSourceRowMarkup/u);
  assert.match(html, /rows: Array\.isArray\(table\.rows\) \? table\.rows : \[\]/u);
  assert.match(html, /void loadActiveTabData\(false, true\)/u);
  assert.match(html, /const candidatePanels = preloadCore \? \[\.\.\.new Map\(\[\.\.\.activeTabPanels\(\),/u);
  assert.match(html, /await Promise\.all\(foreground\.map\(loadPanel\)\)/u);
  assert.match(html, /Math\.min\(2, background\.length\)/u);
  assert.doesNotMatch(html, /financeCorePreloading/u);
  assert.match(html, /const financePointerFilterHandled = new WeakMap\(\)/u);
  assert.match(html, /document\.addEventListener\("pointerdown", \(event\) =>/u);
  assert.match(html, /filterTrigger\.focus\(\{ preventScroll: true \}\)/u);
  assert.match(html, /const menu = trigger\?\.closest\("\.filter-shell"\)\?\.querySelector\("\[data-filter-menu\]"\)/u);
  assert.match(html, /if \(activePanel\(\)\?\.id === panelId && !state\.openFilter && !state\.timeRangeOpen\) render\(\)/u);
});

test('large Grafana snapshots stream through the Finance edge without full-body buffering', () => {
  assert.doesNotMatch(worker, /await response\.arrayBuffer\(\)/u);
  assert.match(worker, /return \(await pending\)\.clone\(\)/u);
  assert.match(worker, /new Response\(response\.body/u);
  assert.match(worker, /upstreamResponse\.clone\(\)/u);
});

test('the login shell prewarms the critical Commission snapshot before dashboard entry', () => {
  assert.match(worker, /async function prewarmCommissionPrimary\(env\)/u);
  assert.match(worker, /url\.searchParams\.set\("panel", "commission-main"\)/u);
  assert.match(worker, /url\.searchParams\.set\("scope", "grafana"\)/u);
  assert.match(worker, /url\.searchParams\.set\("part", "primary"\)/u);
  assert.match(worker, /context\.waitUntil\(prewarmCommissionPrimary\(env\)\.catch/u);
  assert.match(worker, /response\.body\.pipeTo\(new WritableStream\(\)\)/u);
});

test('Commission KPIs fall back to the exact filtered Grafana detail rows when the metric frame is empty', () => {
  assert.match(html, /Array\.isArray\(payload\.metricRows\) && payload\.metricRows\.length/u);
  assert.match(html, /const sourceRows = Array\.isArray\(metricRows\) && metricRows\.length \? metricRows : rows\(panel\.id\)/u);
  assert.match(html, /const stats = grafanaCommissionStats\(scopedRows \?\? commissionMetricFilteredRows\(panel\)\)/u);
});

test('Commission Rider visible columns match the latest Grafana Main Table panel schema', () => {
  const commissionBlock = html.slice(
    html.indexOf('id: "commission-main"'),
    html.indexOf('id: "reimbursement-details"')
  );
  const expectedColumns = [
    'order_id', 'parent_id', 'created_at', 'request_at', 'rider_name',
    'arrival_status', 'order_status', 'vpn', 'branch_name', 'products',
    'battery_size', 'vehicle_name', 'promocode',
    'delivery_service_option', 'level', 'payment_type', 'sales_source',
    'payment_status', 'paymenttotal', 'quantity', 'commission'
  ];
  const actualColumns = [...commissionBlock.matchAll(/\{ key: "([^"]+)", label:/gu)].map((match) => match[1]);
  assert.deepEqual(actualColumns, expectedColumns);
  assert.doesNotMatch(commissionBlock, /key: "battery_level"/u);
  assert.match(html, /hiddenColumns: \{ "commission-main": \["delivery_service_option", "sales_source", "paymenttotal"\] \}/u);
});

test('Arrange mode preserves the live dashboard flow before enabling the editable grid', () => {
  assert.match(html, /function captureFinanceVisualFlowLayout\(grid\)/u);
  assert.match(html, /const snapshots = captureFinanceVisualFlowLayout\(grid\)/u);
  assert.match(html, /ledger-local-finance-reference-layout-v9/u);
  assert.match(html, /Canonical finance dashboard composition/u);
  assert.match(html, /\.panel-commission-main \.dashboard-chart-grid:not\(\.visual-stack-layout\) > \.decision-kpi\.finance-visual \{[\s\S]*?grid-column: span 6 !important/u);
  assert.match(html, /\.dashboard-chart-grid:not\(\.visual-stack-layout\) > :is\(\.grafana-source-table, \.ledger-card\)\.finance-visual \{[\s\S]*?grid-column: 1 \/ -1 !important/u);
  assert.doesNotMatch(html, /if \(grid\.classList\.contains\("visual-stack-layout"\)\) return;[\s\S]{0,180}const snapshots = captureFinanceVisualFlowLayout/u);
  assert.match(html, /financeVisualCards\(grid\)\.forEach\(clearFinanceVisualGridPlacement\)/u);
  assert.match(html, /snapshot\.columns,[\s\S]*?snapshot\.height,[\s\S]*?snapshot\.columnStart,[\s\S]*?snapshot\.rowStart/u);
  assert.doesNotMatch(html, /const snapshots = financeVisualCards\(grid\)\.map\(\(card\) => \(\{[\s\S]*?materializeFinanceVisualGridPositions\(grid\);[\s\S]*?\}\);/u);
});

test('Commission state fullscreen uses the complete presentation panel', () => {
  assert.match(html, /Commission presentation layout/u);
  assert.match(html, /:has\(\.commission-state-pie-layout\) \{\s*min-height: clamp\(720px, 76vh, 940px\) !important;/u);
  assert.match(html, /\.commission-state-pie-layout \{\s*grid-template-columns: minmax\(520px, 1\.25fr\) minmax\(440px, \.75fr\);[\s\S]*?gap: clamp\(36px, 4vw, 72px\);/u);
  assert.match(html, /\.commission-state-legend \{\s*min-height: 0;\s*max-height: none;\s*height: 100%;/u);
  assert.match(html, /\.commission-state-legend-column \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\);/u);
});

test('large Grafana tables use the compact lossless Finance transport', () => {
  assert.match(worker, /FINANCE_CACHE_SCHEMA = "grafana-finance-tables-v\d+"/u);
  assert.match(worker, /cacheUrl\.searchParams\.set\("schema", FINANCE_CACHE_SCHEMA\)/u);
  assert.match(worker, /upstreamUrl\.searchParams\.set\("format", "packed"\)/u);
  assert.match(html, /async function canonicalizePackedFinanceRows\(panel, packedRows\)/u);
  assert.match(html, /async function canonicalizeFinancePayloadRows\(panel, payload\)/u);
  assert.match(html, /canonicalizeFinancePayloadRows\(panel, payload\)/u);
});

test('background core preloads cannot overwrite the active tab status', () => {
  assert.match(html, /const setPanelStatus = \(title, detail\) => \{\s*if \(activePanel\(\)\?\.id === panelId\) setStatus\(title, detail\);\s*\};/u);
  assert.match(html, /setPanelStatus\("Grafana data loaded", `\$\{formatNumber\(liveRows\.length\)\} rows loaded for \$\{panel\.title\}/u);
  assert.match(html, /setPanelStatus\("Grafana connection error"/u);
});
