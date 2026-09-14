import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sourceHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const publishedHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

for (const [label, html] of [['source', sourceHtml], ['published', publishedHtml]]) {
  test(`${label} dashboard filters close and apply without a Done button`, () => {
    assert.doesNotMatch(html, /data-filter-menu-done-panel/);
    assert.doesNotMatch(html, /class="filter-menu-action done"/);
    assert.match(html, /function commitDashboardFilterSelection\(panelId, key/);
    assert.match(html, /commitDashboardFilterSelection\(openFilter\.panelId, openFilter\.key/);
    assert.match(html, /commitDashboardFilterSelection\(panelId, key, \{ focusTrigger: true \}\)/);
  });
}
