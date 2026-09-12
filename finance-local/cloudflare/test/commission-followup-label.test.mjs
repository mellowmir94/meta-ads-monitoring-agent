import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
function declaration(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n      function ', start + 1));
}
function setup(chartAvailable = true) {
  const payloads = [];
  const api = {
    normalizeFilterText: (value) => String(value ?? '').trim().toLowerCase(),
    esc: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    formatMoney: (value) => `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formatPercent: (value) => `${Number(value).toFixed(2)}%`,
    financeVChartAvailable: () => chartAvailable,
    vchartHostMarkup: (_panel, _kind, payload, label) => { payloads.push({ ...payload, label }); return '<div>chart</div>'; },
  };
  vm.createContext(api);
  vm.runInContext(['parseFinanceNumber', 'numberValue', 'commissionSourceContext', 'commissionPayoutStatus', 'canonicalCommissionPayoutStatus',
    'commissionPayoutStatusLabel', 'commissionPayoutStatusColor', 'commissionFollowupSummaryMarkup', 'commissionLiabilitySummary'].map(declaration).join('\n'), api);
  return { api, payloads, render: (rows) => api.commissionLiabilitySummary({ id: 'commission-main' }, rows) };
}
const row = (payment_status, commission, extra = {}) => ({ payment_status, commission, ...extra });

test('order-payment summary names the subtotal, exposes Approved zero and excludes all other groups', () => {
  const { render, payloads } = setup();
  const markup = render([row('Pending', 14283), row('Approved', 0), row('Paid', 261900), row('Failed', 215), row('Cancelled', 17), row('Unknown', 23)]);
  assert.match(markup, /Commission on Pending \+ Approved Orders/);
  assert.match(markup, /<strong>RM 14,283\.00<\/strong>/);
  assert.match(markup, /Pending <b>RM 14,283\.00<\/b>/);
  assert.match(markup, /\+ Approved <b>RM 0\.00<\/b>/);
  assert.match(markup, /not confirmed unpaid rider payouts/);
  assert.match(markup, /Other statuses are excluded from this subtotal/);
  assert.doesNotMatch(markup, /Outstanding exposure/);
  assert.deepEqual(Array.from(payloads[0].values, (entry) => entry.value), [14283, 0, 215, 261900, 17, 23], 'raw chart values unchanged');
});

test('real payout fields switch the wording and retain the existing approved-commission amount basis', () => {
  const { render } = setup();
  const markup = render([
    row('Paid', 900, { commission_status: 'Pending', approved_commission: 40 }),
    row('Paid', 800, { commission_status: 'Approved', approved_commission: 60 }),
    row('Pending', 700, { commission_status: 'Paid', approved_commission: 100, paid_commission: 100 }),
  ]);
  assert.match(markup, /Pending \+ Approved Commission/);
  assert.match(markup, /<strong>RM 100\.00<\/strong>/);
  assert.match(markup, /Pending <b>RM 40\.00/);
  assert.match(markup, /\+ Approved <b>RM 60\.00/);
  assert.match(markup, /Based on commission payout status/);
  assert.doesNotMatch(markup, /on Pending \+ Approved Orders|order payment status/);
});

test('fallback has the same clear subtotal and distinguishes it from the all-status total', () => {
  const { render } = setup(false);
  const markup = render([row('Pending', 50), row('Approved', 25), row('Paid', 200)]);
  assert.match(markup, /Commission on Pending \+ Approved Orders/);
  assert.match(markup, /<strong>RM 75\.00<\/strong>/);
  assert.match(markup, /Total across all statuses<\/span><strong>RM 275\.00/);
  assert.match(markup, /not confirmed unpaid rider payouts/);
  assert.doesNotMatch(markup, /approved \+ pending commission payout status/);
});

test('signed follow-up amounts and a zero follow-up subtotal remain exact', () => {
  const { render } = setup();
  const signed = render([row('Pending', -25), row('Approved', 100), row('Paid', 200)]);
  assert.match(signed, /<strong>RM 75\.00<\/strong>/);
  assert.match(signed, /Pending <b>RM -25\.00/);
  const settled = render([row('Paid', 200)]);
  assert.match(settled, /<strong>RM 0\.00<\/strong>/);
  assert.match(settled, /Pending <b>RM 0\.00/);
  assert.match(settled, /\+ Approved <b>RM 0\.00/);
});
