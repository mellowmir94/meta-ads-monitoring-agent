import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function engine() {
  const sandbox = { window: {}, Intl, Date };
  vm.runInNewContext(await readFile(new URL('../public/assets/finsight-data.js', import.meta.url), 'utf8'), sandbox);
  return sandbox.window.LedgerFinSightData;
}
const records = Array.from({ length: 250 }, (_, i) => ({ id: 'D' + i, reference: 'DED-' + i, rider: 'Rider ' + i, type: 'epf', status: 'applied', amountCents: 2500, installmentCount: 4, installments: [
  { index: 0, dueDate: '2026-09-17', status: 'applied', statementSentAt: '2026-09-17' },
  { index: 1, dueDate: '2026-09-24', status: 'applied' }
] }));
test('screenshot question names every next-week rider beyond record 200 without an AI call or clipping', async () => {
  const api = await engine();
  const result = api.analyse({ question: 'payment installments such as 2/4 or 2/7 << how many left that is pending for the next week? can you name those people', records, today: '2026-09-20', rows: [], columns: [] });
  assert.match(result.answer, /250/);
  assert.match(result.answer, /Rider 249/);
  assert.match(result.answer, /2026-09-21.*2026-09-27/);
  assert.match(result.answer, /2\/4/);
  assert.match(result.answer, /6,250.00/);
  assert.ok(result.answer.length > 8000);
});
test('next-week report excludes reversed/cancelled/sent payments and respects actual per-payment amounts', async () => {
  const api = await engine();
  const result = api.analyse({ question: 'pending deductions next week', today: '2026-09-20', rows: [], columns: [], records: [
    { ...records[0], installments: [{ index: 1, dueDate: '2026-09-24', status: 'applied', amountCents: 1234 }] },
    { ...records[1], status: 'reversed' },
    { ...records[2], installments: [{ index: 1, dueDate: '2026-09-24', status: 'applied', statementSentAt: '2026-09-20' }] }
  ] });
  assert.match(result.answer, /12.34/);
  assert.doesNotMatch(result.answer, /Rider 1|Rider 2/);
});
test('retrieval finds a rider after record 200 and maps zero-based installments correctly', async () => {
  const api = await engine();
  const result = api.analyse({ question: 'Tell me about Rider 249', records, today: '2026-09-20', rows: [], columns: [] });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].payments[1].number, 2);
  assert.equal(result.records[0].payments[1].amountCents, 2500);
});
test('ranking includes commission rows beyond the former 80-row sample', async () => {
  const api = await engine();
  const rows = Array.from({ length: 100 }, (_, i) => ({ rider_name: 'Rider ' + i, commission: i }));
  const result = api.analyse({ question: 'Which riders have the highest commission?', records: [], rows, columns: [{ key: 'commission', money: true }], today: '2026-09-20' });
  assert.match(result.answer, /Rider 99/);
});
test('Malay and mixed-language questions receive a natural BM summary', async () => {
  const api = await engine();
  const result = api.analyse({ question: 'Berapa pending ansuran minggu depan? senaraikan rider', records, today: '2026-09-20' });
  assert.match(result.answer, /250 ansuran sepadan/);
  assert.match(result.answer, /penyata belum/);
});
test('10,000 records are analysed without the former 200-record sampling cap', async () => {
  const api = await engine();
  const many = Array.from({ length: 10000 }, (_, i) => ({ ...records[0], id: 'D' + i, reference: 'DED-' + i, rider: 'Rider ' + i }));
  const result = api.analyse({ question: 'pending deductions next week', records: many, today: '2026-09-20' });
  assert.match(result.answer, /10,000 matching installments/);
  assert.match(result.answer, /Rider 9999/);
});
