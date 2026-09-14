import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../../deductions.js', import.meta.url), 'utf8');
function runtime(extra = {}) {
  const context = vm.createContext({
    document: { addEventListener() {} }, crypto: webcrypto,
    formatMoney: value => 'RM ' + Number(value).toFixed(2), formatNumber: value => String(value),
    numberValue: value => Number(value || 0), formatGrafanaTimestamp: value => String(value || ''),
    auditQuickRange: () => ({ start: '2026-09-22T00:00:00Z' }),
    esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    auditCapture: () => ({ scope: { dates: { start: '2026-09-07', end: '2026-09-13' } } }),
    ...extra,
  });
  vm.runInContext(source + '\nthis.api = { deductionState, deductionSingleRider, deductionFullWeek, deductionNextMonth, deductionDefaultSettlement, deductionSummaryForRows, deductionSummaryMarkup, deductionFilteredHistory, deductionHistoryProgress, deductionHistoryTotals, deductionHistoryGroups, deductionHistoryStatementPayload, deductionRequestIdentity, deductionLoad, deductionDraftFor };', context);
  return context.api;
}
const rows = [{ rider_name: 'Rider A', created_at: '2026-09-07', commission: 300 }, { rider_name: 'Rider A', created_at: '2026-09-08', commission: 255 }];
const record = (overrides = {}) => ({ id: 'r1', reference: 'DED-260922-000001', rider: 'Rider A', riderKey: 'rider a', type: 'insurance', status: 'approved', amountCents: 1200, periodStart: '2026-09-07', periodEnd: '2026-09-13', deductionDate: '2026-09-14', createdAt: '2026-09-10', installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied', paymentDate: '2026-09-22', settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' }, { index: 1, dueDate: '2026-09-21', status: 'scheduled' }], ...overrides });

