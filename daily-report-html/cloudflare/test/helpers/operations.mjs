import assert from 'node:assert/strict';
import worker, { OperationsJobsStore, ManualValuesStore } from '../../src/worker.js';

export function memoryStorage() {
  let data = new Map(), alarm = null;
  const storage = {
    get: async key => structuredClone(data.get(key)),
    put: async (key, value) => {
      assert.ok(new TextEncoder().encode(JSON.stringify(value)).length < 128 * 1024, 'Durable Object values must be chunked below 128 KiB');
      data.set(key, structuredClone(value));
    },
    delete: async key => data.delete(key),
    list: async ({ prefix = '', reverse = false, limit = Infinity } = {}) => new Map([...data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => reverse ? b.localeCompare(a) : a.localeCompare(b)).slice(0, limit).map(([key, value]) => [key, structuredClone(value)])),
    setAlarm: async value => { alarm = value; },
    getAlarm: async () => alarm,
    deleteAlarm: async () => { alarm = null; },
    transaction: async run => {
      const before = structuredClone(data), beforeAlarm = alarm;
      try { return await run(storage); } catch (error) { data = before; alarm = beforeAlarm; throw error; }
    }
  };
  return storage;
}

export function context(storage = memoryStorage()) {
  let tail = Promise.resolve();
  return { storage, blockConcurrencyWhile: run => { const result = tail.then(run); tail = result.catch(() => {}); return result; } };
}

export function harness(options = {}) {
  const kv = new Map(Object.entries(options.legacy || {})), writes = [], manual = new Map();
  const env = {
    ALLOW_LOCAL_API: 'true',
    CONCURRENCY_LIMITER: { idFromName: value => value, get: () => ({ fetch: async () => Response.json({ status: 'admitted' }) }) },
    DASHBOARD_DATA: {
      get: async key => structuredClone(kv.get(key) ?? null),
      put: async (key, value) => { await options.beforeKvPut?.(key, value); kv.set(key, JSON.parse(value)); writes.push(key); },
      delete: async key => { kv.delete(key); writes.push(`delete:${key}`); }
    },
    ...options.env
  };
  env.MANUAL_VALUES = { idFromName: value => value, get: kind => {
    if (!manual.has(kind)) manual.set(kind, new ManualValuesStore(context(), env));
    return manual.get(kind);
  } };
  const ctx = context();
  let instance = new OperationsJobsStore(ctx, env);
  env.OPERATIONS_JOBS = { idFromName: value => value, get: () => ({ fetch: request => instance.fetch(request) }) };
  const request = (path = '/api/operations', method = 'GET', body, headers = {}) => new Request(`http://localhost${path}`, {
    method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return {
    env, kv, writes, manual, storage: ctx.storage,
    get instance() { return instance; },
    restart: () => { instance = new OperationsJobsStore(ctx, env); },
    call: (path, method, body, headers) => worker.fetch(request(path, method, body, headers), env, { waitUntil() {} }),
    internal: (path, method = 'POST', body = {}) => instance.fetch(request(path, method, body)),
    alarm: () => instance.alarm()
  };
}

export const month = (key, sales = 10) => ({ month: key, rows: [{ date: `${key}-01`, channel: 'hq', pitstop: ' HQ LOCAL ', state: 'Selangor', sales }] });
export const jobBody = () => ({ sourceName: 'local-fixture.xlsx', months: [month('2026-01'), month('2026-02', 20), month('2026-03', 30)] });
export const manualCall = (h, kind, body, path = '/restore') => h.env.MANUAL_VALUES.get(kind).fetch(new Request(`https://manual.internal${path}?kind=${kind}`, {
  method: body ? 'POST' : 'GET', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
}));

export async function signedCookies(secret, upload = true) {
  const expires = Math.floor(Date.now() / 1000) + 600;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sign = async value => Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))).toString('base64url');
  const cookies = [`__Host-daily_report_session=${expires}.${await sign(String(expires))}`];
  if (upload) cookies.push(`__Host-daily_report_upload_session=${expires}.${await sign(`upload:${expires}`)}`);
  return cookies.join('; ');
}
