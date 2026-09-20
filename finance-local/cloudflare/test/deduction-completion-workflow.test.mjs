import test from 'node:test';
import assert from 'node:assert/strict';
import { installmentCompleted, batchStage, installmentMatches } from '../src/deduction-workflow.js';
const plan = (count, done = 0) => ({ status: 'applied', installments: Array.from({length:count}, (_,i) => ({ status: 'applied', dueDate: '2026-09-21', completion: i < done ? {state:'completed'} : undefined })) });
test('legacy applied or statement-sent records never become completed automatically', () => {
  const record = plan(4); record.installments.forEach(item => item.statementSentAt = '2026-09-01');
  assert.equal(batchStage([record]), 'active');
  assert.equal(installmentCompleted(record.installments[3]), false);
});
test('mixed deduction plans complete independently; whole batch waits for every active installment', () => {
  assert.equal(batchStage([plan(2,2), plan(4,2)]), 'active');
  assert.equal(batchStage([plan(2,2), plan(7,7)]), 'completed');
  const reopened = plan(7,7); reopened.installments[6].completion.state = 'reopened';
  assert.equal(batchStage([plan(2,2), reopened]), 'active');
  assert.equal(batchStage([{...plan(2),status:'cancelled'}]), 'inactive');
});
test('number filters follow saved payment sequence independently of total or month calendar week', () => {
  for (const count of [2,4,7]) {
    const items = plan(count).installments;
    assert.equal(items.filter((item,i) => installmentMatches(item,i,count,{installment:'exact:2'})).length, 1);
    assert.equal(items.filter((item,i) => installmentMatches(item,i,count,{installment:'later'})).length, count-1);
    assert.equal(items.filter((item,i) => installmentMatches(item,i,count,{installment:'final'})).length, 1);
  }
});
test('month and date range filter the same installment as the payment number', () => {
  assert.equal(installmentMatches({status:'applied',dueDate:'2026-10-01'},1,4,{month:'2026-09',installment:'exact:2'}),false);
  assert.equal(installmentMatches({status:'applied',dueDate:'2026-09-21'},1,7,{month:'2026-09',dueStart:'2026-09-21',dueEnd:'2026-09-27',installment:'exact:2'}),true);
});
