import test from 'node:test';
import assert from 'node:assert/strict';
import { ManualValuesStore } from '../src/worker.js';
import { changedEntries, revisionConflict, validManualReport } from '../src/manual-values.js';

function store(kind, legacy) {
  const data = new Map();
  const storage = {
    get: async key => structuredClone(data.get(key)),
    put: async (key, value) => { data.set(key, structuredClone(value)); },
    transaction: async run => run(storage),
    list: async () => new Map([...data].filter(([key]) => key.startsWith('audit:')))
  };
  let tail = Promise.resolve();
  const ctx = { storage, blockConcurrencyWhile: run => { const result = tail.then(run); tail = result.catch(() => {}); return result; } };
  const instance = new ManualValuesStore(ctx, { DASHBOARD_DATA: { get: async () => structuredClone(legacy) } });
  const call = (method = 'GET', body, path = '/') => instance.fetch(new Request(`https://manual.internal${path}?kind=${kind}`, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }));
  return { call, data };
}

test('manual values import legacy data once and do not lose concurrent saves on other dates', async () => {
  const { call } = store('rsa', { values: { '2026-08-01': { rsaJumpstart: 8 } } });
  const replies = await Promise.all(['2026-08-01', '2026-08-02'].map(date => call('PUT', { date, field: 'rsaJumpstart', value: 12, expectedRevision: 0 })));
  assert.deepEqual(replies.map(reply => reply.status), [200, 200]);
  const saved = await (await call()).json();
  assert.equal(saved.values['2026-08-01'].rsaJumpstart, 12);
  assert.equal(saved.values['2026-08-02'].rsaJumpstart, 12);
  assert.equal(saved.revision, 2);
});

test('same-field concurrent saves reject stale revision and keep an audit trail', async () => {
  const { call, data } = store('rsa', { values: {} });
  const body = { date: '2026-08-01', field: 'rsaFuel', expectedRevision: 0 };
  const replies = await Promise.all([call('PUT', { ...body, value: 2 }), call('PUT', { ...body, value: 3 })]);
  assert.deepEqual(replies.map(reply => reply.status), [200, 409]);
  const conflict = await replies[1].json();
  assert.equal(conflict.current.values[body.date].rsaFuel, 2);
  assert.equal(data.get('audit:000000000001').changes[0].after, 2);
  assert.equal((await call('PUT', { ...body, value: 3, expectedRevision: 1 })).status, 200);
  assert.equal((await call('PUT', { date: body.date, field: body.field, value: 4 })).status, 428);
});

test('SharePoint updates preserve history and revisions for unchanged values without creating manual overrides', async () => {
  const { call } = store('b2w', { values: { '2026-07-31': 20, '2026-08-01': 30 }, sharePointValues: { '2026-07-31': 20, '2026-08-01': 30 }, manualOverrides: {} });
  await call('POST', { rows: [{ date: '2026-08-01', value: 30 }, { date: '2026-08-02', value: 40 }], workbook: 'book', worksheet: 'Aug' }, '/sync');
  const saved = await (await call()).json();
  assert.equal(saved.values['2026-07-31'], 20);
  assert.deepEqual(saved.manualOverrides, {});
  assert.equal(saved.revisions['2026-08-01'] || 0, 0);
  const update = await call('PUT', { date: '2026-08-01', value: 31, expectedRevision: 0 });
  assert.equal(update.status, 200);
  assert.deepEqual((await update.json()).manualOverrides, { '2026-08-01': 31 });
});

test('invalid edits are atomic and deleting a B2W override restores SharePoint', async () => {
  const { call } = store('b2w', { values: { '2026-08-01': 7 }, manualOverrides: { '2026-08-01': 7 }, sharePointValues: { '2026-08-01': 6 } });
  assert.equal((await call('PUT', { updates: [{ date: '2026-08-01', value: 8, expectedRevision: 0 }, { date: 'bad-date', value: -1, expectedRevision: 0 }] })).status, 400);
  assert.equal((await (await call()).json()).values['2026-08-01'], 7);
  const result = await (await call('PUT', { date: '2026-08-01', value: null, expectedRevision: 0 })).json();
  assert.equal(result.values['2026-08-01'], 6);
});

test('revision comparison is per field, not unrelated SharePoint sync time', () => {
  assert.equal(revisionConflict('rsa', { date: '2026-08-01', field: 'rsaFuel', expectedRevision: 0 }, { revisions: { '2026-08-01:rsaJumpstart': 3 } }), 0);
  assert.deepEqual(changedEntries('b2w', { values: { d: 0 } }, { values: { d: 0 }, updatedAt: 'later' }), []);
  assert.equal(validManualReport('indonesia', { daily: { pitstop: 'Cengkareng', totalLead: -1 } }), false);
});
