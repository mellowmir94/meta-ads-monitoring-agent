import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf('  function workflowHealthMarkup()');
const end = source.indexOf('\n  function render()', start);
assert.ok(start >= 0 && end > start);
const renderer = source.slice(start, end);
const clean = { rawSales: 6326, activeSales: 6326, closedSales: 0, excluded: [] };

function render(audit, { view = 'special', reason = '', otherAudit, hosted = true } = {}) {
  return vm.runInNewContext(renderer + '\nworkflowHealthMarkup()', {
    state: { view, pitstopReconciliation: { network: audit, global: otherAudit || audit } },
    HOSTED_MODE: hosted,
    b2cStateSummaryWindow: () => ({}),
    summaryNetworkRangeKey: () => 'network',
    selectedRangeKey: () => 'global',
    isSummaryView: () => view === 'special',
    summaryCopyBlockReason: () => reason,
    formatNumber: value => Number(value).toLocaleString('en-US'),
    numberValue: value => Number(value) || 0,
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
  });
}

test('reconciled pitstop totals have a normal status, separate from copy warnings', () => {
  const html = render(clean, { reason: 'RSA entries are incomplete.' });
  assert.match(html, /is-reconciled" role="status"/);
  assert.match(html, /Pitstop sales reconciled/);
  assert.match(html, /HQ\/BP panels: 6,326 sales; active Master: 6,326; closed locations: 0\./);
  assert.match(html, /Copy unavailable: RSA entries are incomplete\./);
  assert.doesNotMatch(html, /is-error|role="alert"|Review Pitstop Master/);
});

test('missing and ambiguous pitstops show red alerts with escaped names, sales and reasons', () => {
  const html = render({ ...clean, rawSales: 6345, excluded: [
    { name: 'BP NEW <BRANCH>', sales: 12, reason: 'not in Malaysia Pitstop Master' },
    { name: 'HQ DUPLICATE', sales: 7, reason: 'ambiguous Master name' }
  ] });
  assert.match(html, /is-error" role="alert"/);
  assert.match(html, /2 pitstop mapping issues - Master review required/);
  assert.match(html, /19 sales excluded/);
  assert.match(html, /BP NEW &lt;BRANCH&gt;/);
  assert.match(html, /12 sales/);
  assert.match(html, /HQ DUPLICATE/);
  assert.match(html, /7 sales/);
  assert.match(html, /ambiguous Master name/);
  assert.match(html, /href="\/upload\/">Review Pitstop Master/);
  assert.match(html, /data-copy-exclude/);
  assert.doesNotMatch(html, /Pitstop sales reconciled|<BRANCH>/);
});

test('zero-sales unmatched locations are still highlighted, even when totals agree', () => {
  const html = render({ ...clean, excluded: [{ name: 'BP NEW', sales: 0, reason: 'not in Malaysia Pitstop Master' }] });
  assert.match(html, /1 pitstop mapping issue - Master review required/);
  assert.match(html, /0 sales excluded/);
  assert.doesNotMatch(html, /is-reconciled/);
});

test('Summary uses its independent network audit while Explorer uses its own date range', () => {
  const issue = { ...clean, excluded: [{ name: 'BP MISSING', sales: 4, reason: 'not in Malaysia Pitstop Master' }] };
  assert.match(render(clean, { otherAudit: issue }), /is-reconciled/);
  assert.match(render(clean, { view: 'pitstops', otherAudit: issue }), /is-error/);
  assert.equal(render(undefined), '');
  assert.equal(render(issue, { view: 'overview' }), '');
  assert.match(render(issue, { hosted: false }), /href="Data Upload Centre.html"/);
});
