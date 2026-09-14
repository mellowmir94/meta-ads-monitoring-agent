import test from 'node:test';
import assert from 'node:assert/strict';
import { PITSTOP_GRAFANA_PANELS, normalizePitstopPanelRows, preparePitstopPanelSql, prepareWarrantyPanelSql, prepareRsaPanelSql, selectPitstopPanelTarget, warrantyDailySql, warrantyRowsToDaily, rsaRowsToDaily, summarizePitstopChannelSales } from '../src/worker.js';

test('Pitstop Explorer uses the requested HQ and BP Grafana panels only', () => {
  assert.deepEqual(PITSTOP_GRAFANA_PANELS.map(({ channel, dashboardTitle, panelTitle, nameField, salesField }) => ({ channel, dashboardTitle, panelTitle, nameField, salesField })), [
    { channel: 'HQ', dashboardTitle: 'Pitstop Performance - detailed copy', panelTitle: 'ALL PERFORMANCE (HQ) HTML', nameField: 'Name', salesField: 'Total_Sales' },
    { channel: 'BP', dashboardTitle: 'BP Performance - detailed copy', panelTitle: 'ALL PERFORMANCE (BP) HTML', nameField: 'Name', salesField: 'Total_Sales' }
  ]);
});

test('panel rows keep their assigned channel and support aggregate panel output', () => {
  const rows = normalizePitstopPanelRows([
    { Name: 'HQ PERLING', Total_Sales: 17, state: 'JOHOR' }
  ], { channel: 'HQ', nameField: 'Name', salesField: 'Total_Sales' }, '2026-08-01', '2026-08-12');
  assert.deepEqual(rows, [{ date: '2026-08-12', pitstop: 'HQ PERLING', channel: 'HQ', state: 'JOHOR', sales: 17 }]);
});

test('branch_created_date is metadata and does not filter aggregate sales out of the report window', () => {
  const rows = normalizePitstopPanelRows([
    { Name: 'HQ PERLING', Total_Sales: 43, branch_created_date: '2021-05-22' }
  ], { channel: 'HQ', nameField: 'Name', salesField: 'Total_Sales' }, '2026-08-01', '2026-08-13');
  assert.deepEqual(rows, [{ date: '2026-08-13', pitstop: 'HQ PERLING', channel: 'HQ', state: '', sales: 43 }]);
});

test('panel Total_Sales totals are separated into HQ and BP channels', () => {
  assert.deepEqual(summarizePitstopChannelSales([
    { channel: 'HQ', sales: 2 },
    { channel: 'HQ', sales: '1,234' },
    { channel: 'BP', sales: 5 },
    { channel: 'WH', sales: 99 },
    { channel: 'BP', sales: 'not a number' }
  ]), { hq: 1236, bp: 5 });
});

test('Total_Sales accepts Grafana-formatted numeric text but never falls back to another metric', () => {
  const source = { channel: 'BP', nameField: 'Name', salesField: 'Total_Sales' };
  assert.deepEqual(normalizePitstopPanelRows([
    { Name: 'BP JOHOR JAYA', Total_Sales: '1,234' },
    { Name: 'BP ULU TIRAM', Total_Sales: null, value: 99 },
    { Name: 'BP TAMPOI', value: 88 }
  ], source, '2026-08-01', '2026-08-12'), [
    { date: '2026-08-12', pitstop: 'BP JOHOR JAYA', channel: 'BP', state: '', sales: 1234 }
  ]);
});

test('saved panels using singular Total_Sale remain compatible with the Total_Sales metric', () => {
  const rows = normalizePitstopPanelRows([
    { Name: 'HQ PERLING', Total_Sale: '43' }
  ], { channel: 'HQ', nameField: 'Name', salesField: 'Total_Sales' }, '2026-08-01', '2026-08-12');
  assert.equal(rows[0].sales, 43);
});

test('a multi-query HTML panel selects the query that produces Total_Sales', () => {
  const selected = selectPitstopPanelTarget({ targets: [
    { refId: 'A', rawSql: 'SELECT Name FROM branches' },
    { refId: 'B', rawSql: 'SELECT Name, SUM(sales) AS Total_Sales FROM orders GROUP BY Name' }
  ] }, 'Total_Sales');
  assert.equal(selected.refId, 'B');
});

test('panel SQL receives the selected Grafana date range', () => {
  const sql = preparePitstopPanelSql('SELECT ${__from} AS from_ms, ${__to} AS to_ms', '2026-08-01', '2026-08-02');
  assert.match(sql, new RegExp(String(Date.parse('2026-08-01T00:00:00Z'))));
  assert.match(sql, new RegExp(String(Date.parse('2026-08-03T00:00:00Z'))));
});

test('panel SQL resolves Grafana time macros used by saved BigQuery panels', () => {
  const sql = preparePitstopPanelSql("SELECT Name, Total_Sales FROM t WHERE $__timeFilter(created_at) AND created_at >= $__timeFrom() AND created_at < $__timeTo()", '2026-08-01', '2026-08-02');
  assert.doesNotMatch(sql, /\$__time(Filter|From|To)/i);
  assert.match(sql, /DATE\(created_at\) BETWEEN DATE\('2026-08-01'\) AND DATE\('2026-08-02'\)/);
});

