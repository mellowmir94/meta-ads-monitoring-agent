import test from 'node:test';
import assert from 'node:assert/strict';
import { DeductionRegister, deductionsApi } from '../src/deductions.js';
import { createDeductionSnapshot, restoreDeductionSnapshot } from '../src/deduction-backup.js';

class Storage {
  data = new Map();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async list({ prefix='', startAfter, limit }) { return new Map([...this.data].sort(([a],[b])=>a.localeCompare(b)).filter(([key])=>key.startsWith(prefix)&&(!startAfter||key>startAfter)).slice(0,limit)); }
  async transaction(fn) { const before = structuredClone(this.data); try { return await fn(this); } catch(error) { this.data = before; throw error; } }
}
async function fixture() {
  const storage = new Storage();
  const records = ['epf','battery-tester'].map((type, i) => ({ id: 'record-'+i, batchId:'case-a', rider:'PNG BH AIDID',riderKey:'png bh aidid', status:'applied', type, amountCents:i?4000:2500,installmentCount:i?7:4, installments:Array.from({length:i?7:4},(_,index)=>({index,status:'applied',dueDate:'2026-09-24'})), audit:[{action:'created'}] }));
  for(const record of records) await storage.put('record:'+record.id,record);
  const register = new DeductionRegister({storage});
  const save = async (patch={}) => {
    const response = await register.fetch(new Request('https://local/save-payment-formula',{method:'POST',headers:{'x-deduction-session':'finance-session','x-deduction-user':'Finance A','x-deduction-role':'maker'},body:JSON.stringify({requestId:crypto.randomUUID(),batchId:'case-a',paymentIndex:1,expectedRevision:0,lines:[{type:'battery-tester',amount:'40.00'}],...patch})}));
    return {status:response.status,body:await response.json()};
  };
  return {storage,save,records};
}
test('each payment saves independent selections and amounts, including payment seven',async()=>{
  const {storage,save,records}=await fixture();
  assert.equal((await save({paymentIndex:0,lines:[{type:'epf',amount:'25.00'}]})).status,201);
  assert.equal((await save()).status,201);
  assert.equal((await save({paymentIndex:6,lines:[{type:'epf',amount:'12.50'},{type:'insurance',amount:'18.75'}]})).status,201);
  const saved=await storage.get('record:record-0');
  assert.deepEqual(saved.paymentFormulas[0].lines,[{type:'epf',amountCents:2500}]);
  assert.deepEqual(saved.paymentFormulas[1].lines,[{type:'battery-tester',amountCents:4000}]);
  assert.equal(saved.paymentFormulas[6].lines[0].amountCents,1250);
  assert.deepEqual(saved.installments,records[0].installments);
  assert.equal(saved.audit.length,4);
  assert.equal(saved.paymentFormulas[1].savedBy,'Finance A');
});
test('all unchecked saves an explicit zero formula and retry does not duplicate audit',async()=>{
  const {storage,save}=await fixture(),requestId=crypto.randomUUID();
  const first=await save({requestId,lines:[]}),retry=await save({requestId,lines:[]});
  assert.equal(first.status,201);assert.deepEqual(retry,first);
  assert.deepEqual(first.body.formula.lines,[]);
  assert.equal((await storage.get('record:record-0')).audit.length,2);
});
test('rejects stale edits, invalid money, types, indices and missing batches without mutation',async()=>{
  const {storage,save}=await fixture();await save();
  const before=structuredClone(storage.data);
  for(const patch of [{},{paymentIndex:7},{paymentIndex:-1},{batchId:'missing'},{lines:[{type:'epf',amount:'-1'}]},{lines:[{type:'epf',amount:'1.001'}]},{lines:[{type:'bad',amount:'25'}]},{lines:[{type:'epf',amount:'25'},{type:'epf',amount:'25'}]}])assert.equal((await save(patch)).status,400);
  assert.deepEqual(storage.data,before);
  assert.equal((await save({expectedRevision:1,lines:[{type:'manual',amount:'9.99'}]})).status,201);
});
test('gateway requires Finance authentication and same-origin JSON for formula saves',async()=>{
  const request=new Request('https://finance/api/deductions/save-payment-formula',{method:'POST',body:'{}'});
  assert.equal((await deductionsApi(request,{},null)).status,401);
  assert.equal((await deductionsApi(request,{DEDUCTIONS:{}},{sessionId:'s',name:'Finance'})).status,403);
});
test('saved formulas survive backup/restore and completed payments require reopening',async()=>{
  const {storage,save}=await fixture();assert.equal((await save()).status,201);
  const snapshot=await createDeductionSnapshot(storage),restored=new Storage();
  await restoreDeductionSnapshot(restored,snapshot);
  assert.deepEqual((await restored.get('record:record-0')).paymentFormulas,(await storage.get('record:record-0')).paymentFormulas);
  const record=await storage.get('record:record-0');record.installments[1].completion={state:'completed'};await storage.put('record:record-0',record);
  const result=await save({expectedRevision:1});assert.equal(result.status,400);assert.match(result.body.error,/Reopen/);
});
