// Commission Rider deduction register. Durable Object storage is the source of truth;
// optional R2 writes in the gateway are append-only disaster-recovery snapshots.
import { verifyWeeklyCommission } from './deduction-verification.js';
import { createDeductionSnapshot } from './deduction-backup.js';
import { handleBookings } from './bookings.js';
const types = ['insurance', 'battery-tester', 'manual', 'epf'];
const subtypes = ['accident', 'ganti rugi lost item', 'repair accident', 'insurance', 'battery tester', 'EPF', 'other'];
const checkerRoles = new Set(['checker', 'admin']);
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const required = (value, label, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return value.trim();
};
const optional = (value, label, max = 2000) => {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.trim().length > max) throw new Error(`${label} must be no more than ${max} characters.`);
  return value.trim();
};
const date = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a valid date.`);
  return value;
};
const addDays = (value, days) => { const next = new Date(value + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const nextMonth = value => { const next = new Date(value + 'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1, 1); return next.toISOString().slice(0, 7); };
const weekBounds = value => { const current = new Date(value + 'T00:00:00Z'); const start = addDays(value, -((current.getUTCDay() + 6) % 7)); return { start, end: addDays(start, 6) }; };
const validateEpfScheduleDates = (values, month) => {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(Date.parse(`${month}-01`))) throw new Error('EPF schedule month must be valid.');
  if (!Array.isArray(values) || values.length !== 4) throw new Error('EPF requires four weekly deduction dates.');
  const dates = values.map((value, index) => date(value, `EPF payment ${index + 1} deduction date`));
  if (new Set(dates).size !== 4 || dates.some((value, index) => index && value <= dates[index - 1])) throw new Error('EPF deduction dates must be unique and chronological.');
  return dates;
};
const publicRecord = record => { const { creatorSession, ...value } = record; return value; };
const duplicateKey = record => 'duplicate:' + encodeURIComponent([record.riderKey, record.type, record.subtype, record.pricingMode, record.installmentCount, record.periodStart, record.periodEnd, record.amountCents, record.deductionDate].join('|'));
const inactive = record => ['rejected', 'cancelled', 'reversed'].includes(record.status);
const epfHoldMonth = record => record.epfScheduleMonth || record.deductionDate.slice(0, 7);
const epfWeekKey = record => 'epf-week:' + encodeURIComponent([record.riderKey, record.periodStart, record.periodEnd].join('|'));
const epfMonthKey = record => 'epf-month:' + encodeURIComponent([record.riderKey, epfHoldMonth(record)].join('|'));
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
  if (!Number.isInteger(installmentCount) || (type === 'insurance' && installmentCount !== 2) || (type === 'battery-tester' && !validBatteryInstallments) || (type === 'manual' && !validSpecialInstallments) || (type === 'epf' && installmentCount !== 4)) throw new Error(type === 'insurance' ? 'Insurance requires 2 weekly deductions.' : type === 'battery-tester' && pricingMode === 'manual' ? 'Manual Battery Tester requires 1 to 52 weekly payments.' : type === 'battery-tester' ? 'Battery Tester requires the selected fixed plan schedule.' : type === 'manual' ? 'Special Case requires 1 to 52 weekly payments.' : 'EPF requires four weekly RM25 deductions.');
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
    if (!/^\d+(\.\d{1,2})?$/.test(String(input.weeklyCommission || '')) || Number(input.weeklyCommission) < 300 || Number(input.weeklyCommission) > 100000000) throw new Error('EPF requires recorded weekly commission of RM300 or more.');
  }
  const epfScheduleMonth = type === 'epf' ? required(input.epfScheduleMonth || deductionDate.slice(0, 7), 'EPF schedule month', 7) : null;
  const installmentDates = type === 'epf' ? validateEpfScheduleDates(input.installmentDates, epfScheduleMonth) : Array.from({ length: installmentCount }, (_, index) => addDays(deductionDate, index * 7));
  const installments = installmentDates.map((dueDate, index) => ({ index, dueDate, status: 'scheduled', appliedAt: null, appliedBy: null, reversedAt: null, reversedBy: null }));
  return {
    rider, riderKey: rider.normalize('NFKC').toLowerCase().replace(/\s+/g, ' '), orderId, periodStart, periodEnd, type, subtype: input.subtype,
    codes: type === 'insurance' ? [2] : type === 'battery-tester' ? [2, 7] : [], pricingMode, amountCents, installmentCount, installmentIntervalDays: installmentCount > 1 ? 7 : 0,
    scheduledAmountCents: amountCents * installmentCount, installments,
    reportedWeeklyCommissionCents: type === 'epf' ? Math.round(Number(input.weeklyCommission) * 100) : null, weeklyCommissionVerified: false,
    grossCommissionCents: Math.max(0, Math.round(Number(input.grossCommission || 0) * 100)),
    reason: optional(input.reason, 'Reason / remarks'), deductionDate: type === 'epf' ? installmentDates[0] : deductionDate, epfScheduleMonth, epfContributionMonth: type === 'epf' ? nextMonth(`${epfScheduleMonth}-01`) : null,
    createdBy, source: 'finance-manual', identityVerified: false, status: 'approved', approvalStatus: 'approved', approvedBy: createdBy, approvedAt: null,
    eligibility: type === 'epf' ? 'Filtered weekly commission of at least RM300 was recorded when Finance created the request.' : 'Active Finance deduction schedule.'
  };
}

export class DeductionRegister {
  constructor(state, env = {}, options = {}) { this.storage = state.storage; this.now = options.now || (() => new Date()); }
  async list(url, actor) {
    const after = url.searchParams.get('after');
    if (after && !/^record:[a-z0-9-]+$/i.test(after)) return reply({ error: 'Invalid cursor.' }, 400);
    const records = await this.storage.transaction(async tx => {
      const page = await tx.list({ prefix: 'record:', limit: 101, ...(after ? { startAfter: after } : {}) }); let upgraded = 0;
      for (const [key, record] of page) {
        const scheduled = (record.installments || []).filter(item => item.status === 'scheduled');
        if (!['pending', 'approved'].includes(record.status)) continue;
        const at = this.now().toISOString(), appliedBy = record.createdBy || actor.name;
        record.installments = (record.installments || []).map(item => item.status === 'scheduled' ? { ...item, status: 'applied', appliedAt: at, appliedBy, paymentDate: at.slice(0, 10), settlementPeriodStart: record.periodStart, settlementPeriodEnd: record.periodEnd, ...(record.type === 'epf' ? { epfContributionMonth: nextMonth(at.slice(0, 10)) } : {}) } : item);
        record.status = record.approvalStatus = 'applied'; record.approvedBy = appliedBy; record.approvedAt ||= at;
        if (record.type === 'epf') record.epfContributionMonth = nextMonth(at.slice(0, 10));
        record.audit = [...(record.audit || []), { action: 'automatically-applied', at, by: appliedBy, role: 'finance', identityVerified: false, amountCents: scheduled.reduce((sum, item) => sum + Number(item.amountCents ?? record.amountCents ?? 0), 0), reason: 'Converted to the direct-apply Finance workflow' }];
        await tx.put(key, record); upgraded += 1;
      }
      if (upgraded) await tx.put('counter:revision', Number(await tx.get('counter:revision') || 0) + 1);
      return page;
    });
    const entries = [...records].slice(0, 100);
    return reply({ records: entries.map(([, record]) => publicRecord(record)), next: records.size > 100 ? entries.at(-1)[0] : null, actor, approvalAvailable: false });
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const actor = { sessionId: request.headers.get('x-deduction-session') || '', name: request.headers.get('x-deduction-user') || '', role: request.headers.get('x-deduction-role') || 'maker' };
      if (!actor.sessionId || !actor.name) return reply({ error: 'Authenticated Finance identity required.' }, 401);
      if (url.pathname.startsWith('/booking/')) return handleBookings(this.storage, request, actor, this.now().toISOString());
      if (request.method === 'GET') {
        if (url.pathname === '/jobs') {
          const after = url.searchParams.get('after');
          if (after && !/^job:[a-z0-9-]+$/i.test(after)) return reply({ error: 'Invalid job cursor.' }, 400);
          const page = [...await this.storage.list({ prefix: 'job:', limit: 101, ...(after ? {startAfter: after} : {}) })];
          return reply({ jobs: page.slice(0,100).map(([,job]) => job).filter(job => job.status !== 'replaced'), next: page.length > 100 ? page[99][0] : null });
        }
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
      if (!['/save-job', '/save-jobs', '/delete-jobs', '/create', '/create-batch', '/approve', '/reject', '/apply', '/cancel', '/reverse', '/update-schedule', '/update-details', '/mark-sent', '/complete-installment', '/reopen-installment', '/delete-batch'].includes(url.pathname)) return reply({ error: 'Deduction action not found.' }, 404);
      const signature = requestSignature(url.pathname, input);
      const result = await this.storage.transaction(async tx => {
        const prior = await tx.get('request:' + input.requestId);
        if (prior) {
          if (prior.signature !== signature || prior.session !== actor.sessionId) throw new Error('Request ID already used. Refresh and try again.');
          return prior.result;
        }
        const now = this.now().toISOString(); let result;
        if (url.pathname === '/save-jobs' || url.pathname === '/delete-jobs') {
          const deleting=url.pathname==='/delete-jobs';
          if(deleting&&request.headers.get('x-deduction-delete-authorized')!=='1')throw new Error('Delete PIN authorization is required.');
          if(deleting)input.rows=[];
          const rider=required(input.rider,'Rider'),riderKey=rider.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
          const periodStart=date(input.periodStart,'Commission period start'),periodEnd=date(input.periodEnd,'Commission period end');
          if(periodEnd<periodStart)throw new Error('Invalid commission period.');
          const resetting=!deleting&&input.reset===true;
          if(!Array.isArray(input.rows)||(!deleting&&!resetting&&!input.rows.length)||input.rows.length>10000||(resetting&&input.rows.length))throw new Error('Enter at least one Additional Job, or reset to RM0.00.');
          const rows=input.rows.map(row=>{const description=required(row.description,'Job description',500),amount=String(row.amount??'');if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>1000000)throw new Error('Enter a valid positive RM amount.');return {description,amountCents:Math.round(Number(amount)*100)};});
          const existing=[];let after='';
          do {const page=[...await tx.list({prefix:'job:',limit:500,...(after?{startAfter:after}:{})})];for(const [,job] of page)if(job.status!=='replaced'&&job.riderKey===riderKey&&job.periodStart>=periodStart&&job.periodEnd<=periodEnd)existing.push(job);after=page.length===500?page.at(-1)[0]:'';}while(after);
          const fingerprint=jobs=>JSON.stringify(jobs.map(job=>[job.id,job.amountCents,job.description]).sort((a,b)=>a[0].localeCompare(b[0])));
          if(!Array.isArray(input.expectedJobs)||fingerprint(existing)!==fingerprint(input.expectedJobs))throw new Error('Saved jobs changed. Refresh and review before saving again.');
          if(deleting&&(!existing.length||existing.some(job=>job.periodStart!==periodStart||job.periodEnd!==periodEnd)))throw new Error('Additional Jobs changed. Refresh History before deleting.');
          for(const job of existing)await tx.put('job:'+job.id,{...job,status:'replaced',replacedAt:now,replacedBy:actor.name,replacementRequestId:input.requestId,...(deleting?{deletedAt:now,deletedBy:actor.name}:{}),audit:[...(job.audit||[]),{action:deleting?'additional-jobs-deleted':resetting?'additional-jobs-reset':'additional-jobs-overwritten',at:now,by:actor.name,amountCents:job.amountCents}]});
          let counter=Number(await tx.get('counter:job-reference')||0);const jobs=[];
          for(let i=0;i<rows.length;i++){const job={...rows[i],id:input.requestId+'-'+i,reference:'JOB-'+String(++counter).padStart(6,'0'),rider,riderKey,periodStart,periodEnd,createdAt:now,createdBy:actor.name,status:'saved',audit:[{action:'additional-job-saved',at:now,by:actor.name,replaces:existing.map(job=>job.id)}]};await tx.put('job:'+job.id,job);jobs.push(job);}
          await tx.put('counter:job-reference',counter);result=deleting?{deleted:existing.length}: {jobs};
        } else if (url.pathname === '/save-job') {
          const rider = required(input.rider, 'Rider'), description = required(input.description, 'Job description / reference', 500);
          const periodStart = date(input.periodStart, 'Commission period start'), periodEnd = date(input.periodEnd, 'Commission period end');
          if (periodEnd < periodStart) throw new Error('Commission period end must follow its start.');
          const amount = String(input.amount ?? '');
          if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Enter a positive RM amount with up to two decimal places.');
          const amountCents = Math.round(Number(amount) * 100);
          if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100000000) throw new Error('Additional Job amount must be RM0.01 to RM1,000,000.');
          const counter = Number(await tx.get('counter:job-reference') || 0) + 1;
          const job = { id: input.requestId, reference: 'JOB-' + String(counter).padStart(6,'0'), rider, riderKey: rider.normalize('NFKC').toLowerCase().replace(/\s+/g,' '), periodStart, periodEnd, description, amountCents, createdAt: now, createdBy: actor.name, status: 'saved', audit: [{action:'additional-job-saved',at:now,by:actor.name,amountCents}] };
          await tx.put('job:' + job.id, job);
          await tx.put('counter:job-reference',counter);
          result = { job };
        } else if (url.pathname === '/delete-batch') {
          if (request.headers.get('x-deduction-delete-authorized') !== '1') throw new Error('Delete PIN authorization is required.');
          const batchId = required(input.batchId, 'Batch ID', 90), all = await tx.list({ prefix: 'record:' });
          const records = [...all.values()].filter(record => (record.batchId || record.id) === batchId);
          if (!records.length) throw new Error('Deduction request batch not found.');
          const recordIds = new Set(records.map(record => record.id));
          for (const record of records) {
            await tx.delete('record:' + record.id); await tx.delete(duplicateKey(record));
            if (record.type === 'epf') {
              await tx.delete(epfWeekKey(record));
              await tx.delete(epfMonthKey(record));
              const bucket = 'epf:' + encodeURIComponent(record.riderKey) + ':' + epfHoldMonth(record), remaining = (await tx.get(bucket) || []).filter(id => id !== record.id);
              if (remaining.length) await tx.put(bucket, remaining); else await tx.delete(bucket);
            }
          }
          const receipts = await tx.list({ prefix: 'request:' });
          for (const [key, receipt] of receipts) {
            const linked = key === 'request:' + batchId || recordIds.has(receipt?.result?.id) || receipt?.result?.batchId === batchId || receipt?.result?.records?.some(item => recordIds.has(item.id));
            if (linked) await tx.delete(key);
          }
          const deleted = { batchId, rider: records[0].rider, records: records.map(record => ({ id: record.id, reference: record.reference, type: record.type, status: record.status, amountCents: record.amountCents, installmentCount: record.installmentCount })), deletedAt: now, deletedBy: actor.name, role: actor.role, reason: 'PIN-authorized deletion of deduction request' };
          await tx.put('deleted:' + batchId, deleted); result = { batchId, deleted: records.length };
        } else if (url.pathname === '/create' || url.pathname === '/create-batch') {
          const common = url.pathname === '/create-batch' ? input : {};
          const lines = url.pathname === '/create-batch' ? input.lines : [input];
          if (!Array.isArray(lines) || !lines.length || lines.length > 4) throw new Error('Choose between one and four deduction types.');
          if (new Set(lines.map(line => line.type)).size !== lines.length) throw new Error('Each deduction type can be selected only once per request.');
          const validated = lines.map(line => validateDeduction({ ...common, ...line }));
          if (new Set(validated.map(line => line.riderKey)).size !== 1) throw new Error('All deductions in one request must belong to the same rider.');
          const created = [];
          for (let index = 0; index < validated.length; index += 1) {
            // Finance may intentionally create matching cases. Request receipts still deduplicate retries.
            const data = validated[index];
            if (data.type === 'epf') {
              const bucket = 'epf:' + encodeURIComponent(data.riderKey) + ':' + data.epfScheduleMonth;
              await tx.put(bucket, [...(await tx.get(bucket) || []), `${input.requestId}-${index + 1}`]);
              await tx.put(epfWeekKey(data), `${input.requestId}-${index + 1}`);
              await tx.put(epfMonthKey(data), `${input.requestId}-${index + 1}`);
            }
            const counter = Number(await tx.get('counter:reference') || 0) + 1; await tx.put('counter:reference', counter);
            const id = `${input.requestId}-${index + 1}`; const reference = `DED-${now.slice(0, 7).replace('-', '')}-${String(counter).padStart(6, '0')}`;
            const installments = data.installments.map((item, installmentIndex) => {
              const settlement = data.type === 'epf' ? installmentIndex === 0 ? { start: data.periodStart, end: data.periodEnd } : weekBounds(item.dueDate) : { start: data.periodStart, end: data.periodEnd };
              return { ...item, status: 'applied', appliedAt: now, appliedBy: data.createdBy, paymentDate: data.type === 'epf' ? item.dueDate : now.slice(0, 10), settlementPeriodStart: settlement.start, settlementPeriodEnd: settlement.end, ...(data.type === 'epf' ? { epfContributionMonth: data.epfContributionMonth } : {}) };
            });
            const record = { ...data, installments, status: 'applied', approvalStatus: 'applied', approvedBy: data.createdBy, approvedAt: now, id, batchId: input.requestId, reference, createdAt: now, creatorSession: actor.sessionId, audit: [{ action: 'created-and-applied', at: now, by: data.createdBy, role: actor.role, identityVerified: false, selfDeclared: true, amountCents: data.scheduledAmountCents, ...(data.type === 'epf' ? { recordedWeeklyCommissionCents: data.reportedWeeklyCommissionCents, installmentDates: data.installments.map(item => item.dueDate) } : {}), reason: data.reason || 'Finance saved and applied this deduction' }] };
            await tx.put('record:' + id, record); await tx.put(duplicateKey(data), id); created.push({ id, reference, type: data.type, status: 'applied' });
          }
          result = { batchId: input.requestId, records: created, id: created[0].id, reference: created[0].reference, approvalStatus: 'applied' };
        } else {
          const record = await tx.get('record:' + required(input.recordId, 'Record ID', 90));
          if (!record) throw new Error('Deduction record not found.');
          const reason = String(input.reason || '').trim(); const checker = checkerRoles.has(actor.role);
          const alreadyProceeded = url.pathname === '/approve' && ['approved', 'applied'].includes(record.status);
          if (!alreadyProceeded && ['/approve', '/reject', '/reverse'].includes(url.pathname) && !checker) throw new Error('Authorized Finance checker access is required.');
          if (!alreadyProceeded && ['/approve', '/reject'].includes(url.pathname) && record.creatorSession === actor.sessionId) throw new Error('Maker-checker rule: the creator cannot approve or reject their own request.');
          if (['/update-details', '/update-schedule', '/reverse', '/cancel'].includes(url.pathname) && record.installments.some(item => item.completion?.state === 'completed')) throw new Error('Reopen completed installments with a reason before changing this deduction.');
          if (['/complete-installment', '/reopen-installment'].includes(url.pathname)) {
            const index = Number(input.installmentIndex), item = record.installments[index];
            if (!Number.isInteger(index) || !item || item.status !== 'applied' || inactive(record)) throw new Error('Choose an active applied installment.');
            if (input.expectedDueDate !== item.dueDate || Number(input.expectedAmountCents) !== Number(item.amountCents ?? record.amountCents) || Number(input.expectedInstallmentCount) !== record.installments.length) throw new Error('The amount or schedule changed. Refresh and verify this installment again.');
            const priorCompletion = item.completion || null;
            if (String(input.expectedCompletionAt || '') !== String(priorCompletion?.version || priorCompletion?.changedAt || '')) throw new Error('This installment changed in another session. Refresh and try again.');
            const reopening = url.pathname === '/reopen-installment';
            if (reopening !== (priorCompletion?.state === 'completed')) throw new Error(reopening ? 'This installment is not completed.' : 'This installment is already completed.');
            if (!reopening && input.reconciled !== true) throw new Error('Confirm reconciliation against the rider payout.');
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
            if (!reopening && item.dueDate > today) throw new Error('Upcoming installments cannot be completed before their due date.');
            const completionReason = required(input.reason, reopening ? 'Reopening reason' : 'Reconciliation note', 2000);
            item.completion = { state: reopening ? 'reopened' : 'completed', changedAt: now, version: input.requestId, by: actor.name, reason: completionReason };
            record.audit ||= [];
            record.audit.push({ action: reopening ? 'installment-reopened' : 'installment-completed', installmentIndex: index, dueDate: item.dueDate, amountCents: Number(item.amountCents ?? record.amountCents), at: now, by: actor.name, role: actor.role, identityVerified: true, reason: completionReason, previousCompletion: priorCompletion });
            result = { id: record.id, installmentIndex: index, completion: item.completion };
          } else if (url.pathname === '/mark-sent') {
            const index = Number(input.installmentIndex);
            if (!Number.isInteger(index) || !record.installments[index] || record.installments[index].status !== 'applied') throw new Error('Choose an applied payment statement before marking it sent.');
            const item = record.installments[index];
            if (!item.statementSentAt) {
              record.installments[index] = { ...item, statementSentAt: now, statementSentBy: actor.name };
              record.audit.push({ action: 'statement-sent', installmentIndex: index, dueDate: item.dueDate, at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: Number(item.amountCents ?? record.amountCents), reason: optional(input.reason, 'Delivery note') || 'Finance explicitly confirmed delivery of the statement to the rider' });
            }
            const sent = record.installments[index]; result = { id: record.id, installmentIndex: index, statementSentAt: sent.statementSentAt, statementSentBy: sent.statementSentBy };
          } else if (url.pathname === '/update-details') {
            const pricingMode = record.type === 'battery-tester' ? required(input.pricingMode || record.pricingMode, 'Battery Tester plan') : record.pricingMode;
            const installmentCount = Number(input.installmentCount ?? record.installmentCount), amount = required(String(input.amount ?? record.amountCents / 100), 'Amount', 15);
            if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Enter a positive amount with up to two decimal places.');
            const amountCents = Math.round(Number(amount) * 100);
            if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100000000) throw new Error('Enter an amount between RM0.01 and RM1,000,000.');
            const plans = { 'fixed-2': { count: 2, amountCents: 5000 }, 'fixed-7': { count: 7, amountCents: 4000 } };
            if (record.type === 'epf' && (installmentCount !== 4 || amountCents !== 2500)) throw new Error('EPF remains fixed at four RM25 deductions.');
            if (record.type === 'insurance' && installmentCount !== 2) throw new Error('Insurance remains fixed at two payments.');
            if (record.type === 'battery-tester' && !['fixed-2', 'fixed-7', 'manual'].includes(pricingMode)) throw new Error('Choose a valid Battery Tester plan.');
            if (record.type === 'battery-tester' && pricingMode !== 'manual' && (installmentCount !== plans[pricingMode].count || amountCents !== plans[pricingMode].amountCents)) throw new Error(pricingMode === 'fixed-2' ? 'The 2-payment Battery Tester plan is RM50 per payment.' : 'The 7-payment Battery Tester plan is RM40 per payment.');
            if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 52) throw new Error('Choose between 1 and 52 payments.');
            const values = input.installmentDates;
            if (!Array.isArray(values) || values.length !== installmentCount) throw new Error(`This deduction requires exactly ${installmentCount} payment date${installmentCount === 1 ? '' : 's'}.`);
            const installmentDates = record.type === 'epf'
              ? validateEpfScheduleDates(values, record.epfScheduleMonth || record.deductionDate.slice(0, 7))
              : values.map((value, index) => date(value, `Payment ${index + 1} deduction date`));
            if (new Set(installmentDates).size !== installmentDates.length || installmentDates.some((value, index) => index && value <= installmentDates[index - 1])) throw new Error('Payment dates must be unique and chronological.');
            const structuralChange = amountCents !== Number(record.amountCents) || installmentCount !== Number(record.installmentCount) || pricingMode !== record.pricingMode;
            if (structuralChange && record.installments.some(item => item.status !== 'applied')) throw new Error('Amount, plan, or payment count cannot change after a payment is reversed or cancelled.');
            const updatedReason = optional(input.reason, 'Reason / remarks'), previousDates = record.installments.map(item => item.dueDate), previousReason = record.reason || '', previousAmountCents = record.amountCents, previousInstallmentCount = record.installmentCount, previousPricingMode = record.pricingMode, oldDuplicateKey = duplicateKey(record), nextDuplicateKey = duplicateKey({ ...record, pricingMode, installmentCount, amountCents, deductionDate: installmentDates[0] });
            const collision = await tx.get(nextDuplicateKey);
            if (collision && collision !== record.id) throw new Error('An identical deduction already exists for this rider and period.');
            record.installments = installmentDates.map((dueDate, index) => {
              const item = record.installments[index], settlement = record.type === 'epf' ? index === 0 ? { start: record.periodStart, end: record.periodEnd } : weekBounds(dueDate) : { start: record.periodStart, end: record.periodEnd };
              return { ...(item || {}), index, dueDate, amountCents, status: item?.status || 'applied', appliedAt: item?.appliedAt || now, appliedBy: item?.appliedBy || actor.name, paymentDate: record.type === 'epf' ? dueDate : item?.paymentDate || now.slice(0, 10), settlementPeriodStart: settlement.start, settlementPeriodEnd: settlement.end, ...(record.type === 'epf' ? { epfContributionMonth: record.epfContributionMonth } : {}) };
            });
            record.deductionDate = installmentDates[0]; record.reason = updatedReason; record.amountCents = amountCents; record.installmentCount = installmentCount; record.installmentIntervalDays = installmentCount > 1 ? 7 : 0; record.scheduledAmountCents = amountCents * installmentCount; record.pricingMode = pricingMode; record.codes = record.type === 'battery-tester' ? [2, 7] : record.codes;
            record.audit.push({ action: 'details-updated', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.scheduledAmountCents, previousAmountCents, previousInstallmentCount, previousPricingMode, previousDates, installmentDates, previousReason, reason: updatedReason || 'Finance updated the deduction details' });
            if (oldDuplicateKey !== nextDuplicateKey) await tx.delete(oldDuplicateKey);
            await tx.put(nextDuplicateKey, record.id);
            result = { id: record.id, reference: record.reference, status: record.status, approvalStatus: record.status, amountCents, installmentCount, pricingMode, installmentDates, reason: record.reason };
          } else if (url.pathname === '/update-schedule') {
            if (record.type !== 'epf' || Number(record.installmentCount) !== 4) throw new Error('Only four-payment EPF schedules can be edited.');
            const scheduleMonth = record.epfScheduleMonth || record.deductionDate.slice(0, 7), installmentDates = validateEpfScheduleDates(input.installmentDates, scheduleMonth);
            const previousDates = record.installments.map(item => item.dueDate), oldDuplicateKey = duplicateKey(record);
            record.installments = record.installments.map((item, index) => {
              const dueDate = installmentDates[index], settlement = index === 0 ? { start: record.periodStart, end: record.periodEnd } : weekBounds(dueDate);
              return { ...item, dueDate, ...(item.status === 'applied' ? { paymentDate: dueDate, settlementPeriodStart: settlement.start, settlementPeriodEnd: settlement.end, epfContributionMonth: record.epfContributionMonth || nextMonth(`${scheduleMonth}-01`) } : {}) };
            });
            record.deductionDate = installmentDates[0]; record.epfScheduleMonth = scheduleMonth; record.epfContributionMonth = nextMonth(`${scheduleMonth}-01`);
            record.audit.push({ action: 'schedule-updated', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.scheduledAmountCents, previousDates, installmentDates, reason: reason || 'Finance updated and locked the EPF deduction dates' });
            await tx.delete(oldDuplicateKey); await tx.put(duplicateKey(record), record.id);
            result = { id: record.id, reference: record.reference, status: record.status, approvalStatus: record.status, installmentDates };
          } else if (url.pathname === '/approve') {
            if (alreadyProceeded) { result = { id: record.id, reference: record.reference, status: record.status, approvalStatus: record.status }; }
            else if (record.status !== 'pending') throw new Error('Only active deduction schedules can be confirmed.');
            if (result) { /* Compatibility no-op for records already proceeded by Finance. */ }
            else {
            record.status = record.approvalStatus = 'approved'; record.approvedBy = actor.name; record.approvedAt = now;
            record.audit.push({ action: 'approved', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.amountCents, ...(record.type === 'epf' ? { recordedWeeklyCommissionCents: record.reportedWeeklyCommissionCents } : {}), reason: reason || 'Approved' });
            }
          } else if (url.pathname === '/reject') {
            if (record.status !== 'pending') throw new Error('Only pending deductions can be rejected.');
            record.status = record.approvalStatus = 'rejected'; record.rejectedBy = actor.name; record.rejectedAt = now;
            record.audit.push({ action: 'rejected', at: now, by: actor.name, role: actor.role, identityVerified: true, amountCents: record.amountCents, reason: required(reason, 'Rejection reason', 2000) });
          } else if (url.pathname === '/cancel') {
            if (!['pending', 'approved'].includes(record.status) || record.installments.some(item => item.status === 'applied' || item.status === 'reversed' || item.appliedAt)) throw new Error('Only an unapplied deduction schedule can be cancelled.');
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
              if (record.reportedWeeklyCommissionCents < 30000 || settlement.settlementPeriodStart !== record.periodStart || settlement.settlementPeriodEnd !== record.periodEnd) throw new Error('EPF must be applied to its recorded earning commission week.');
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
          await tx.put('record:' + record.id, record); result ||= { id: record.id, reference: record.reference, status: record.status, approvalStatus: record.status };
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
  if (!['/', '/jobs', '/save-job', '/save-jobs', '/delete-jobs', '/eligibility', '/create', '/create-batch', '/approve', '/reject', '/apply', '/cancel', '/reverse', '/update-schedule', '/update-details', '/mark-sent', '/complete-installment', '/reopen-installment', '/delete-batch'].includes(path)) return reply({ error: 'Deduction action not found.' }, 404);
  const readOnly = path === '/' || path === '/eligibility' || path === '/jobs';
  if ((readOnly && request.method !== 'GET') || (!readOnly && request.method !== 'POST')) return reply({ error: 'Method not allowed.' }, 405);
  try {
    if (path === '/eligibility') return reply(await verifyWeeklyCommission(env, Object.fromEntries(url.searchParams)));
    const text = request.method === 'POST' ? await request.text() : undefined;
    if (text && text.length > 48000) return reply({ error: 'Request is too large.' }, 413);
    // Remove every browser-supplied verification, including those nested in batch lines.
    const input = text ? JSON.parse(text, (key, value) => key === 'epfVerification' ? undefined : value) : undefined;
    if (request.method === 'POST' && (!input || typeof input !== 'object' || Array.isArray(input) || !/^[a-z0-9-]{16,80}$/i.test(input.requestId || ''))) return reply({ error: 'A valid deduction request with a request ID is required.' }, 400);
    const deleteAuthorized = ['/delete-batch','/delete-jobs'].includes(path) && typeof env.DEDUCTION_DELETE_PIN === 'string' && env.DEDUCTION_DELETE_PIN.length >= 4 && String(input.pin || '') === env.DEDUCTION_DELETE_PIN;
    if (['/delete-batch','/delete-jobs'].includes(path) && !deleteAuthorized) return reply({ error: 'Incorrect deletion PIN.' }, 403);
    if (input) delete input.pin;
    const stub = env.DEDUCTIONS.get(env.DEDUCTIONS.idFromName('finance-deductions-v1'));
    const headers = { 'content-type': 'application/json', 'x-deduction-session': actor.sessionId, 'x-deduction-user': actor.name, 'x-deduction-role': actor.role, 'x-deduction-internal': '1', ...(deleteAuthorized ? { 'x-deduction-delete-authorized': '1' } : {}) };
    let savedReceipt = null;
    if (input) {
      const receiptResponse = await stub.fetch(new Request('https://deductions.internal/receipt', { method: 'POST', headers, body: JSON.stringify({ path, input }) }));
      if (!receiptResponse.ok) return receiptResponse;
      const receipt = await receiptResponse.json();
      if (receipt.found) savedReceipt = receipt.result;
    }
    if (!savedReceipt && path === '/create-batch' && (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 4)) return reply({ error: 'Choose between one and four deduction types.' }, 400);
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
