import test from 'node:test';
import assert from 'node:assert/strict';
import { DeductionRegister, validateDeduction, deductionsApi } from '../src/deductions.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = { rider: 'Rider A', orderId: '123', type: 'insurance', subtype: 'insurance', amount: '12.35', installmentCount: '2', reason: 'Policy renewal', deductionDate: '2026-09-14', createdBy: 'Finance A' };
const epfSchedule = ['2026-09-18', '2026-09-24', '2026-10-01', '2026-10-08'];
const epfInput = { ...base, type: 'epf', subtype: 'EPF', amount: '25', installmentCount: '4', periodStart: '2026-08-31', periodEnd: '2026-09-06', deductionDate: epfSchedule[0], epfScheduleMonth: '2026-09', installmentDates: epfSchedule, weeklyCommission: '300' };
const dashboardHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
class MemoryStorage {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); }
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async delete(key) { this.data.delete(key); }
  async list({ prefix, startAfter, limit }) { return new Map([...this.data].sort(([a],[b]) => a.localeCompare(b)).filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).slice(0, limit)); }
  transaction(fn) {
    const operation = this.queue.then(async () => { const before = structuredClone(this.data); try { return await fn(this); } catch (error) { this.data = before; throw error; } });
    this.queue = operation.catch(() => {}); return operation;
  }
}
const post = async (register, body, path = '/create', session = 'session-a', role = 'maker', name = role === 'checker' ? 'Finance Checker' : 'Finance Maker') => {
  const input = structuredClone(body);
  // Direct register tests stand in for the trusted gateway; gateway verification is covered separately.
  for (const line of path === '/create-batch' ? input.lines : [input]) {
    const scope = { ...input, ...line };
    if (line.type === 'epf') line.epfVerification = { rider: scope.rider, riderKey: scope.rider.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' '), periodStart: scope.periodStart, periodEnd: scope.periodEnd, amountCents: Math.round(Number(scope.weeklyCommission) * 100), rowCount: 1, verifiedAt: '2026-09-23T12:00:00Z', source: 'Grafana Finance', eligible: true };
  }
  const response = await register.fetch(new Request('https://local' + path, { method: 'POST', headers: { 'x-deduction-session': session, 'x-deduction-user': name, 'x-deduction-role': role, 'x-deduction-internal': '1' }, body: JSON.stringify(input) }));
  return { status: response.status, body: await response.json() };
};
test('validates cents, required fields, subtype, dates and weekly EPF qualification', () => {
  assert.equal(validateDeduction(base).amountCents, 1235);
  assert.equal(validateDeduction(base).scheduledAmountCents, 2470);
  assert.equal(validateDeduction(base).installmentCount, 2);
  assert.equal(validateDeduction(base).installmentIntervalDays, 7);
  assert.deepEqual(validateDeduction(base).codes, [2]);
  const batteryTwo = validateDeduction({ ...base, type: 'battery-tester', subtype: 'battery tester', pricingMode: 'fixed-2', amount: '50', installmentCount: '2' });
  assert.deepEqual(batteryTwo.codes, [2,7]);
  assert.equal(batteryTwo.scheduledAmountCents, 10000);
  const batterySeven = validateDeduction({ ...base, type: 'battery-tester', subtype: 'battery tester', pricingMode: 'fixed-7', amount: '40', installmentCount: '7' });
  assert.equal(batterySeven.scheduledAmountCents, 28000);
  const batteryManual = validateDeduction({ ...base, type: 'battery-tester', subtype: 'battery tester', pricingMode: 'manual', amount: '63.50', installmentCount: '3', deductionDate: '2026-09-15' });
  assert.equal(batteryManual.installmentCount, 3);
  assert.equal(batteryManual.scheduledAmountCents, 19050);
  const specialManual = validateDeduction({ ...base, type: 'manual', subtype: 'accident', amount: '75.25', installmentCount: '4', deductionDate: '2026-09-15' });
  assert.equal(specialManual.installmentCount, 4);
  assert.equal(specialManual.scheduledAmountCents, 30100);
  assert.deepEqual(specialManual.installments.map(item => item.dueDate), ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06']);
  assert.throws(() => validateDeduction({ ...base, type: 'battery-tester', subtype: 'battery tester', pricingMode: 'manual', amount: '63.50', installmentCount: '0', deductionDate: '2026-09-15' }));
  assert.throws(() => validateDeduction({ ...base, type: 'manual', subtype: 'other', installmentCount: '0', deductionDate: '2026-09-15' }));
  assert.throws(() => validateDeduction({ ...base, type: 'manual', subtype: 'other', installmentCount: '53', deductionDate: '2026-09-15' }));
  assert.throws(() => validateDeduction({ ...base, installmentCount: '7' }));
  assert.throws(() => validateDeduction({ ...base, type: 'battery-tester', subtype: 'battery tester', pricingMode: 'fixed-2', amount: '40', installmentCount: '2' }));
  assert.throws(() => validateDeduction({ ...base, type: 'battery-tester', subtype: 'battery tester', pricingMode: 'fixed-7', amount: '40', installmentCount: '3' }));
  assert.throws(() => validateDeduction({ ...base, deductionDate: '2026-09-15' }));
  for (const field of ['rider', 'createdBy']) assert.throws(() => validateDeduction({ ...base, [field]: '' }));
  assert.equal(validateDeduction({ ...base, reason: '' }).reason, '');
  assert.equal(validateDeduction({ ...base, reason: '  ' }).reason, '');
  assert.throws(() => validateDeduction({ ...base, reason: 'x'.repeat(2001) }));
  for (const amount of ['-1', '0', '1.001', 'NaN', 'Infinity']) assert.throws(() => validateDeduction({ ...base, amount }));
  assert.throws(() => validateDeduction({ ...base, deductionDate: '2026-02-30' }));
  const epf = epfInput;
  assert.equal(validateDeduction(epf).reportedWeeklyCommissionCents, 30000);
  assert.equal(validateDeduction(epf).epfContributionMonth, '2026-10');
  assert.equal(validateDeduction(epf).scheduledAmountCents, 10000);
  assert.deepEqual(validateDeduction(epf).installments.map(item => item.dueDate), epfSchedule);
  assert.throws(() => validateDeduction({ ...epf, weeklyCommission: '299.99' }));
  assert.throws(() => validateDeduction({ ...epf, amount: '26' }));
  assert.throws(() => validateDeduction({ ...epf, periodStart: '2026-09-01' }));
});

test('worker exposes the Malaysia government holiday calendar for EPF scheduling', () => {
  assert.match(workerSource, /\/api\/public-holidays/);
  assert.match(workerSource, /https:\/\/www\.malaysia\.gov\.my\/calendar/);
  assert.match(workerSource, /`\$\{year\}-09-16`/);
  assert.match(workerSource, /new Set\(\[\.\.\.fixedDates, \.\.\.dates\]\)/);
});
test('one rider request can create independent EPF and Insurance records atomically', async () => {
  const register = new DeductionRegister({ storage: new MemoryStorage() });
  const requestId = crypto.randomUUID();
  const result = await post(register, {
    requestId, rider: 'Rider A', orderId: '', periodStart: '2026-09-07', periodEnd: '2026-09-13', grossCommission: '555', createdBy: 'Finance A',
    lines: [
      { type: 'epf', subtype: 'EPF', amount: '25', installmentCount: '4', deductionDate: epfSchedule[0], epfScheduleMonth: '2026-09', installmentDates: epfSchedule, weeklyCommission: '555', reason: 'Monthly EPF plan' },
      { type: 'insurance', subtype: 'insurance', amount: '12', installmentCount: '2', deductionDate: '2026-09-14', reason: 'Insurance repayment' }
    ]
  }, '/create-batch');
  assert.equal(result.status, 201);
  assert.equal(result.body.records.length, 2);
  assert.deepEqual(result.body.records.map(record => record.type), ['epf', 'insurance']);
  assert.equal(result.body.approvalStatus, 'applied');
  assert.equal(result.body.records.every(record => record.status === 'applied'), true);
  assert.equal(result.body.records.every(record => /^DED-\d{6}-\d{6}$/.test(record.reference)), true);
  const listed = await (await register.fetch(new Request('https://local/', { headers: { 'x-deduction-session': 'session-a', 'x-deduction-user': 'Signed-in User', 'x-deduction-role': 'maker' } }))).json();
  assert.equal(listed.records.every(record => record.createdBy === 'Finance A'), true);
  assert.equal(listed.records.every(record => record.identityVerified === false), true);
});
test('loading History applies every legacy pending installment to its commission period', async () => {
  const storage = new MemoryStorage();
  const register = new DeductionRegister({ storage }, {}, { now: () => new Date('2026-09-23T12:00:00Z') });
  const legacy = { ...validateDeduction(base), id: 'legacy-pending-1', reference: 'DED-202609-000001', status: 'pending', approvalStatus: 'pending', approvedBy: null, approvedAt: null, audit: [{ action: 'created', at: '2026-09-14T08:00:00Z', by: 'Finance A' }] };
  await storage.put('record:' + legacy.id, legacy);
  const listed = await (await register.fetch(new Request('https://local/', { headers: { 'x-deduction-session': 'session-a', 'x-deduction-user': 'Finance A', 'x-deduction-role': 'maker' } }))).json();
  assert.equal(listed.records[0].status, 'applied');
  assert.equal(listed.records[0].approvalStatus, 'applied');
  assert.equal(listed.records[0].approvedBy, 'Finance A');
  assert.equal(listed.records[0].installments.every(item => item.status === 'applied'), true);
  assert.equal(listed.records[0].installments.every(item => item.paymentDate === '2026-09-23'), true);
  assert.equal(listed.records[0].audit.at(-1).action, 'automatically-applied');
});
test('loading History finishes a partially applied legacy schedule with zero remaining', async () => {
  const storage = new MemoryStorage();
  const register = new DeductionRegister({ storage }, {}, { now: () => new Date('2026-09-23T12:00:00Z') });
  const legacy = { ...validateDeduction(base), id: 'legacy-partial-1', reference: 'DED-202609-000002', status: 'approved', approvalStatus: 'approved', audit: [{ action: 'applied', at: '2026-09-14T08:00:00Z', by: 'Finance A' }] };
  legacy.installments[0] = { ...legacy.installments[0], status: 'applied', appliedAt: '2026-09-14T08:00:00Z', appliedBy: 'Finance A', paymentDate: '2026-09-14' };
  await storage.put('record:' + legacy.id, legacy);
  const listed = await (await register.fetch(new Request('https://local/', { headers: { 'x-deduction-session': 'session-a', 'x-deduction-user': 'Finance A', 'x-deduction-role': 'maker' } }))).json();
  assert.equal(listed.records[0].status, 'applied');
  assert.equal(listed.records[0].installments.every(item => item.status === 'applied'), true);
  assert.equal(listed.records[0].installments.filter(item => item.paymentDate === '2026-09-23').length, 1);
});
test('a downloaded payment statement is persistently marked sent to rider', async () => {
  const storage = new MemoryStorage(); const register = new DeductionRegister({ storage }, {}, { now: () => new Date('2026-09-15T10:00:00Z') });
  const created = await post(register, { ...base, requestId: crypto.randomUUID() });
  const marked = await post(register, { recordId: created.body.id, installmentIndex: 0, requestId: crypto.randomUUID() }, '/mark-sent');
  assert.equal(marked.status, 201); assert.equal(marked.body.statementSentBy, 'Finance Maker');
  const stored = await storage.get('record:' + created.body.id);
  assert.equal(stored.installments[0].statementSentBy, 'Finance Maker');
  assert.equal(stored.audit.at(-1).action, 'statement-sent');
});
test('saved deductions apply immediately, remain idempotent, support reversal and enforce one EPF plan per month', async () => {
  const storage = new MemoryStorage(); const register = new DeductionRegister({ storage }, {}, { now: () => new Date('2026-09-23T12:00:00Z') });
  const input = { ...base, requestId: crypto.randomUUID() };
  const first = await post(register, input); assert.equal(first.status, 201);
  assert.deepEqual(await post(register, input), first);
  assert.equal((await post(register, { ...input, amount: '99' })).status, 400);
  const recordId = first.body.id;
  assert.equal(first.body.approvalStatus, 'applied');
  assert.equal((await post(register, { requestId: crypto.randomUUID(), recordId }, '/approve')).status, 201);
  const appliedRecord = await storage.get('record:' + recordId);
  assert.equal(appliedRecord.installments.every(item => item.status === 'applied'), true);
  assert.equal(appliedRecord.amountCents * appliedRecord.installments.length, 2470);
  assert.equal((await post(register, { requestId: crypto.randomUUID(), recordId, reason: 'Correction' }, '/reverse', 'session-b', 'checker')).body.status, 'reversed');
  const listRequest = new Request('https://local/', { headers: { 'x-deduction-session': 'session-a', 'x-deduction-user': 'Finance Maker', 'x-deduction-role': 'maker' } });
  const result = await (await register.fetch(listRequest)).json();
  assert.equal(result.records.some(record => record.status === 'reversed'), true);
  assert.equal(result.records.every(record => !('creatorSession' in record)), true);
  const firstPlan = await post(register, { ...epfInput, requestId: crypto.randomUUID() });
  const secondPlan = await post(register, { ...epfInput, orderId: '', periodStart: '2026-09-07', periodEnd: '2026-09-13', requestId: crypto.randomUUID() });
  assert.equal(firstPlan.status, 201); assert.equal(secondPlan.status, 400);
  assert.match(secondPlan.body.error, /monthly plan.*2026-09/i);
});
test('gateway rejects cross-origin and non-JSON mutations', async () => {
  const actor = { sessionId: 's', name: 'Finance Maker', role: 'maker' };
  assert.equal((await deductionsApi(new Request('https://app/api/deductions/create', { method: 'POST', headers: { origin: 'https://evil', 'content-type': 'application/json' } }), { DEDUCTIONS: {} }, actor)).status, 403);
  assert.equal((await deductionsApi(new Request('https://app/api/deductions/create', { method: 'POST', headers: { origin: 'https://app', 'content-type': 'text/plain' } }), { DEDUCTIONS: {} }, actor)).status, 403);
});
test('retired deduction filters cannot hide rows in any Finance table', () => {
  const source = readFileSync(new URL('../../deductions.js', import.meta.url), 'utf8');
  const context = vm.createContext({ document: { addEventListener() {} }, auditViews: { tables: { main: { deductionFilter: 'insurance' }, copy: {} } }, formatGrafanaTimestamp: value => value });
  vm.runInContext(source + '\nglobalThis.registerState = deductionState;', context);
  context.registerState.loaded = true;
  context.registerState.records = [{ ...validateDeduction(base), id: 'a' }];
  const rows = [{ rider_name: 'Rider A', order_id: '123' }, { rider_name: 'Rider B', order_id: '123' }, { rider_name: 'Rider A', order_id: '456' }];
  assert.equal(context.deductionFilterRows('main', rows).length, 3);
  assert.equal(context.deductionFilterRows('copy', rows).length, 3);
  context.registerState.records[0].status = context.registerState.records[0].approvalStatus = 'cancelled';
  assert.equal(context.deductionFilterRows('main', rows).length, 3);
  context.registerState.records = [{ ...validateDeduction({ ...base, orderId: '', periodStart: '2026-09-01', periodEnd: '2026-09-07' }) }];
  assert.equal(context.deductionFilterRows('main', [{ rider_name: 'Rider A', created_at: '2026-09-07 23:59:59' }, { rider_name: 'Rider A', created_at: '2026-09-08 00:00:00' }]).length, 2);
});

test('multiple rider names only disable deduction controls and never filter Commission Rider rows', () => {
  assert.doesNotMatch(dashboardHtml, /return panel\.id === "commission-main" && typeof deductionFilterRows/);
  assert.doesNotMatch(dashboardHtml, /output = deductionFilterRows\(tableId, output\)/);
  assert.match(dashboardHtml, /More than 1 rider_name found\. Filter to one rider before creating a deduction\./);
  assert.match(dashboardHtml, /data-deduction-inline-create[^>]*disabled/);
});
test('a single-rider Commission Rider filter renders every matching detail row before the deduction formula', () => {
  assert.match(dashboardHtml, /const singleRiderScope = panel\.id === "commission-main" && typeof deductionSingleRider === "function" && deductionSingleRider\(dataRows\)\.valid;/);
  assert.match(dashboardHtml, /const renderedCount = singleRiderScope \? dataRows\.length : Math\.min\(TABLE_SCROLL_BATCH, dataRows\.length\);/);
  assert.match(dashboardHtml, /is-single-rider-scope/);
  assert.match(dashboardHtml, /\.ledger-card\.is-single-rider-scope \.table-wrap\s*\{\s*min-height: 320px;\s*max-height: min\(52vh, 520px\);/);
});
test('only applied installments reduce rider commission; scheduled installments do not', () => {
  const source = readFileSync(new URL('../../deductions.js', import.meta.url), 'utf8');
  const context = vm.createContext({ document: { addEventListener() {} }, auditViews: { tables: {} }, auditCapture: () => ({ scope: { dates: { start: '2026-09-07', end: '2026-09-13' } } }), formatGrafanaTimestamp: value => String(value).replace('T', ' ').replace('Z', ''), numberValue: value => Number(value) || 0, formatNumber: value => Number(value).toLocaleString('en-US'), formatMoney: value => `RM ${Number(value).toFixed(2)}`, esc: value => String(value) });
  vm.runInContext(source + '\nglobalThis.registerState = deductionState;', context);
  context.registerState.loaded = true;
  const insurance = validateDeduction({ ...base, amount: '10', deductionDate: '2026-09-07' });
  insurance.status = insurance.approvalStatus = 'approved'; insurance.installments[0].status = 'applied';
  const scheduled = validateDeduction({ ...base, amount: '99', deductionDate: '2026-09-07' });
  const epf = validateDeduction({ ...epfInput, orderId: '', periodStart: '2026-09-07', periodEnd: '2026-09-13', weeklyCommission: '350' });
  epf.status = epf.approvalStatus = 'applied'; epf.installments.forEach((item, index) => { item.status = 'applied'; item.settlementPeriodStart = index === 0 ? '2026-09-07' : '2026-01-01'; item.settlementPeriodEnd = index === 0 ? '2026-09-13' : '2026-01-07'; });
  context.registerState.records = [insurance, scheduled, epf];
  const rows = [{ rider_name: 'Rider A', created_at: '2026-09-10 10:00:00', commission: 350 }];
  const result = context.deductionSummaryForRows(rows, { start: '2026-09-07 00:00:00', end: '2026-09-13 23:59:59' });
  assert.equal(result.amounts.insurance, 1000);
  assert.equal(result.amounts.epf, 2500);
  assert.equal(result.pendingCents, 9900);
  assert.equal(result.approvedCents, 3500);
  assert.equal(result.netCents, 31500);
  const active = context.deductionSummaryMarkup(rows, 'main');
  assert.match(active, /<h3>Rider A<\/h3>/);
  assert.match(active, /data-deduction-inline-type/);
  assert.match(active, /data-deduction-history-open>History<\/button>/);
  assert.match(active, /Applied deductions<\/span><strong>RM 35\.00/);
  assert.match(active, /Net commission<\/span><strong>RM 315\.00/);
  assert.doesNotMatch(active, /data-deduction-inline-type disabled/);
  const inactive = context.deductionSummaryMarkup([...rows, { rider_name: 'Rider B', created_at: '2026-09-10 11:00:00', commission: 20 }], 'main');
  assert.equal(inactive, '');
  const missing = context.deductionSummaryMarkup([...rows, { rider_name: '', created_at: '2026-09-10 12:00:00', commission: 10 }], 'main');
  assert.equal(missing, '');
});
test('Commission Rider uses the green rider-level deduction form and has no toolbar or row-level Deduct buttons', () => {
  assert.doesNotMatch(dashboardHtml, /data-deduction-row/);
  assert.doesNotMatch(dashboardHtml, /deductionRowAction/);
  assert.doesNotMatch(dashboardHtml, /card\.querySelector\('\.audit-template-controls'\)\?\.after\(menu\)/);
  assert.match(dashboardHtml, /data-deduction-inline-type/);
  assert.match(dashboardHtml, /data-deduction-inline-amount/);
  assert.match(dashboardHtml, /data-deduction-inline-battery-plan/);
  assert.match(dashboardHtml, /2 × RM50/);
  assert.match(dashboardHtml, /7 × RM40/);
  assert.match(dashboardHtml, /Manual · set amount and payments/);
  assert.match(dashboardHtml, /aria-label="Special Case number of payments"/);
  assert.match(dashboardHtml, /Reason \/ remarks <span>\(optional\)<\/span>/);
  assert.doesNotMatch(dashboardHtml, /data-line-reason[^>]*required/);
  assert.match(dashboardHtml, /type === 'manual' \? draft\.manualCount/);
  assert.match(dashboardHtml, /type === 'manual' \? \{ installmentCount: draft\.manualCount \}/);
  assert.match(dashboardHtml, />Proceed<\/button>/);
  assert.match(dashboardHtml, /type="checkbox"[^>]+data-deduction-inline-type/);
  assert.match(dashboardHtml, /deductionProceedBatch/);
  assert.doesNotMatch(dashboardHtml, /deductionDialog\('Create deduction request'\)/);
  assert.match(dashboardHtml, /await deductionHistoryOpen\(\)/);
  assert.match(dashboardHtml, /createdBy: deductionState\.actor\?\.name/);
  assert.match(dashboardHtml, /More than 1 rider_name found\. Filter to one rider/);
  assert.match(dashboardHtml, /class="button row-detail-action"/);
  assert.match(dashboardHtml, /Commission deduction formula/);
  assert.match(dashboardHtml, /RM25 × first 4 weeks · RM100 monthly/);
  assert.doesNotMatch(dashboardHtml, /Checking the rider’s complete weekly commission/);
  assert.doesNotMatch(dashboardHtml, /deductionRequest\('\/eligibility\?rider='/);
  assert.match(dashboardHtml, /Thursday; Friday when Wednesday is a holiday/);
  assert.match(dashboardHtml, /data-deduction-detail-toggle/);
  assert.match(dashboardHtml, /data-deduction-detail-save/);
  assert.match(dashboardHtml, /data-deduction-detail-amount/);
  assert.match(dashboardHtml, /data-deduction-detail-count/);
  assert.match(dashboardHtml, /data-deduction-detail-plan/);
  assert.match(dashboardHtml, /deductionRequest\('\/update-details'/);
  assert.match(dashboardHtml, /foot: payload\.footerRows/);
  assert.match(dashboardHtml, /payload\.exportSummaryRows/);
});

test('PDF deduction footer contains only applied deduction categories and their total', () => {
  const start = dashboardHtml.indexOf('function financeCommissionExportMeta');
  const end = dashboardHtml.indexOf('function financeTableExportPayload', start);
  const source = dashboardHtml.slice(start, end);
  const columns = [{ key: 'rider_name', value: row => row.rider_name }, { key: 'quantity', value: row => row.quantity }, { key: 'commission', value: row => row.commission }];
  const rows = [{ rider_name: 'Rider A', quantity: 30, commission: 1095 }];
  const context = vm.createContext({
    columns,
    rows,
    formatMoney: value => `RM ${Number(value).toFixed(2)}`,
    formatNumber: value => String(value),
    numberValue: value => Number(value || 0),
    deductionSummaryForRows: () => ({ loaded: true, grossCents: 109500, amounts: { epf: 10000, insurance: 0, 'battery-tester': 0, manual: 0 }, approvedCents: 10000, pendingCents: 0, netCents: 99500 }),
    auditCapture: () => ({ scope: { dates: { start: '2026-09-07', end: '2026-09-13' } } }),
    tableFilterId: () => 'commission-main-ledger',
    state: { dates: {} },
  });
  vm.runInContext(source + '\nthis.result = financeCommissionExportMeta({ id: "commission-main" }, columns, rows, "commission-main-ledger");', context);
  const footerValues = Array.from(context.result.footerRows, row => Array.from(row));
  assert.ok(footerValues.some(row => row[0] === 'EPF' && row[2] === '- RM 25.00'));
  assert.ok(footerValues.some(row => row[0] === 'Total Deducted' && row[2] === '- RM 25.00'));
  assert.equal(context.result.summary.value, 'RM 1070.00');
  assert.match(source, /epf: Number\(statementAmounts\.epf \|\| 0\) > 0 \? 2500 : 0/);
  assert.match(source, /\["EPF", exportAmounts\.epf\]/);
  assert.match(source, /\["INSURANCE", exportAmounts\.insurance\]/);
  assert.match(source, /\["OBD \/ BATTERY TESTER", exportAmounts\["battery-tester"\]\]/);
  assert.match(source, /\.filter\(\(\[, cents\]\) => Number\(cents \|\| 0\) > 0\)/);
  assert.match(source, /const pdfDeductionItems = exportDeductedCents > 0/);
  assert.match(source, /\["Total Deducted"/);
  assert.match(source, /const footerRows = \[footer, \.\.\.pdfDeductionItems\.map/);
  assert.doesNotMatch(source, /weekly commission|weekly deductions|Pending Deductions/);
  assert.match(source, /riderNames\.length !== 1 \|\| !exportRows\.length \|\| exportRows\.some/);
});

test('Commission Rider PDF exports one Battery Tester payment for fixed 2 and fixed 7 plans', () => {
  const start = dashboardHtml.indexOf('function financeCommissionExportMeta');
  const end = dashboardHtml.indexOf('function financeTableExportPayload', start);
  const source = dashboardHtml.slice(start, end);
  const columns = [{ key: 'rider_name', value: row => row.rider_name }, { key: 'commission', value: row => row.commission }];
  const rows = [{ rider_name: 'Rider A', commission: 500 }];
  const exportFor = (rawCents, statementCents) => {
    const context = vm.createContext({
      columns,
      rows,
      formatMoney: value => `RM ${Number(value).toFixed(2)}`,
      formatNumber: value => String(value),
      numberValue: value => Number(value || 0),
      deductionSummaryForRows: () => ({ loaded: true, grossCents: 50000, amounts: { epf: 0, insurance: 0, 'battery-tester': rawCents, manual: 0 }, statementAmounts: { epf: 0, insurance: 0, 'battery-tester': statementCents, manual: 0 }, approvedCents: rawCents, pendingCents: 0, netCents: 50000 - rawCents }),
      auditCapture: () => ({ scope: { dates: { start: '2026-09-07', end: '2026-09-13' } } }),
      tableFilterId: () => 'commission-main-ledger',
      state: { dates: {} },
    });
    vm.runInContext(source + '\nthis.result = financeCommissionExportMeta({ id: "commission-main" }, columns, rows, "commission-main-ledger");', context);
    return context.result;
  };
  const twoPayments = exportFor(10000, 5000);
  const sevenPayments = exportFor(28000, 4000);
  assert.ok(Array.from(twoPayments.footerRows, row => Array.from(row)).some(row => row[0] === 'OBD / BATTERY TESTER' && row[1] === '- RM 50.00'));
  assert.ok(Array.from(sevenPayments.footerRows, row => Array.from(row)).some(row => row[0] === 'OBD / BATTERY TESTER' && row[1] === '- RM 40.00'));
});

test('Commission Rider PDF exports the entered Insurance amount once', () => {
  const start = dashboardHtml.indexOf('function financeCommissionExportMeta');
  const end = dashboardHtml.indexOf('function financeTableExportPayload', start);
  const source = dashboardHtml.slice(start, end);
  const columns = [{ key: 'rider_name', value: row => row.rider_name }, { key: 'commission', value: row => row.commission }];
  const rows = [{ rider_name: 'Rider A', commission: 100 }];
  const context = vm.createContext({
    columns,
    rows,
    formatMoney: value => `RM ${Number(value).toFixed(2)}`,
    formatNumber: value => String(value),
    numberValue: value => Number(value || 0),
    deductionSummaryForRows: () => ({ loaded: true, grossCents: 10000, amounts: { epf: 0, insurance: 3888, 'battery-tester': 0, manual: 0 }, statementAmounts: { epf: 0, insurance: 1944, 'battery-tester': 0, manual: 0 }, approvedCents: 3888, pendingCents: 0, netCents: 6112 }),
    auditCapture: () => ({ scope: { dates: { start: '2026-09-07', end: '2026-09-13' } } }),
    tableFilterId: () => 'commission-main-ledger',
    state: { dates: {} },
  });
  vm.runInContext(source + '\nthis.result = financeCommissionExportMeta({ id: "commission-main" }, columns, rows, "commission-main-ledger");', context);
  const footerValues = Array.from(context.result.footerRows, row => Array.from(row));
  assert.ok(footerValues.some(row => row[0] === 'INSURANCE' && row[1] === '- RM 19.44'));
  assert.ok(footerValues.some(row => row[0] === 'Total Deducted' && row[1] === '- RM 19.44'));
  assert.equal(context.result.summary.value, 'RM 80.56');
});

test('deduction history is a dedicated Commission Rider view launched from the green formula footer', () => {
  assert.doesNotMatch(dashboardHtml, /className = 'nav-button deduction-history-nav'/);
  assert.match(dashboardHtml, /data-deduction-history-open>History<\/button>/);
  assert.match(dashboardHtml, /id = 'deductionHistoryView'/);
  assert.match(dashboardHtml, />Rider deduction history<\/h2>/);
  assert.match(dashboardHtml, /data-deduction-history-search/);
  assert.match(dashboardHtml, /data-deduction-history-status/);
  assert.match(dashboardHtml, /data-deduction-history-type/);
  assert.match(dashboardHtml, /Payment schedule/);
  assert.match(dashboardHtml, /<th>Next payment<\/th>/);
  assert.match(dashboardHtml, /data-deduction-history-payment-select/);
  assert.match(dashboardHtml, /data-deduction-history-payment-download/);
  assert.match(dashboardHtml, /Applied deductions/);
  assert.match(dashboardHtml, /Total deducted/);
  assert.match(dashboardHtml, /Applied installments/);
  assert.match(dashboardHtml, /data-deduction-history-export="pdf"/);
  assert.match(dashboardHtml, />Export checked Rider PDF<\/button>/);
  assert.match(dashboardHtml, /data-deduction-history-select/);
  assert.match(dashboardHtml, /data-deduction-delete-batch/);
  assert.match(dashboardHtml, />Delete request<\/button>/);
  assert.doesNotMatch(dashboardHtml, /cannot be deleted\. Keep it for the audit trail/);
  assert.match(dashboardHtml, /<th>EPF<\/th><th>Insurance<\/th><th>OBD \/ Battery Tester<\/th><th>Special Case<\/th>/);
  assert.match(dashboardHtml, /function deductionHistoryTypeCell/);
  assert.match(dashboardHtml, /function deductionHistoryGroups/);
  assert.match(dashboardHtml, /data-deduction-batch-id/);
  assert.match(dashboardHtml, /function deductionHistoryStatementPayload/);
  assert.match(dashboardHtml, /financeTableExportPayload\('commission-main'\)/);
  assert.doesNotMatch(dashboardHtml, /SCHEDULED DEDUCTIONS/);
  assert.match(dashboardHtml, /saved deductions are applied immediately/);
  assert.doesNotMatch(dashboardHtml, /data-deduction-action="approve"/);
  assert.doesNotMatch(dashboardHtml, /data-deduction-action="apply">Apply payment/);
  assert.match(dashboardHtml, /data-deduction-action="reverse"/);
  assert.match(dashboardHtml, /← Back to Commission Rider/);
  assert.doesNotMatch(dashboardHtml, /data-deduction-register>History<\/button>/);
});

test('Special Case treats Finance input as the total and shows the per-payment split', () => {
  assert.match(dashboardHtml, /total \? ' total amount' : ' amount per payment'/);
  assert.match(dashboardHtml, /deductionMoney\(cents \/ count\) \+ ' × ' \+ count/);
  assert.match(dashboardHtml, /const amount = type === 'manual' \? entered \/ count : entered/);
  assert.match(dashboardHtml, /amount: amount\.toFixed\(2\)/);
});
