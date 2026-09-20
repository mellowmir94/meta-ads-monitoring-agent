const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../cloudflare/public/index.html'), 'utf8');
  const between = (a, b) => html.slice(html.indexOf(a) + a.length, html.indexOf(b, html.indexOf(a)));
  const styles = between('<!-- BEGIN LEDGER FINSIGHT STYLES -->', '<!-- END LEDGER FINSIGHT STYLES -->');
  const panel = between('<!-- BEGIN LEDGER FINSIGHT: PANEL -->', '<!-- END LEDGER FINSIGHT -->');
  const runtime = between('<!-- BEGIN LEDGER FINSIGHT RUNTIME -->', '<!-- END LEDGER FINSIGHT RUNTIME -->').replace(/<script src=[^>]+><\/script>/, '');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://finsight.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('https://finsight.test/');
    await page.setContent('<style>:root{--text:#f4f7ef;--surface-strong:#172015;--line:#35402d;--accent:#b3f442;}body{background:#10160d;color:#fff;font-family:Arial;}button{padding:10px;cursor:pointer;}</style>' + styles + panel + runtime);
    await page.evaluate(() => {
      window.ledgerFinSightBridge = { context: async () => ({ directAnswer: '**250 matching installments**\n\n' + Array.from({ length: 250 }, (_, i) => '- **Rider ' + i + '** · Payment 2/4 · RM 25.00').join('\n'), evidence: [{ Rider: 'Rider 249', Reference: 'DED-249' }], generatedAt: new Date().toISOString(), datasets: [{ visibleRowCount: 400, dateRange: { start: '2026-09-01', end: '2026-09-20' } }], deductionHistory: { recordCount: 250 } }) };
    });
    await page.locator('#finsightQuestion').fill('Pending installments next week');
    await page.locator('#finsightForm').evaluate(form => form.requestSubmit());
    await page.getByRole('button', { name: 'View matching records' }).waitFor();
    assert.match(await page.locator('#finsightMessages').innerText(), /Rider 249/);
    assert.equal(await page.locator('#finsightSend').isEnabled(), true);
    await page.getByRole('button', { name: 'View matching records' }).click();
    assert.match(await page.locator('dialog').innerText(), /DED-249/);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('#finsightClear').click();
    await page.evaluate(() => { window.ledgerFinSightBridge.context = () => new Promise(resolve => { window.finishOld = resolve; }); });
    await page.locator('#finsightQuestion').fill('Slow request');
    await page.locator('#finsightForm').evaluate(form => form.requestSubmit());
    await page.locator('#finsightClear').click();
    await page.evaluate(() => window.finishOld({ directAnswer: 'STALE ANSWER' }));
    assert.doesNotMatch(await page.locator('#finsightMessages').innerText(), /STALE ANSWER/);
    assert.equal(await page.locator('#finsightSend').isEnabled(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392));
    assert.deepEqual(errors, []);
    console.log('PASS: 250-rider answer, evidence dialog, Clear chat race, send reset, mobile overflow, no browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
