import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(request){
 const c=vm.createContext({document:{addEventListener(){}},URLSearchParams,FINANCE_API_ENDPOINT:'/api/finance',requestFinancePayload:request,canonicalizeFinancePayloadRows:async(_p,data)=>data.rows});
 vm.runInContext(readFileSync(new URL('../../deductions.js',import.meta.url),'utf8'),c);return c;
}
test('one download recovers a timed-out weekly query using complete smaller ranges',async()=>{
 const calls=[];const c=fixture(async url=>{const p=new URL(url,'https://local').searchParams;const from=p.get('from').slice(0,10),to=p.get('to').slice(0,10);calls.push([from,to]);if(from==='2026-09-14'&&to==='2026-09-20')throw Error('Data not refreshed: Grafana took too long. Please retry Refresh or Download.');return {response:{ok:true},payload:{rows:[{from,to}]}};});
 const rows=await c.deductionLoadStatementRows({id:'commission-main'},'2026-09-14','2026-09-20');
 assert.equal(rows.length,2);assert.deepEqual(calls,[['2026-09-14','2026-09-20'],['2026-09-14','2026-09-17'],['2026-09-18','2026-09-20']]);
});
test('persistent HTTP 500 is bounded and never caches partial rows',async()=>{
 let calls=0;const c=fixture(async()=>{calls++;return {response:{ok:false,status:500},payload:{error:'Grafana unavailable'}};});
 await assert.rejects(c.deductionLoadStatementRows({id:'commission-main'},'2026-09-14','2026-09-20'));
 assert.ok(calls>1&&calls<=7);assert.equal(vm.runInContext('deductionStatementRowsCache.size',c),0);
});
test('authentication failures are not retried',async()=>{
 let calls=0;const c=fixture(async()=>{calls++;return {response:{ok:false,status:401},payload:{error:'Sign in'}};});
 await assert.rejects(c.deductionLoadStatementRows({id:'commission-main'},'2026-09-14','2026-09-20'),/Sign in/);assert.equal(calls,1);
});

test('failure after a successful subrange never returns or caches a partial statement',async()=>{
 const c=fixture(async url=>{const p=new URL(url,'https://local').searchParams;
 if(p.get('to').startsWith('2026-09-17'))return {response:{ok:true},payload:{rows:[{commission:100}]}};
 return {response:{ok:false,status:500},payload:{error:'Unavailable'}};});
 await assert.rejects(c.deductionLoadStatementRows({id:'commission-main'},'2026-09-14','2026-09-20'));
 assert.equal(vm.runInContext('deductionStatementRowsCache.size',c),0);
});

test('hover warmup does not query Grafana or load financial statements',async()=>{
 let requests=0;const c=fixture(async()=>{requests++;throw Error('unexpected query');});
 c.ensureFinanceExportBundle=async()=>{};c.financePdfLogo=async()=>{};
 c.deductionHistoryPrefetchRow({});await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);
});
