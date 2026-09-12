import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../../package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const source = readFileSync(new URL('../../recharts-bridge.jsx', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const statuses = ['Pending', 'Approved', 'Reversed / Failed', 'Paid / Completed', 'Cancelled', 'Unknown / Unavailable'];
const palette = ['#D99A00', '#2878C8', '#D64B4B', '#1F9D62', '#7B8A9A', '#8064C6'];
const amounts = [10987, 0, 250, 251393, 0, 0];

function setup() {
  const events = [];
  const sandbox = { require, module: { exports: {} }, exports: {},
    window: { dispatchEvent: (event) => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  const code = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
  vm.runInNewContext(`${code}\nmodule.exports = { CommissionStatusBar, commissionStatusDomain, RankedView, FinanceTooltip, fallbackColors };`, sandbox);
  const api = sandbox.module.exports;
  return { ...api, events, colors: { ...api.fallbackColors, text: '#DCEAF0' } };
}

function view(api, kind = 'commission-status-ranked', values = amounts) {
  return api.RankedView({ panelId: 'commission-main', kind, colors: api.colors, labels: true,
    payload: { values: statuses.map((label, index) => ({ label, value: values[index] })), colors: palette },
  }).props.children;
}

function shape(api, value, width, label = 'Reversed / Failed', extra = {}) {
  return api.CommissionStatusBar({ x: 160, y: 50, width, height: 36, fill: palette[2],
    payload: { label, value, ...extra }, panelId: 'commission-main', colors: api.colors });
}

test('RM250 retains its true rectangular width and a distinct marker only when too small to see', () => {
  const api = setup();
  const markup = renderToStaticMarkup(shape(api, 250, 18));
  assert.match(markup, /class="commission-status-value-bar"[^>]*width="18"[^>]*height="36"[^>]*fill="#D64B4B"/);
  assert.match(markup, /RM 250\.00/);
  assert.doesNotMatch(markup, /commission-status-zero-marker|commission-status-small-marker|commission-status-cap-break/);
  assert.doesNotMatch(source, /minPointSize/);
  const tiny = renderToStaticMarkup(shape(api, 250, 0.75));
  assert.match(tiny, /commission-status-value-bar[^>]*width="0\.75"[^>]*height="36"/);
  assert.match(tiny, /commission-status-small-marker/);
  assert.match(tiny, /Small amount marked with a diamond; bar length remains proportional/);
  assert.match(tiny, /RM 250\.00/);
  const negative = renderToStaticMarkup(shape(api, -250, -0.75));
  assert.match(negative, /commission-status-value-bar[^>]*x="159\.25"[^>]*width="0\.75"/);
  assert.match(negative, /RM -250\.00/);
});

test('zero is an outlined marker and RM0, never a positive bar', () => {
  const api = setup();
  const markup = renderToStaticMarkup(shape(api, 0, 0, 'Approved'));
  assert.match(markup, /commission-status-zero-marker[^>]*fill="none"/);
  assert.match(markup, /RM 0\.00/);
  assert.doesNotMatch(markup, /commission-status-value-bar|commission-status-small-marker/);
});

test('Pending and Paid lengths follow actual RM ratios across screens, even when both exceed the former cap', () => {
  const api = setup();
  for (const values of [amounts, [36000, 12000, 250, 250000, 0, 900], [80000, 0, 250, 20000, 0, 0]]) {
  for (const [width, height] of [[1100, 700], [700, 400], [600, 400]]) {
    const markup = renderToStaticMarkup(React.cloneElement(view(api, 'commission-status-ranked', values), { width, height }));
    const groups = [...markup.matchAll(/<g class="commission-status-bar"[^>]*>[\s\S]*?<\/g>/g)].map((match) => match[0]);
    assert.equal(groups.length, 6, `${width}px: six selectable statuses`);
    assert.equal((markup.match(/class="commission-status-zero-marker"/g) || []).length, values.filter((value) => value === 0).length);
    groups.forEach((group, index) => {
      assert.ok(group.includes(palette[index]), `${statuses[index]} retains its colour`);
      assert.ok(group.includes(`RM ${values[index].toLocaleString('en-MY', { minimumFractionDigits: 2 })}`));
      const labelX = Number(group.match(/class="commission-status-amount" x="([^"]+)"/)?.[1]);
      assert.ok(labelX > 0 && labelX <= width - 95, `${width}px: reserve room for amount text`);
    });
    const paidWidth = Number(groups[3].match(/class="commission-status-value-bar"[^>]*width="([^"]+)"/)?.[1]);
    const pendingWidth = Number(groups[0].match(/class="commission-status-value-bar"[^>]*width="([^"]+)"/)?.[1]);
    const smallWidth = Number(groups[2].match(/class="commission-status-value-bar"[^>]*width="([^"]+)"/)?.[1]);
    assert.ok(paidWidth > 0);
    assert.ok(smallWidth > 0, 'small amounts retain a real proportional bar');
    assert.ok(Math.abs(pendingWidth / paidWidth - values[0] / values[3]) < 1e-10, 'Pending/Paid matches its actual money ratio');
    assert.equal(pendingWidth < paidWidth, values[0] < values[3], 'larger amounts always draw longer bars');
    assert.ok(Math.abs(smallWidth / paidWidth - values[2] / values[3]) < 1e-10, 'no display cap or inflated minimum width');
    assert.match(groups[2], /commission-status-small-marker/);
    assert.match(groups[3], /height="36"/);
    assert.doesNotMatch(markup, /commission-status-cap-break|Bar capped/);
    assert.doesNotMatch(markup, /clip-path=/);
  }
  }
});

test('small bar, large bar and zero target dispatch the original status once by mouse or keyboard', () => {
  const api = setup();
  let stopped = 0, prevented = 0;
  const event = { stopPropagation: () => stopped++, preventDefault: () => prevented++ };
  const small = shape(api, 250, 0.75);
  small.props.onClick(event);
  small.props.onKeyDown({ ...event, key: 'Enter' });
  small.props.onKeyDown({ ...event, key: ' ' });
  small.props.onKeyDown({ ...event, key: 'Escape' });
  assert.equal(api.events.length, 3);
  assert.equal(stopped, 3, 'do not bubble into the chart and toggle the filter off');
  assert.equal(prevented, 2);
  api.events.forEach((entry) => {
    assert.equal(entry.type, 'finance-recharts-select');
    assert.equal(entry.detail.panelId, 'commission-main');
    assert.equal(entry.detail.value, 'Reversed / Failed');
  });
  shape(api, 0, 0, 'Approved').props.onClick(event);
  assert.equal(api.events[3].detail.value, 'Approved');
  const paid = shape(api, 251393, 400, 'Paid / Completed');
  paid.props.onClick(event);
  assert.equal(api.events[4].detail.value, 'Paid / Completed');
  assert.match(paid.props['aria-label'], /RM 251,393\.00\. Filter matching records/);
  assert.equal(small.props.role, 'button');
  assert.equal(small.props.tabIndex, 0);
  assert.match(small.props['aria-label'], /RM 250\.00/);
});

test('thicker status bars retain raw tooltip amounts and do not change other chart types', () => {
  const api = setup();
  const chart = view(api);
  const statusBar = React.Children.toArray(chart.props.children).find((child) => child.props.dataKey === 'value');
  assert.equal(statusBar.props.barSize, 36);
  assert.equal(typeof statusBar.props.shape, 'function');
  assert.deepEqual(Array.from(chart.props.data, (row) => row.value), amounts);
  assert.ok(chart.props.data.every((row) => !('plotValue' in row) && !('displayCapped' in row)));
  const tooltip = api.FinanceTooltip({ active: true, kind: 'commission-status-ranked', label: statuses[2], payload: [{ value: 250, name: 'Commission' }] });
  assert.match(renderToStaticMarkup(tooltip), /RM 250\.00/);
  const paidTooltip = api.FinanceTooltip({ active: true, kind: 'commission-status-ranked', label: statuses[3], payload: [{ value: 251393, payload: chart.props.data[3] }] });
  const tooltipMarkup = renderToStaticMarkup(paidTooltip);
  assert.match(tooltipMarkup, /Commission<\/span><b>RM 251,393\.00/);
  assert.doesNotMatch(tooltipMarkup, /Capped|Bar display/);
  const other = view(api, 'reimbursement-ranking');
  const otherBar = React.Children.toArray(other.props.children).find((child) => child.props.dataKey === 'value');
  assert.equal(otherBar.props.barSize, 18);
  assert.equal(otherBar.props.shape, undefined);
});

test('one zero-based linear domain includes full amounts, signed values, zeros and uncapped outliers', () => {
  const api = setup();
  const rows = [0, 250, 12000, 12000.01, 251393, -18000].map((value) => ({ value }));
  const snapshot = JSON.stringify(rows);
  const domain = api.commissionStatusDomain(rows);
  assert.equal(JSON.stringify(rows), snapshot, 'source rows must not change');
  assert.deepEqual(Array.from(domain), [-18000, 251393]);
  assert.deepEqual(Array.from(api.commissionStatusDomain([{ value: -18000 }, { value: -500 }])), [-18000, 0]);
  for (const empty of [[], [{ value: 0 }], [{ value: NaN }, { value: Infinity }]]) assert.deepEqual(Array.from(api.commissionStatusDomain(empty)), [0, 1]);
  const chart = api.RankedView({ panelId: 'commission-main', kind: 'commission-status-ranked', colors: api.colors, labels: true, payload: { values: [{ label: 'Pending', value: 250 }] } }).props.children;
  const axis = React.Children.toArray(chart.props.children).find((child) => child.props.type === 'number');
  assert.deepEqual(Array.from(axis.props.domain), [0, 250], 'small filtered scopes use their actual maximum');
  assert.equal(axis.props.scale, 'linear');
  const fullAxis = React.Children.toArray(view(api).props.children).find((child) => child.props.type === 'number');
  assert.deepEqual(Array.from(fullAxis.props.domain), [0, 251393]);
  assert.notEqual(fullAxis.props.allowDataOverflow, true, 'do not clip the amount labels with the bars');
  assert.doesNotMatch(source, /displayCap|plotValue/);
});

test('non-finite geometry is ignored and the proportional-scale explanation is visible', () => {
  const api = setup();
  assert.equal(shape(api, 250, NaN), null);
  assert.match(html, /Bar lengths are proportional to RM amounts on one shared scale\. ◆ Small non-zero amount/);
  assert.doesNotMatch(html, /Display cap: RM12,000|displayCap: 12000/);
  assert.match(html, /commission-status-bar:focus-visible \.commission-status-hit-target/);
  assert.match(html, /const hostRole = \["commission-status-ranked", "pitstop-state-trend"\]\.includes\(kind\) \? "group" : "img"/);
  assert.match(source, /minWidth: isCommissionStatus \? 600 : 0/);
  assert.match(html, /data-vchart-kind="commission-status-ranked"\] \{[^}]*overflow-x: auto/);
});