test('panel SQL resolves the Grafana branch-area selector to the full network', () => {
  const sql = preparePitstopPanelSql("SELECT * FROM branches WHERE ('${branch_area}' = 'All' OR state IN (${branch_area}))", '2026-08-01', '2026-08-02', "'JOHOR', 'SELANGOR'");
  assert.equal(sql, "SELECT * FROM branches WHERE ('All' = 'All' OR state IN ('JOHOR', 'SELANGOR'))");
  assert.doesNotMatch(sql, /\$\{branch_area/);
});

test('RSA panel SQL receives the selected date window', () => {
  const sql = prepareRsaPanelSql("SELECT * FROM rsa_orders WHERE $__timeFilter(created_at)", '2026-08-17', '2026-08-18');
  assert.doesNotMatch(sql, /\$__timeFilter/i);
  assert.match(sql, /DATE\(created_at\) BETWEEN DATE\('2026-08-17'\) AND DATE\('2026-08-18'\)/);
});

test('RSA daily totals count every recognized activity and combine both type fields', () => {
  const rows = rsaRowsToDaily([
    { created_at: '2026-08-17', status: 'completed', product_name: 'Jump Start', Order_category: 'JUMPSTART' },
    { created_at: '2026-08-17', status: 'cancelled', product_name: 'Jump Start' },
    { created_at: '2026-08-17', status: 'completed', product_name: 'Tyre Patch' },
    { created_at: '2026-08-17', status: 'completed', product_name: 'RSA Service', Order_category: 'Fuel Service' },
    { created_at: '2026-08-18', status: 'COMPLETED', Order_category: 'TIRE PATCH' },
    { created_at: '2026-08-18', status: 'completed', product_name: 'Unknown' },
    { status: 'completed', product_name: 'Fuel' }
  ], '2026-08-17', '2026-08-19');

  assert.deepEqual(rows, [
    { date: '2026-08-17', rsaJumpstart: 2, rsaTyrePatch: 1, rsaFuel: 1, total: 4 },
    { date: '2026-08-18', rsaJumpstart: 0, rsaTyrePatch: 1, rsaFuel: 0, total: 1 },
    { date: '2026-08-19', rsaJumpstart: 0, rsaTyrePatch: 0, rsaFuel: 0, total: 0 }
  ]);
});

test('warranty fallback tolerates Grafana label and BigQuery schema differences', () => {
  const sql = warrantyDailySql('2026-08-01', '2026-08-18');
  assert.match(sql, /TO_JSON_STRING\(source_row\)/);
  assert.match(sql, /JSON_VALUE\(row_json, '\$\.Plate_Number'\)/);
  assert.match(sql, /JSON_VALUE\(row_json, '\$\.plate_number'\)/);
  assert.match(sql, /JSON_VALUE\(row_json, '\$\.completed_at'\)/);
  assert.doesNotMatch(sql, /CAST\(plate_number AS STRING\)/i);
  assert.doesNotMatch(sql, /CAST\(Plate_Number AS STRING\)/);
  assert.match(sql, /payment_status/i);
  assert.match(sql, /GROUP BY report_date, plate_number/);
  assert.match(sql, /COUNTIF\(attend_count = 1\) AS total_warranty/);
});

test('saved warranty panel trims the live product value before filtering', () => {
  const sql = prepareWarrantyPanelSql(
    "SELECT completed_at, Plate_Number FROM orders WHERE $__timeFilter(completed_at) AND products.name IN (${product_name:sqlstring}) AND payments.status IN (${payment_status:sqlstring})",
    '2026-08-01',
    '2026-08-17'
  );
  assert.match(sql, /TRIM\(products\.name\) IN \('Warranty Service'\)/);
  assert.match(sql, /payments\.status IN \('Completed'\)/);
  assert.doesNotMatch(sql, /\$\{product_name|\$\{payment_status|\$__timeFilter/);
});

test('warranty attendance matches the manual daily Plate_Number pivot', () => {
  const rows = warrantyRowsToDaily([
    { completed_at: '2026-08-01 08:00:00', Plate_Number: 'ABC1' },
    { completed_at: '2026-08-01 09:00:00', Plate_Number: 'ABC2' },
    { completed_at: '2026-08-01 10:00:00', Plate_Number: 'ABC2' },
    { completed_at: '2026-08-01 11:00:00', Plate_Number: 'ABC3' },
    { completed_at: '2026-08-01 12:00:00', Plate_Number: 'ABC3' },
    { completed_at: '2026-08-01 13:00:00', Plate_Number: 'ABC3' },
    // The same plate on the next day is counted independently for that date.
    { completed_at: '2026-08-02 08:00:00', Plate_Number: 'ABC2' }
  ], '2026-08-01', '2026-08-02');

  assert.deepEqual(rows, [
    { date: '2026-08-01', warranty1st: 1, warranty2nd: 1, warranty3rd: 1, total: 1 },
    { date: '2026-08-02', warranty1st: 1, warranty2nd: 0, warranty3rd: 0, total: 1 }
  ]);
});
