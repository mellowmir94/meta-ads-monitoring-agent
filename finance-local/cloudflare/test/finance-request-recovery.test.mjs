import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('      async function requestFinancePayload('), html.indexOf('      function yieldFinanceFrame('));
function harness(responses) {
  let calls = 0;
  const context = vm.createContext({ AbortController, performance, setTimeout, clearTimeout,
    financeInflightRequests:new Map(), financePanelControllers:new Map(), activePanel:()=>({id:'commission-main'}),
    fetch:async()=>{const result = responses[Math.min(calls++,responses.length-1)]; if(result instanceof Error) throw result; return result.clone();}
  });
  vm.runInContext(source,context);
  return {run:()=>context.requestFinancePayload('/api/finance/data?panel=commission-main','commission-main',true),calls:()=>calls};
}
test('a temporary gateway failure recovers without showing the generic connection error',async()=>{
  const h=harness([Response.json({}, {status:502}),Response.json({rows:[{commission:25}]})]);
  const result=await h.run();
  assert.equal(result.response.ok,true);
  assert.equal(result.payload.rows[0].commission,25);
  assert.equal(h.calls(),2);
});
test('HTML gateway failures recover without a JSON parsing error',async()=>{
  const h=harness([new Response('<html>Bad Gateway</html>',{status:502}),Response.json({rows:[]})]);
  assert.equal((await h.run()).response.ok,true);
});
test('persistent gateway failure stops after one retry with a useful HTTP message',async()=>{
  const h=harness([Response.json({}, {status:503})]);
  const result=await h.run();
  assert.equal(result.response.ok,false);
  assert.match(result.payload.error,/503/);
  assert.equal(h.calls(),2);
});
test('authentication and invalid filters are not retried',async()=>{
  for(const status of [400,401,403]) {
    const h=harness([Response.json({error:'Rejected'},{status})]);
    assert.equal((await h.run()).response.status,status);
    assert.equal(h.calls(),1);
  }
});
