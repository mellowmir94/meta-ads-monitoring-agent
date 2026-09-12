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

test('date range trigger names every matching quick range', () => {
  const context = vm.createContext({ Date });
  vm.runInContext([
    'isoLocalDate',
    'financeCalendarDate',
    'normalizeFinanceBoundary',
    'fullDayFinanceRange',
    'financeQuickRange',
    'financeQuickRangeLabel'
  ].map(functionSource).join('\n'), context);

  const now = new Date('2026-09-11T08:00:00Z');
  const expected = {
    today: 'Today',
    yesterday: 'Yesterday',
    'this-week': 'This week',
    'last-week': 'Last week (Mon–Sun)',
    'this-month': 'This month',
    'previous-month': 'Previous month'
  };
  for (const [key, label] of Object.entries(expected)) {
    assert.equal(context.financeQuickRangeLabel(context.financeQuickRange(key, now), now), label);
  }
  assert.equal(context.financeQuickRangeLabel({ start: '2026-08-02 00:00:00', end: '2026-08-05 23:59:59' }, now), '');
});

test('date range trigger displays the quick-range label while retaining exact dates in its title', () => {
  const start = html.indexOf('      function filtersMarkup(');
  const end = html.indexOf('\n      let renderRowsCache', start);
  const source = html.slice(start, end);
  assert.match(source, /financeQuickRangeLabel\(appliedDates\)/u);
  assert.match(source, /title="\$\{esc\(`\$\{financeBoundaryLabel\(appliedDates\.start\)\} to \$\{financeBoundaryLabel\(appliedDates\.end, true\)\}`\)\}"/u);
});
