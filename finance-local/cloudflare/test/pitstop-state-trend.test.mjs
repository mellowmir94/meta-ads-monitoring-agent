import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../../package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../../recharts-bridge.jsx', import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function declaration(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n      function ', start + 1));
}

function appSetup() {
  const chart = { group: 'day', hiddenSeries: {} };
  const hosts = [];
  const sandbox = {
    rowTimestamp: (row) => row.date ? new Date(`${row.date}T12:00:00`).getTime() : null,
    commissionState: (row) => row.state,
    numberValue: (value) => Number(value) || 0,
    chartState: () => chart,
    formatMoney: (value) => `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formatFinanceDate: (date) => date,
    esc: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    financeVChartAvailable: () => true,
    vchartHostMarkup: (...args) => { hosts.push(args); return '<div>CHART</div>'; },
  };
  vm.createContext(sandbox);
  vm.runInContext(['dateBucket', 'commissionStateColor', 'pitstopStateTrendModel', 'pitstopTrendHighlights', 'channelShareChart'].map(declaration).join('\n'), sandbox);
  return { ...sandbox, chart, hosts };
}

function bridgeSetup() {
  const sandbox = { require, module: { exports: {} }, exports: {}, window: {} };
  const code = transformSync(bridge, { loader: 'jsx', format: 'cjs' }).code;
  vm.runInNewContext(`${code}\nmodule.exports = { PitstopStateTrendView, PitstopTrendTooltip, pitstopTrendDateLabel, TrendView, fallbackColors };`, sandbox);
  return sandbox.module.exports;
}

const rows = Array.from({ length: 15 }, (_, day) => ['Selangor', 'Kuala Lumpur', 'Johor', 'Pahang', 'Melaka', 'Perak', 'Kedah'].map((state, index) => ({
  state, date: `2026-08-${String(day + 1).padStart(2, '0')}`, net_sales: (7 - index) * (day + 1),
}))).flat();

test('top-five plus Other and latest-12 data retain the existing trend calculation', () => {
  const api = appSetup();
  const before = JSON.stringify(rows);
  const model = api.pitstopStateTrendModel(rows, 'day');
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(plain(model.series), ['Selangor', 'Kuala Lumpur', 'Johor', 'Pahang', 'Melaka', 'Other states']);
  assert.equal(model.periodCount, 15);
  assert.equal(model.data.length, 12);
  assert.equal(model.data[0].date, '2026-08-04');
  for (const bucket of model.data) {
    const day = Number(bucket.date.slice(-2));
    assert.deepEqual(plain(bucket.values), { Selangor: 7 * day, 'Kuala Lumpur': 6 * day, Johor: 5 * day, Pahang: 4 * day, Melaka: 3 * day, 'Other states': 3 * day });
  }
  assert.deepEqual(plain(model.highest), [['Selangor', 840]]);
  assert.deepEqual(plain(model.lowest), [['Kedah', 120]]);
  assert.equal(model.total, 3360);
  assert.match(api.pitstopTrendHighlights(model), /Lowest state[\s\S]*Kedah[\s\S]*In Other states/);
});

test('full-period ranking is independent of visible window, grouping and latest point', () => {
  const api = appSetup();
  const data = [...rows, { state: 'Kedah', date: '2026-08-01', net_sales: 5000 }, { state: 'Unmapped', date: '2026-08-15', net_sales: 90000 }, { state: 'Selangor', date: null, net_sales: 999999 }];
  for (const group of ['day', 'week', 'month']) {
    const model = api.pitstopStateTrendModel(data, group);
    assert.deepEqual(plain(model.highest), [['Kedah', 5120]], `${group}: rank before latest12 and Other`);
    assert.deepEqual(plain(model.lowest), [['Perak', 240]]);
    assert.equal(model.total, 98360, 'includes Unmapped but excludes rows without a date, as before');
  }
});

test('one state, tied cents, genuine zero/negative totals and unmapped-only scopes are explicit', () => {
  const api = appSetup();
  const data = (amounts) => amounts.map(([state, net_sales]) => ({ state, net_sales, date: '2026-08-01' }));
  const one = api.pitstopStateTrendModel(data([['Selangor', 250]]), 'day');
  assert.match(api.pitstopTrendHighlights(one), /Only mapped state/);
  assert.doesNotMatch(api.pitstopTrendHighlights(one), /Lowest state/);
  const tied = api.pitstopStateTrendModel(data([['Selangor', 100.001], ['Johor', 100.002]]), 'day');
  assert.equal(tied.allTied, true);
  assert.match(api.pitstopTrendHighlights(tied), /All mapped states tied/);
  const signed = api.pitstopStateTrendModel(data([['Selangor', 0], ['Johor', -250]]), 'day');
  assert.deepEqual(plain(signed.highest), [['Selangor', 0]]);
  assert.deepEqual(plain(signed.lowest), [['Johor', -250]]);
  const unknown = api.pitstopStateTrendModel(data([['Unmapped', 0]]), 'day');
  assert.equal(unknown.mappedCount, 0);
  assert.match(api.pitstopTrendHighlights(unknown), /Unmapped only/);
  assert.equal(api.pitstopStateTrendModel([], 'day').data.length, 0);
});

test('legend visibility changes only plotted series and retains controls when all are hidden', () => {
  const api = appSetup();
  const panel = { id: 'daily-sales-hq-dealer-overview' };
  api.chart.hiddenSeries.Selangor = true;
  const markup = api.channelShareChart(panel, rows);
  const [, kind, payload] = api.hosts[0];
  assert.equal(kind, 'pitstop-state-trend');
  assert.ok(payload.values.every((item) => item.series !== 'Selangor'));
  assert.equal(payload.seriesColors['Kuala Lumpur'], '#0ea5e9', 'palette is independent of visibility');
  assert.match(markup, /data-chart-series-value="Selangor" aria-pressed="false"/);
  assert.match(markup, /Period net sales[\s\S]*RM 3,360\.00/);
  assert.match(markup, /Latest 12 daily periods/);
  for (const name of api.pitstopStateTrendModel(rows, 'day').series) api.chart.hiddenSeries[name] = true;
  const hidden = api.channelShareChart(panel, rows);
  assert.match(hidden, /All state lines are hidden/);
  assert.equal((hidden.match(/data-chart-series-value=/g) || []).length, 6);
  assert.equal(api.hosts.length, 1, 'do not mount empty chart');
  assert.match(hidden, /Period net sales[\s\S]*RM 3,360\.00/);
  const handler = html.slice(html.indexOf('const chartSeries = event.target.closest'), html.indexOf('const chartSeries = event.target.closest') + 850);
  assert.match(handler, /settings\.hiddenSeries\[key\]/);
  assert.doesNotMatch(handler, /state\.filters|statusSelection|settings\.selection|downloadChart/);
  assert.match(handler, /focus\(\{ preventScroll: true \}\)/);
});

test('highlight swatches share the exact palette index used by fallback-colour states', () => {
  const api = appSetup();
  const data = [{ state: 'Selangor', date: '2026-08-01', net_sales: 500 }, { state: 'Putrajaya', date: '2026-08-01', net_sales: 250 }];
  const markup = api.channelShareChart({ id: 'daily-sales-hq-dealer-overview' }, data);
  const payload = api.hosts[0][2];
  const color = payload.seriesColors.Putrajaya;
  assert.match(markup, new RegExp(`title="Putrajaya"><i style="background:${color}"`));
  assert.match(markup, new RegExp(`--legend-color:${color}" data-chart-series="[^"]+" data-chart-series-value="Putrajaya"`));
});

test('state chart renders matching line/fill/dot colours and keeps signed values, including one period', () => {
  const api = bridgeSetup();
  const input = { colors: api.fallbackColors, payload: { group: 'day', highlightStates: ['Selangor'], seriesColors: { Selangor: '#2563eb', Johor: '#d97706' },
    values: [{ date: '2026-08-01', series: 'Selangor', value: 250 }, { date: '2026-08-01', series: 'Johor', value: -50 },
      { date: '2026-08-02', series: 'Selangor', value: 300 }, { date: '2026-08-02', series: 'Johor', value: 0 }] } };
  for (const [width, height] of [[1000, 440], [460, 320], [320, 300]]) {
    const chart = api.PitstopStateTrendView(input).props.children;
    const markup = renderToStaticMarkup(React.cloneElement(chart, { width, height }));
    assert.equal(chart.props.accessibilityLayer, true);
    assert.equal(chart.props.data[0].Selangor, 250);
    assert.equal(chart.props.data[0].Johor, -50);
    const parts = React.Children.toArray(chart.props.children);
    for (const [name, color] of Object.entries(input.payload.seriesColors)) {
      const line = parts.find((child) => child.props.name === name && child.props.stroke !== 'none');
      const area = parts.find((child) => child.props.name === name && child.props.stroke === 'none');
      assert.equal(line.props.stroke, color);
      assert.equal(line.props.dot.fill, color);
      assert.equal(area.props.fill, color);
      assert.equal(area.props.tooltipType, 'none');
      assert.match(markup, new RegExp(`stroke="${color}"`));
      assert.match(markup, new RegExp(`fill="${color}"`));
    }
    assert.equal((markup.match(/class="recharts-dot recharts-line-dot"/g) || []).length, 4);
    assert.doesNotMatch(markup, /NaN|Infinity/);
  }
  const single = api.PitstopStateTrendView({ ...input, payload: { ...input.payload, values: input.payload.values.slice(0, 2) } }).props.children;
  const markup = renderToStaticMarkup(React.cloneElement(single, { width: 460, height: 320 }));
  assert.equal((markup.match(/class="recharts-dot recharts-line-dot"/g) || []).length, 2, 'single period has visible points');
});

test('shared tooltip has readable dates, one row per visible state and exact RM amounts', () => {
  const api = bridgeSetup();
  const payload = [
    { dataKey: 'Kuala_Lumpur', name: 'Kuala Lumpur', value: 12345.67, color: '#0ea5e9' },
    { dataKey: 'Kuala_Lumpur', name: 'Kuala Lumpur', value: 12345.67, color: '#0ea5e9' },
    { dataKey: 'Johor', name: 'Johor', value: -250, color: '#d97706' },
    { dataKey: 'Melaka', name: 'Melaka', value: null },
  ];
  const markup = renderToStaticMarkup(api.PitstopTrendTooltip({ active: true, label: '2026-08', group: 'month', payload }));
  assert.match(markup, /Aug 2026/);
  assert.equal((markup.match(/Kuala Lumpur/g) || []).length, 1);
  assert.match(markup, /RM 12,345\.67/);
  assert.match(markup, /RM -250\.00/);
  assert.doesNotMatch(markup, /Melaka/);
  assert.match(markup, /background:#0ea5e9/);
  assert.equal(api.pitstopTrendDateLabel('2026-08-03', 'week'), 'Week of 3 Aug 2026');
  assert.equal(api.PitstopTrendTooltip({ active: false, payload }), null);
});

test('scoped renderer avoids dense ranking height and leaves generic trends untouched', () => {
  assert.match(declaration('vchartHostMarkup'), /valueCount > 20 && kind !== "pitstop-state-trend"/);
  assert.match(html, /data-vchart-kind="pitstop-state-trend"[\s\S]*?min-height: 300px/);
  const api = bridgeSetup();
  const regular = api.TrendView({ payload: { values: [{ date: 'A', series: 'Value', value: 1 }] }, colors: api.fallbackColors }).props.children;
  const line = React.Children.toArray(regular.props.children).find((child) => child.props.dataKey === 'Value');
  assert.equal(line.props.dot, false);
  assert.equal(line.props.strokeWidth, 2.5);
  assert.equal(html, readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'));
});
