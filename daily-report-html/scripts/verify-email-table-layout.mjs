import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const output = new URL('dist/email-layout-review/', root);
await fs.mkdir(output, { recursive: true });
const css = await fs.readFile(new URL('src/dashboard.css', root), 'utf8');
let js = await fs.readFile(new URL('src/dashboard.js', root), 'utf8');
js = js.replace(/var HOSTED_MODE = [^;]+;/, 'var HOSTED_MODE = false;');
js = js.replace('    prepareCopiedTableLayout(clone);', "    var originalCopyText = clone.textContent;\n    prepareCopiedTableLayout(clone);\n    if (clone.textContent !== originalCopyText) throw new Error('Table formatting changed report values');");
js = js.replace("  if (document.readyState === 'loading')", "  window.layoutTest = { state, render, copyEmailSummary };\n  if (document.readyState === 'loading')");
const template = await fs.readFile(new URL('src/dashboard.html', root), 'utf8');
const html = template.replace('/* INLINE_CSS */', () => css).replace('/* INLINE_APP */', () => js);
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-06-18T04:00:00Z'));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://email-layout.test');
  await page.waitForFunction(() => window.layoutTest?.state.data);
  await page.evaluate(() => {
    const state = layoutTest.state;
    for (let day = 1; day <= 17; day++) {
      const date = `2026-06-${String(day).padStart(2, '0')}`;
      state.manualRsaValues[date] = { rsaJumpstart: 20, rsaTyrePatch: 10, rsaFuel: 2 };
      state.manualB2wValues[date] = 30;
      state.manualBGarageSummaryValues[date] = { rows: [{ outlet: 'BGarage Kajang', dailyTarget: 100, dailyActual: 70, mtdActual: 700, monthlyTarget: 3000, referrals: 2, conversions: 1, pickDrop: 0, intakeActual: 2, intakeTarget: 5 }] };
      state.manualIndonesiaSummaryValues[date] = { daily: { pitstop: 'Cengkareng', totalLead: 20, pendingLead: 2, cancelledLead: 1, baterikuJumpstart: 3, baterikuCharge: 1, baterikuWarranty: 2, baterikuBattery: 4, partnerJumpstart: 1, partnerBattery: 2 } };
    }
  });
  for (const viewportWidth of [1440, 390]) {
   await page.setViewportSize({ width: viewportWidth, height: 1000 });
   for (const view of ['special', 'summary-header', 'operations-summary', 'bgarage-summary', 'indonesia-summary']) {
    const snapshot = await page.evaluate(async view => {
      layoutTest.state.view = view;
      layoutTest.state.emailRankingCollapsed = false;
      layoutTest.render();
      const before = document.querySelector('#emailSummaryContent').innerHTML;
      const result = await layoutTest.copyEmailSummary({ snapshotOnly: true });
      if (document.querySelector('#emailSummaryContent').innerHTML !== before) throw new Error('Copy changed the visible Summary');
      return result;
    }, view);
    assert.ok(snapshot?.html, `${view}: clipboard snapshot missing`);
    if (viewportWidth === 1440) await fs.writeFile(new URL(`${view}.html`, output), '<!doctype html><meta charset="utf-8"><title>Email table preview</title>' + snapshot.html);
    const paste = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await paste.setContent(snapshot.html);
    const tables = await paste.locator('table.email-table').evaluateAll(tables => tables.map(table => ({
      type: table.className,
      width: Math.round(table.getBoundingClientRect().width),
      top: table.getBoundingClientRect().top,
      bottom: table.getBoundingClientRect().bottom,
      cells: [...table.querySelectorAll('th,td')].map(cell => ({
        font: getComputedStyle(cell).fontSize,
        height: cell.getBoundingClientRect().height,
        border: getComputedStyle(cell).borderTopWidth,
        overflow: cell.scrollWidth > cell.clientWidth + 2
      }))
    })));
    assert.ok(tables.length, `${view}: no report tables`);
    for (let i = 1; i < tables.length; i++) {
      assert.ok(tables[i].top >= tables[i - 1].bottom, `${view}: ${tables[i].type} overlaps the previous table`);
    }
    for (const table of tables) {
      if (table.width < 1100 || table.type.includes('email-state-detail-table') && table.width > 1101 || table.cells.some(cell => cell.font !== '16px' || cell.height < 29 || cell.border !== '1px' || cell.overflow)) {
        failures.push({ view, type: table.type, width: table.width, badCells: table.cells.filter(cell => cell.font !== '16px' || cell.height < 29 || cell.border !== '1px' || cell.overflow).slice(0, 3) });
      }
    }
    if (view === 'special' && viewportWidth === 1440) {
      const detail = paste.locator('.email-state-detail-table').first();
      await detail.screenshot({ path: new URL('state-details.png', output).pathname.replace(/^\/(\w:)/, '$1') });
    }
    if (viewportWidth === 1440) await paste.screenshot({ path: new URL(`${view}.png`, output).pathname.replace(/^\/(\w:)/, '$1') });
    console.log(`${view} at ${viewportWidth}px: checked ${tables.length} pasted tables`);
    await paste.close();
   }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, [], 'Pasted tables must match the reference dimensions without clipped content');
} finally {
  await browser.close();
}
