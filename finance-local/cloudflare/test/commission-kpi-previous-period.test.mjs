import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../commission-kpi-comparison.js', import.meta.url), 'utf8');

test('Commission fallback requests the immediately preceding equal period and uses its official total', async () => {
  let requested = '', renders = 0;
  const state = { dates: { 'commission-main': { start: '2026-09-10 00:00:00', end: '2026-09-10 23:59:59' } }, api: { loading: {} } };
  const sandbox = {
    state, LOCAL_PREVIEW: false, URLSearchParams, Date, Number, String,
    auditStable: JSON.stringify,
    financeGrafanaFilterScope: () => ({ arrival_status: ['arrived'] }),
    financeGrafanaFilterParam: () => JSON.stringify({ arrival_status: ['arrived'] }),
    financeBoundaryEpoch: value => Date.parse(value.replace(' ', 'T') + 'Z'),
    FINANCE_API_ENDPOINT: '/api/grafana/finance',
    requestFinancePayload: async url => { requested = url; return { response: { ok: true }, payload: { metricRows: [{ total_commission: 500, order_count: 2 }] } }; },
    canonicalizeFinanceRows: async (_panel, rows) => rows,
    canonicalizeFinancePayloadRows: async () => [],
    grafanaCommissionStats: rows => ({ totalCommission: rows.reduce((sum, row) => sum + row.total_commission, 0) }),
    render: () => { renders++; },
    decisionKpiTrend: (_kpi, history) => ({ comparable: true, points: history.points, label: '+100.0%' })
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.previous = commissionPreviousPeriod;', context);
  const panel = { id: 'commission-main' };
  await context.ensureCommissionPreviousPeriod(panel);
  const url = new URL(requested, 'https://test.local');
  assert.equal(url.searchParams.get('from'), '2026-09-09 00:00:00');
  assert.equal(url.searchParams.get('to'), '2026-09-09 23:59:59');
  assert.equal(url.searchParams.get('scope'), 'selection');
  assert.equal(context.previous.result.value, 500);
  assert.equal(renders, 1);
  const trend = context.commissionPreviousPeriodTrend(panel, { metric: 'commission', rawValue: 1000 });
  assert.equal(trend.caption, 'vs previous period');
  assert.equal(trend.points[0].values.commission, 500);
  assert.equal(trend.points[1].values.commission, 1000);
});

test('Commission fallback does not fetch in local preview', async () => {
  let called = false;
  const context = vm.createContext({ LOCAL_PREVIEW: true, state: {}, requestFinancePayload: async () => { called = true; } });
  vm.runInContext(source, context);
  await context.ensureCommissionPreviousPeriod({ id: 'commission-main' });
  assert.equal(called, false);
});
