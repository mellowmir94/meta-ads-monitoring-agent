import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);

test('RSA, B2W and ResQ charts use compact deltas against the preceding calendar day', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const priorValueStart = source.indexOf('function serviceChartPriorValue(date, key)');
  const priorValueEnd = source.indexOf('function serviceChartDeltaText(delta)', priorValueStart);
  const priorValueSource = source.slice(priorValueStart, priorValueEnd);
  const columnStart = source.indexOf('function serviceColumnSvg(rows, key, max, step, ariaLabel)');
  const columnEnd = source.indexOf('function renderServicesEnhanced()', columnStart);
  const columnSource = source.slice(columnStart, columnEnd);

  assert.match(source, /function priorServiceChartDate\(iso\)/);
  assert.match(priorValueSource, /priorServiceChartDate\(date\)/);
  assert.match(priorValueSource, /if \(key === 'b2w'\) return hasManualB2w\(priorDate\) \? manualB2wValue\(priorDate\) : null;/);
  assert.match(source, /syncHostedResq\(priorServiceChartDate\(state\.from\), state\.to, selectedRangeKey\(\)\)/);
  assert.match(source, /function serviceChartDeltaText\(delta\) \{\s+return !Number\.isFinite\(delta\) \? 'N\/A' : \(delta > 0 \? '\+' : ''\) \+ formatNumber\(delta\);/);
  assert.match(source, /priorTotal = serviceChartPriorTotal\(row\.date, series\)/);
  assert.match(source, /'RSA breakdown by day', \{ enabled: true \}/);
  assert.doesNotMatch(source, /priorTotal: resqPriorTotal|totals\[index - 1\]/);
  assert.match(columnSource, /priorValue = serviceChartPriorValue\(rows\[index\]\.date, key\)/);
  assert.match(source, /comparison with prior day/);
  assert.doesNotMatch(columnSource, /First day/);
  assert.doesNotMatch(columnSource, /vs prior/);
});

const source = await readFile(dashboardPath, 'utf8');
const helpers = source.slice(source.indexOf('  function priorServiceChartDate(iso)'), source.indexOf('  function serviceControl(label, options)'));
function chartContext({ rsa = {}, b2w = {}, resq = [], resqReady = true } = {}) {
  const context = vm.createContext({
    state: { resqApiAvailable: resqReady, resqSyncRange: 'selected', grafanaResqRows: resq, data: { dailySales: [] } },
    HOSTED_MODE: true,
    selectedRangeKey: () => 'selected',
    hasManualB2w: date => Object.hasOwn(b2w, date),
    manualB2wValue: date => b2w[date],
    hasManualRsa: (date, field) => Object.hasOwn(rsa[date] || {}, field),
    manualRsaValue: (date, field) => rsa[date][field],
    numberValue: value => Number(value) || 0,
    formatNumber: value => Number(value).toLocaleString('en-US'),
    serviceLongDayLabel: date => date,
    escapeHtml: value => String(value)
  });
  vm.runInContext(helpers, context);
  return context;
}
const rsaSeries = ['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'].map(key => ({ key }));
const resqSeries = ['resQSelangor', 'resQJb', 'resQPahang', 'resQPenang'].map(key => ({ key }));

test('every month starts by comparing to the last calendar day of the previous month', () => {
  const chart = chartContext();
  const priorDays = ['2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30'];
  priorDays.forEach((prior, index) => assert.equal(chart.priorServiceChartDate(`2026-${String(index + 1).padStart(2, '0')}-01`), prior));
  assert.equal(chart.priorServiceChartDate('2024-03-01'), '2024-02-29');
  assert.equal(chart.priorServiceChartDate('2026-09-16'), '2026-09-15');
  assert.equal(chart.priorServiceChartDate('2026-99-01'), '');
  assert.equal(chart.priorServiceChartDate('2026-02-30'), '');
});

test('first September RSA, B2W and ResQ deltas use August 31 saved or queried values', () => {
  const chart = chartContext({
    rsa: { '2026-08-31': { rsaJumpstart: 18, rsaTyrePatch: 10, rsaFuel: 2 } },
    b2w: { '2026-08-31': 42 },
    resq: [{ date: '2026-08-31', resQSelangor: 10, resQJb: 2, resQPahang: 1, resQPenang: 0 }]
  });
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', rsaSeries), 30);
  assert.equal(chart.serviceChartDeltaText(34 - chart.serviceChartPriorTotal('2026-09-01', rsaSeries)), '+4');
  assert.equal(chart.serviceChartDeltaText(43 - chart.serviceChartPriorValue('2026-09-01', 'b2w')), '+1');
  assert.equal(chart.serviceChartDeltaText(9 - chart.serviceChartPriorTotal('2026-09-01', resqSeries)), '-4');
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', [rsaSeries[0]]), 18);
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', [resqSeries[0]]), 10);
});

test('missing prior days do not skip backwards or produce invented zero comparisons', () => {
  const chart = chartContext({ rsa: { '2026-08-31': { rsaJumpstart: 18, rsaTyrePatch: 10 } }, b2w: { '2026-08-30': 100 }, resqReady: false });
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', rsaSeries), null, 'partial RSA is not a total');
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', [rsaSeries[0]]), 18, 'selected RSA type can still be compared');
  assert.equal(chart.serviceChartPriorValue('2026-09-01', 'b2w'), null, 'do not compare with August 30');
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', resqSeries), null, 'unavailable ResQ must not be summed as zero');
  assert.equal(chart.serviceChartDeltaText(null), 'N/A');
  assert.equal(chart.serviceChartDeltaText(NaN), 'N/A');
  assert.match(chart.serviceChartDeltaMarkup('2026-09-01', null, 100, 20, 'b2w-delta'), /Previous day 2026-08-31: value unavailable/);
});

test('confirmed zero prior values remain valid comparisons', () => {
  const chart = chartContext({ rsa: { '2026-08-31': { rsaJumpstart: 0, rsaTyrePatch: 0, rsaFuel: 0 } }, b2w: { '2026-08-31': 0 } });
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', rsaSeries), 0);
  assert.equal(chart.serviceChartPriorValue('2026-09-01', 'b2w'), 0);
  assert.equal(chart.serviceChartPriorTotal('2026-09-01', resqSeries), 0, 'successful ResQ range with no cases is zero');
  assert.equal(chart.serviceChartDeltaText(0), '0');
  assert.equal(chart.serviceChartDeltaText(-3), '-3');
});
