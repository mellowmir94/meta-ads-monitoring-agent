import test from 'node:test';
import assert from 'node:assert/strict';
import { FINANCE_GRAFANA_TABLES, buildFinanceQuery, financeDateWindow, financeSnapshotFreshSeconds, financeSnapshotKey, packFinanceRows, prepareFinanceSql, resolveGrafanaTimeExpression } from '../src/worker.js';
import { readFileSync } from 'node:fs';

const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const wranglerSource = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

const window = { fromMs: Date.parse('2025-08-01T00:00:00Z'), toMs: Date.parse('2025-09-02T23:59:59Z') };

test('large Finance rows use a lossless compact transport without repeating object keys', () => {
  const sourceRows = Array.from({ length: 6000 }, (_, index) => ({
    order_id: String(2300000 + index),
    branch: ['HQ AMPANG', 'HQ MELAKA', 'HQ PUCHONG'][index % 3],
    payment_status: ['Completed', 'Pending'][index % 2],
    amount_paid: index % 17,
    optional_value: index % 5 === 0 ? null : `REF-${index}`
  }));
  const packed = packFinanceRows(sourceRows);
  assert.equal(packed.version, 1);
  assert.equal(packed.rowCount, sourceRows.length);
  const decoded = Array.from({ length: packed.rowCount }, (_, rowIndex) => Object.fromEntries(
    packed.columns.map((column) => {
      const encoded = column.values[rowIndex];
      const value = Array.isArray(column.dictionary)
        ? (encoded === -1 ? null : column.dictionary[encoded])
        : encoded;
      return [column.key, value];
    })
  ));
  assert.deepEqual(decoded, sourceRows);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(sourceRows).length * 0.65);
});

test('native Grafana table bundles contain the exact Finance panel counts and Details columns', () => {
  assert.equal(FINANCE_GRAFANA_TABLES['reimbursement-details'].length, 1);
  assert.equal(FINANCE_GRAFANA_TABLES['daily-sales-branch-overview'].length, 6);
  assert.equal(FINANCE_GRAFANA_TABLES['daily-sales-hq-dealer-overview'].length, 8);
  assert.deepEqual(FINANCE_GRAFANA_TABLES['daily-sales-branch-overview'].map((table) => table.title), ['Branch', 'Warranty', 'Payment Type', 'With Office', 'Stock Location', 'Details']);
  assert.deepEqual(FINANCE_GRAFANA_TABLES['daily-sales-hq-dealer-overview'].map((table) => table.title), ['HQ-SELANGOR', 'DEALER', 'HQ-SELANGOR - WARRANTY', 'DEALER - WARRANTY', 'HQ-SELANGOR - PAYMENT TYPE', 'DEALER - PAYMENT TYPE', 'WITH OFFICE', 'DETAILS']);
  assert.deepEqual(FINANCE_GRAFANA_TABLES['reimbursement-details'][0].columns, ['created_at', 'order_id', 'customer_name', 'phone_number', 'email', 'order_status', 'plate_number', 'brand', 'product', 'address', 'rider_category', 'rider_name', 'branch', 'branch_area', 'payment_type_1', 'payment_type_2', 'Payment_Status', 'service_price', 'direct_bank_in', 'amount_paid', 'reimbursement', 'order_segment', 'promocode', 'trade_in_price']);
});

test('Commission uses the newest saved Grafana Main Table panel', () => {
  assert.match(workerSource, /'commission-main': \{ dashboardUid: '_Qmhp4wHz', panelId: 20 \}/u);
  assert.doesNotMatch(workerSource, /'commission-main': \{ dashboardUid: '_Qmhp4wHz', panelId: 19 \}/u);
});

