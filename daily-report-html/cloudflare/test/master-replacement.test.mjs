import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../src/master-review.js', import.meta.url), 'utf8'), context);
const row = (Branch, Tier = 1) => ({ Branch, Tier, State: 'Selangor', Type: 'HQ', branch_status: 'active', Country: 'Malaysia' });

test('Master replacement keeps the last duplicate and reviews the rows that will be saved', () => {
  const uploaded = [row('HQ SS19'), row('HQ NEW'), row(' hq ss19 ', 2)];
  const report = context.MasterReview.review([row('HQ SS19'), row('HQ OLD')], uploaded);
  assert.equal(report.canConfirm, true);
  assert.equal(report.requiresAcknowledgement, true);
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0].Tier, 2);
  assert.equal(report.counts.changed, 1);
  assert.equal(report.counts.added, 1);
  assert.equal(report.counts.removed, 1);
  assert.equal(report.duplicates.length, 1);
  assert.equal(uploaded.length, 3);
});

test('Master replacement still validates the winning row and an empty file', () => {
  assert.equal(context.MasterReview.review([], [row('HQ SS19'), { ...row('HQ SS19'), State: '' }]).canConfirm, false);
  assert.equal(context.MasterReview.review([], []).canConfirm, false);
  assert.equal(context.MasterReview.review([], [{ ...row('HQ SS19'), State: '' }, row('HQ SS19')]).canConfirm, true);
});
