import test from 'node:test';
import assert from 'node:assert/strict';
import { DeductionRegister, deductionsApi } from '../src/deductions.js';
import { createDeductionSnapshot, validateDeductionSnapshot, restoreDeductionSnapshot } from '../src/deduction-backup.js';

class MemoryStorage {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); }
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async delete(key) { this.data.delete(key); }
  async list({ prefix = '', startAfter, limit } = {}) { return new Map([...this.data].sort(([a], [b]) => a.localeCompare(b)).filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).slice(0, limit)); }
  transaction(fn) {
    const operation = this.queue.then(async () => { const before = structuredClone(this.data); try { return await fn(this); } catch (error) { this.data = before; throw error; } });
    this.queue = operation.catch(() => {}); return operation;
  }
}
const fixedNow = () => new Date('2026-09-23T12:00:00.000Z');
const actor = { sessionId: 'maker-session', name: 'Finance Maker', role: 'maker' };
const checker = { sessionId: 'checker-session', name: 'Finance Checker', role: 'checker' };
const base = { rider: 'Rider A', periodStart: '2026-09-07', periodEnd: '2026-09-13', type: 'insurance', subtype: 'insurance', amount: '50', installmentCount: 2, deductionDate: '2026-09-14', createdBy: 'Self-declared Finance', reason: 'Policy repayment' };
const epfSchedule = ['2026-09-18', '2026-09-24', '2026-10-01', '2026-10-08'];
const epf = { ...base, type: 'epf', subtype: 'EPF', amount: '25', installmentCount: 4, deductionDate: epfSchedule[0], epfScheduleMonth: '2026-09', installmentDates: epfSchedule, weeklyCommission: '999999' };
function setup(rows = [{ rider_name: 'Rider A', commission: 350, created_at: '2026-09-10 12:00:00', order_id: '1' }]) {
  const storage = new MemoryStorage();
  const register = new DeductionRegister({ storage }, {}, { now: fixedNow });
  const upstreamRequests = []; const backups = [];
  const env = {
    DEDUCTIONS: { idFromName: value => value, get: () => register },
    DEDUCTION_DELETE_PIN: '4321',
    FINANCE_PROXY_SHARED_SECRET: 'test-only',
    GRAFANA_PROXY: { async fetch(request) {
      upstreamRequests.push(request);
      const url = new URL(request.url);
      return Response.json({ ok: true, source: 'Grafana Finance', panel: 'commission-main', part: 'primary', rows, rowCount: rows.length, from: url.searchParams.get('from') + ' 00:00:00', to: url.searchParams.get('to') + ' 23:59:59', truncated: false });
    } },
    DEDUCTION_BACKUPS: { async put(key, body) { backups.push({ key, body: JSON.parse(body) }); } }
  };
  return { storage, register, env, upstreamRequests, backups };
}
async function call(env, path, input, identity = actor) {
  const settlement = path === '/apply' ? { settlementPeriodStart: '2026-09-07', settlementPeriodEnd: '2026-09-13' } : {};
  const response = await deductionsApi(new Request('https://app/api/deductions' + path, input ? { method: 'POST', headers: { origin: 'https://app', 'content-type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), ...settlement, ...input }) } : {}), env, identity);
  return { status: response.status, body: await response.json() };
}
test('eligibility remains available for reference while EPF records use the filtered table amount', async () => {
  const state = setup();
  const eligibility = await call(state.env, '/eligibility?rider=Rider%20A&periodStart=2026-09-07&periodEnd=2026-09-13');
  assert.equal(eligibility.status, 200);
  assert.equal(eligibility.body.amountCents, 35000);
  assert.equal(eligibility.body.eligible, true);
  const created = await call(state.env, '/create', { ...epf, weeklyCommission: '350', epfVerification: { amountCents: 99999999 } });
  assert.equal(created.status, 201);
  const record = await state.storage.get('record:' + created.body.id);
  assert.equal(record.reportedWeeklyCommissionCents, 35000);
  assert.equal(record.epfVerification, undefined);
  assert.equal(record.weeklyCommissionVerified, false);
  assert.equal(state.upstreamRequests.length, 1);
  const query = new URL(state.upstreamRequests[0].url);
  assert.equal(query.pathname, '/api/internal/finance-data');
  assert.equal(query.searchParams.get('panel'), 'commission-main');
  assert.equal(query.searchParams.get('part'), 'primary');
  assert.equal(query.searchParams.get('scope'), 'grafana');
  assert.ok(Object.values(JSON.parse(query.searchParams.get('filters'))).every(value => value.length === 1 && value[0] === '$__all'));
});
test('EPF creation does not depend on Grafana but keeps the recorded RM300 and full-week rules', async () => {
  const unavailable = setup(); delete unavailable.env.GRAFANA_PROXY;
  const created = await call(unavailable.env, '/create', { ...epf, weeklyCommission: '350' });
  assert.equal(created.status, 201);
  const record = await unavailable.storage.get('record:' + created.body.id);
  assert.equal(record.status, 'applied');
  assert.equal(record.installments[0].status, 'applied');
  assert.equal((await call(setup().env, '/create', { ...epf, weeklyCommission: '299.99' })).status, 400);
  assert.equal((await call(setup().env, '/create', { ...epf, periodStart: '2026-09-08' })).status, 400);
});
test('same rider week cannot be duplicated by changing hold date or month, including legacy records', async () => {
  const state = setup(); const created = await call(state.env, '/create', epf);
  assert.equal(created.status, 201);
  const second = await call(state.env, '/create', { ...epf, rider: '  RIDER  A ', deductionDate: '2026-10-01', epfScheduleMonth: '2026-10', installmentDates: ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'] });
  assert.equal(second.status, 400);
  assert.match(second.body.error, /week|duplicate/i);
  for (const key of [...state.storage.data.keys()]) if (key.startsWith('epf-week:')) state.storage.data.delete(key);
  assert.equal((await call(state.env, '/create', { ...epf, deductionDate: '2026-11-05', epfScheduleMonth: '2026-11', installmentDates: ['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26'] })).status, 400);
});
test('creation applies every installment immediately to the selected earned commission week', async () => {
  const state = setup(); const created = await call(state.env, '/create', base);
  assert.equal(created.status, 201);
  const record = await state.storage.get('record:' + created.body.id);
  assert.equal(record.status, 'applied');
  assert.equal(record.installments.every(item => item.status === 'applied'), true);
  assert.equal(record.installments.every(item => item.paymentDate === '2026-09-23'), true);
  assert.equal(record.installments.every(item => item.settlementPeriodStart === '2026-09-07' && item.settlementPeriodEnd === '2026-09-13'), true);
  assert.equal(record.audit.at(-1).action, 'created-and-applied');
});
test('reversing a direct-applied plan reverses its full installment breakdown', async () => {
  const state = setup(); const created = await call(state.env, '/create', base);
  const reversed = await call(state.env, '/reverse', { recordId: created.body.id, reason: 'Wrong policy; cancel remaining payments' }, checker);
  assert.equal(reversed.status, 201);
  const record = await state.storage.get('record:' + created.body.id);
  assert.deepEqual(record.installments.map(item => item.status), ['reversed', 'reversed']);
  assert.ok(record.installments[0].appliedAt);
  assert.equal(record.audit.filter(entry => entry.action === 'created-and-applied').length, 1);
  assert.equal(record.reversal.amountCents, 10000);
});
test('partial reversal targets one installment without losing the other applied installment', async () => {
  const state = setup(); const created = await call(state.env, '/create', base);
  assert.equal((await call(state.env, '/reverse', { recordId: created.body.id, installmentIndex: 0, reason: 'First installment returned' }, checker)).status, 201);
  const record = await state.storage.get('record:' + created.body.id);
  assert.deepEqual(record.installments.map(item => item.status), ['reversed', 'applied']);
  assert.equal(record.status, 'applied');
  assert.equal(record.reversals[0].amountCents, 5000);
});

test('source row irregularities do not block a valid recorded EPF request', async () => {
  const row = { rider_name: 'Rider A', commission: 200, created_at: '2026-09-10 12:00:00', order_id: '1' };
  const duplicated = setup([row, row]);
  assert.equal((await call(duplicated.env, '/create', epf)).status, 201);
  const dates = setup([{ ...row, commission: 350, created_at: '2026-08-31 12:00:00' }]);
  assert.equal((await call(dates.env, '/create', epf)).status, 201);
});
test('PIN deletion removes deduction batches regardless of status and retains tombstones', async () => {
  const state = setup();
  const batch = await call(state.env, '/create-batch', { rider: base.rider, periodStart: base.periodStart, periodEnd: base.periodEnd, createdBy: base.createdBy, lines: [base, { ...base, type: 'manual', subtype: 'other' }] });
  assert.equal((await call(state.env, '/delete-batch', { batchId: batch.body.batchId, pin: '1111' })).status, 403);
  const deleted = await call(state.env, '/delete-batch', { batchId: batch.body.batchId, pin: '4321' });
  assert.equal(deleted.status, 201); assert.equal(deleted.body.deleted, 2);
  assert.equal([...state.storage.data.keys()].filter(key => key.startsWith('record:')).length, 0);
  assert.equal((await state.storage.get('deleted:' + batch.body.batchId)).records.length, 2);
  const changedState = setup(), created = await call(changedState.env, '/create', base);
  await call(changedState.env, '/reverse', { recordId: created.body.id, reason: 'Correction after save' }, checker);
  const changedRecord = await changedState.storage.get('record:' + created.body.id);
  const deletedChanged = await call(changedState.env, '/delete-batch', { batchId: changedRecord.batchId, pin: '4321' });
  assert.equal(deletedChanged.status, 201); assert.equal(deletedChanged.body.deleted, 1);
  assert.equal(await changedState.storage.get('record:' + created.body.id), undefined);
  const changedTombstone = await changedState.storage.get('deleted:' + changedRecord.batchId);
  assert.equal(changedTombstone.records.length, 1);
  assert.match(changedTombstone.reason, /PIN-authorized deletion/i);
});
test('a saved request retry returns its receipt during upstream failure and cannot cross actions', async () => {
  const state = setup(); const requestId = crypto.randomUUID();
  const first = await call(state.env, '/create', { ...epf, requestId });
  delete state.env.GRAFANA_PROXY;
  assert.deepEqual(await call(state.env, '/create', { ...epf, requestId }), first);
  assert.equal((await call(state.env, '/cancel', { ...epf, requestId })).status, 400);
  assert.equal([...state.storage.data.keys()].filter(key => key.startsWith('record:')).length, 1);
});
test('R2 snapshots contain every record, audit, index and receipt and restore deterministically into an empty store', async () => {
  const state = setup(); const created = await call(state.env, '/create', base);
  assert.equal(state.backups.length, 1);
  const latest = state.backups.at(-1).body;
  const validated = await validateDeductionSnapshot(latest);
  assert.deepEqual(validated, new Map([...state.storage.data].sort(([a], [b]) => a.localeCompare(b))));
  assert.ok(validated.get('record:' + created.body.id).creatorSession);
  assert.ok([...validated.keys()].some(key => key.startsWith('request:')));
  const restored = new MemoryStorage();
  assert.deepEqual(await restoreDeductionSnapshot(restored, latest), { revision: 1, records: 1, entries: validated.size });
  assert.deepEqual(await createDeductionSnapshot(restored, latest.createdAt), latest);
  await assert.rejects(restoreDeductionSnapshot(restored, latest), /empty/);
  const corrupt = structuredClone(latest); corrupt.entries.find(([key]) => key.startsWith('record:'))[1].amountCents = 1;
  await assert.rejects(validateDeductionSnapshot(corrupt), /checksum/);
});
test('backup failure never misreports an already committed deduction as a failed save', async () => {
  const state = setup(); const input = { ...base, requestId: crypto.randomUUID() };
  state.env.DEDUCTION_BACKUPS.put = async () => { throw new Error('offline'); };
  const created = await call(state.env, '/create', input);
  assert.equal(created.status, 201);
  assert.equal(created.body.backupStatus, 'failed');
  assert.equal([...state.storage.data.keys()].filter(key => key.startsWith('record:')).length, 1);
  state.env.DEDUCTION_BACKUPS.put = async (key, body) => state.backups.push({ key, body: JSON.parse(body) });
  const retried = await call(state.env, '/create', input);
  assert.equal(retried.status, 201);
  assert.equal(retried.body.id, created.body.id);
  assert.equal(state.backups.length, 1);
});
test('EPF uniqueness remains atomic when same-week requests use different dates concurrently', async () => {
  const state = setup();
  const results = await Promise.all(['2026-09-03', '2026-09-04'].map(deductionDate => call(state.env, '/create', { ...epf, deductionDate })));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 400).length, 1);
});
test('direct-applied EPF creates one four-week monthly plan and blocks a second plan in that month', async () => {
  const state = setup();
  state.env.GRAFANA_PROXY.fetch = async request => {
    const query = new URL(request.url).searchParams;
    const rows = [{ rider_name: 'Rider A', commission: 350, created_at: query.get('from') + ' 12:00:00' }];
    return Response.json({ ok: true, source: 'Grafana Finance', panel: 'commission-main', part: 'primary', rows, rowCount: 1, from: query.get('from') + ' 00:00:00', to: query.get('to') + ' 23:59:59', truncated: false });
  };
  const created = await call(state.env, '/create', epf);
  assert.equal(created.status, 201);
  const duplicateMonth = await call(state.env, '/create', { ...epf, periodStart: '2026-09-14', periodEnd: '2026-09-20' });
  assert.equal(duplicateMonth.status, 400); assert.match(duplicateMonth.body.error, /monthly plan.*2026-09/i);
  const record = await state.storage.get('record:' + created.body.id);
  assert.equal(record.scheduledAmountCents, 10000);
  assert.deepEqual(record.installments.map(item => item.dueDate), epfSchedule);
  assert.equal(record.epfContributionMonth, '2026-10');
  assert.equal(record.installments[0].epfContributionMonth, '2026-10');
  assert.equal(record.installments[0].dueDate, '2026-09-18');
  assert.equal(record.installments[0].settlementPeriodStart, '2026-09-07');
  assert.equal(record.installments[0].settlementPeriodEnd, '2026-09-13');
});
test('Finance can unlock and save four chronological EPF dates across calendar months', async () => {
  const state = setup(), created = await call(state.env, '/create', epf);
  const editedDates = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25'];
  const updated = await call(state.env, '/update-schedule', { recordId: created.body.id, installmentDates: editedDates });
  assert.equal(updated.status, 201); assert.deepEqual(updated.body.installmentDates, editedDates);
  const record = await state.storage.get('record:' + created.body.id);
  assert.deepEqual(record.installments.map(item => item.dueDate), editedDates);
  assert.deepEqual(record.installments.map(item => item.paymentDate), editedDates);
  assert.equal(record.audit.at(-1).action, 'schedule-updated');
  const monthlyEdit = ['2026-09-18', '2026-10-02', '2026-10-16', '2026-11-06'];
  const moved = await call(state.env, '/update-schedule', { recordId: created.body.id, installmentDates: monthlyEdit });
  assert.equal(moved.status, 201); assert.deepEqual(moved.body.installmentDates, monthlyEdit);
  const outOfOrder = await call(state.env, '/update-schedule', { recordId: created.body.id, installmentDates: ['2026-10-02', '2026-09-18', '2026-10-16', '2026-11-06'] });
  assert.equal(outOfOrder.status, 400); assert.match(outOfOrder.body.error, /chronological/i);
});
test('History owns amount, payment count, dates and optional remarks editing', async () => {
  const state = setup(), created = await call(state.env, '/create', base);
  const dates = ['2026-09-21', '2026-10-05'];
  const updated = await call(state.env, '/update-details', { recordId: created.body.id, amount: '75', installmentCount: 2, installmentDates: dates, reason: 'Adjusted by Finance in History' });
  assert.equal(updated.status, 201);
  assert.deepEqual(updated.body.installmentDates, dates);
  assert.equal(updated.body.amountCents, 7500);
  assert.equal(updated.body.reason, 'Adjusted by Finance in History');
  const record = await state.storage.get('record:' + created.body.id);
  assert.deepEqual(record.installments.map(item => item.dueDate), dates);
  assert.equal(record.amountCents, 7500);
  assert.equal(record.scheduledAmountCents, 15000);
  assert.equal(record.installments.every(item => item.paymentDate === '2026-09-23'), true);
  assert.equal(record.reason, 'Adjusted by Finance in History');
  assert.equal(record.audit.at(-1).action, 'details-updated');
  const duplicate = await call(state.env, '/update-details', { recordId: created.body.id, amount: '75', installmentCount: 2, installmentDates: [dates[0], dates[0]], reason: '' });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.error, /unique|chronological/i);
  const special = await call(state.env, '/create', { ...base, type: 'manual', subtype: 'other', amount: '60', installmentCount: 3 });
  const specialDates = ['2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14'];
  const resized = await call(state.env, '/update-details', { recordId: special.body.id, amount: '40', installmentCount: 4, installmentDates: specialDates, reason: '' });
  assert.equal(resized.status, 201);
  const resizedRecord = await state.storage.get('record:' + special.body.id);
  assert.equal(resizedRecord.installmentCount, 4);
  assert.equal(resizedRecord.scheduledAmountCents, 16000);
  assert.deepEqual(resizedRecord.installments.map(item => item.dueDate), specialDates);
  const lockedEpf = await call(state.env, '/create', epf);
  assert.equal((await call(state.env, '/update-details', { recordId: lockedEpf.body.id, amount: '30', installmentCount: 4, installmentDates: epfSchedule, reason: '' })).status, 400);
});
test('a qualifying row in the final fractional second of Sunday is included', async () => {
  const state = setup([{ rider_name: 'Rider A', commission: 300, created_at: '2026-09-13T23:59:59.999Z' }]);
  assert.equal((await call(state.env, '/create', epf)).status, 201);
});
test('a complete backup and restore retain more than one thousand storage keys', async () => {
  const state = setup(); await call(state.env, '/create', base);
  for (let index = 0; index < 1200; index += 1) await state.storage.put('request:test-receipt-' + index, { signature: 'test', session: actor.sessionId, result: { id: 'fixture' } });
  const snapshot = await createDeductionSnapshot(state.storage, fixedNow().toISOString());
  assert.equal(snapshot.entries.length, state.storage.data.size);
  assert.ok(snapshot.entries.length > 1200);
  const restored = new MemoryStorage(); await restoreDeductionSnapshot(restored, snapshot);
  assert.equal(restored.data.size, state.storage.data.size);
});
test('first EPF hold applies to the opening commission week and later holds follow schedule dates', async () => {
  const state = setup(); const created = await call(state.env, '/create', epf);
  const record = await state.storage.get('record:' + created.body.id);
  assert.equal(record.status, 'applied');
  assert.deepEqual(record.installments.map(item => item.settlementPeriodStart), ['2026-09-07', '2026-09-21', '2026-09-28', '2026-10-05']);
  assert.deepEqual(record.installments.map(item => item.paymentDate), epfSchedule);
});

export { MemoryStorage, setup, call, base, epf, actor, checker };
