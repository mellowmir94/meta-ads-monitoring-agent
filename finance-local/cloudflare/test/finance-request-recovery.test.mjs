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

test('HTTP 500 from Grafana retries once without needing a page refresh',async()=>{
  const h=harness([Response.json({error:'Temporary server failure'},{status:500}),Response.json({rows:[{commission:25}]})]);
  assert.equal((await h.run()).payload.rows[0].commission,25);assert.equal(h.calls(),2);
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

test('repeated Refresh shares the pending live query instead of aborting and restarting it', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const context = vm.createContext({ AbortController, performance, setTimeout, clearTimeout,
    financeInflightRequests: new Map(), financePanelControllers: new Map(), activePanel: () => ({ id: 'commission-main' }),
    fetch: async (_url, { signal }) => {
      calls++;
      await Promise.race([gate, new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))]);
      return Response.json({ rows: [{ commission: 35 }] });
    }
  });
  vm.runInContext(source, context);
  const first = context.requestFinancePayload('/api/finance/data?panel=commission-main', 'commission-main', true).catch(error => error);
  const second = context.requestFinancePayload('/api/finance/data?panel=commission-main', 'commission-main', true).catch(error => error);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1, 'a repeated click must not restart Grafana');
  assert.ok(results.every(result => result.payload?.rows[0].commission === 35));
  await context.requestFinancePayload('/api/finance/data?panel=commission-main', 'commission-main', true);
  assert.equal(calls, 2, 'the next Refresh after completion must still pull fresh data');
  assert.equal(context.financeInflightRequests.size, 0, 'no completed response cache is added');
});

test('a changed date/filter request cancels the obsolete scope instead of sharing it', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const signals = [];
  const context = vm.createContext({ AbortController, performance, setTimeout, clearTimeout,
    financeInflightRequests: new Map(), financePanelControllers: new Map(), activePanel: () => ({ id: 'commission-main' }),
    fetch: async (_url, { signal }) => {
      signals.push(signal);
      await Promise.race([gate, new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))]);
      return Response.json({ rows: [] });
    }
  });
  vm.runInContext(source, context);
  const old = context.requestFinancePayload('/api/finance/data?from=2026-09-14', 'commission-main', true).catch(error => error);
  const current = context.requestFinancePayload('/api/finance/data?from=2026-09-21', 'commission-main', true);
  release();
  assert.equal((await old).name, 'AbortError');
  assert.equal((await current).response.status, 200);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
});

test('the panel loader coalesces repeated Refresh before rendering or clearing temporary statement state again', async () => {
  let calls = 0, clears = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const temporary = { clear() { clears++; } };
  const context = vm.createContext({
    financePanelLoadPromises: new Map(), financeLoadScopeKey: () => 'same-scope',
    deductionStatementRowsCache: temporary, deductionStatementPayloadCache: temporary, additionalJobsStatementCache: temporary,
    performGrafanaDataLoad: async () => { calls++; await gate; }
  });
  const start = html.indexOf('      function loadGrafanaData(');
  vm.runInContext(html.slice(start, html.indexOf('      async function performGrafanaDataLoad(', start)), context);
  const first = context.loadGrafanaData('commission-main', true);
  const second = context.loadGrafanaData('commission-main', true);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(clears, 3);
  release(); await first;
  await context.loadGrafanaData('commission-main', true);
  assert.equal(calls, 2);
});

test('every caller sharing a timed-out query receives the same useful deadline error', async () => {
  const context = vm.createContext({ AbortController, performance, setTimeout, clearTimeout,
    financeInflightRequests: new Map(), financePanelControllers: new Map(), activePanel: () => ({ id: 'commission-main' }),
    fetch: async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  });
  vm.runInContext(source, context);
  const first = context.requestFinancePayload('/deadline', 'commission-main', true, { timeoutMs: 10 }).catch(error => error);
  const second = context.requestFinancePayload('/deadline', 'commission-main', true).catch(error => error);
  const errors = await Promise.all([first, second]);
  assert.ok(errors.every(error => /Grafana took too long/.test(error.message)));
  assert.equal(context.financeInflightRequests.size, 0);
});

test('changing Live/Sync source creates a new panel load scope even when dates and filters match', () => {
  const context = vm.createContext({ state: { dates: {}, filters: {}, grafanaFilterDirty: {}, grafanaScopeHydrated: {} }, financeSource: { epoch: 1 } });
  const start = html.indexOf('      function financeLoadScopeKey(');
  vm.runInContext(html.slice(start, html.indexOf('      function loadGrafanaData(', start)), context);
  const before = context.financeLoadScopeKey('commission-main');
  context.financeSource.epoch++;
  assert.notEqual(context.financeLoadScopeKey('commission-main'), before);
});
