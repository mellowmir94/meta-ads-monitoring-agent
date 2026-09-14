// Commission Rider deduction register. Durable Object storage is the source of truth;
// optional R2 writes in the gateway are append-only disaster-recovery snapshots.
import { verifyWeeklyCommission, requireEpfVerification } from './deduction-verification.js';
import { createDeductionSnapshot } from './deduction-backup.js';
const types = ['insurance', 'battery-tester', 'manual', 'epf'];
const subtypes = ['accident', 'ganti rugi lost item', 'repair accident', 'insurance', 'battery tester', 'EPF', 'other'];
const checkerRoles = new Set(['checker', 'admin']);
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const required = (value, label, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return value.trim();
};
const date = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a valid date.`);
  return value;
};
const addDays = (value, days) => { const next = new Date(value + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const nextMonth = value => { const next = new Date(value + 'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1, 1); return next.toISOString().slice(0, 7); };
const publicRecord = record => { const { creatorSession, ...value } = record; return value; };
const duplicateKey = record => 'duplicate:' + encodeURIComponent([record.riderKey, record.type, record.subtype, record.pricingMode, record.installmentCount, record.periodStart, record.periodEnd, record.amountCents, record.deductionDate].join('|'));
const inactive = record => ['rejected', 'cancelled', 'reversed'].includes(record.status);
const epfHoldMonth = record => (record.installments?.find(item => item.status === 'applied')?.paymentDate || record.deductionDate).slice(0, 7);
const epfWeekKey = record => 'epf-week:' + encodeURIComponent([record.riderKey, record.periodStart, record.periodEnd].join('|'));
const settlementWeek = input => {
  const settlementPeriodStart = date(input.settlementPeriodStart, 'Settlement commission week start');
  const settlementPeriodEnd = date(input.settlementPeriodEnd, 'Settlement commission week end');
  if (new Date(settlementPeriodStart).getUTCDay() !== 1 || Date.parse(settlementPeriodEnd) - Date.parse(settlementPeriodStart) !== 6 * 86400000) throw new Error('The settlement commission period must be a full Monday–Sunday week.');
  return { settlementPeriodStart, settlementPeriodEnd };
};
const requestSignature = (path, input) => JSON.stringify({ path, input }, (key, value) => key === 'epfVerification' ? undefined : value);

export function validateDeduction(input) {
  const rider = required(input.rider, 'Rider');
  const createdBy = required(input.createdBy, 'Created by');
  const type = required(input.type, 'Deduction type');
  if (!types.includes(type) || !subtypes.includes(input.subtype)) throw new Error('Choose a valid type and subtype.');
  const expected = { insurance: 'insurance', 'battery-tester': 'battery tester', epf: 'EPF' }[type];
  if (expected && input.subtype !== expected) throw new Error('The subtype must match the deduction type.');
  const amount = required(String(input.amount ?? ''), 'Amount', 15);
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Enter a positive amount with up to two decimal places.');
  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100000000) throw new Error('Enter an amount between RM0.01 and RM1,000,000.');
  const installmentCount = Number(input.installmentCount || 1);
  const pricingMode = type === 'battery-tester' ? required(input.pricingMode, 'Battery Tester plan') : type === 'epf' ? 'fixed-epf' : 'manual';
  const batteryPlans = { 'fixed-2': { count: 2, amountCents: 5000 }, 'fixed-7': { count: 7, amountCents: 4000 } };
  if (type === 'battery-tester' && !['fixed-2', 'fixed-7', 'manual'].includes(pricingMode)) throw new Error('Choose 2 × RM50, 7 × RM40, or Manual for Battery Tester.');
  if (type === 'battery-tester' && pricingMode !== 'manual' && (installmentCount !== batteryPlans[pricingMode].count || amountCents !== batteryPlans[pricingMode].amountCents)) throw new Error(pricingMode === 'fixed-2' ? 'The 2-payment Battery Tester plan is RM50 per payment.' : 'The 7-payment Battery Tester plan is RM40 per payment.');
  const validBatteryInstallments = pricingMode === 'manual' ? installmentCount >= 1 && installmentCount <= 52 : installmentCount === batteryPlans[pricingMode]?.count;
  const validSpecialInstallments = type === 'manual' && installmentCount >= 1 && installmentCount <= 52;
  if (!Number.isInteger(installmentCount) || (type === 'insurance' && installmentCount !== 2) || (type === 'battery-tester' && !validBatteryInstallments) || (type === 'manual' && !validSpecialInstallments) || (type === 'epf' && installmentCount !== 1)) throw new Error(type === 'insurance' ? 'Insurance requires 2 weekly deductions.' : type === 'battery-tester' && pricingMode === 'manual' ? 'Manual Battery Tester requires 1 to 52 weekly payments.' : type === 'battery-tester' ? 'Battery Tester requires the selected fixed plan schedule.' : type === 'manual' ? 'Special Case requires 1 to 52 weekly payments.' : 'EPF is a single deduction.');
  const orderId = String(input.orderId || '').trim();
  if (orderId.length > 100) throw new Error('Order ID is too long.');
  const periodStart = input.periodStart ? date(input.periodStart, 'Period start') : '';
  const periodEnd = input.periodEnd ? date(input.periodEnd, 'Period end') : '';
  if ((!periodStart !== !periodEnd) || periodStart > periodEnd || (!orderId && !periodStart)) throw new Error('Provide an order ID or a valid commission period.');
  const deductionDate = date(input.deductionDate, 'Deduction date');
  if ((type === 'insurance' || type === 'battery-tester' && pricingMode !== 'manual') && new Date(deductionDate).getUTCDay() !== 1) throw new Error('Scheduled Insurance and fixed-plan Battery Tester deductions must start on a Monday.');
  if (type === 'epf') {
    if (amountCents !== 2500) throw new Error('EPF must be RM25.00 per deduction.');
    if (!periodStart || new Date(periodStart).getUTCDay() !== 1 || Date.parse(periodEnd) - Date.parse(periodStart) !== 6 * 86400000) throw new Error('EPF requires a full Monday-Sunday commission week.');
    if (!/^\d+(\.\d{1,2})?$/.test(String(input.weeklyCommission || '')) || Number(input.weeklyCommission) < 300 || Number(input.weeklyCommission) > 100000000) throw new Error('EPF requires reported weekly commission of RM300 or more, subject to checker verification.');
  }
  const installments = Array.from({ length: installmentCount }, (_, index) => ({ index, dueDate: addDays(deductionDate, index * 7), status: 'scheduled', appliedAt: null, appliedBy: null, reversedAt: null, reversedBy: null }));
  return {
    rider, riderKey: rider.normalize('NFKC').toLowerCase().replace(/\s+/g, ' '), orderId, periodStart, periodEnd, type, subtype: input.subtype,
    codes: type === 'insurance' ? [2] : type === 'battery-tester' ? [2, 7] : [], pricingMode, amountCents, installmentCount, installmentIntervalDays: installmentCount > 1 ? 7 : 0,
    scheduledAmountCents: amountCents * installmentCount, installments,
    reportedWeeklyCommissionCents: type === 'epf' ? Math.round(Number(input.weeklyCommission) * 100) : null, weeklyCommissionVerified: false,
    grossCommissionCents: Math.max(0, Math.round(Number(input.grossCommission || 0) * 100)),
    reason: required(input.reason, 'Reason / remarks', 2000), deductionDate, epfContributionMonth: type === 'epf' ? nextMonth(deductionDate) : null,
    createdBy, source: 'finance-manual', identityVerified: false, status: 'pending', approvalStatus: 'pending', approvedBy: null, approvedAt: null,
    eligibility: type === 'epf' ? 'Weekly commission of at least RM300 must be verified before approval.' : 'Pending checker review.'
  };
}

export class DeductionRegister {
  constructor(state, env = {}, options = {}) { this.storage = state.storage; this.now = options.now || (() => new Date()); }
  async list(url, actor) {
    const after = url.searchParams.get('after');
    if (after && !/^record:[a-z0-9-]+$/i.test(after)) return reply({ error: 'Invalid cursor.' }, 400);
    const records = await this.storage.list({ prefix: 'record:', limit: 101, ...(after ? { startAfter: after } : {}) });
    const entries = [...records].slice(0, 100);
    return reply({ records: entries.map(([, record]) => publicRecord(record)), next: records.size > 100 ? entries.at(-1)[0] : null, actor, approvalAvailable: checkerRoles.has(actor.role) });
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const actor = { sessionId: request.headers.get('x-deduction-session') || '', name: request.headers.get('x-deduction-user') || '', role: request.headers.get('x-deduction-role') || 'maker' };
      if (!actor.sessionId || !actor.name) return reply({ error: 'Authenticated Finance identity required.' }, 401);
      if (request.method === 'GET') {
        if (url.pathname === '/snapshot' && request.headers.get('x-deduction-internal') === '1') return reply(await this.storage.transaction(tx => createDeductionSnapshot(tx, this.now().toISOString())));
        if (url.pathname === '/record' && request.headers.get('x-deduction-internal') === '1') {
          const record = await this.storage.get('record:' + required(url.searchParams.get('id'), 'Record ID', 90));
          return record ? reply(publicRecord(record)) : reply({ error: 'Deduction record not found.' }, 404);
        }
        return this.list(url, { name: actor.name, role: actor.role });
      }
      if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
      const input = await request.json();
      if (url.pathname === '/receipt' && request.headers.get('x-deduction-internal') === '1') {
        const prior = await this.storage.get('request:' + input.input?.requestId);
        if (!prior) return reply({ found: false });
        if (prior.signature !== requestSignature(input.path, input.input) || prior.session !== actor.sessionId) return reply({ error: 'Request ID already used. Refresh and try again.' }, 400);
        return reply({ found: true, result: prior.result });
      }
      if (!/^[a-z0-9-]{16,80}$/i.test(input.requestId || '')) return reply({ error: 'A valid request ID is required.' }, 400);
      if (!['/create', '/create-batch', '/approve', '/reject', '/apply', '/cancel', '/reverse'].includes(url.pathname)) return reply({ error: 'Deduction action not found.' }, 404);
      const signature = requestSignature(url.pathname, input);
      const result = await this.storage.transaction(async tx => {
        const prior = await tx.get('request:' + input.requestId);
        if (prior) {
          if (prior.signature !== signature || prior.session !== actor.sessionId) throw new Error('Request ID already used. Refresh and try again.');
          return prior.result;
        }
        const now = this.now().toISOString(); let result;
        if (url.pathname === '/create' || url.pathname === '/create-batch') {
          const common = url.pathname === '/create-batch' ? input : {};
          const lines = url.pathname === '/create-batch' ? input.lines : [input];
          if (!Array.isArray(lines) || !lines.length || lines.length > 4) throw new Error('Choose between one and four deduction types.');
          if (new Set(lines.map(line => line.type)).size !== lines.length) throw new Error('Each deduction type can be selected only once per request.');
          const validated = lines.map(line => {
            const merged = { ...common, ...line };
            if (merged.type !== 'epf') return validateDeduction(merged);
            if (request.headers.get('x-deduction-internal') !== '1') throw new Error('Server-side EPF verification is required.');
            const verification = requireEpfVerification(merged.epfVerification, merged);
            return { ...validateDeduction({ ...merged, weeklyCommission: (verification.amountCents / 100).toFixed(2) }), epfVerification: verification };
          });
          if (new Set(validated.map(line => line.riderKey)).size !== 1) throw new Error('All deductions in one request must belong to the same rider.');
          const created = [];
          for (let index = 0; index < validated.length; index += 1) {
            const data = validated[index]; const existingId = await tx.get(duplicateKey(data));
            if (existingId) { const existing = await tx.get('record:' + existingId); if (existing && !['rejected', 'cancelled', 'reversed'].includes(existing.status)) throw new Error(`Possible duplicate ${data.type} deduction already exists as ${existing.reference || existing.id}.`); }
            if (data.type === 'epf') {
              // Scan as well as index: legacy records predate the unique rider/week key.
              const previous = await tx.list({ prefix: 'record:' });
              for (const record of previous.values()) {
                if (record.type === 'epf' && record.riderKey === data.riderKey && record.periodStart === data.periodStart && record.periodEnd === data.periodEnd && !inactive(record)) throw new Error(`An EPF deduction already exists for this rider and commission week (${record.reference || record.id}).`);
              }
              const bucket = 'epf:' + encodeURIComponent(data.riderKey) + ':' + data.deductionDate.slice(0, 7);
              const active = [...previous.values()].filter(record => record.type === 'epf' && record.riderKey === data.riderKey && !inactive(record) && epfHoldMonth(record) === data.deductionDate.slice(0, 7)).map(record => record.id);
              if (active.length >= 4) throw new Error('This rider already has four active EPF deductions for this month.');
              await tx.put(bucket, [...active, `${input.requestId}-${index + 1}`]);
              await tx.put(epfWeekKey(data), `${input.requestId}-${index + 1}`);
            }
            const counter = Number(await tx.get('counter:reference') || 0) + 1; await tx.put('counter:reference', counter);
            const id = `${input.requestId}-${index + 1}`; const reference = `DED-${now.slice(0, 7).replace('-', '')}-${String(counter).padStart(6, '0')}`;
            const record = { ...data, id, batchId: input.requestId, reference, createdAt: now, creatorSession: actor.sessionId, audit: [{ action: 'created', at: now, by: data.createdBy, role: actor.role, identityVerified: false, selfDeclared: true, amountCents: data.amountCents, ...(data.type === 'epf' ? { epfVerification: data.epfVerification } : {}), reason: data.reason }] };
            await tx.put('record:' + id, record); await tx.put(duplicateKey(data), id); created.push({ id, reference, type: data.type, status: 'pending' });
          }
          result = { batchId: input.requestId, records: created, id: created[0].id, reference: created[0].reference, approvalStatus: 'pending' };
        } else {
          const record = await tx.get('record:' + required(input.recordId, 'Record ID', 90));
          if (!record) throw new Error('Deduction record not found.');
          const reason = String(input.reason || '').trim(); const checker = checkerRoles.has(actor.role);
          if (['/approve', '/reject', '/apply', '/reverse'].includes(url.pathname) && !checker) throw new Error('Authorized Finance checker access is required.');
          if (['/approve', '/reject'].includes(url.pathname) && record.creatorSession === actor.sessionId) throw new Error('Maker-checker rule: the creator cannot approve or reject their own request.');
          if (url.pathname === '/approve') {
            if (record.status !== 'pending') throw new Error('Only pending deductions can be approved.');
            if (record.type === 'epf') {
              if (request.headers.get('x-deduction-internal') !== '1') throw new Error('Server-side EPF verification is required.');
              record.epfVerification = requireEpfVerification(input.epfVerification, record);
              record.reportedWeeklyCommissionCents = record.epfVerification.amountCents;
            }
            record.status = record.approvalStatus = 'approved'; record.approvedBy = actor.name; record.approvedAt = now; record.weeklyCommissionVerified = record.type === 'epf';
            record.audit.push({ action: 'approved', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.amountCents, ...(record.type === 'epf' ? { epfVerification: record.epfVerification } : {}), reason: reason || 'Approved' });
          } else if (url.pathname === '/reject') {
            if (record.status !== 'pending') throw new Error('Only pending deductions can be rejected.');
            record.status = record.approvalStatus = 'rejected'; record.rejectedBy = actor.name; record.rejectedAt = now;
            record.audit.push({ action: 'rejected', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.amountCents, reason: required(reason, 'Rejection reason', 2000) });
          } else if (url.pathname === '/cancel') {
            if (record.status !== 'pending') throw new Error('Only pending deductions can be cancelled.');
            if (record.creatorSession !== actor.sessionId && !checker) throw new Error('Only the creator or an authorized checker can cancel this request.');
            record.status = record.approvalStatus = 'cancelled'; record.cancelledBy = actor.name; record.cancelledAt = now;
            record.audit.push({ action: 'cancelled', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.amountCents, reason: required(reason, 'Cancellation reason', 2000) });
          } else if (url.pathname === '/apply') {
            if (record.status !== 'approved') throw new Error('Only approved deductions can be applied.');
            const index = input.installmentIndex == null || input.installmentIndex === '' ? NaN : Number(input.installmentIndex);
            if (!Number.isInteger(index) || !record.installments[index] || record.installments[index].status !== 'scheduled') throw new Error('Choose a scheduled installment that has not been applied.');
            const paymentDate = date(input.paymentDate, 'Payment date');
            if (paymentDate > now.slice(0, 10) || record.installments[index].dueDate > now.slice(0, 10) || paymentDate < record.installments[index].dueDate) throw new Error('Apply only a due installment using its actual payment date; future or early payments are not allowed.');
            const settlement = settlementWeek(input);
            if (record.type === 'epf') {
              if (!record.weeklyCommissionVerified || settlement.settlementPeriodStart !== record.periodStart || settlement.settlementPeriodEnd !== record.periodEnd) throw new Error('EPF must be applied to its verified earning commission week.');
              const all = await tx.list({ prefix: 'record:' });
              const otherHolds = [...all.values()].filter(other => other.id !== record.id && other.type === 'epf' && other.riderKey === record.riderKey && !inactive(other) && epfHoldMonth(other) === paymentDate.slice(0, 7));
              if (otherHolds.length >= 4) throw new Error('This rider already has four active EPF holds for the actual payment month.');
              const oldBucket = 'epf:' + encodeURIComponent(record.riderKey) + ':' + epfHoldMonth(record);
              const newBucket = 'epf:' + encodeURIComponent(record.riderKey) + ':' + paymentDate.slice(0, 7);
              if (oldBucket !== newBucket) await tx.put(oldBucket, (await tx.get(oldBucket) || []).filter(id => id !== record.id));
              await tx.put(newBucket, [...otherHolds.map(other => other.id), record.id]);
            }
            record.installments[index] = { ...record.installments[index], status: 'applied', appliedAt: now, appliedBy: actor.name, paymentDate, ...settlement, ...(record.type === 'epf' ? { epfContributionMonth: nextMonth(paymentDate) } : {}) };
            record.status = record.approvalStatus = record.installments.some(item => item.status === 'scheduled') ? 'approved' : 'applied';
            if (record.type === 'epf') record.epfContributionMonth = nextMonth(paymentDate);
            record.audit.push({ action: 'applied', installmentIndex: index, dueDate: record.installments[index].dueDate, paymentDate, ...settlement, at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.amountCents, reason: reason || 'Applied to rider commission' });
          } else if (url.pathname === '/reverse') {
            const wholePlan = input.installmentIndex == null;
            const index = Number(input.installmentIndex);
            if (!wholePlan && (!Number.isInteger(index) || !record.installments[index] || record.installments[index].status !== 'applied')) throw new Error('Choose an applied installment to reverse.');
            const applied = record.installments.filter(item => item.status === 'applied' && (wholePlan || item.index === index));
            if (!applied.length) throw new Error('Only applied deductions can be reversed.');
            const reversalReason = required(reason, 'Reversal reason', 2000);
            const cancelledIndexes = [];
            record.installments = record.installments.map(item => {
              if (item.status === 'applied' && (wholePlan || item.index === index)) return { ...item, status: 'reversed', reversedAt: now, reversedBy: actor.name, reversalId: input.requestId };
              if (wholePlan && item.status === 'scheduled') { cancelledIndexes.push(item.index); return { ...item, status: 'cancelled', cancelledAt: now, cancelledBy: actor.name, cancellationReason: reversalReason }; }
              return item;
            });
            record.status = record.approvalStatus = record.installments.some(item => item.status === 'scheduled') ? 'approved' : record.installments.some(item => item.status === 'applied') ? 'applied' : 'reversed';
            record.reversal = { id: input.requestId, originalId: record.id, at: now, by: actor.name, reason: reversalReason, amountCents: applied.length * record.amountCents, installmentIndexes: applied.map(item => item.index), cancelledIndexes };
            record.reversals = [...(record.reversals || []), record.reversal];
            record.audit.push({ action: 'reversed', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.reversal.amountCents, installmentIndexes: record.reversal.installmentIndexes, cancelledIndexes, reason: reversalReason });
          }
          await tx.put('record:' + record.id, record); result = { id: record.id, reference: record.reference, status: record.status, approvalStatus: record.status };
        }
        await tx.put('request:' + input.requestId, { signature, session: actor.sessionId, result });
        await tx.put('counter:revision', Number(await tx.get('counter:revision') || 0) + 1);
        return result;
      });
      return reply(result, 201);
    } catch (error) { return reply({ error: error.message || 'Unable to save deduction.' }, 400); }
  }
}

export async function deductionsApi(request, env, actor, context) {
  if (!actor?.sessionId || !actor.name) return reply({ error: 'Authenticated Finance identity required.' }, 401);
  if (!env.DEDUCTIONS) return reply({ error: 'Deduction register is not configured.' }, 503);
  const url = new URL(request.url);
  if (request.method !== 'GET') {
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Same-origin JSON request required.' }, 403);
  }
  const path = url.pathname.slice('/api/deductions'.length) || '/';
  if (!['/', '/eligibility', '/create', '/create-batch', '/approve', '/reject', '/apply', '/cancel', '/reverse'].includes(path)) return reply({ error: 'Deduction action not found.' }, 404);
  const readOnly = path === '/' || path === '/eligibility';
  if ((readOnly && request.method !== 'GET') || (!readOnly && request.method !== 'POST')) return reply({ error: 'Method not allowed.' }, 405);
  try {
    if (path === '/eligibility') return reply(await verifyWeeklyCommission(env, Object.fromEntries(url.searchParams)));
    const text = request.method === 'POST' ? await request.text() : undefined;
    if (text && text.length > 48000) return reply({ error: 'Request is too large.' }, 413);
    // Remove every browser-supplied verification, including those nested in batch lines.
    const input = text ? JSON.parse(text, (key, value) => key === 'epfVerification' ? undefined : value) : undefined;
    if (request.method === 'POST' && (!input || typeof input !== 'object' || Array.isArray(input) || !/^[a-z0-9-]{16,80}$/i.test(input.requestId || ''))) return reply({ error: 'A valid deduction request with a request ID is required.' }, 400);
    const stub = env.DEDUCTIONS.get(env.DEDUCTIONS.idFromName('finance-deductions-v1'));
    const headers = { 'content-type': 'application/json', 'x-deduction-session': actor.sessionId, 'x-deduction-user': actor.name, 'x-deduction-role': actor.role, 'x-deduction-internal': '1' };
    let savedReceipt = null;
    if (input) {
      const receiptResponse = await stub.fetch(new Request('https://deductions.internal/receipt', { method: 'POST', headers, body: JSON.stringify({ path, input }) }));
      if (!receiptResponse.ok) return receiptResponse;
      const receipt = await receiptResponse.json();
      if (receipt.found) savedReceipt = receipt.result;
    }
    if (!savedReceipt && (path === '/create' || path === '/create-batch')) {
      const lines = path === '/create-batch' ? input.lines : [input];
      if (!Array.isArray(lines) || !lines.length || lines.length > 4) return reply({ error: 'Choose between one and four deduction types.' }, 400);
      for (const line of lines) {
        if (line.type !== 'epf') continue;
        const scope = { ...input, ...line };
        line.epfVerification = requireEpfVerification(await verifyWeeklyCommission(env, scope), scope);
      }
    } else if (!savedReceipt && path === '/approve') {
      if (!checkerRoles.has(actor.role)) return reply({ error: 'Authorized Finance checker access is required.' }, 403);
      const current = await stub.fetch(new Request('https://deductions.internal/record?id=' + encodeURIComponent(required(input.recordId, 'Record ID', 90)), { headers }));
      if (!current.ok) return current;
      const record = await current.json();
      if (record.type === 'epf') input.epfVerification = requireEpfVerification(await verifyWeeklyCommission(env, record), record);
    }
    const response = savedReceipt ? reply(savedReceipt, 201) : await stub.fetch(new Request('https://deductions.internal' + path + url.search, { method: request.method, headers, ...(input ? { body: JSON.stringify(input) } : {}) }));
    if (input && response.ok && env.DEDUCTION_BACKUPS?.put) {
      try {
        const snapshotResponse = await stub.fetch(new Request('https://deductions.internal/snapshot', { headers }));
        if (!snapshotResponse.ok) throw new Error('Snapshot unavailable');
        const snapshot = await snapshotResponse.json();
        await env.DEDUCTION_BACKUPS.put(`commission-rider/snapshots/v2/${String(snapshot.revision).padStart(12, '0')}-${snapshot.checksumSha256.slice(0, 16)}.json`, JSON.stringify(snapshot), { httpMetadata: { contentType: 'application/json' } });
      } catch {
        // The primary transaction has committed; never report a failed save or encourage a duplicate retry.
        return reply({ ...await response.json(), backupStatus: 'failed', backupWarning: 'Saved in the deduction register. The R2 backup needs retry; contact the administrator.' }, response.status);
      }
    }
    return response;
  } catch (error) { return reply({ error: error.message || 'Unable to verify or save deduction.' }, error.status || 400); }
}
