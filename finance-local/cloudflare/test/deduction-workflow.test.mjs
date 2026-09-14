import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../../deductions.js', import.meta.url), 'utf8');
function runtime(extra = {}) {
  const context = vm.createContext({
    document: { addEventListener() {} }, crypto: webcrypto, URLSearchParams,
    formatMoney: value => 'RM ' + Number(value).toFixed(2), formatNumber: value => String(value),
    numberValue: value => Number(value || 0), formatGrafanaTimestamp: value => String(value || ''),
    auditQuickRange: () => ({ start: '2026-09-22T00:00:00Z' }),
    esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    auditCapture: () => ({ scope: { dates: { start: '2026-09-07', end: '2026-09-13' } } }),
    ...extra,
  });
  vm.runInContext(source + '\nthis.api = { deductionState, deductionSingleRider, deductionFullWeek, deductionNextMonth, deductionFirstFourThursdayWeeks, deductionEpfSchedule, deductionDefaultSettlement, deductionSummaryForRows, deductionSummaryMarkup, deductionFilteredHistory, deductionHistoryProgress, deductionHistoryTotals, deductionHistoryGroups, deductionGroupScheduleProgress, deductionGroupMatchesTiming, deductionGroupMatchesTypePaymentFilters, deductionHistoryPaymentOptions, deductionHistoryDownloadOptions, deductionHistoryStatementPayload, deductionPaymentStatementPayload, deductionCombinedPaymentStatementPayload, deductionPrefetchPaymentStatement, deductionScheduleNotice, deductionRequestIdentity, deductionLoad, deductionDraftFor };', context);
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
test('EPF starts in the current week, shifts only the holiday week, and continues across months', () => {
  const api = runtime(), schedule = api.deductionEpfSchedule('2026-09-14', new Set(['2026-09-16']));
  assert.deepEqual(Array.from(schedule, item => item.dueDate), ['2026-09-18', '2026-09-24', '2026-10-01', '2026-10-08']);
  assert.equal(schedule[0].shifted, true);
  assert.equal(schedule[1].shifted, false);
  assert.equal(schedule.length, 4);
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
test('main Commission Rider PDF treats EPF payment 1 as the opening week for existing records', () => {
  const api = runtime(); api.deductionState.loaded = true;
  api.deductionState.records = [record({ type: 'epf', amountCents: 2500, status: 'applied', installments: [
    { index: 0, dueDate: '2026-09-18', status: 'applied', settlementPeriodStart: '2026-09-14', settlementPeriodEnd: '2026-09-20' },
    { index: 1, dueDate: '2026-09-24', status: 'applied', settlementPeriodStart: '2026-09-21', settlementPeriodEnd: '2026-09-27' },
    { index: 2, dueDate: '2026-10-01', status: 'applied', settlementPeriodStart: '2026-09-28', settlementPeriodEnd: '2026-10-04' },
    { index: 3, dueDate: '2026-10-08', status: 'applied', settlementPeriodStart: '2026-10-05', settlementPeriodEnd: '2026-10-11' },
  ] })];
  const opening = api.deductionSummaryForRows(rows, { start: '2026-09-07', end: '2026-09-13' });
  const second = api.deductionSummaryForRows(rows, { start: '2026-09-21', end: '2026-09-27' });
  assert.equal(opening.amounts.epf, 2500);
  assert.equal(second.amounts.epf, 2500);
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
    record({ id: 'epf', batchId: 'batch-one', type: 'epf', amountCents: 2500, status: 'applied', installments: [
      { index: 0, dueDate: '2026-09-18', status: 'applied', settlementPeriodStart: '2026-09-14', settlementPeriodEnd: '2026-09-20' },
      { index: 1, dueDate: '2026-09-24', status: 'applied', settlementPeriodStart: '2026-09-21', settlementPeriodEnd: '2026-09-27' },
      { index: 2, dueDate: '2026-10-01', status: 'applied', settlementPeriodStart: '2026-09-28', settlementPeriodEnd: '2026-10-04' },
      { index: 3, dueDate: '2026-10-08', status: 'applied', settlementPeriodStart: '2026-10-05', settlementPeriodEnd: '2026-10-11' },
    ] }),
  ]);
  assert.equal(payload.rows.length, 2); assert.equal(payload.summary.value, 'RM 518.00');
  assert.deepEqual(Array.from(payload.footerRows.at(-1)), ['NET COMMISSION', 'RM 518.00']);
  assert.ok(payload.footerRows.some(row => row[0] === 'EPF (applied)' && row[1] === '- RM 25.00'));
  assert.ok(payload.footerRows.some(row => row[0] === 'APPLIED DEDUCTIONS' && row[1] === '- RM 37.00'));
  assert.equal(payload.footerRows.some(row => row[0].includes('SCHEDULED')), false);
});
test('History marks the payment active for today without confusing it with the applied record status', () => {
  const api = runtime();
  const dates = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
  const notice = api.deductionScheduleNotice(record({ installmentCount: 7, installments: dates.map((dueDate, index) => ({ index, dueDate, status: 'applied' })) }), '2026-09-15');
  assert.equal(notice.state, 'current');
  assert.equal(notice.payment, 1);
  assert.equal(notice.count, 7);
  assert.equal(notice.start, '2026-09-14');
  assert.equal(notice.end, '2026-09-20');
});
test('History payment progress follows schedule dates and marks an active payment ready for download', () => {
  const api = runtime();
  const schedule = record({ installmentCount: 2, installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied' }, { index: 1, dueDate: '2026-09-21', status: 'applied' }] });
  const first = api.deductionGroupScheduleProgress([schedule], '2026-09-15');
  assert.equal(first.label, '1/2 payment'); assert.equal(first.ready, true);
  const second = api.deductionGroupScheduleProgress([schedule], '2026-09-21');
  assert.equal(second.label, '2/2 payment'); assert.equal(second.ready, true);
});
test('History payment schedule filter keeps a full request when one of its payments matches', () => {
  const api = runtime();
  const request = { records: [record({ installmentCount: 2, installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied' }, { index: 1, dueDate: '2026-09-21', status: 'applied' }] })] };
  assert.equal(api.deductionGroupMatchesTiming(request, 'ready', '2026-09-15'), true);
  assert.equal(api.deductionGroupMatchesTiming(request, 'upcoming', '2026-09-15'), true);
  assert.equal(api.deductionGroupMatchesTiming(request, 'upcoming', '2026-09-12'), true);
  assert.equal(api.deductionGroupMatchesTiming(request, 'complete', '2026-09-22'), false);
});
test('Ready to download excludes payments already sent to rider', () => {
  const api = runtime();
  const sent = { records: [record({ installmentCount: 1, installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied', statementSentAt: '2026-09-14T09:00:00Z' }] })] };
  assert.equal(api.deductionGroupMatchesTiming(sent, 'ready', '2026-09-15'), false);
  assert.equal(api.deductionGroupMatchesTiming(sent, 'sent', '2026-09-15'), true);
  assert.equal(api.deductionGroupMatchesTiming(sent, 'complete', '2026-09-15'), true);
});
test('History exposes every payment option while preventing early PDF downloads', () => {
  const group = { records: [record({ installmentCount: 2, installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied' }, { index: 1, dueDate: '2026-09-21', status: 'applied' }] })] };
  const options = runtime().deductionHistoryPaymentOptions(group, '2026-09-15');
  assert.deepEqual(options.map(option => [option.label, option.state]), [['Insurance · Payment 1/2', 'ready'], ['Insurance · Payment 2/2', 'upcoming']]);
});
test('one History row combines its selected due payments into one PDF', async () => {
  const columns = [{ key: 'rider_name', label: 'Rider', value: row => row.rider_name }, { key: 'quantity', label: 'Quantity', value: row => row.quantity }, { key: 'commission', label: 'Commission', value: row => row.commission }];
  let requests = 0;
  const api = runtime({
    FINANCE_API_ENDPOINT: '/api/grafana/finance', panels: [{ id: 'commission-main', columns }], visibleTableColumns: panel => panel.columns,
    financeGrafanaFilterParam: () => '{}', requestFinancePayload: async () => { requests += 1; return { response: { ok: true }, payload: { rows: [{ rider_name: 'Rider A', quantity: 1, commission: 300 }] } }; },
    canonicalizeFinancePayloadRows: async (_panel, payload) => payload.rows,
  });
  const group = { records: [
    record({ id: 'insurance', amountCents: 1944, installmentCount: 2, installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied', settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' }, { index: 1, dueDate: '2026-09-21', status: 'applied', settlementPeriodStart: '2026-09-14', settlementPeriodEnd: '2026-09-20' }] }),
    record({ id: 'battery', type: 'battery-tester', amountCents: 5000, installmentCount: 2, installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied', settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' }, { index: 1, dueDate: '2026-09-21', status: 'applied', settlementPeriodStart: '2026-09-14', settlementPeriodEnd: '2026-09-20' }] }),
  ] };
  const payload = await api.deductionCombinedPaymentStatementPayload(api.deductionHistoryDownloadOptions(group, {}, '2026-09-15'));
  assert.equal(requests, 1);
  assert.equal(payload.filename, 'Rider_A_payment-2');
  assert.ok(payload.footerRows.some(row => row[0] === 'INSURANCE — PAYMENT 1 OF 2' && row[2] === '- RM 19.44'));
  assert.ok(payload.footerRows.some(row => row[0] === 'OBD / BATTERY TESTER — PAYMENT 1 OF 2' && row[2] === '- RM 50.00'));
  assert.ok(payload.footerRows.some(row => row[0] === 'TOTAL DEDUCTED' && row[2] === '- RM 69.44'));
  assert.match(payload.period, /Insurance · Payment 1 of 2 · Deduction date: 14\/09\/2026/);
  assert.match(payload.period, /OBD \/ Battery Tester · Payment 1 of 2 · Deduction date: 14\/09\/2026/);
});
test('History filters each deduction column by its own payment status', () => {
  const api = runtime();
  const group = { records: [record({ type: 'insurance', installmentCount: 1, installments: [{ index: 0, dueDate: '2026-09-14', status: 'applied' }] }), record({ id: 'battery', type: 'battery-tester', installmentCount: 1, installments: [{ index: 0, dueDate: '2026-09-21', status: 'applied' }] })] };
  assert.equal(api.deductionGroupMatchesTypePaymentFilters(group, { insurance: 'ready' }, '2026-09-15'), true);
  assert.equal(api.deductionGroupMatchesTypePaymentFilters(group, { 'battery-tester': 'ready' }, '2026-09-15'), false);
  assert.equal(api.deductionGroupMatchesTypePaymentFilters(group, { 'battery-tester': 'upcoming' }, '2026-09-15'), true);
  assert.equal(api.deductionGroupMatchesTypePaymentFilters(group, { epf: 'ready' }, '2026-09-15'), false);
});
test('rider statement PDF allocates later EPF payments to their configured weeks', () => {
  const tableRows = [{ rider_name: 'Rider A', commission: 100 }];
  const columns = [{ key: 'rider_name', label: 'Rider', value: row => row.rider_name }, { key: 'commission', label: 'Commission', value: row => row.commission }];
  const api = runtime({
    auditCapture: () => ({ scope: { dates: { start: '2026-09-21', end: '2026-09-27' } } }),
    financeTableExportPayload: () => ({ title: 'Line Item Audit', panelTitle: 'Commission Rider', filename: 'Commission', columns, rows: tableRows, footer: ['Filtered total', 'RM 100.00'], period: '2026-09-21 - 2026-09-27' }),
  });
  const payload = api.deductionHistoryStatementPayload([
    record({ id: 'epf', batchId: 'batch-one', type: 'epf', amountCents: 2500, status: 'applied', installments: [
      { index: 0, dueDate: '2026-09-18', status: 'applied', settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' },
      { index: 1, dueDate: '2026-09-24', status: 'applied', settlementPeriodStart: '2026-09-21', settlementPeriodEnd: '2026-09-27' },
      { index: 2, dueDate: '2026-10-01', status: 'applied', settlementPeriodStart: '2026-09-28', settlementPeriodEnd: '2026-10-04' },
      { index: 3, dueDate: '2026-10-08', status: 'applied', settlementPeriodStart: '2026-10-05', settlementPeriodEnd: '2026-10-11' },
    ] }),
  ]);
  assert.equal(payload.summary.value, 'RM 75.00');
  assert.ok(payload.footerRows.some(row => row[0] === 'EPF (applied)' && row[1] === '- RM 25.00'));
  assert.ok(payload.footerRows.some(row => row[0] === 'APPLIED DEDUCTIONS' && row[1] === '- RM 25.00'));
});
test('History Rider PDF exports one Battery Tester payment for fixed 2 and fixed 7 plans', () => {
  const tableRows = [{ rider_name: 'Rider A', commission: 500 }];
  const columns = [{ key: 'rider_name', label: 'Rider', value: row => row.rider_name }, { key: 'commission', label: 'Commission', value: row => row.commission }];
  const api = runtime({ financeTableExportPayload: () => ({ title: 'Line Item Audit', panelTitle: 'Commission Rider', filename: 'Commission', columns, rows: tableRows, footer: ['Filtered total', 'RM 500.00'], period: '2026-09-07 - 2026-09-13' }) });
  const installments = (count, amountCents) => Array.from({ length: count }, (_, index) => ({ index, dueDate: '2026-09-10', status: 'applied', amountCents, settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' }));
  const twoPayments = api.deductionHistoryStatementPayload([record({ type: 'battery-tester', pricingMode: 'fixed-2', amountCents: 5000, installmentCount: 2, installments: installments(2, 5000) })]);
  const sevenPayments = api.deductionHistoryStatementPayload([record({ type: 'battery-tester', pricingMode: 'fixed-7', amountCents: 4000, installmentCount: 7, installments: installments(7, 4000) })]);
  assert.ok(twoPayments.footerRows.some(row => row[0] === 'OBD / BATTERY TESTER (applied)' && row[1] === '- RM 50.00'));
  assert.ok(sevenPayments.footerRows.some(row => row[0] === 'OBD / BATTERY TESTER (applied)' && row[1] === '- RM 40.00'));
});
test('History Rider PDF exports the entered Insurance amount once', () => {
  const tableRows = [{ rider_name: 'Rider A', commission: 100 }];
  const columns = [{ key: 'rider_name', label: 'Rider', value: row => row.rider_name }, { key: 'commission', label: 'Commission', value: row => row.commission }];
  const api = runtime({ financeTableExportPayload: () => ({ title: 'Line Item Audit', panelTitle: 'Commission Rider', filename: 'Commission', columns, rows: tableRows, footer: ['Filtered total', 'RM 100.00'], period: '2026-09-07 - 2026-09-13' }) });
  const insurance = record({ amountCents: 1944, installmentCount: 2, installments: [
    { index: 0, dueDate: '2026-09-07', status: 'applied', amountCents: 1944, settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' },
    { index: 1, dueDate: '2026-09-08', status: 'applied', amountCents: 1944, settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' },
  ] });
  api.deductionState.loaded = true;
  api.deductionState.records = [insurance];
  assert.equal(api.deductionSummaryForRows([{ rider_name: 'Rider A', created_at: '2026-09-07', commission: 100 }], { start: '2026-09-07', end: '2026-09-13' }).statementAmounts.insurance, 1944);
  const payload = api.deductionHistoryStatementPayload([insurance]);
  assert.ok(payload.footerRows.some(row => row[0] === 'INSURANCE (applied)' && row[1] === '- RM 19.44'));
  assert.ok(payload.footerRows.some(row => row[0] === 'APPLIED DEDUCTIONS' && row[1] === '- RM 19.44'));
  assert.equal(payload.summary.value, 'RM 80.56');
});
test('selected payment PDF refreshes its own Commission Rider week and exports one installment', async () => {
  const columns = [{ key: 'rider_name', label: 'Rider', value: row => row.rider_name }, { key: 'quantity', label: 'Quantity', value: row => row.quantity }, { key: 'commission', label: 'Commission', value: row => row.commission }];
  let requestUrl = '';
  const api = runtime({
    FINANCE_API_ENDPOINT: '/api/grafana/finance', panels: [{ id: 'commission-main', columns }], visibleTableColumns: panel => panel.columns,
    financeGrafanaFilterParam: () => '{}', requestFinancePayload: async url => { requestUrl = url; return { response: { ok: true }, payload: { rows: [{ rider_name: 'Rider A', quantity: 1, commission: 300 }, { rider_name: 'Other', quantity: 1, commission: 999 }] } }; },
    canonicalizeFinancePayloadRows: async (_panel, payload) => payload.rows,
  });
  const epf = record({ type: 'epf', amountCents: 2500, installmentCount: 4, installments: [{ index: 0, dueDate: '2026-09-18', status: 'applied', settlementPeriodStart: '2026-09-14', settlementPeriodEnd: '2026-09-20' }] });
  const payload = await api.deductionPaymentStatementPayload(epf, 0);
  assert.match(requestUrl, /from=2026-09-07/);
  assert.match(requestUrl, /to=2026-09-13/);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.filename, 'Rider_A_payment-4');
  assert.match(payload.period, /EPF · Payment 1 of 4 · Deduction date: 18\/09\/2026/);
  assert.ok(!payload.footerRows.some(row => row[0] === 'SELECTED DEDUCTION DATE'));
  assert.ok(!payload.footerRows.some(row => row[0] === 'COMMISSION PERIOD'));
  assert.ok(payload.footerRows.some(row => row[0] === 'EPF — PAYMENT 1 OF 4' && row[1] === '18/09/2026' && row[2] === '- RM 25.00'));
  assert.ok(payload.footerRows.some(row => row[0] === 'NET COMMISSION' && row[2] === 'RM 275.00'));
});
test('selected payment statement reuses its preloaded Grafana request for a fast download', async () => {
  const columns = [{ key: 'rider_name', label: 'Rider', value: row => row.rider_name }, { key: 'quantity', label: 'Quantity', value: row => row.quantity }, { key: 'commission', label: 'Commission', value: row => row.commission }];
  let requests = 0;
  const api = runtime({
    FINANCE_API_ENDPOINT: '/api/grafana/finance', panels: [{ id: 'commission-main', columns }], visibleTableColumns: panel => panel.columns,
    financeGrafanaFilterParam: () => '{}', requestFinancePayload: async () => { requests += 1; return { response: { ok: true }, payload: { rows: [{ rider_name: 'Rider A', quantity: 1, commission: 300 }] } }; },
    canonicalizeFinancePayloadRows: async (_panel, payload) => payload.rows,
  });
  await api.deductionPrefetchPaymentStatement(record(), 0);
  await api.deductionPaymentStatementPayload(record(), 0);
  assert.equal(requests, 1);
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
