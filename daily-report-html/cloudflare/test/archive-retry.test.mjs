import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('failed archive batches resume without deleting or resending completed months', async () => {
  const script = fs.readFileSync(new URL('../../src/data-upload-centre.js', import.meta.url), 'utf8').replace("  if (document.readyState === 'loading')", "  window.publishArchiveMonths = publishArchiveMonths;\n  if (document.readyState === 'loading')");
  const calls = [], stored = new Map([['2025-12', [{ sales: 1 }]]]);
  let fail = true;
  const context = { window: { location: { protocol: 'https:' } }, document: { readyState: 'loading', addEventListener() {} }, fetch: async (_, options) => {
    assert.equal(options.method, 'PUT', 'archive imports must never clear the entire store');
    const body = JSON.parse(options.body); calls.push(body.month);
    if (body.month === '2026-02' && fail) return Response.json({ error: 'Temporary outage' }, { status: 503 });
    stored.set(body.month, body.rows);
    return Response.json({ ok: true });
  } };
  vm.runInNewContext(script, context);
  const archive = { sourceFile: 'test.xlsx', months: { '2026-01': [{ sales: 2 }], '2026-02': [{ sales: 3 }], '2026-03': [{ sales: 4 }] } };
  await assert.rejects(() => context.window.publishArchiveMonths(archive, () => {}), /outage/);
  assert.equal(stored.has('2025-12'), true);
  fail = false;
  await context.window.publishArchiveMonths(archive, () => {});
  assert.deepEqual(calls, ['2026-01', '2026-02', '2026-02', '2026-03']);
  await context.window.publishArchiveMonths(archive, () => {});
  assert.equal(calls.length, 4);
  assert.equal(stored.size, 4);
});
