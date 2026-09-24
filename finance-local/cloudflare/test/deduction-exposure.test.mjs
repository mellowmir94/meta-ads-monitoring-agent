import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../', import.meta.url);
function aggregate(records, scope = {}) {
  const addDays = (value, days) => { const date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const context = vm.createContext({ window: {}, document: { addEventListener() {} }, deductionHistoryProgress: record => ({items:record.installments}), deductionInstallmentAmount: (record,item) => item.amountCents ?? record.amountCents, deductionToday: () => '2026-09-10', deductionAddDays: addDays, deductionWeekBounds: () => ({start:'2026-09-07',end:'2026-09-13'}) });
  vm.runInContext(readFileSync(new URL('assets/history-workflow.js',root),'utf8'),context);
  vm.runInContext(readFileSync(new URL('deduction-exposure.js',root),'utf8'),context);
  return JSON.parse(JSON.stringify(context.deductionExposureRows(records,scope)));
}
const records = [{type:'epf',status:'applied',amountCents:2500,installments:[
  {status:'applied',dueDate:'2026-09-01'},
  {status:'applied',dueDate:'2026-09-08',statementSentAt:'2026-09-08'},
  {status:'applied',dueDate:'2026-09-15',completion:{state:'completed'}},
  {status:'applied',dueDate:'2026-10-01'}
]}];
test('counts installments once, separately from requests; final is not completion', () => {
  const before = JSON.stringify(records), rows = aggregate(records);
  assert.deepEqual(rows.map(row => row.stage),['statement','reconciliation','completed','statement']);
  assert.equal(rows.reduce((sum,row) => sum+row.cents,0),10000);
  assert.equal(JSON.stringify(records),before);
  assert.equal(aggregate(records,{installment:'final'})[0].stage,'statement');
});
test('payment month, payment number and progress intersect', () => {
  assert.equal(aggregate(records,{month:'2026-09',installment:'later'}).length,2);
  assert.equal(aggregate(records,{month:'2026-09',progress:'completed'}).length,1);
  assert.equal(aggregate(records,{installment:'exact:2'})[0].stage,'reconciliation');
  assert.equal(aggregate(records,{installment:'single'}).length,0);
});
test('practical due-period and deduction-type filters use payment dates, not request dates', () => {
  assert.equal(aggregate(records,{period:'this-week'}).length,1);
  assert.equal(aggregate(records,{period:'next-week'}).length,1);
  assert.equal(aggregate(records,{period:'overdue'}).length,2);
  assert.equal(aggregate(records,{period:'month:2026-10'}).length,1);
  assert.equal(aggregate(records,{type:'insurance'}).length,0);
  assert.equal(aggregate(records,{type:'epf',period:'this-week',progress:'reconciliation'}).length,1);
});
test('inactive records and reversed installments excluded; no 200-record sample cap', () => {
  assert.equal(aggregate([{...records[0],status:'cancelled'}]).length,0);
  assert.equal(aggregate([{...records[0],installments:[{status:'reversed'}]}]).length,0);
  assert.equal(aggregate(Array.from({length:203},() => records[0])).length,812);
});
test('replacement leaves primary state chart path alone', () => {
  const source = readFileSync(new URL('index.html',root),'utf8');
  assert.match(source,/if \(panel.id === "commission-main"\) return deductionExposureChart\(\)/);
  assert.match(source,/Total Commission by State/);
});
