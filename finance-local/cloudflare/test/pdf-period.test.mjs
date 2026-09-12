import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const source = name => {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0);
  return html.slice(start, html.indexOf('\n      }', start) + 8);
};
test('PDF uses applied date boundaries rather than timezone-shifted row dates', () => {
  const state = { dates: { commission: { start: '2026-08-31 00:00:00', end: '2026-09-06 23:59:59' } }, imports: {} };
  const context = vm.createContext({ state, panels: [{ id: 'commission' }, { id: 'snapshot', dateIndependent: true }] });
  vm.runInContext(source('formatFinanceDate') + '\n' + source('financePdfPeriod'), context);
  assert.equal(context.financePdfPeriod('commission', '31/08/2026 - 07/09/2026'), '31/08/2026 - 06/09/2026');
  state.imports.commission = { apiFrom: '2026-08-31T00:00:00Z', apiTo: '2026-09-06T23:59:59Z' };
  assert.equal(context.financePdfPeriod('commission', 'wrong'), '31/08/2026 - 06/09/2026');
  assert.equal(context.financePdfPeriod('snapshot', 'Current snapshot'), 'Current snapshot');
});
test('date correction is PDF-only and shared by original and copied exports', () => {
  assert.match(html, /if \(payload && format === "pdf"\) payload\.period = .*auditExportPeriod\(panelId, sourceKey, copyId, financePdfPeriod\(panelId, payload\.period\)\)/);
});
