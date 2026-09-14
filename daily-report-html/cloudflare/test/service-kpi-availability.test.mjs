import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);
const source = await readFile(dashboardPath, 'utf8');
const statsStart = source.indexOf('  function serviceAvailableStats(rows, keys)');
const statsEnd = source.indexOf('  function dataQualityMarkup()', statsStart);
const context = vm.createContext({ Number });
vm.runInContext(source.slice(statsStart, statsEnd), context);

const rows = [
  [19, 12, 3, 43],
  [30, 23, 3, 92],
  [23, 24, 4, 60],
  [28, 19, 4, 37],
  [39, 24, 1, 32],
  [34, 21, 4, 30]
].map(([rsaJumpstart, rsaTyrePatch, rsaFuel, b2w], index) => ({
  date: `2026-09-0${index + 1}`,
  rsaJumpstart,
  rsaTyrePatch,
  rsaFuel,
  b2w
}));
rows.push({ date: '2026-09-07', rsaJumpstart: NaN, rsaTyrePatch: NaN, rsaFuel: NaN, b2w: NaN });

test('service KPI totals use confirmed days without treating missing days as zero', () => {
  const rsa = context.serviceAvailableStats(rows, ['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel']);
  const b2w = context.serviceAvailableStats(rows, ['b2w']);

  assert.equal(rsa.total, 315);
  assert.equal(rsa.average, 52.5);
  assert.equal(rsa.count, 6);
  assert.equal(rsa.latest.row.date, '2026-09-06');
  assert.equal(b2w.total, 294);
  assert.equal(b2w.count, 6);
  assert.equal(b2w.latest.value, 30);
});

test('service KPI totals remain unavailable when no day is confirmed', () => {
  const stats = context.serviceAvailableStats([{ date: '2026-09-07', b2w: NaN }], ['b2w']);
  assert.ok(Number.isNaN(stats.total));
  assert.ok(Number.isNaN(stats.average));
  assert.equal(stats.count, 0);
  assert.equal(stats.latest, null);
});

test('B2W latest-day outline follows the latest confirmed bar', () => {
  const columnStart = source.indexOf('function serviceColumnSvg(rows, key, max, step, ariaLabel)');
  const columnEnd = source.indexOf('function serviceWarrantySvg', columnStart);
  const columnSource = source.slice(columnStart, columnEnd);

  assert.match(columnSource, /latestAvailableIndex = rows\.reduce/);
  assert.match(columnSource, /index === latestAvailableIndex \? ' is-latest'/);
  assert.doesNotMatch(columnSource, /index === values\.length - 1 \? ' is-latest'/);
});

test('page-level RSA and ResQ KPI cards follow their chart filters', () => {
  const summaryStart = source.indexOf('  function serviceSummaryMarkupClean(rows, rsaSeries, resqSeries)');
  const summaryEnd = source.indexOf('  function dataQualityMarkup()', summaryStart);
  const summaryContext = vm.createContext({
    Number,
    formatDate: value => value,
    formatNumber: value => Number.isNaN(value) ? 'N/A' : String(Math.round(value)),
    escapeHtml: value => String(value)
  });
  vm.runInContext(source.slice(summaryStart, summaryEnd), summaryContext);

  const filteredRows = [
    { date: '2026-09-01', rsaJumpstart: 19, rsaTyrePatch: 12, rsaFuel: 3, b2w: 43, resQSelangor: 7, resQJb: 0, resQPahang: 1, resQPenang: 1, warranty1st: 100, warranty2nd: 1, warranty3rd: 0 },
    { date: '2026-09-02', rsaJumpstart: 30, rsaTyrePatch: 23, rsaFuel: 3, b2w: 92, resQSelangor: 1, resQJb: 2, resQPahang: 2, resQPenang: 0, warranty1st: 100, warranty2nd: 0, warranty3rd: 0 }
  ];
  const tyrePatch = [{ key: 'rsaTyrePatch', label: 'Tyre Patch' }];
  const johorBahru = [{ key: 'resQJb', label: 'JB' }];
  const html = summaryContext.serviceSummaryMarkupClean(filteredRows, tyrePatch, johorBahru);

  assert.match(html, /Tyre Patch total[\s\S]*35 units/);
  assert.match(html, /ResQ JB[\s\S]*2 units/);
  assert.doesNotMatch(html, /Total RSA/);
  assert.doesNotMatch(html, /Total ResQ/);
  assert.match(source, /serviceSummaryMarkupClean\(rows, visibleRsaSeries, resqSeries\)/);
});
