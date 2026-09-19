import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

test('FinSight is placed above Commission and limited to Commission plus History', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.ok(html.indexOf('data-tab="finsight"') < html.indexOf('data-tab="commission"'));
  assert.match(html, /Commission Rider \+ Deduction History/);
  assert.doesNotMatch(html.match(/<section class="section tab-panel finsight-ledger"[\s\S]*?<\/section>/)?.[0] || '', /Reimbursement|Branch Overview|HQ &amp; Dealer Overview/);
  assert.match(html, /window\.ledgerFinSightBridge/);
  assert.match(html, /deductionHistory:/);
});

test('FinSight API uses an authenticated private service binding', async () => {
  const worker = await readFile(new URL('cloudflare/src/worker.js', root), 'utf8');
  const config = await readFile(new URL('cloudflare/wrangler.jsonc', root), 'utf8');
  assert.match(worker, /url\.pathname === "\/api\/finsight-chat"/);
  assert.match(worker, /x-finance-agent-secret/);
  assert.match(config, /"binding": "FINANCE_AGENT"/);
});

