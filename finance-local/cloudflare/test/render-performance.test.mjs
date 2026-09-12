import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const source = name => {
  const start = html.indexOf(`      function ${name}(`);
  return html.slice(start, html.indexOf('\n      }', start) + 8);
};
test('timestamp rendering reuses one formatter for a large API table', () => {
  let constructions = 0;
  const context = vm.createContext({ Intl: { DateTimeFormat: function (...args) { constructions++; return new Intl.DateTimeFormat(...args); } } });
  vm.runInContext(source('formatGrafanaTimestamp'), context);
  for (let i = 0; i < 10000; i++) assert.equal(context.formatGrafanaTimestamp(1788739140000), '2026-09-06 23:59:00');
  assert.equal(constructions, 1);
});
test('single-pass date range matches sorting without modifying API rows', () => {
  let data = [8, null, 3, 12, 3, -4];
  const context = vm.createContext({ rows: () => data, rowTimestamp: value => value, formatFinanceDate: String });
  vm.runInContext(source('periodLabel'), context);
  assert.equal(context.periodLabel({ id: 'test' }), '-4 - 12');
  assert.deepEqual(data, [8, null, 3, 12, 3, -4]);
  data = [null];
  assert.equal(context.periodLabel({ id: 'test' }), 'No valid dates');
});
