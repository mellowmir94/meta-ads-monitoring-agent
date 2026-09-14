import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('all PDF table sections inherit centred cell alignment', () => {
  const pdf = html.slice(html.indexOf('      async function downloadPdfTable('), html.indexOf('      async function exportFinanceTable('));
  assert.match(pdf, /styles: \{ font: "helvetica", halign: "center", valign: "middle"/);
  assert.doesNotMatch(pdf, /(?:headStyles|bodyStyles|footStyles): \{[^}]*halign: "(?:left|right)"/);
});
test('PDF export remains available when the optional Bateriku logo cannot be decoded', () => {
  const pdf = html.slice(html.indexOf('      async function downloadPdfTable('), html.indexOf('      async function exportFinanceTable('));
  assert.match(pdf, /let logo = null;[\s\S]*?try \{\s*logo = await financePdfLogo\(\);[\s\S]*?catch \(error\)/u);
  assert.match(pdf, /if \(logo\) doc\.addImage\(logo, "PNG", 28, 16, 122, 18\.8\);[\s\S]*?else \{[\s\S]*?BATERIKU\.COM/u);
});
test('Applied deductions PDF total uses an amber row distinct from other footer rows', () => {
  const pdf = html.slice(html.indexOf('      async function downloadPdfTable('), html.indexOf('      async function exportFinanceTable('));
  assert.match(pdf, /didParseCell: \(data\) => \{[\s\S]*?label === "APPLIED DEDUCTIONS"/u);
  assert.match(pdf, /data\.cell\.styles\.fillColor = \[217, 149, 47\]/u);
});
const source = name => {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0);
  return html.slice(start, html.indexOf('\n      }', start) + 8);
};
test('PDF request_at matches the table date-time format for seconds and milliseconds', () => {
  const context = vm.createContext({});
  vm.runInContext(source('formatGrafanaTimestamp') + '\n' + source('financePdfCellValue'), context);
  for (const key of ['created_at', 'request_at']) {
  const column = { key, value: row => row.value };
  for (const value of [Date.parse('2026-09-06T15:30:00Z'), Date.parse('2026-09-06T15:30:00Z') / 1000]) {
    assert.equal(context.financePdfCellValue(column, { value }), '2026-09-06\n15:30:00');
    assert.equal(context.financePdfCellValue(column, { value: String(value) }), '2026-09-06\n15:30:00');
  }
  assert.equal(context.financePdfCellValue(column, { value: '2026-09-06 12:34:56' }), '2026-09-06\n12:34:56');
  assert.equal(context.financePdfCellValue(column, { value: null }), '');
  // Live Grafana API sample: order 3288497, dashboard timezone utc.
  assert.equal(context.financePdfCellValue(column, { value: 1788739140000 }), '2026-09-06\n23:59:00');
  for (const value of ['2026-09-06T12:34:56.123Z', 1788710400000, '2026-09-06 23:59:59']) {
    assert.equal(context.financePdfCellValue(column, { value }).replace('\n', ' '), context.formatGrafanaTimestamp(value));
  }
  }
  assert.equal(context.financePdfCellValue({ key: 'commission', value: () => 35 }, {}), '35');
});
