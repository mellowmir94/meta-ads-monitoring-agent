import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);
const cssPath = new URL('../../src/dashboard.css', import.meta.url);

test('RSA, B2W, and ResQ charts use day-only x-axis labels with a right-aligned month', async () => {
  const [source, css] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);

  const dateLabelStart = source.indexOf('function serviceChartDateLabel(iso)');
  const dateLabelEnd = source.indexOf('function serviceChartMonthLabel(rows)', dateLabelStart);
  const dateLabelSource = source.slice(dateLabelStart, dateLabelEnd);
  const xAxisStart = source.indexOf('function serviceXMarkup(rows, x, labelY, monthX, monthY)');
  const xAxisEnd = source.indexOf('function serviceStackedSvg', xAxisStart);
  const xAxisSource = source.slice(xAxisStart, xAxisEnd);

  assert.match(dateLabelSource, /return String\(Number\(match\[3\]\)\);/);
  assert.doesNotMatch(dateLabelSource, /months = \[/);
  assert.match(source, /function serviceChartMonthLabel\(rows\)/);
  assert.match(xAxisSource, /text-anchor="middle"/);
  assert.match(xAxisSource, /service-month-axis/);
  assert.match(source, /serviceXMarkup\(rows, x, height - 30, width - pad\.right, height - 8\)/);
  assert.match(css, /\.service-month-axis \{ fill: #18304a; font-size: 10px; font-weight: 900; \}/);
});
