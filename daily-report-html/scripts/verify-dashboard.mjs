import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const project = 'C:/Users/AmirKhalil/Documents/CC/daily-report-html';
const source = path.join(project, 'dist', 'Daily Report Dashboard - Enhanced.html');
const workbook = 'C:/Users/AmirKhalil/Desktop/Daily Report Data.xlsx';
const synced = 'C:/Users/AmirKhalil/Desktop/Daily Report Dashboard - Daily Report Data Synced.html';
const screenshot = path.join(project, 'dist', 'qa-dashboard.png');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
await page.locator('#fileInput').setInputFiles(workbook);
await page.waitForFunction(() => document.querySelector('#loadStatus')?.textContent === 'Ready');
await page.waitForTimeout(300);

const qualityText = await page.locator('.data-quality-banner').textContent();
if (!qualityText.includes('no Date column')) throw new Error('Expected service date-join warning was not shown.');
if (qualityText.includes('uploaded Pitstop status')) throw new Error('Pitstop status thresholds still disagree with the workbook.');
if (!(await page.locator('#loadMeta').textContent()).includes('Data through 05 Aug 2026')) throw new Error('Freshness metadata does not show the latest data date.');

const downloadPromise = page.waitForEvent('download');
await page.locator('#exportButton').click();
const download = await downloadPromise;
await download.saveAs(synced);

await page.locator('[data-view="services"]').click();
const serviceLabels = await page.locator('.service-kpi-label').allTextContents();
for (const expected of ['Total RSA', 'Total B2W', 'Total ResQ', 'Warranty first attendance', 'Warranty repeat rate']) {
  if (!serviceLabels.includes(expected)) throw new Error(`Missing service KPI: ${expected}`);
}
await page.screenshot({ path: path.join(project, 'dist', 'qa-services.png'), fullPage: true });

await page.locator('[data-view="pitstops"]').click();
if (!(await page.locator('.panel-header p').first().textContent()).includes('Snapshot as of 05 Aug 2026')) throw new Error('Pitstop snapshot date is missing.');
const thresholdCheckRow = page.locator('.pitstop-table tbody tr', { hasText: 'HQ JALAN GENTING KELANG' }).first();
if (!(await thresholdCheckRow.textContent()).includes('Action Required')) throw new Error('Pitstop 83% achievement should remain Red / Action Required.');
await page.screenshot({ path: path.join(project, 'dist', 'qa-pitstops.png'), fullPage: true });

await page.locator('[data-view="bgarage"]').click();
await page.locator('#toDate').fill('2026-08-04');
await page.locator('#toDate').dispatchEvent('change');
await page.waitForTimeout(100);
if (!(await page.locator('.daily-detail-note.is-warning').textContent()).includes('No BGarage data falls within')) throw new Error('BGarage date filter still falls back outside the selected period.');
await page.screenshot({ path: path.join(project, 'dist', 'qa-bgarage-empty.png'), fullPage: true });

await page.locator('[data-range="all"]').click();
const tuhuRow = page.locator('.bgarage-table tbody tr', { hasText: 'TUHU Puchong' }).first();
if (!(await tuhuRow.textContent()).includes('RM -') || !(await tuhuRow.textContent()).includes('N/A')) throw new Error('BGarage RM - values are not preserved as N/A.');
await page.locator('[data-view="overview"]').click();
const easternRegion = page.locator('.region-matrix-table tbody tr', { hasText: 'EASTERN' }).first();
if (!(await easternRegion.textContent()).includes('56%')) throw new Error('Regional achievement is not using weighted sales / target.');
await page.screenshot({ path: screenshot, fullPage: true });

const baked = await browser.newPage({ viewport: { width: 1440, height: 900 } });
baked.on('pageerror', error => errors.push(`Exported report: ${error.message}`));
await baked.goto(pathToFileURL(synced).href, { waitUntil: 'load' });
if (!(await baked.locator('#loadMeta').textContent()).includes('Data through 05 Aug 2026')) throw new Error('Exported report did not retain the workbook data.');

await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ synced, screenshot, serviceLabels, dataQuality: qualityText.trim() }, null, 2));
