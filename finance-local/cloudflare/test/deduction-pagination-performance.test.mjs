import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { DeductionRegister } from '../src/deductions.js';

const frontend = readFileSync(new URL('../../deductions.js', import.meta.url), 'utf8');

test('a complete 600-record History loads in two bounded pages without losing or modifying records', async () => {
  const records = new Map(Array.from({ length: 600 }, (_, index) => {
    const id = 'case-' + String(index).padStart(4, '0');
    return ['record:' + id, { id, status: 'applied', rider: 'Rider A', amountCents: 2500, creatorSession: 'private-session', installments: [] }];
  }));
  let reads = 0;
  const storage = {
    transaction: async fn => fn(storage),
    list: async ({ prefix, startAfter, limit }) => new Map([...records].filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).slice(0, limit)),
    put: async () => assert.fail('existing applied records must not be changed during a performance read')
  };
  const register = new DeductionRegister({ storage });
  const request = async path => {
    reads++;
    const response = await register.fetch(new Request('https://register/' + path, { headers: { 'x-deduction-session': 'test', 'x-deduction-user': 'Finance' } }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const context = vm.createContext({ deductionState: { loaded: false, records: [] }, deductionRequest: request });
  vm.runInContext(frontend.slice(frontend.indexOf('async function deductionLoad('), frontend.indexOf('function deductionAddDays(')), context);
  await context.deductionLoad();
  assert.equal(reads, 2, 'the full History read must not require six serialized round trips');
  assert.equal(context.deductionState.records.length, 600);
  assert.equal(new Set(context.deductionState.records.map(record => record.id)).size, 600);
  assert.ok(context.deductionState.records.every(record => !('creatorSession' in record)));
  assert.equal(records.size, 600);
});

test('History read page size stays bounded and rejects invalid limits', async () => {
  const register = new DeductionRegister({ storage: { transaction: () => assert.fail('invalid page size must not reach storage') } });
  for (const limit of ['0', '-1', '501', '1.5', 'all']) {
    const response = await register.fetch(new Request('https://register/?limit=' + limit, { headers: { 'x-deduction-session': 'test', 'x-deduction-user': 'Finance' } }));
    assert.equal(response.status, 400);
  }
});
