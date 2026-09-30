import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../src/worker.js';
import { applyConcurrencyAction, concurrencyConfig } from '../src/concurrency.js';

function fixture(t) {
  let state = {}, upstreamCalls = 0, checks = 0, matches = 0;
  const stored = new Map(), tasks = [], upstreamUrls = [];
  const secret = 'unit-test-signing-secret';
  const env = { MAX_CONCURRENT_USERS: '5', SESSION_SIGNING_SECRET: secret, FINANCE_PROXY_SHARED_SECRET: 'unit-test-proxy-secret' };
  const config = concurrencyConfig(env);
  const act = (action, id) => { const result = applyConcurrencyAction(state, action, id, Date.now(), config); state = result.state; return result.result; };
  env.CONCURRENCY_LIMITER = { idFromName: (name) => name, get: () => ({ fetch: async (_url, options) => {
    const { action, sessionId } = JSON.parse(options.body); if (action === 'check') checks++;
    return Response.json(act(action, sessionId));
  } }) };
  env.GRAFANA_PROXY = { fetch: async (request) => { upstreamCalls++; upstreamUrls.push(new URL(request.url)); return Response.json({ rows: [{ commission: 35 }] }); } };
  const cache = { match: async (key) => { matches++; return stored.get(key.url)?.clone(); }, put: async (key, response) => { stored.set(key.url, new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers })); } };
  const previousCaches = globalThis.caches;
  globalThis.caches = { default: cache };
  t.after(() => { if (previousCaches === undefined) delete globalThis.caches; else globalThis.caches = previousCaches; });
  const cookie = (id) => { const value = `${id}.${Math.floor(Date.now() / 1000) + 600}`; return `ledger_finance_session=${value}.${createHmac('sha256', secret).update(value).digest('hex')}`; };
  const call = (id, path = '/api/grafana/finance?panel=branch&part=primary&scope=selection', method = 'GET') => worker.fetch(new Request(`https://finance.test${path}`, { method, headers: id ? { cookie: cookie(id) } : {} }), env, { waitUntil: (task) => tasks.push(task) });
  return { env, config, cache, stored, tasks, act, call, upstreamUrls, stats: () => ({ upstreamCalls, checks, matches, state }), flush: async () => { await Promise.all(tasks.splice(0)); } };
}

test('five admitted users receive live data; the sixth stays blocked until FIFO promotion', async (t) => {
  const f = fixture(t);
  for (let index = 1; index <= 5; index++) assert.equal(f.act('enter', `u${index}`).status, 'admitted');
  assert.equal(f.act('enter', 'u6').status, 'queued');
  const first = await f.call('u1'); assert.equal(first.status, 200); await first.text(); await f.flush();
  for (let index = 2; index <= 5; index++) { const response = await f.call(`u${index}`); assert.equal(response.headers.get('x-finance-cache'), 'BYPASS'); await response.text(); }
  const before = f.stats();
  const denied = await f.call('u6'); assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'queue_required');
  assert.equal(f.stats().matches, before.matches, 'the queue check runs before any cache read');
  assert.equal(f.stats().upstreamCalls, 5);
  assert.equal(Object.keys(f.stats().state.active).length, 5);
  f.act('enter', 'u7'); f.act('release', 'u1');
  assert.equal(f.act('check', 'u6').status, 'admitted'); assert.equal(f.act('check', 'u7').position, 1);
  const promoted = await f.call('u6'); assert.equal(promoted.status, 200); await promoted.text();
  assert.equal(Object.keys(f.stats().state.active).length, 5);
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.vars.MAX_CONCURRENT_USERS, '5');
});

test('unauthenticated requests never reach the cache or Grafana', async (t) => {
  const f = fixture(t); const response = await f.call(null);
  assert.equal(response.status, 401); assert.equal(f.stats().matches, 0); assert.equal(f.stats().upstreamCalls, 0);
});

test('simultaneous live requests share only pending work, never completed cached responses', async (t) => {
  const f = fixture(t); f.act('enter', 'u1');
  let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  f.env.GRAFANA_PROXY.fetch=async()=>{calls++;await gate;return Response.json({rows:[]});};
  const pending=Promise.all(Array.from({length:5},()=>f.call('u1')));
  await new Promise(resolve=>setTimeout(resolve,20));release();
  const responses=await pending;
  assert.ok(responses.every(response=>response.headers.get('x-finance-cache')==='BYPASS'));
  await Promise.all(responses.map((response) => response.text()));
  assert.equal(calls,1);
  const again = await f.call('u1'); await again.text();
  assert.equal(calls,2);assert.equal(f.stored.size,0);assert.equal(f.stats().matches,0);
});

test('Refresh still bypasses cache and forwards every filter/date/revision unchanged', async (t) => {
  const f = fixture(t); f.act('enter', 'u1');
  const params = new URLSearchParams({ panel: 'commission-main', from: '2026-09-01', to: '2026-09-02', scope: 'selection', part: 'primary', filters: JSON.stringify({ level: ['LOW'] }), revision: 'commission-kpi-v9', refresh: '1' });
  for (let index = 0; index < 2; index++) { const response = await f.call('u1', `/api/grafana/finance?${params}`); assert.equal(response.headers.get('x-finance-cache'), 'BYPASS'); await response.text(); await f.flush(); }
  assert.equal(f.stats().matches, 0); assert.equal(f.stats().upstreamCalls, 2);
  for (const [key, value] of params) assert.equal(f.upstreamUrls[0].searchParams.get(key), value);
  assert.equal(f.upstreamUrls[0].searchParams.get('format'), 'packed');
});
