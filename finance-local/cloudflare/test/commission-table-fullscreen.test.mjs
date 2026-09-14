import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Commission Rider table has a dedicated fullscreen control after search', () => {
  assert.match(html, /class="ledger-search"[\s\S]{0,700}data-table-fullscreen="\$\{esc\(panel\.id\)\}"/);
  assert.match(html, /panel\.id === "commission-main"/);
  assert.match(html, /function toggleTableFullscreen\(button\)/);
  assert.match(html, /className = "finance-table-fullscreen-layer"/);
  assert.match(html, /document\.body\.append\(fullscreenTableLayer\)/);
  assert.match(html, /ledger-card\.is-table-fullscreen > \.table-wrap/);
  assert.match(html, /event\.key === "Escape" && fullscreenTableId/);
  assert.match(html, /aria-label="\$\{fullscreenTableId === panel\.id \? "Exit full-screen table" : "Full-screen table"\}"/);
  assert.match(html, /class="table-header-filter-reset-button"[^>]+data-table-header-filter-reset="\$\{esc\(tableFilterId\(panel\.id\)\)\}"/);
  assert.match(html, /\.table-fullscreen-button, \.table-header-filter-reset-button\s*\{[^}]*place-items: center;/);
});

test('reset table filters clears only the current table header filters', () => {
  assert.match(html, /const tableHeaderFilterReset = event\.target\.closest\("\[data-table-header-filter-reset\]"\);/);
  assert.match(html, /state\.tableColumnFilters\[tableId\] = \{\};/);
  assert.match(html, /delete state\.tableColumnFilterDrafts\[tableId\];/);
  assert.match(html, /Table header filters reset/);
});

test('table fullscreen remains scoped to the selected table surface', () => {
  assert.match(html, /card\.classList\.add\("is-table-fullscreen"\)/);
  assert.match(html, /document\.body\.classList\.add\("finance-table-fullscreen"\)/);
  assert.match(html, /captureTableFullscreenRenderState\(\)/);
  assert.match(html, /restoreTableFullscreenRenderState\(tableFullscreenRenderState\)/);
  assert.match(html, /fullscreenTablePlaceholder\.replaceWith\(card\)/);
  assert.doesNotMatch(html, /data-table-fullscreen[^\n]+data-chart-fullscreen/);
});