test('sales panels preserve saved Grafana variables including Billplz and exact All semantics', () => {
  const dashboard = { templating: { list: [
    { name: 'payment_method', current: { value: ['2C2P', 'billplz', 'cash'] } },
    { name: 'brand', current: { value: ['$__all'] } },
    { name: 'product_category', current: { value: ['BATTERY'] } }
  ] } };
  const rawSql = `SELECT branch_name, typeofpayment, SUM(net_sales) AS net_sales
FROM finance_source
WHERE created_at >= TIMESTAMP_MILLIS(\${__from})
  AND created_at <= TIMESTAMP_MILLIS(\${__to})
  AND (
    typeofpayment IN ($payment_method)
    OR typeofpayment IS NULL
  )
  AND brand IN ($brand)
  AND product_category IN ($product_category)
GROUP BY branch_name, typeofpayment`;
  const sql = prepareFinanceSql(rawSql, 'daily-sales-branch-overview', window, dashboard, { primary: false });
  assert.match(sql, /typeofpayment IN \('2C2P', 'billplz', 'cash'\)/);
  assert.match(sql, /OR typeofpayment IS NULL/);
  assert.match(sql, /brand IS NOT NULL/);
  assert.match(sql, /product_category IN \('BATTERY'\)/);
  assert.doesNotMatch(sql, /billplz\|bplaz|NOT REGEXP_CONTAINS\(LOWER\(COALESCE\(typeofpayment/i);
});

test('Warranty companion panels use their explicit Grafana WARRANTY scope', () => {
  const dashboard = { templating: { list: [
    { name: 'product_category', current: { value: ['BATTERY'] } }
  ] } };
  const rawSql = `SELECT branch_name, SUM(paymenttotal) AS net_sales_warranty
FROM finance_source
WHERE created_at >= TIMESTAMP_MILLIS(\${__from})
  AND created_at < TIMESTAMP_MILLIS(\${__to})
  AND product_category IN ($product_category)
  AND product_category = 'WARRANTY'
GROUP BY branch_name`;
  const definition = FINANCE_GRAFANA_TABLES['daily-sales-branch-overview'].find((table) => table.key === 'warranty');
  const sql = prepareFinanceSql(rawSql, 'daily-sales-branch-overview', window, dashboard, {
    primary: false,
    variableOverrides: definition.variableOverrides
  });
  assert.match(sql, /product_category IN \('WARRANTY'\)/);
  assert.match(sql, /product_category = 'WARRANTY'/);
  assert.doesNotMatch(sql, /product_category IN \('BATTERY'\)/);
});

test('only the native sales Details query receives chart-support fields', () => {
  const dashboard = { templating: { list: [] } };
  const rawSql = 'SELECT branch_name, typeofpayment FROM source WHERE 1 = 1 ORDER BY branch_name';
  const aggregate = prepareFinanceSql(rawSql, 'daily-sales-hq-dealer-overview', window, dashboard, { primary: false });
  const details = prepareFinanceSql(rawSql, 'daily-sales-hq-dealer-overview', window, dashboard, { primary: true });
  assert.doesNotMatch(aggregate, /created_at,/);
  assert.match(details, /SELECT\s+created_at,\s+typeofpayment,\s+product_category,\s+stock_location,/i);
  assert.doesNotMatch(details, /branch_name IS NOT NULL AND TRIM\(branch_name\) != ''/);
});

test('the three Grafana Finance dashboards use UTC boundaries without a hidden offset', () => {
  const result = financeDateWindow(new URL('https://example.test/?from=2025-08-01%2000%3A00%3A00&to=2025-09-02%2023%3A59%3A59'), 0);
  assert.equal(result.fromMs, Date.parse('2025-08-01T00:00:00Z'));
  assert.equal(result.toMs, Date.parse('2025-09-03T00:00:00Z'));
});

test('reimbursement SQL is identical to Grafana and does not exclude a payment provider', () => {
  const dashboard = { templating: { list: [
    { name: 'product', current: { value: ['Battery A', 'Battery B'] } },
    { name: 'order_status', current: { value: ['completed', 'pending'] } },
    { name: 'order_segment', current: { value: ['branch_staff_order'] } }
  ] } };
  const rawSql = `SELECT created_at, order_id, payment_type_1, payment_type_2, reimbursement
FROM finance.reimbursement
WHERE created_at >= TIMESTAMP_MILLIS(\${__from})
  AND created_at < TIMESTAMP_MILLIS(\${__to})
  AND order_status IN($order_status)
  AND product IN ($product)
  AND order_segment IN ($order_segment)`;
  const sql = prepareFinanceSql(rawSql, 'reimbursement-details', window, dashboard, { primary: true });
  assert.match(sql, /order_status IN\('completed', 'pending'\)/);
  assert.match(sql, /product IN \('Battery A', 'Battery B'\)/);
  assert.match(sql, /order_segment IN \('branch_staff_order'\)/);
  assert.doesNotMatch(sql, /billplz|bplaz|REGEXP_CONTAINS/i);
});

test('Grafana relative month-to-date scope resolves in UTC through the current instant', () => {
  const now = Date.parse('2026-08-19T03:22:44.020Z');
  assert.equal(resolveGrafanaTimeExpression('now/M', now), Date.parse('2026-08-01T00:00:00.000Z'));
  assert.equal(resolveGrafanaTimeExpression('now', now), now);
});

test('Finance companion panels run native BigQuery requests concurrently while Commission detail and exact KPIs run in parallel', () => {
  assert.match(workerSource, /function executeFinancePanelBatch\(/u);
  assert.match(workerSource, /await Promise\.all\(entries\.map\(async \(entry\) =>/u);
  assert.match(workerSource, /const query = \{ \.\.\.entry\.query, refId: 'A' \}/u);
  assert.match(workerSource, /queries: \[query\]/u);
  assert.match(workerSource, /function queryCommissionPrimaryBundle\(/u);
  assert.match(workerSource, /const \[detailResponse, countResponse, totalResponse\] = await Promise\.all\(/u);
  assert.match(workerSource, /const countResult = countPayload && countPayload\.results && countPayload\.results\.A/u);
  assert.match(workerSource, /const totalResult = totalPayload && totalPayload\.results && totalPayload\.results\.A/u);
  assert.match(workerSource, /maxDataPoints: 20000/u);
});

test('Commission KPI reducer preserves the saved Grafana variable scope exactly', () => {
  const dashboard = { templating: { list: [
    { name: 'branch_name', current: { value: ['$__all'] } },
    { name: 'arrival_status', current: { value: ['pending', 'arrived'] } },
    { name: 'order_status', current: { value: ['completed', 'cancelled'] } },
    { name: 'level', current: { value: ['MOTOR', 'LOW'] } },
    { name: 'battery_size', current: { value: ['$__all'] } },
    { name: 'sales_source', current: { value: ['$__all'] } },
    { name: 'rider_category', current: { value: ['FREELANCE/B-HERO', 'MOTEC/A-TEAM'] } }
  ] } };
  const target = {
    datasource: { type: 'grafana-bigquery-datasource', uid: 'finance' },
    rawSql: `SELECT order_id
FROM finance.commission_rider
WHERE created_at >= TIMESTAMP_MILLIS(\${__from})
  AND created_at < TIMESTAMP_MILLIS(\${__to})
  AND branch_name IN($branch_name)
  AND arrival_status IN($arrival_status)
  AND order_status IN($order_status)
  AND level IN($level)
  AND battery_size IN($battery_size)
  AND sales_source IN($sales_source)
  AND riderPosition IN ($rider_category)`
  };
  // The current production path runs the saved count/total panels separately.
  // Test that path rather than the obsolete combined-CTE helper signature.
  const query = buildFinanceQuery(target, target.datasource, 'commission-main', window, dashboard);
  assert.match(query.rawSql, /SELECT order_id/);
  assert.match(query.rawSql, /branch_name IS NOT NULL/);
  assert.match(query.rawSql, /arrival_status IN\('pending', 'arrived'\)/);
  assert.match(query.rawSql, /order_status IN\('completed', 'cancelled'\)/);
  assert.match(query.rawSql, /level IN\('MOTOR', 'LOW'\)/);
  assert.match(query.rawSql, /riderPosition IN \('FREELANCE\/B-HERO', 'MOTEC\/A-TEAM'\)/);
  assert.doesNotMatch(query.rawSql, /GROUP BY/);
  assert.doesNotMatch(query.rawSql, /\$[A-Za-z_{]/);
});

test('Commission detail keeps nested Grafana All predicates valid', () => {
  const dashboard = { templating: { list: [
    { name: 'branch_name', current: { value: ['$__all'] } },
    { name: 'battery_size', current: { value: ['$__all'] } },
    { name: 'level', current: { value: ['LOW', 'MOTOR'] } }
  ] } };
  const rawSql = `SELECT cr.*
FROM finance.commission_rider AS cr
WHERE cr.created_at >= TIMESTAMP_MILLIS(\${__from})
  AND cr.created_at < TIMESTAMP_MILLIS(\${__to})
  AND cr.branch_name IN (\${branch_name:sqlstring})
  AND (
    'All' IN (\${battery_size:sqlstring})
    OR cr.battery_size IN (\${battery_size:sqlstring})
    OR REGEXP_CONTAINS(UPPER(COALESCE(cr.battery_size, '')), r'NX110[- ]?5L')
  )
  AND (
    'All' IN (\${level:sqlstring})
    OR cr.level IN (\${level:sqlstring})
  )`;
  const sql = prepareFinanceSql(rawSql, 'commission-main', window, dashboard, { primary: true });
  assert.match(sql, /cr\.branch_name IS NOT NULL/);
  assert.match(sql, /'All' IN \('All'\)\s+OR cr\.battery_size IN \('All'\)\s+OR REGEXP_CONTAINS/);
  assert.match(sql, /'All' IN \('LOW', 'MOTOR'\)/);
  assert.match(sql, /cr\.level IN \('LOW', 'MOTOR'\)/);
  assert.doesNotMatch(sql, /\$[A-Za-z_{]/);
  assert.equal((sql.match(/\(/g) || []).length, (sql.match(/\)/g) || []).length);
});

test('Finance snapshots use stable canonical keys and part-specific freshness', () => {
  const refreshUrl = new URL('https://example.test/api/internal/finance-data?scope=grafana&panel=commission-main&refresh=1&part=primary');
  const normalUrl = new URL('https://example.test/api/internal/finance-data?panel=commission-main&part=primary&scope=grafana');
  assert.equal(financeSnapshotKey(refreshUrl), financeSnapshotKey(normalUrl));
  assert.equal(financeSnapshotFreshSeconds(normalUrl), 150);
  assert.equal(financeSnapshotFreshSeconds(new URL('https://example.test/?part=tables')), 300);
  assert.equal(financeSnapshotFreshSeconds(new URL('https://example.test/?part=options')), 900);
});

test('Finance snapshots are persisted, refreshed in the background, and prewarmed every two minutes', () => {
  assert.match(workerSource, /env\.DASHBOARD_DATA\.getWithMetadata\(snapshotKey/u);
  assert.match(workerSource, /env\.DASHBOARD_DATA\.put\(key/u);
  assert.match(workerSource, /metadata: \{ status: response\.status, storedAt: Date\.now\(\) \}/u);
  assert.match(workerSource, /x-finance-snapshot/u);
  assert.match(workerSource, /ctx\.waitUntil\(financeLiveResponse/u);
  assert.match(workerSource, /async scheduled\(_controller, env, ctx\)/u);
  assert.match(workerSource, /prewarmFinanceSnapshots\(env, ctx\)/u);
  assert.match(wranglerSource, /"crons": \["\*\/2 \* \* \* \*"\]/u);
});
