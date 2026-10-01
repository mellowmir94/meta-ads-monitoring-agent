import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const css = await fs.readFile(new URL('src/dashboard.css', root), 'utf8');
let js = await fs.readFile(new URL('src/dashboard.js', root), 'utf8');
js = js.replace(/var HOSTED_MODE = [^;]+;/, 'var HOSTED_MODE = false;');
js = js.replace("  if (document.readyState === 'loading')", "  window.draftTest = { state, render, workflowHealthMarkup, pitstopMasterDraftRows, summaryNetworkRangeKey, b2cStateSummaryWindow };\n  if (document.readyState === 'loading')");
const template = await fs.readFile(new URL('src/dashboard.html', root), 'utf8');
const html = template.replace('/* INLINE_CSS */', () => css).replace('/* INLINE_APP */', () => js);
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedDraft = text; } } }));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://master-draft.test');
  await page.waitForFunction(() => window.draftTest?.state.data);
  const before = await page.evaluate(() => {
    const { state, render, summaryNetworkRangeKey, b2cStateSummaryWindow } = draftTest;
    state.view = 'special';
    state.data.pitstopMaster = [{ id: 'HQ136', name: 'HQ EXISTING', active: true }, { id: 'HQ120', name: 'HQ CLOSED', active: false }, { id: 'BP009', name: 'BP EXISTING', active: true }];
    state.pitstopReconciliation[summaryNetworkRangeKey(b2cStateSummaryWindow())] = { rawSales: 10, activeSales: 0, closedSales: 0, excluded: [
      { name: 'HQ ALMA', sales: 6, reason: 'not in Malaysia Pitstop Master' },
      { name: 'BP <UNKNOWN>', sales: 4, reason: 'not in Malaysia Pitstop Master' },
      { name: 'HQ DUPLICATE', sales: 0, reason: 'ambiguous Master name' }
    ] };
    render();
    return JSON.stringify(state.data.pitstopMaster);
  });
  assert.equal(await page.locator('.workflow-master-draft tbody tr').count(), 2);
  assert.equal(await page.locator('.workflow-master-draft th').count(), 12);
  assert.equal(await page.locator('.workflow-master-draft th').first().innerText(), 'No_ID');
  assert.match(await page.locator('.workflow-master-draft').innerText(), /provisional/);
  assert.equal(await page.locator('.workflow-master-draft tbody tr').nth(1).locator('td').nth(1).innerText(), 'BP <UNKNOWN>');
  await page.locator('[data-copy-master-drafts]').click();
  const copied = await page.evaluate(() => window.copiedDraft);
  const lines = copied.split('\r\n').map(line => line.split('\t'));
  assert.equal(lines.length, 2);
  assert.ok(lines.every(row => row.length === 12));
  assert.deepEqual(lines[0], ['HQ137', 'HQ ALMA', 'PENANG', 'HQ', 'Tier 3', 'Active', 'BUKIT MERTAJAM', 'NORTHERN', 'MALAYSIA', '', '5.32987', '100.47810']);
  assert.equal(lines[1][0], 'BP010');
  assert.equal(lines[1][4], '');
  assert.ok(!copied.includes('branch_status'));
  const ids = await page.evaluate(() => draftTest.pitstopMasterDraftRows(['HQ ALMA', 'HQ NEXT', 'HQ ALMA', 'WH NEW'].map(name => ({ name, sales: 1, reason: 'not in Malaysia Pitstop Master' }))).map(row => row[0]));
  assert.deepEqual(ids, ['HQ137', 'HQ138', 'HQ137', '']);
  assert.equal(await page.evaluate(() => JSON.stringify(draftTest.state.data.pitstopMaster)), before);
  assert.equal(await page.locator('.workflow-health.is-error[data-copy-exclude] .workflow-master-draft').count(), 1);
  await page.setViewportSize({ width: 390, height: 900 });
  const layout = await page.locator('.workflow-master-draft-scroll').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, viewport: innerWidth }));
  assert.ok(layout.width <= layout.viewport && layout.scroll > layout.width);
  const output = new URL('dist/master-draft-review/', root);
  await fs.mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.workflow-health.is-error').screenshot({ path: new URL('draft-warning.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  assert.deepEqual(errors, []);
  console.log('Passed: draft warning, Excel TSV, escaped branch names, ambiguous-name exclusion, unchanged master, and mobile overflow.');
} finally { await browser.close(); }
