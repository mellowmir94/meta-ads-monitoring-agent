import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createManualBackup, validateManualBackup, planMissingRestore } from '../cloudflare/src/manual-backup.js';
import { validManualReport } from '../cloudflare/src/manual-values.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const css = await fs.readFile(path.join(root, 'src/data-upload-centre.css'), 'utf8');
const js = await fs.readFile(path.join(root, 'src/data-upload-centre.js'), 'utf8');
const template = await fs.readFile(path.join(root, 'src/data-upload-centre.html'), 'utf8');
const html = template.replace('/* INLINE_CSS */', () => css).replace('/* INLINE_APP */', () => js).replace('/* INITIAL_DATA */', '{}');
const backup = await createManualBackup('rsa', { values: { '2026-08-01': { rsaFuel: 6, rsaJumpstart: 20 }, '2026-08-02': { rsaFuel: 2 } } });
let record = { values: { '2026-08-01': { rsaFuel: 7 } } }, revision = 0, conflict = true, deny = false;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/upload/') return route.fulfill({ contentType: 'text/html', body: html });
  if (url.pathname.startsWith('/api/concurrency/')) return send({ status: 'admitted' });
  if (url.pathname === '/api/manual-values-backup') return deny ? send({ error: 'Unlock the Data Upload Centre to access report backups.' }, 403) : send(await createManualBackup('rsa', record));
  if (url.pathname === '/api/manual-values-restore') {
    const body = route.request().postDataJSON();
    try { await validateManualBackup(body.backup, url.searchParams.get('kind'), validManualReport); } catch (error) { return send({ error: error.message }, 400); }
    const plan = planMissingRestore('rsa', record, body.backup.record);
    if (body.action === 'preview') return send({ preview: { ...plan.counts, revision } });
    if (conflict) { conflict = false; revision++; return send({ error: 'Saved records changed after the preview. Review the backup again; nothing was restored.' }, 409); }
    assert.equal(body.expectedRevision, revision);
    record = plan.pending; revision++;
    return send({ restored: plan.counts.missing });
  }
  return send({ data: { pitstopMaster: [{ Branch: 'HQ SAMPLE', State: 'JOHOR', Type: 'HQ', Tier: 1, branch_status: 'active', Country: 'MY' }] }, months: [] });
});

try {
  await page.goto('https://backup.test/upload/');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup', exact: true }).click();
  const download = await downloadEvent;
  const downloaded = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  assert.equal(downloaded.record.values['2026-08-01'].rsaFuel, 7);
  await page.locator('#restoreBackupInput').setInputFiles({ name: 'rsa-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await page.locator('#manualRestorePreview').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#restoreMissingCount').innerText(), '2');
  assert.equal(await page.locator('#restoreDifferentCount').innerText(), '1');
  await fs.mkdir(path.join(root, 'artifacts/workflow'), { recursive: true });
  await page.locator('#manualBackups').screenshot({ path: path.join(root, 'artifacts/workflow/backup-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#manualBackups').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/backup-mobile.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Restore missing values', exact: true }).click();
  await page.getByText(/Saved records changed after the preview/).waitFor();
  assert.equal(record.values['2026-08-01'].rsaJumpstart, undefined);
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await page.locator('#manualRestorePreview').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Restore missing values', exact: true }).click();
  await page.getByText('2 missing values restored. Existing values were retained.').waitFor();
  assert.equal(record.values['2026-08-01'].rsaFuel, 7);
  assert.equal(record.values['2026-08-01'].rsaJumpstart, 20);
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await page.getByText('Nothing is missing. No restore is needed.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Restore missing values', exact: true }).isEnabled(), false);
  const corrupted = structuredClone(backup); corrupted.checksum = 'bad';
  await page.locator('#restoreBackupInput').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupted)) });
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await page.getByText(/Backup checksum does not match/).waitFor();
  deny = true;
  await page.getByRole('button', { name: 'Download backup', exact: true }).click();
  await page.getByText(/Unlock the Data Upload Centre/).waitFor();
  assert.deepEqual(errors, []);
  console.log('Backup UI: real download, preview counts, conflict/review, missing-only recovery, corrupt-file rejection, expired access and desktop/mobile checks passed.');
} finally { await browser.close(); }
