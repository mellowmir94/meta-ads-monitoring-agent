// Run against the loopback preview server, never a production URL.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');
const { chromium } = require(process.env.COMMISSION_PLAYWRIGHT || 'playwright');
const url = 'http://127.0.0.1:4320';
const out = resolve(__dirname, '../preview-evidence');
mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', recordVideo: { dir: resolve(out, 'interactions'), size: { width: 1440, height: 1000 } } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    const main = page.locator('#commission-main-ledger');
    await main.waitFor();
    await main.locator('.commission-deduction-summary').waitFor();
    await main.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, 'commission-all-riders.png') });
    assert.ok(await main.locator('[data-deduction-inline-type]').first().isDisabled(), 'multiple riders must block deductions');
    await main.locator('[data-search]').fill('DEMO · AHMAD DANIAL');
    await main.locator('[data-search]').press('Enter');
    await page.waitForFunction(() => !document.querySelector('#commission-main-ledger [data-deduction-inline-type]')?.disabled);
    await main.locator('[data-table-fullscreen]').click();
    const fullscreen = page.locator('.finance-table-fullscreen-layer');
    const geometry = await fullscreen.evaluate(el => {
      const card = el.querySelector('.ledger-card'), header = card.querySelector('.ledger-head').getBoundingClientRect(), table = card.querySelector('.table-wrap').getBoundingClientRect();
      return { direction: getComputedStyle(card).flexDirection, headerBottom: header.bottom, tableTop: table.top, tableWidth: table.width, tableHeight: table.height, width: innerWidth, height: innerHeight };
    });
    assert.equal(geometry.direction, 'column');
    assert.ok(geometry.tableWidth >= geometry.width - 2, 'fullscreen table must use viewport width');
    assert.ok(geometry.tableHeight >= 160, 'table retains usable height');
    assert.ok(geometry.tableTop >= geometry.headerBottom - 1, 'toolbar must not overlay the table');
    await page.screenshot({ path: resolve(out, 'commission-fullscreen.png') });
    await fullscreen.locator('[data-deduction-inline-type][value="epf"]').check();
    await fullscreen.locator('[data-deduction-inline-type][value="insurance"]').check();
    await fullscreen.locator('[data-deduction-inline-amount="insurance"]').fill('35');
    await fullscreen.locator('[data-deduction-inline-create]').click();
    const dialog = page.locator('#deductionDialog');
    await dialog.waitFor();
    await page.waitForTimeout(350);
    await dialog.screenshot({ path: resolve(out, 'deduction-request-desktop.png') });
    assert.equal(await dialog.locator('[data-deduction-line]').count(), 2);
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await dialog.evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, viewport: innerWidth }));
      assert.ok(overflow.scroll <= overflow.width + 1, `dialog overflow at ${width}px: ${JSON.stringify(overflow)}`);
      assert.ok(overflow.left >= 0 && overflow.right <= overflow.viewport, `dialog fits ${width}px`);
      await dialog.screenshot({ path: resolve(out, `deduction-request-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog.locator('[data-deduction-close]').click();
    await page.keyboard.press('Escape');
    assert.equal(await fullscreen.count(), 0, 'Escape exits fullscreen');
    await main.locator('[data-deduction-history-open]').click();
    await page.locator('#deductionHistoryView').waitFor({ state: 'visible' });
    await page.screenshot({ path: resolve(out, 'deduction-history.png') });
    await page.locator('[data-deduction-history-close]').click();
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    await main.scrollIntoViewIfNeeded();
    await main.locator('[data-table-fullscreen]').click();
    await page.screenshot({ path: resolve(out, 'commission-fullscreen-light.png') });
    await page.keyboard.press('Escape');
    await page.reload();
    await main.waitFor();
    assert.equal(await main.locator('[data-search]').inputValue(), 'DEMO · AHMAD DANIAL', 'table search persists on refresh');
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log('PASS: single-rider guard, multi-selection, fullscreen geometry/Escape, responsive request dialog, history, refresh persistence, light/dark. Synthetic loopback only.');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
