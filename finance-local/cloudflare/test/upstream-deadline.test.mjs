import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function fetchFinanceUpstream('),source.indexOf('async function financeDataApi('));
test('stuck upstream is bounded, shared while pending, and released for retry',async()=>{
 let timer, calls=0, signal;const requests=new Map();
 const c=vm.createContext({Request,Response,AbortController,financeRequests:requests,setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}});vm.runInContext(code,c);
 const env={FINANCE_PROXY_SHARED_SECRET:'test',GRAFANA_PROXY:{fetch:req=>{calls++;signal=req.signal;return new Promise(()=>{});}}};
 const first=c.fetchFinanceUpstream('https://internal/data',env,'same'),second=c.fetchFinanceUpstream('https://internal/data',env,'same');
 assert.equal(calls,1);assert.equal(typeof timer,'function','upstream must have a deadline');
 const failures=Promise.allSettled([first,second]);timer();
 assert.ok((await failures).every(result=>result.status==='rejected'));assert.equal(signal.aborted,true);assert.equal(requests.size,0);
 env.GRAFANA_PROXY.fetch=async()=>Response.json({ok:true});assert.equal((await c.fetchFinanceUpstream('https://internal/data',env,'same')).status,200);
 assert.equal(requests.size,0);
});
