import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function declaration(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n      function ', start + 1));
}

test('every native Grafana table keeps source count and scroll progress in one metadata row', () => {
  const source = declaration('grafanaSourceTablesMarkup');
  assert.match(source, /class="ledger-source-heading"/);
  assert.match(source, /class="ledger-source-meta"/);
  assert.match(source, /<div class="ledger-source-meta"><span class="ledger-grain"[\s\S]*?<span class="ledger-scroll-progress" data-scroll-progress>[\s\S]*?<\/span><\/div><\/div><div class="ledger-actions">/);
  assert.doesNotMatch(source, /<div><h4>\$\{esc\(table\.title\)\}<\/h4>/, 'native table titles must use the normalized heading wrapper');
});

test('native table header aligns with the 11px table-cell edge and uses a compact metadata rhythm', () => {
  assert.match(html, /\.grafana-source-table:not\(\.table-copy\) > \.ledger-head \{[\s\S]*?min-height: 56px;[\s\S]*?padding: 9px 11px;/);
  assert.match(html, /\.ledger-source-meta \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;[\s\S]*?gap: 2px 7px;/);
  assert.match(html, /\.ledger-source-meta > \.ledger-scroll-progress::before \{[\s\S]*?content: "·";/);
  assert.match(html, /\.ledger-card thead th \{[\s\S]*?padding: 8px 11px;/);
});

test('the native-table rule excludes duplicated tables so their delete-button spacing is preserved', () => {
  assert.doesNotMatch(html, /\.grafana-source-table > \.ledger-head\s*\{/);
  assert.match(html, /\.table-copy > \.ledger-head \{ position: relative; padding-right: 56px; \}/);
  assert.match(html, /FINANCE_ASSET_VERSION = "20260909\.1"/);
});
