import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);

test('daily sales trend renders every x-axis label as a day number', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const chartStart = source.indexOf('function trendSvg(rows, benchmark)');
  const chartEnd = source.indexOf('function regionSummary', chartStart);
  const chartSource = source.slice(chartStart, chartEnd);

  assert.match(source, /function trendDayLabel\(iso\)/);
  assert.match(source, /return match \? String\(Number\(match\[1\]\)\) : formatDate\(iso\);/);
  assert.match(chartSource, /trendDayLabel\(row\.date\)/);
  assert.doesNotMatch(chartSource, /rows\.forEach\(function\(row, index\) \{ if \(rows\.length <= 14 \|\| index % 2 === 0/);
});
