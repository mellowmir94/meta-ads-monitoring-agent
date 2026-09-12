import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function functionSource(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  return html.slice(start, html.indexOf('\n      }', start) + 8);
}

test('Commission Rider Excel created_at and request_at match the visible table timestamp', () => {
  const context = vm.createContext({ Intl, Date });
  vm.runInContext(
    `${functionSource('formatGrafanaTimestamp')}\n${functionSource('financeExcelCellValue')}`,
    context
  );

  for (const key of ['created_at', 'request_at']) {
    const column = { key, value: (row) => row[key] };
    for (const value of [
      Date.parse('2026-09-06T15:30:00Z'),
      Date.parse('2026-09-06T15:30:00Z') / 1000,
      '2026-09-06T15:30:00.123Z',
      '2026-09-06 15:30:00'
    ]) {
      const row = { [key]: value };
      assert.equal(
        context.financeExcelCellValue(column, row, 'Commission Rider'),
        context.formatGrafanaTimestamp(value)
      );
    }
  }
});

test('Excel writer passes every cell through the export display formatter', () => {
  const start = html.indexOf('      async function downloadExcelTable(');
  const end = html.indexOf('      function renderWithColumnMenuOpen(', start);
  const source = html.slice(start, end);
  assert.match(source, /xlsxCellXml\(financeExcelCellValue\(column, row, payload\.panelTitle\)/u);
});