test('rider guard normalizes case, Unicode and whitespace and rejects two or missing riders', () => {
  const api = runtime();
  assert.equal(api.deductionSingleRider([{ rider_name: ' RIDER  A ' }, { rider_name: 'rider a' }]).valid, true);
  assert.equal(api.deductionSingleRider([{ rider_name: 'Rider A' }, { rider_name: 'Rider B' }]).valid, false);
  assert.match(api.deductionSingleRider([{ rider_name: 'A' }, {}]).message, /no rider_name/);
  assert.equal(api.deductionSingleRider([]).valid, false);
});
test('EPF requires the exact full week and next contribution month handles year boundary', () => {
  const api = runtime();
  assert.equal(api.deductionFullWeek('2026-09-07', '2026-09-13'), true);
  assert.equal(api.deductionFullWeek('2026-09-07', '2026-09-20'), false);
  assert.equal(api.deductionFullWeek('2026-09-08', '2026-09-13'), false);
  assert.equal(api.deductionNextMonth('2026-12-31'), '2027-01');
});
test('settlement defaults follow earned commission week, not payment or due date', () => {
  const api = runtime();
  assert.equal(api.deductionDefaultSettlement(record(), 0).start, '2026-09-07');
  assert.equal(api.deductionDefaultSettlement(record(), 1).start, '2026-09-14');
  assert.equal(api.deductionDefaultSettlement(record(), 1).end, '2026-09-20');
});
test('only applied installments reduce the selected commission period and scheduled amounts stay separate', () => {
  const api = runtime(); api.deductionState.loaded = true; api.deductionState.records = [record()];
  const summary = api.deductionSummaryForRows(rows, { start: '2026-09-07', end: '2026-09-13' });
  assert.equal(summary.grossCents, 55500); assert.equal(summary.approvedCents, 1200); assert.equal(summary.netCents, 54300);
  assert.equal(api.deductionSummaryForRows(rows, { start: '2026-09-21', end: '2026-09-27' }).approvedCents, 0);
  assert.equal(api.deductionSummaryForRows(rows, { start: '2026-09-21', end: '2026-09-27' }).pendingCents, 1200);
});
test('legacy applied records retain due date basis with an explicit summary marker', () => {
  const api = runtime(); api.deductionState.loaded = true;
  api.deductionState.records = [record({ installments: [{ dueDate: '2026-09-08', status: 'applied' }] })];
  const summary = api.deductionSummaryForRows(rows, { start: '2026-09-07', end: '2026-09-13' });
  assert.equal(summary.approvedCents, 1200); assert.equal(summary.legacyCount, 1);
});
test('multiple riders never aggregate a deduction and negative net is not silently clamped', () => {
  const api = runtime(); api.deductionState.loaded = true; api.deductionState.records = [record({ amountCents: 60000 })];
  assert.equal(api.deductionSummaryForRows(rows, { start: '2026-09-07', end: '2026-09-13' }).netCents, -4500);
  assert.equal(api.deductionSummaryForRows([...rows, { rider_name: 'B', commission: 30 }], { start: '2026-09-07', end: '2026-09-13' }).approvedCents, 0);
});
test('history calculations use actual installment amounts and handle partial reversal', () => {
  const api = runtime(), item = record({ installments: [{ index: 0, dueDate: '2026-09-14', status: 'reversed', amountCents: 1300 }, { index: 1, dueDate: '2026-09-21', status: 'applied', amountCents: 1100 }] });
  const progress = api.deductionHistoryProgress(item); assert.equal(progress.appliedCents, 1100); assert.equal(progress.reversedCents, 1300); assert.equal(progress.paidCount, 1);
  const totals = api.deductionHistoryTotals([item, record({ grossCommissionCents: 55500, batchId: 'duplicate-period' })]);
  assert.equal(totals.appliedCents, 2300); assert.equal(totals.remainingCents, 1200); assert.equal('grossCents' in totals, false); assert.equal('netCents' in totals, false);
});
test('history filters share reference, due, type, status and contribution month matching', () => {
  const api = runtime(), items = [record(), record({ id: 'epf', type: 'epf', epfContributionMonth: '2026-10' })];
  assert.equal(api.deductionFilteredHistory(items, { search: 'ded-260922-000001' }).length, 2);
  assert.equal(api.deductionFilteredHistory(items, { due: 'overdue' }, '2026-09-22').length, 2);
  assert.equal(api.deductionFilteredHistory(items, { due: 'overdue' }, '2026-09-21').length, 0);
  assert.equal(api.deductionFilteredHistory(items, { month: '2026-10', type: 'epf', status: 'approved' }).length, 1);
});
test('deductions created in one request render as one history group with combined totals', () => {
  const api = runtime(), batch = 'batch-20260914-finance';
  const groups = api.deductionHistoryGroups([
    record({ id: 'insurance', batchId: batch, type: 'insurance', amountCents: 10000 }),
    record({ id: 'epf', batchId: batch, type: 'epf', amountCents: 2500, installments: [{ index: 0, dueDate: '2026-09-14', status: 'scheduled' }] }),
    record({ id: 'special', batchId: batch, type: 'manual', amountCents: 6000, installments: [{ index: 0, dueDate: '2026-09-14', status: 'scheduled' }, { index: 1, dueDate: '2026-09-21', status: 'scheduled' }, { index: 2, dueDate: '2026-09-28', status: 'scheduled' }] }),
  ]);
  assert.equal(groups.length, 1); assert.deepEqual(Array.from(groups[0].records, item => item.type), ['epf', 'insurance', 'manual']);
  assert.equal(groups[0].progress.count, 6); assert.equal(groups[0].progress.appliedCents, 10000); assert.equal(groups[0].progress.remainingCents, 30500);
});
test('rider statement PDF keeps all filtered table rows and subtracts only applied deductions', () => {
  const tableRows = [{ rider_name: 'Rider A', commission: 300 }, { rider_name: 'Rider A', commission: 255 }];
  const columns = [{ key: 'rider_name', label: 'Rider', value: row => row.rider_name }, { key: 'commission', label: 'Commission', value: row => row.commission }];
  const api = runtime({ financeTableExportPayload: () => ({ title: 'Line Item Audit', panelTitle: 'Commission Rider', filename: 'Commission', columns, rows: tableRows, footer: ['Filtered total', 'RM 555.00'], period: '2026-09-07 - 2026-09-13' }) });
  const payload = api.deductionHistoryStatementPayload([
    record({ batchId: 'batch-one' }),
    record({ id: 'epf', batchId: 'batch-one', type: 'epf', amountCents: 2500, status: 'approved', installments: [{ index: 0, dueDate: '2026-09-14', status: 'scheduled' }] }),
  ]);
  assert.equal(payload.rows.length, 2); assert.equal(payload.summary.value, 'RM 543.00');
  assert.deepEqual(Array.from(payload.footerRows.at(-1)), ['NET COMMISSION', 'RM 543.00']);
  assert.ok(payload.footerRows.some(row => row[0] === 'EPF (scheduled)' && row[1] === '- RM 25.00'));
  assert.ok(payload.footerRows.some(row => row[0] === 'SCHEDULED DEDUCTIONS' && row[1] === 'RM 37.00'));
});
test('same request payload retries keep idempotency ID; changed payload gets a new one', () => {
  const identify = runtime().deductionRequestIdentity(), first = identify({ rider: 'A', amount: 25 });
  assert.equal(identify({ rider: 'A', amount: 25 }), first);
  assert.notEqual(identify({ rider: 'A', amount: 26 }), first);
});
test('incomplete or repeated-page register fails closed without exposing partial records', async () => {
  const api = runtime({ fetch: async () => ({ ok: true, json: async () => ({ records: [record()], next: 'same-cursor' }) }) });
  await assert.rejects(api.deductionLoad(), /Incomplete deduction register/); assert.equal(api.deductionState.loaded, false); assert.equal(api.deductionState.records.length, 0);
});
test('independent table drafts reset when rider or date period changes', () => {
  const api = runtime(), rider = { key: 'a' }, dates = { start: '2026-09-07', end: '2026-09-13' };
  api.deductionDraftFor('one', rider, dates).selected.push('epf');
  assert.equal(api.deductionDraftFor('two', rider, dates).selected.length, 0);
  assert.equal(api.deductionDraftFor('one', { key: 'b' }, dates).selected.length, 0);
});
test('summary is hidden for an invalid rider scope so the table remains the sole workspace', () => {
  const api = runtime(); api.deductionState.loaded = true;
  const markup = api.deductionSummaryMarkup([{ rider_name: 'A', commission: 1 }, { rider_name: 'B', commission: 2 }], 'main');
  assert.equal(markup, '');
});
