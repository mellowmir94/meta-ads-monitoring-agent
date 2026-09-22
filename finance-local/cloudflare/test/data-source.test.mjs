import test from 'node:test';
import assert from 'node:assert/strict';
import { DeductionRegister } from '../src/deductions.js';
import { dataSourceApi } from '../src/data-source.js';
import { createDeductionSnapshot, validateDeductionSnapshot } from '../src/deduction-backup.js';
class Store {
  data = new Map();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key,value) { this.data.set(key,structuredClone(value)); }
  async list({prefix='',startAfter='',limit=Infinity}={}) { return new Map([...this.data].sort(([a],[b])=>a.localeCompare(b)).filter(([key])=>key.startsWith(prefix)&&key>startAfter).slice(0,limit)); }
  async transaction(fn) { return fn(this); }
}
function setup() {
  const storage = new Store(), objects = new Map(); let calls = 0;
  const fixture = { from:'2026-09-14 00:00:00',to:'2026-09-20 23:59:59',rows:[{order_id:'1',rider_name:'Rider A',commission:20}],rowCount:1,metricRows:[{order_count:2,total_commission:35}],truncated:false };
  const env = { FINANCE_PROXY_SHARED_SECRET:'test', GRAFANA_PROXY:{fetch:async request=>{calls++;const url=new URL(request.url);assert.equal(url.searchParams.get('panel'),'commission-main');assert.equal(url.searchParams.get('filters'),'{}');await new Promise(resolve=>setTimeout(resolve,5));return Response.json(fixture);}}, DEDUCTION_BACKUPS:{ put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null } };
  const register = new DeductionRegister({storage},env);env.DEDUCTIONS={idFromName:x=>x,get:()=>register};
  async function call(path,input,name='Finance A') { const response=await dataSourceApi(new Request('https://test/api/data-source/'+path,input?{method:'POST',headers:{origin:'https://test','content-type':'application/json'},body:JSON.stringify(input)}:{}),env,{name,sessionId:name});return {status:response.status,body:await response.json()}; }
  return {call,storage,objects,fixture,calls:()=>calls};
}
const week={start:'2026-09-14',end:'2026-09-20'};
test('mode defaults live and is isolated by Finance identity',async()=>{
  const h=setup();assert.equal((await h.call('settings')).body.live,true);
  await h.call('settings',{live:false});assert.equal((await h.call('settings')).body.live,false);
  assert.equal((await h.call('settings',null,'Finance B')).body.live,true);assert.equal(h.calls(),0);
});
test('sync saves exact independent KPIs; all readers and downloads reuse immutable data',async()=>{
  const h=setup();const result=await h.call('sync',week);assert.equal(result.status,200);
  await h.call('settings',{live:false});
  const read=await h.call('data?from=2026-09-14&to=2026-09-20');assert.equal(read.body.rows.length,1);assert.equal(read.body.metricRows[0].total_commission,35);
  await h.call('data?from=2026-09-14&to=2026-09-20',null,'Finance B');assert.equal(h.calls(),1);
  assert.equal((await h.call('data?from=2026-09-21&to=2026-09-27')).status,404);
  await validateDeductionSnapshot(await createDeductionSnapshot(h.storage));
  assert.ok([...h.objects.keys()].some(key=>key.startsWith('commission-rider/snapshots/v2/')));
});
test('concurrent users share one sync; resync replaces the pointer without duplicating rows',async()=>{
  const h=setup();await Promise.all([h.call('sync',week),h.call('sync',week,'Finance B')]);assert.equal(h.calls(),1);
  h.fixture.rows[0].commission=50;await h.call('sync',week);assert.equal(h.calls(),2);
  assert.equal((await h.call('settings')).body.weeks.length,1);
  assert.equal((await h.call('data?from=2026-09-14&to=2026-09-20')).body.rows[0].commission,50);
  assert.equal([...h.objects.keys()].filter(key=>key.startsWith('commission-sync/')).length,2);
});
test('invalid dates, incomplete tables and missing KPI sources never replace a saved week',async()=>{
  const h=setup();await h.call('sync',week);
  assert.equal((await h.call('sync',{...week,start:'2026-09-15'})).status,400);
  for (const change of [{truncated:true},{rowCount:5},{metricRows:null},{summaryError:'KPI unavailable'},{from:'2026-08-14'}]) {
    const original=structuredClone(h.fixture);Object.assign(h.fixture,change);assert.equal((await h.call('sync',week)).status,400);Object.assign(h.fixture,original);
    assert.equal((await h.call('data?from=2026-09-14&to=2026-09-20')).body.rows[0].commission,20);
  }
});
