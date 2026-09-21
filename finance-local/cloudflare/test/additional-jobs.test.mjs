import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DeductionRegister,deductionsApi} from '../src/deductions.js';
import {createDeductionSnapshot,validateDeductionSnapshot,restoreDeductionSnapshot} from '../src/deduction-backup.js';
class Store {
  data=new Map();
  async get(key){return structuredClone(this.data.get(key));}
  async put(key,value){this.data.set(key,structuredClone(value));}
  async list({prefix='',startAfter='',limit=Infinity}={}){return new Map([...this.data].sort(([a],[b])=>a.localeCompare(b)).filter(([key])=>key.startsWith(prefix)&&key>startAfter).slice(0,limit));}
  async transaction(fn){const previous=structuredClone(this.data);try{return await fn(this);}catch(error){this.data=previous;throw error;}}
}
function setup(){const storage=new Store(),register=new DeductionRegister({storage}),backups=[];return {storage,register,backups,env:{DEDUCTIONS:{idFromName:x=>x,get:()=>register},DEDUCTION_BACKUPS:{put:async(key,value)=>backups.push(JSON.parse(value))}}};}
const actor={sessionId:'test-session',name:'Finance',role:'maker'};
const job={rider:'Rider A',periodStart:'2026-09-14',periodEnd:'2026-09-20',description:'Extra battery delivery',amount:'12.35'};
async function call(env,path,body){const result=await deductionsApi(new Request('https://ledger.test/api/deductions'+path,body?{method:'POST',headers:{origin:'https://ledger.test','content-type':'application/json'},body:JSON.stringify(body)}:{}),env,actor);return {status:result.status,body:await result.json()};}
test('jobs save centrally, retry idempotently, preserve deductions and survive backup/restore',async()=>{
  const {env,storage,backups}=setup();await storage.put('counter:reference',203);
  const input={...job,requestId:crypto.randomUUID()},first=await call(env,'/save-job',input),retry=await call(env,'/save-job',input);
  assert.equal(first.status,201);assert.deepEqual(first.body,retry.body);assert.equal(first.body.job.amountCents,1235);
  assert.equal(await storage.get('counter:reference'),203);assert.equal((await call(env,'/jobs')).body.jobs.length,1);
  assert.equal((await call(env,'/')).body.records.length,0);
  assert.ok(backups.length);await validateDeductionSnapshot(backups.at(-1));const restored=new Store();await restoreDeductionSnapshot(restored,backups.at(-1));assert.equal((await restored.list({prefix:'job:'})).size,1);
  assert.equal((await call(env,'/save-job',{...input,amount:'99'})).status,400);
});
test('rejects invalid job money, descriptions and dates without writing',async()=>{
  const {env,storage}=setup();for(const change of [{amount:'-2'},{amount:'1.001'},{amount:'Infinity'},{amount:'1000001'},{description:''},{periodEnd:'2026-09-01'},{periodStart:'2026-02-30'}])assert.equal((await call(env,'/save-job',{...job,...change,requestId:crypto.randomUUID()})).status,400);
  assert.equal((await storage.list()).size,0);
});
test('saving visible job rows replaces RM80 with RM50, retains audit, and retries once',async()=>{
  const {env,storage}=setup();
  for(const amount of ['30','50'])await call(env,'/save-job',{...job,amount,requestId:crypto.randomUUID()});
  const expectedJobs=(await call(env,'/jobs')).body.jobs;
  const input={...job,requestId:crypto.randomUUID(),expectedJobs,rows:[{description:'Additional Job',amount:'50'}]};
  const saved=await call(env,'/save-jobs',input);assert.ok(saved.status<300,JSON.stringify(saved.body));
  assert.deepEqual((await call(env,'/save-jobs',input)).body,saved.body);
  const current=(await call(env,'/jobs')).body.jobs;assert.equal(current.length,1);assert.equal(current[0].amountCents,5000);
  const all=[...await storage.list({prefix:'job:'})].map(([,value])=>value);assert.equal(all.length,3);assert.equal(all.filter(job=>job.status==='replaced').length,2);
  assert.equal((await call(env,'/')).body.records.length,0);
  assert.equal((await call(env,'/save-jobs',{...input,requestId:crypto.randomUUID()})).status,400);
});
test('job listing paginates beyond 200 without changing any job',async()=>{
  const {env,storage}=setup();for(let i=0;i<235;i++)await storage.put('job:'+String(i).padStart(5,'0'),{...job,id:String(i)});
  const ids=[];let next='';do{const result=await call(env,'/jobs'+(next?'?after='+encodeURIComponent(next):''));ids.push(...result.body.jobs.map(item=>item.id));next=result.body.next;}while(next);
  assert.equal(new Set(ids).size,235);
});
test('shared statement includes only matching rider/period jobs, adds once, cleans labels',async()=>{
  const context=vm.createContext({document:{addEventListener(){}},deductionRiderKey:s=>String(s||'').toLowerCase(),deductionMoney:c=>'RM '+(c/100).toFixed(2)});
  vm.runInContext(readFileSync(new URL('../../additional-jobs.js',import.meta.url),'utf8'),context);
  vm.runInContext(`additionalJobsLoad=async()=>{}; additionalJobsState.jobs=[{riderKey:'rider a',periodStart:'2026-09-14',periodEnd:'2026-09-20',reference:'JOB-1',description:'Extra job',amountCents:1235},{riderKey:'rider b',periodStart:'2026-09-14',periodEnd:'2026-09-20',amountCents:9000},{riderKey:'rider a',periodStart:'2026-10-01',periodEnd:'2026-10-07',amountCents:9000}];`,context);
  vm.runInContext(readFileSync(new URL('../../rider-statement.js',import.meta.url),'utf8'),context);
  const payload={panelTitle:'Commission Rider',statementScope:{rider:'Rider A',start:'2026-09-14',end:'2026-09-20'},columns:[{key:'id',value:r=>r.id},{key:'commission',value:r=>r.commission}],rows:[{id:1,commission:100}],summary:{value:'RM 75.00'},footerRows:[['Filtered total','RM 100.00'],['EPF (applied)','- RM 25.00'],['APPLIED DEDUCTIONS','- RM 25.00'],['NET COMMISSION','RM 75.00']]};
  const master=await context.prepareRiderStatement(payload);assert.equal(master.summary.value,'RM 87.35');assert.equal(master.rows.length,1);assert.equal(master.footerRows[3][0],'ADDITIONAL JOB 1 · JOB-1 · Extra job');assert.equal(master.footerRows[3][1],'+ RM 12.35');assert.equal(master.footerRows[2][0],'TOTAL DEDUCTIONS');assert.equal(master.footerRows.at(-1)[0],'NET COMMISSION');assert.equal(payload.rows.length,1);assert.equal(master.footerRows.filter(row=>row[0]==='NET COMMISSION').length,1);assert.ok(master.footerRows.some(row=>row[0]==='TOTAL DEDUCTIONS'));assert.ok(!JSON.stringify(master.footerRows).includes('(applied)'));
  assert.equal(await context.prepareRiderStatement(master),master);
});
