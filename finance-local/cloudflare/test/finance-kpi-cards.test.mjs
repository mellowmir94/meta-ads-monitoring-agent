import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const panelIds = ['commission-main', 'reimbursement-details', 'daily-sales-branch-overview', 'daily-sales-hq-dealer-overview', 'job-booking', 'pending-job', 'pending-payment-combined', 'quantity-pitstop-details'];
function declaration(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n      function ', start + 1));
}

function setup(source = []) {
  const state = { metricRows: {}, imports: {}, filters: {}, search: {} };
  const dialogs = [];
  let metricSource = source;
  let tableSource = source;
  const sandbox = {
    state, panelFilterDefs: {}, filteredRows: () => tableSource, rows: () => source,
    applyPanelFilters: (_panel, rows) => rows,
    commissionMetricFilteredRows: () => metricSource,
    periodLabel: () => 'Selected period',
    numberValue: (value) => Number(value) || 0,
    distinctCount: (rows, key) => new Set(rows.map((row) => row[key]).filter(Boolean)).size,
    rowChannel: (row) => row.channel || 'Dealer', normalizeFilterText: (value) => String(value).trim().toLowerCase(),
    formatNumber: (value, digits = 0) => Number(value).toLocaleString('en-MY', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    formatMoney: (value) => `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formatPercent: (value) => `${Number(value).toFixed(2)}%`,
    formatFinanceDate: (value) => value,
    chartState: () => ({ selection: '' }),
    rowTimestamp: (row) => row.date ? new Date(`${row.date}T12:00:00`).getTime() : null,
    esc: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    showFinanceDialog: (...args) => dialogs.push(args),
  };
  vm.createContext(sandbox);
  vm.runInContext(['parseFinanceNumber', 'numberValue', 'dateBucket', 'grafanaCommissionStats', 'decisionKpis', 'commissionKpiUtcTimestamp', 'commissionKpiHistory', 'decisionKpiHistory', 'decisionKpiTrend', 'decisionKpiPointValue', 'decisionKpiSparkline', 'decisionKpiCardMarkup', 'decisionKpiMarkup', 'showDecisionKpiDetails', 'financeGridPlacementOverlaps', 'compactFinanceKpiPlacements', 'reflowExpandedKpiPlacements'].map(declaration).join('\n'), sandbox);
  return { ...sandbox, dialogs, setMetricSource: (rows) => { metricSource = rows; state.metricRows['commission-main'] = rows; }, setTableSource: (rows) => { tableSource = rows; } };
}

function history(values) {
  return { reason: '', points: values.map((value, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, values: { metric: value } })) };
}

test('every KPI uses direction only: green up, red down, slate unchanged, including zero and negative baselines', () => {
  const api = setup();
  const cases = [
    [[100, 120], 'up', '+20.0%'], [[120, 100], 'down', '−16.7%'],
    [[100, 100], 'neutral', '0.0%'], [[0, 0], 'neutral', '0.0%'],
    [[0, 50], 'up', 'From 0'], [[0, -50], 'down', 'From 0'],
    [[-100, -50], 'up', '+50.0%'], [[-50, -100], 'down', '−100.0%'],
    [[100, 100.001], 'up', '+<0.1%'], [[100, 99.999], 'down', '−<0.1%'],
  ];
  for (const [values, direction, label] of cases) {
    const result = api.decisionKpiTrend({ metric: 'metric' }, history(values));
    assert.equal(result.direction, direction);
    assert.equal(result.label, label);
    assert.equal(result.comparable, true);
    assert.match(result.description, /last two observed daily values/);
  }
  assert.doesNotMatch(declaration('decisionKpiTrend'), /lowerIsBetter|favourable|is-adverse/);
  assert.match(html, /kpi-direction-up \{ --kpi-direction: var\(--kpi-up\)/);
  assert.match(html, /kpi-direction-down \{ --kpi-direction: var\(--kpi-down\)/);
});

test('missing, invalid and unavailable history stays neutral without invented sparklines', () => {
  const api = setup();
  for (const values of [[], [100], [100, null], [100, NaN], [Infinity, 100], [-1e308, 1e308]]) {
    const trend = api.decisionKpiTrend({ metric: 'metric' }, history(values));
    assert.equal(trend.direction, 'neutral');
    assert.equal(trend.label, 'No comparison');
    assert.equal(trend.comparable, false);
    assert.equal(api.decisionKpiSparkline(trend, 'sample'), '');
  }
  const unavailable = api.decisionKpiTrend({ metric: 'metric', unavailable: true }, history([100, 200]));
  assert.equal(unavailable.comparable, false);
});

test('Commission daily history uses official metric rows and Grafana reducers, never a different detail scope', () => {
  const api = setup([{ date: '2026-08-01', order_id: 'detail', commission: 99999 }]);
  const panel = { id: 'commission-main' };
  assert.deepEqual(plain(api.decisionKpis(panel).map((kpi) => kpi.value)), ['1', 'RM 99,999.00']);
  const metricRows = [{ date: '2026-08-01', order_count: 3, total_commission: 100 }, { date: '2026-08-02', order_count: 5, total_commission: 200 }];
  api.setMetricSource(metricRows);
  const kpis = api.decisionKpis(panel);
  assert.deepEqual(plain(kpis.map((kpi) => kpi.value)), ['8', 'RM 300.00']);
  const hist = api.decisionKpiHistory(panel);
  assert.deepEqual(plain(hist.points.map((point) => point.values)), [{ orders: 3, commission: 100 }, { orders: 5, commission: 200 }]);
  assert.equal(api.decisionKpiTrend(kpis[1], hist).label, '+100.0%');
  api.setMetricSource([{ order_count: 8, total_commission: 300 }]);
  const fallback = api.decisionKpiHistory(panel);
  assert.match(fallback.reason, /at least two days/);
  assert.equal(fallback.commissionOnly, true);
  const duplicates = api.decisionKpis(panel, [{ order_id: 'A', commission: 50 }, { order_id: 'A', commission: 50 }]);
  assert.equal(duplicates[0].rawValue, 2, 'Grafana count, not distinct IDs');
});

test('branch exceptions, weighted rates and collection-gap trend use the headline reducer', () => {
  const data = [
    { date: '2026-08-01', branch_name: 'HQ A', amount_paid: 100, reimbursement: 50, payment_status: 'Pending', gross_sales: 100, net_sales: 96, price: 100, payment_amount: 0 },
    { date: '2026-08-01', branch_name: 'HQ A', amount_paid: 100, reimbursement: 50, payment_status: 'Pending', gross_sales: 100, net_sales: 96, price: 0, payment_amount: 100 },
    { date: '2026-08-02', branch_name: 'HQ A', amount_paid: 100, reimbursement: 25, payment_status: 'Completed', gross_sales: 100, net_sales: 100, price: 10, payment_amount: 0 },
  ];
  const api = setup(data);
  const reimbursement = api.decisionKpiHistory({ id: 'reimbursement-details' });
  assert.equal(reimbursement.points[0].values.breaches, 1, 'count one branch, not two critical records');
  assert.equal(reimbursement.points[0].values.reimbursement_rate, 50);
  assert.equal(reimbursement.points[1].values.breaches, 0);
  const trend = api.decisionKpiTrend({ metric: 'reimbursement' }, reimbursement);
  assert.equal(trend.direction, 'down', 'lower reimbursement is red under direction-only convention');
  const branch = api.decisionKpiHistory({ id: 'daily-sales-branch-overview' });
  assert.equal(branch.points[0].values.exceptions, 1, 'two RM4 differences aggregate to one RM8 branch exception');
  assert.equal(branch.points[1].values.exceptions, 0);
  const quantity = api.decisionKpiHistory({ id: 'quantity-pitstop-details' });
  assert.equal(quantity.points[0].values.collection_gap, 0, 'net price/payment before clamping, like headline');
  assert.equal(quantity.points[1].values.collection_gap, 10);
  const invalidBase = api.decisionKpis({ id: 'reimbursement-details' }, [{ amount_paid: 0, reimbursement: 100 }]);
  assert.equal(invalidBase[1].value, '0.00%', 'headline contract is unchanged');
  assert.equal(invalidBase[1].rawValue, null, 'do not draw zero as a measured rate with no base');
});

test('history is chronological, limited to eight observed days, and never fills missing dates', () => {
  const data = Array.from({ length: 10 }, (_, i) => ({ date: `2026-08-${String(i * 2 + 1).padStart(2, '0')}`, net_sales: i * 100, gross_sales: i * 100 })).reverse();
  const before = JSON.stringify(data);
  const api = setup(data);
  const hist = api.decisionKpiHistory({ id: 'daily-sales-branch-overview' });
  assert.equal(hist.points.length, 8);
  assert.equal(hist.points[0].date, '2026-08-05');
  assert.equal(hist.points[7].date, '2026-08-19');
  assert.equal(JSON.stringify(data), before);
});

test('snapshots retain exact official headline totals but do not imply historical movement', () => {
  const api = setup([{ date: '2026-08-01', payment_amount: 1 }]);
  const panel = { id: 'pending-payment-combined', dateIndependent: true };
  api.state.imports[panel.id] = { truncated: true, exactSummary: { totalAmount: 10000, pendingPayment: 200, riders: 50 } };
  assert.deepEqual(plain(api.decisionKpis(panel).map((kpi) => kpi.value)), ['200', '50', 'RM 10,000.00']);
  const markup = api.decisionKpiMarkup(panel);
  assert.doesNotMatch(markup, /Snapshot · no comparison|No comparison|finance-kpi-bottom|<svg class="finance-kpi-sparkline"|finance-kpi-change/);
});

test('unreconciled audit history powers only the Total Commission trend while preserving the official headline', () => {
  const api = setup([
    { created_at: '2026-09-01T01:00:00Z', order_id: 'A', commission: 10 },
    { created_at: '2026-09-02T02:00:00Z', order_id: 'B', commission: 20 },
  ]);
  api.setMetricSource([{ order_count: 3, total_commission: 99 }]);
  api.state.imports['commission-main'] = { metricRowsScope: 'api-scope' };
  const panel = { id: 'commission-main' };
  const markup = api.decisionKpiMarkup(panel);
  assert.equal((markup.match(/kpi-has-trend/g) || []).length, 1);
  assert.equal((markup.match(/finance-kpi-bottom/g) || []).length, 1);
  assert.match(markup, /vs previous data day/);
  assert.match(markup, /Daily activity · UTC/);
  assert.match(markup, /RM 99\.00/);
  assert.equal((markup.match(/data-kpi-info=/g) || []).length, 2);
  assert.equal(api.decisionKpiTrend(api.decisionKpis(panel)[0], api.decisionKpiHistory(panel)).comparable, false);
  assert.equal(api.decisionKpiTrend(api.decisionKpis(panel)[1], api.decisionKpiHistory(panel)).label, '+100.0%');
  api.showDecisionKpiDetails(panel, 1);
  assert.match(api.dialogs[0][2], /headline remains the official Grafana KPI total/);
  assert.match(html, /\.decision-kpi\.finance-kpi-card:not\(\.kpi-has-trend\) \{ grid-template-rows: auto 1fr; \}/);
});

test('all 29 live KPI cards share the new renderer, retain their keys and values, and expose a working details dialog', () => {
  const data = [
    { date: '2026-08-01', order_id: 'A', commission: 10, amount_paid: 100, reimbursement: 40, branch_name: 'HQ A', gross_sales: 100, net_sales: 80, promo_discount: 5, scrap_cost: 5, payment_status: 'Pending', amount: 100, pending_days: 31, price: 100, payment_amount: 50, rider_name: 'Rider A', channel: 'Dealer' },
    { date: '2026-08-02', order_id: 'B', commission: 20, amount_paid: 100, reimbursement: 20, branch_name: 'HQ B', gross_sales: 200, net_sales: 180, promo_discount: 5, scrap_cost: 5, payment_status: 'Completed', amount: 200, pending_days: 15, price: 200, payment_amount: 200, rider_name: 'Rider B', channel: 'HQ - Selangor' },
  ];
  const api = setup(data);
  let count = 0;
  for (const id of panelIds) {
    const panel = { id };
    const kpis = api.decisionKpis(panel);
    const markup = api.decisionKpiMarkup(panel);
    assert.equal((markup.match(/class="decision-kpi finance-visual finance-kpi-card/g) || []).length, kpis.length);
    kpis.forEach((kpi, index) => {
      assert.ok(markup.includes(`data-visual-key="${id}:kpi:${index}"`));
      assert.ok(markup.includes(`>${kpi.value}</strong>`));
      assert.ok(markup.includes(`data-kpi-info="${id}" data-kpi-index="${index}"`));
    });
    count += kpis.length;
  }
  assert.equal(count, 29);
  assert.equal(api.decisionKpiMarkup({ id: 'quantity-pitstop-summary' }), '');
  api.showDecisionKpiDetails({ id: 'commission-main' }, 1);
  assert.equal(api.dialogs.length, 1);
  assert.equal(api.dialogs[0][0], 'Total Commission (RM)');
  assert.match(api.dialogs[0][2], /Green = increase\. Red = decrease\. Slate grey/);
  assert.match(html, /showDecisionKpiDetails\(panel, Number\(kpiInfo\.dataset\.kpiIndex\)\)/);
  assert.match(html, /aria-haspopup="dialog"/);
});

test('sparklines have real finite points, a last-point marker, unique fills and accessible daily labels', () => {
  const api = setup();
  assert.equal(api.decisionKpiPointValue('commission', 100.25), 'RM 100.25');
  assert.equal(api.decisionKpiPointValue('retention', 98.25), '98.25%');
  assert.equal(api.decisionKpiPointValue('orders', 100), '100');
  assert.equal(api.decisionKpiPointValue('oldest_age', 31), '31 days');
  for (const values of [[100, 120, 90, 130], [-100, -80], [0, 0], [100, 100]]) {
    const trend = api.decisionKpiTrend({ metric: 'metric' }, history(values));
    const markup = api.decisionKpiSparkline(trend, 'commission-main-1');
    assert.match(markup, /id="kpi-shade-commission-main-1"/);
    assert.match(markup, /class="kpi-spark-line"/);
    assert.match(markup, /class="kpi-spark-end"/);
    assert.match(markup, new RegExp(`Last ${values.length} observed daily values`));
    assert.doesNotMatch(markup, /NaN|Infinity/);
    const y = Number(markup.match(/kpi-spark-end" cx="[^"]+" cy="([^"]+)"/)[1]);
    assert.ok(y >= 9 && y <= 55);
  }
  assert.match(declaration('decisionKpiCardMarkup'), /const minHeight = commissionPreview \? \(trend\.comparable \? 140 : 100\) : 160/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.1fr\)/, 'caption and sparkline occupy separate columns');
  assert.match(html, /\[data-theme="dark"\] \.decision-kpi\.finance-kpi-card/);
});

test('live undated Commission totals keep their official headline while detail rows provide the daily commission trend', () => {
  const data = [
    { created_at: '2026-09-01T01:00:00Z', order_id: 'A', commission: 10.25 },
    { created_at: '2026-09-01T18:00:00Z', order_id: 'A', commission: 20.25 },
    { created_at: '2026-09-02T18:00:00Z', order_id: 'B', commission: 60.50 },
  ];
  const snapshot = JSON.stringify(data);
  const api = setup(data);
  const panel = { id: 'commission-main' };
  api.setMetricSource([{ order_count: 3, total_commission: 91 }]);
  api.state.imports[panel.id] = { metricRowsScope: 'server-resolved-scope', apiFrom: '2026-09-01 00:00:00', apiTo: '2026-09-02 23:59:59' };
  const kpis = api.decisionKpis(panel);
  assert.deepEqual(plain(kpis.map((kpi) => kpi.value)), ['3', 'RM 91.00']);
  const hist = api.decisionKpiHistory(panel);
  assert.equal(hist.reason, '');
  assert.deepEqual(plain(hist.points), [
    { date: '2026-09-01', values: { orders: 2, commission: 30.5 } },
    { date: '2026-09-02', values: { orders: 1, commission: 60.5 } },
  ]);
  assert.match(hist.basis, /Daily audit activity \(UTC\), reconciled/);
  assert.equal(api.decisionKpiTrend(kpis[0], hist).direction, 'down');
  assert.equal(api.decisionKpiTrend(kpis[1], hist).direction, 'up');
  api.setTableSource([]);
  api.state.search[panel.id] = 'no records';
  api.state.exceptionMode = { [panel.id]: 'critical' };
  assert.deepEqual(plain(api.decisionKpiHistory(panel)), plain(hist), 'table-only filters cannot narrow official KPI history');
  assert.equal(JSON.stringify(data), snapshot);
  api.setMetricSource([{ order_count: 4, total_commission: 91 }]);
  const countMismatch = api.decisionKpiHistory(panel);
  assert.equal(countMismatch.reason, '');
  assert.equal(countMismatch.commissionOnly, true);
  assert.equal(api.decisionKpiTrend(api.decisionKpis(panel)[0], countMismatch).comparable, false);
  assert.equal(api.decisionKpiTrend(api.decisionKpis(panel)[1], countMismatch).comparable, true);
  api.setMetricSource([{ order_count: 3, total_commission: 91.01 }]);
  const totalMismatch = api.decisionKpiHistory(panel);
  assert.equal(totalMismatch.reason, '');
  assert.equal(totalMismatch.commissionOnly, true);
  assert.equal(api.decisionKpiTrend(api.decisionKpis(panel)[1], totalMismatch).label, '+98.4%');
  assert.deepEqual(plain(api.decisionKpis(panel).map((kpi) => kpi.value)), ['3', 'RM 91.01'], 'never change the official headline to make history fit');
});

test('Commission audit fallback rejects incomplete, invalid, synthetic, stale and single-day history', () => {
  const panel = { id: 'commission-main' };
  const run = (data, metadata = {}, metrics = [{ order_count: 2, total_commission: 30 }]) => {
    const api = setup(data);
    api.setMetricSource(metrics);
    api.state.imports[panel.id] = { metricRowsScope: 'api-scope', apiFrom: '2026-09-01 00:00:00', apiTo: '2026-09-02 23:59:59', ...metadata };
    return { api, history: api.decisionKpiHistory(panel) };
  };
  const first = { created_at: '2026-09-01T01:00:00Z', order_id: 'A', commission: 10 };
  const second = { created_at: '2026-09-02T02:00:00Z', order_id: 'B', commission: 20 };
  for (const date of [undefined, '', 'not-a-date', '2026-09-02T23:59:59Z']) {
    assert.match(run([first, { ...second, created_at: date }]).history.reason, /trustworthy activity date/);
  }
  assert.match(run([first, second], { truncated: true }).history.reason, /incomplete/);
  assert.match(run([first, { ...second, commission: null }]).history.reason, /missing or invalid/);
  assert.match(run([first, { ...second, commission: 'invalid' }]).history.reason, /missing or invalid/);
  assert.match(run([first, { ...second, created_at: '2026-08-31T23:59:59Z' }]).history.reason, /outside/);
  assert.match(run([first, { ...second, created_at: first.created_at }]).history.reason, /at least two days/);
  const { api } = run([first, second]);
  api.state.api = { loading: { [panel.id]: true } };
  assert.match(api.decisionKpiHistory(panel).reason, /Waiting/);
  api.state.api.loading[panel.id] = false;
  assert.equal(api.decisionKpiHistory(panel).reason, '', 'no stale failed-history cache after loading');
});

test('Commission date buckets are UTC and independent of browser timezone or sign of commission', () => {
  const api = setup([
    { created_at: '2026-09-01 23:30:00', order_id: 'A', commission: -10 },
    { created_at: '2026-09-02T00:30:00+08:00', order_id: 'B', commission: 0 },
    { created_at: '2026-09-02T23:30:00Z', order_id: 'C', commission: -5 },
  ]);
  api.setMetricSource([{ order_count: 3, total_commission: -15 }]);
  api.state.imports['commission-main'] = { metricRowsScope: 'UTC' };
  const hist = api.decisionKpiHistory({ id: 'commission-main' });
  assert.deepEqual(plain(hist.points), [
    { date: '2026-09-01', values: { orders: 2, commission: -10 } },
    { date: '2026-09-02', values: { orders: 1, commission: -5 } },
  ]);
  assert.equal(api.decisionKpiTrend({ metric: 'commission' }, hist).label, '+50.0%');
  assert.equal(api.commissionKpiUtcTimestamp('1'), null);
  assert.equal(api.commissionKpiUtcTimestamp(''), null);
  assert.equal(api.commissionKpiUtcTimestamp(Infinity), null);
  for (const invalid of ['2026-02-30', '2026-02-29', '2026-09-31T12:00:00+08:00', '2026-00-01', '2026-13-01', '2026-01-00', '1900-02-29', '2100-02-29']) {
    assert.equal(api.commissionKpiUtcTimestamp(invalid), null, invalid);
  }
  for (const valid of ['2024-02-29', '2000-02-29T23:00:00Z', '2028-02-29T01:00:00+08:00', '2026-04-30']) {
    assert.equal(Number.isFinite(api.commissionKpiUtcTimestamp(valid)), true, valid);
  }
});

test('only Commission cards use 100px without comparison and 140px with trend; other KPIs stay 160px', () => {
  const api = setup([
    { date: '2026-09-01', order_id: 'A', commission: 10 },
    { date: '2026-09-02', order_id: 'B', commission: 20 },
  ]);
  const commission = api.decisionKpiMarkup({ id: 'commission-main' });
  assert.equal((commission.match(/finance-kpi-preview-card/g) || []).length, 2);
  assert.equal((commission.match(/data-min-height="140"/g) || []).length, 2);
  assert.equal((commission.match(/viewBox="0 0 200 64"/g) || []).length, 2);
  assert.equal((commission.match(/preserveAspectRatio="xMaxYMax meet"/g) || []).length, 2);
  assert.equal((commission.match(/Daily activity · UTC/g) || []).length, 2);
  for (const id of panelIds.filter((id) => id !== 'commission-main')) {
    const markup = api.decisionKpiMarkup({ id });
    assert.doesNotMatch(markup, /finance-kpi-preview-card|data-min-height="360"|Daily activity · UTC/);
    assert.match(markup, /data-min-height="160"/);
  }
  const noComparison = setup().decisionKpiMarkup({ id: 'commission-main' });
  assert.equal((noComparison.match(/data-min-height="100"/g) || []).length, 2);
  assert.doesNotMatch(noComparison, /finance-kpi-bottom|No comparison/);
  assert.match(html, /\.finance-kpi-preview-card \.finance-kpi-main > \.finance-kpi-value \{ font-size: clamp\(1\.2rem, 5\.5cqi, 1\.75rem\)/);
  assert.match(html, /\.decision-kpi\.finance-kpi-card\.finance-kpi-preview-card \{\s*--kpi-preview-height: 100px;\s*min-height: var\(--kpi-preview-height\); padding: 12px/);
  assert.match(html, /\.decision-kpi\.finance-kpi-card\.finance-kpi-preview-card\.kpi-has-trend \{ --kpi-preview-height: 140px; \}/);
  assert.match(html, /\.finance-kpi-preview-card \.finance-kpi-bottom > \.finance-kpi-sparkline \{ width: min\(100%, 220px\); height: 36px/);
  assert.match(html, /@container \(max-width: 260px\)/);
  assert.doesNotMatch(declaration('commissionKpiHistory'), /\bfetch\(|filteredRows\(panel\)|localStorage/);
});

test('every KPI uses the default dashboard surface with no direction tint and unchanged trend indicators', () => {
  const api = setup();
  const trend = api.decisionKpiTrend({ metric: 'metric' }, history([200, 100]));
  const markup = api.decisionKpiCardMarkup({ id: 'commission-main' }, { label: 'Total Commission', metric: 'metric', value: 'RM 100.00' }, 1, trend, 6);
  assert.match(markup, /finance-kpi-preview-card kpi-has-trend kpi-direction-down/);
  assert.match(markup, /finance-kpi-change/);
  assert.match(markup, /kpi-spark-line/);
  assert.match(html, /\.decision-kpi\.finance-kpi-card \{[^}]*background: var\(--kpi-surface\);/);
  assert.match(html, /\.control-metric \{ background: var\(--surface\); \}/);
  assert.match(html, /kpi-direction-down \{ --kpi-direction: var\(--kpi-down\)/);
  assert.match(html, /kpi-direction-up \{ --kpi-direction: var\(--kpi-up\)/);
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n');
  assert.deepEqual([...css.matchAll(/--kpi-surface:\s*([^;]+);/g)].map((match) => match[1]), ['var(--surface)']);
  assert.deepEqual([...css.matchAll(/--kpi-edge:\s*([^;]+);/g)].map((match) => match[1]), ['var(--line)']);
  const tintedCards = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => /background:\s*radial-gradient/.test(match[2]) && match[2].includes('var(--kpi-direction)'));
  assert.equal(tintedCards.length, 0);
});

test('compact KPI layout removes only freed empty tracks while preserving intentional gaps and neighbours', () => {
  const api = setup();
  const cards = [
    { card: 'KPI A', rowStart: 1, columnStart: 1, columns: 6, rowSpan: 11 },
    { card: 'KPI B', rowStart: 1, columnStart: 7, columns: 6, rowSpan: 11 },
    { card: 'Chart', rowStart: 20, columnStart: 1, columns: 12, rowSpan: 20 },
  ];
  const snapshot = JSON.stringify(cards);
  const bands = [{ start: 12, end: 20 }, { start: 12, end: 20 }];
  const result = api.compactFinanceKpiPlacements(cards, bands);
  assert.equal(result[2].rowStart, 12, 'overlapping freed bands are counted once');
  assert.equal(JSON.stringify(cards), snapshot, 'read-time compaction never mutates saved input');
  assert.deepEqual(plain(api.compactFinanceKpiPlacements(cards, bands)), plain(result), 'repeat loads do not drift');
  result.forEach((entry, index) => {
    assert.equal(entry.columnStart, cards[index].columnStart);
    assert.equal(entry.columns, cards[index].columns);
    assert.equal(entry.rowSpan, cards[index].rowSpan);
    result.slice(index + 1).forEach((other) => assert.equal(api.financeGridPlacementOverlaps(entry, other), false));
  });
  const gap = cards.map((entry) => entry.card === 'Chart' ? { ...entry, rowStart: 25 } : entry);
  assert.equal(api.compactFinanceKpiPlacements(gap, bands)[2].rowStart, 17, 'five intentional empty tracks remain');
  const blocked = [cards[0], { ...cards[1], card: 'Tall neighbour', rowSpan: 19 }, cards[2]];
  assert.equal(api.compactFinanceKpiPlacements(blocked, bands)[2].rowStart, 20, 'occupied neighbouring tracks cannot collapse');
  const four = [1, 4, 7, 10].map((columnStart) => ({ card: `KPI ${columnStart}`, rowStart: 1, columnStart, columns: 3, rowSpan: 9 }));
  four.push({ card: 'Chart', rowStart: 12, columnStart: 1, columns: 12, rowSpan: 20 });
  assert.equal(api.compactFinanceKpiPlacements(four, four.slice(0, 4).map(() => ({ start: 10, end: 12 })))[4].rowStart, 10, 'four shared KPI bands collapse once');
  assert.doesNotMatch(declaration('compactFinanceKpiPlacements'), /localStorage|fetch|saveFinance/);
});

test('saved larger KPI sizes on every dashboard become 160px without locking out future explicit resize', () => {
  const source = {
    'commission-main:kpi:0': { height: 360, columns: 6, columnStart: 1, rowStart: 1 },
    'commission-main:kpi:1': { height: 200, columns: 6, columnStart: 7, rowStart: 1, kpiDensity: 'compact-v1' },
    'commission-main:chart': { height: 400, columns: 12, columnStart: 1, rowStart: 20 },
  };
  const makeCard = (key) => ({ dataset: { visualKey: key }, classList: { contains: (name) => key.includes(':kpi:') && name === 'finance-kpi-card' } });
  const cards = Object.keys(source).map(makeCard);
  const grid = { classList: { add() {}, contains: () => true } };
  const box = {
    window: { innerWidth: 1280 }, VISUAL_SIZE_KEY: 'sizes',
    readVisualLayout: () => ({ commission: source }), financeVisualLayoutKey: () => 'commission',
    financeVisualCards: () => cards, financeVisualMinHeight: () => 160,
    financeVisualRowSpan: (height) => Math.ceil((height + 12) / 20),
    applyFinanceVisualSize: (card, columns, height, columnStart, rowStart) => { card.height = height; card.position = { columns, columnStart, rowStart, rowSpan: Math.ceil((height + 12) / 20) }; },
    materializeFinanceVisualGridPositions() {},
    financeVisualGridPosition: (card) => card.position,
    applyFinanceVisualPlacement: (card, columnStart, rowStart) => { card.position = { ...card.position, columnStart, rowStart }; },
  };
  vm.createContext(box);
  vm.runInContext(['financeKpiDensity', 'financeGridPlacementOverlaps', 'reflowExpandedKpiPlacements', 'compactFinanceKpiPlacements', 'applySavedFinanceVisualSizes'].map(declaration).join('\n'), box);
  const snapshot = JSON.stringify(source);
  box.applySavedFinanceVisualSizes(grid);
  assert.deepEqual(cards.map((card) => card.height), [160, 160, 400]);
  assert.equal(cards[2].position.rowStart, 10);
  box.applySavedFinanceVisualSizes(grid);
  assert.equal(cards[2].position.rowStart, 10);
  assert.equal(JSON.stringify(source), snapshot);
  source['commission-main:kpi:0'].kpiDensity = 'compact-v2';
  source['commission-main:kpi:1'].kpiDensity = 'compact-v2';
  box.applySavedFinanceVisualSizes(grid);
  assert.deepEqual(cards.map((card) => card.height), [360, 200, 400], 'later user-saved size is respected');
  assert.equal(cards[2].position.rowStart, 20);
  assert.match(declaration('saveFinanceVisualSizes'), /classList\.contains\("finance-kpi-card"\) \? \{ kpiDensity: financeKpiDensity\(card\) \}/);
  cards[0].classList.contains = (name) => name === 'finance-kpi-card';
  source['commission-main:kpi:0'].height = 480;
  delete source['commission-main:kpi:0'].kpiDensity;
  box.applySavedFinanceVisualSizes(grid);
  assert.deepEqual(cards.map((card) => card.height), [160, 200, 400], 'non-preview KPI shrinks too; v2 neighbour remains untouched');
  const compact = box.compactFinanceKpiPlacements;
  let capturedBands = [];
  box.compactFinanceKpiPlacements = (placements, bands) => { capturedBands = plain(bands); return compact(placements, bands); };
  source['commission-main:kpi:1'].height = 160;
  for (const [height, rowStart, expectedBands] of [
    [null, 1, []], [undefined, 1, []], ['Infinity', 1, []], [NaN, 1, []],
    [120, 1, []], [160, 1, []],
    [201, 1, [{ start: 10, end: 12 }]],
    [480, 1, [{ start: 10, end: 26 }]],
    [Number.MAX_VALUE, 1, [{ start: 10, end: 57 }]],
    [200, Number.MAX_SAFE_INTEGER, []],
  ]) {
    Object.assign(source['commission-main:kpi:0'], { height, rowStart });
    capturedBands = [];
    box.applySavedFinanceVisualSizes(grid);
    assert.equal(cards[0].height, 160);
    assert.deepEqual(capturedBands, expectedBands, `${height} at ${rowStart}: safe rounded/clamped freed tracks only`);
    assert.equal(cards[2].height, 400, 'chart height is never changed');
  }
  cards.slice(0, 2).forEach((card) => {
    card.classList.contains = (name) => ['finance-kpi-card', 'finance-kpi-preview-card'].includes(name);
    card.dataset.minHeight = '100';
  });
  box.financeVisualMinHeight = (card) => Number(card.dataset.minHeight || 160);
  Object.assign(source['commission-main:kpi:0'], { height: 160, rowStart: 1, kpiDensity: 'compact-v2' });
  Object.assign(source['commission-main:kpi:1'], { height: 160, rowStart: 1, kpiDensity: 'compact-v2' });
  box.applySavedFinanceVisualSizes(grid);
  assert.deepEqual(cards.map((card) => card.height), [100, 100, 400], 'previous compact Commission layout becomes smaller');
  assert.equal(cards[2].position.rowStart, 17, 'only the three newly freed tracks collapse');
  box.applySavedFinanceVisualSizes(grid);
  assert.equal(cards[2].position.rowStart, 17, 'repeat rendering does not shift rows again');
  cards[0].dataset.minHeight = '140';
  box.applySavedFinanceVisualSizes(grid);
  assert.deepEqual(cards.map((card) => card.height), [140, 100, 400], 'trend card has enough room without enlarging the other card');
  assert.equal(cards[2].position.rowStart, 19, 'visible trend occupies the extra tracks');
  Object.assign(source['commission-main:kpi:0'], { height: 240, kpiDensity: 'compact-v3' });
  Object.assign(source['commission-main:kpi:1'], { height: 200, kpiDensity: 'compact-v3' });
  box.applySavedFinanceVisualSizes(grid);
  assert.deepEqual(cards.map((card) => card.height), [240, 200, 400], 'future manual Commission resizing remains available');
  assert.equal(cards[2].position.rowStart, 20);
  assert.equal(box.financeKpiDensity(cards[0]), 'compact-v3');
  assert.equal(box.financeKpiDensity(cards[2]), 'compact-v2');
});

test('expanding saved KPI cards shifts only overlapping neighbours down, never columns or stored preferences', () => {
  const api = setup();
  const placements = [
    { card: 'KPI A', rowStart: 1, columnStart: 1, columns: 6, rowSpan: 11 },
    { card: 'KPI B', rowStart: 1, columnStart: 7, columns: 6, rowSpan: 11 },
    { card: 'Chart', rowStart: 8, columnStart: 1, columns: 6, rowSpan: 15 },
    { card: 'Other chart', rowStart: 14, columnStart: 7, columns: 6, rowSpan: 10 },
    { card: 'Table', rowStart: 24, columnStart: 1, columns: 12, rowSpan: 30 },
  ];
  const snapshot = JSON.stringify(placements);
  const result = api.reflowExpandedKpiPlacements(placements);
  assert.equal(JSON.stringify(placements), snapshot);
  const rows = Object.fromEntries(result.map((entry) => [entry.card, entry.rowStart]));
  assert.deepEqual(rows, { 'KPI A': 1, 'KPI B': 1, Chart: 12, 'Other chart': 14, Table: 27 });
  result.forEach((entry, index) => {
    const before = placements.find((item) => item.card === entry.card);
    assert.equal(entry.columnStart, before.columnStart);
    assert.equal(entry.columns, before.columns);
    assert.equal(entry.rowSpan, before.rowSpan);
    result.slice(index + 1).forEach((other) => assert.equal(api.financeGridPlacementOverlaps(entry, other), false));
  });
  assert.doesNotMatch(declaration('reflowExpandedKpiPlacements'), /localStorage|saveFinance|fetch/);
  assert.match(declaration('applySavedFinanceVisualSizes'), /if \(expandedKpi && grid\.classList\.contains\("visual-stack-layout"\)/);
  assert.match(html, /\.dashboard-chart-grid\.visual-stack-layout > \.decision-kpi\.finance-visual\.finance-kpi-card \{\s*display: grid;/);
});
