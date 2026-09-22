import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

test('Commission primary does not wait for unused or explicitly selected dropdown queries', async () => {
  const originalFetch = globalThis.fetch;
  const queries = [];
  const dashboard = {
    panels: [20, 4, 6].map(id => ({ id, targets: [{ rawSql: "SELECT order_id, commission FROM orders WHERE branch_name IN ($branch_name) AND arrival_status IN ($arrival_status)", datasource: { uid: 'test', type: 'grafana-bigquery-datasource' } }] })),
    templating: { list: [
      { name: 'branch_name', current: { value: ['$__all'] }, query: { rawSql: 'SELECT branch_name FROM branch_options' } },
      { name: 'arrival_status', current: { value: ['arrived'] }, query: { rawSql: 'SELECT arrival_status FROM slow_options' } },
      { name: 'sales_source', current: { value: ['$__all'] }, query: { rawSql: 'SELECT sales_source FROM slow_options' } }
    ] }
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/api/dashboards/')) return Response.json({ dashboard });
    const sql = JSON.parse(init.body).queries[0].rawSql;
    queries.push(sql);
    if (sql.includes('slow_options')) return new Promise(() => {});
    const branch = sql.includes('branch_options');
    return Response.json({ results: { A: { frames: [{ schema: { fields: branch ? [{ name: 'branch_name' }] : [{ name: 'order_id' }, { name: 'commission' }] }, data: { values: branch ? [['HQ TEST']] : [['1'], [25]] } }] } } });
  };
  let timer;
  try {
    const params = new URLSearchParams({ panel: 'commission-main', part: 'primary', scope: 'selection', from: '2026-09-14', to: '2026-09-20' });
    const response = await Promise.race([
      worker.fetch(new Request('https://test/api/internal/finance-data?' + params, { headers: { 'x-finance-proxy-secret': 'test' } }), { GRAFANA_URL: 'https://refresh-latency.test', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'test', FINANCE_PROXY_SHARED_SECRET: 'test' }, {}),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Refresh blocked by unrelated dropdown query')), 300); })
    ]);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.rows.length, 1);
    assert.deepEqual(payload.metricRows, [{ order_count: 1, total_commission: 25 }]);
    assert.equal(queries.length, 4, 'one required All expansion plus table and two unchanged KPI queries');
    for (const sql of queries.filter(sql => sql.includes('FROM orders'))) {
      assert.match(sql, /branch_name IN \('HQ TEST'\)/);
      assert.match(sql, /arrival_status IN \('arrived'\)/);
    }
  } finally { clearTimeout(timer); globalThis.fetch = originalFetch; }
});
