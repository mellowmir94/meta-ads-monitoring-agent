import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);
const htmlPath = new URL('../../src/dashboard.html', import.meta.url);
const cssPath = new URL('../../src/dashboard.css', import.meta.url);

test('Summary saves require explicit confirmation before replacing existing data', async () => {
  const [source, html, css] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(htmlPath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);

  assert.match(html, /id="overwriteConfirmDialog"/);
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /id="overwriteConfirmCancel"[^>]*>Cancel</);
  assert.match(html, /id="overwriteConfirmAccept"[^>]*>Overwrite and save</);
  assert.match(css, /\.overwrite-confirm-backdrop\[hidden\]/);
  assert.match(css, /\.overwrite-confirm-accept/);

  assert.match(source, /function confirmSummaryOverwrite\(options\)/);
  assert.match(source, /function manualServiceOverwriteDates\(/);
  assert.match(source, /manualReportHasSavedDate\('bgarage', reportDate\)/);
  assert.match(source, /manualReportHasSavedDate\('indonesia', reportDate\)/);
  assert.match(source, /title: 'Overwrite RSA & B2W data\?'/);
  assert.match(source, /title: 'Overwrite BGarage data\?'/);
  assert.match(source, /title: 'Overwrite Indonesia data\?'/);
  assert.match(source, /if \(!confirmed\) return;/);
  assert.doesNotMatch(source, /window\.confirm\(/);
});

test('first-time Summary saves bypass the overwrite dialog', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const bgarageSave = source.slice(source.indexOf('async function saveManualBGarageSummary()'), source.indexOf('async function saveManualIndonesiaSummary()'));
  const indonesiaSave = source.slice(source.indexOf('async function saveManualIndonesiaSummary()'), source.indexOf('function setBGarageSummaryDate'));

  assert.match(bgarageSave, /if \(manualReportHasSavedDate\('bgarage', reportDate\)\)/);
  assert.match(indonesiaSave, /if \(manualReportHasSavedDate\('indonesia', reportDate\)\)/);
  assert.match(bgarageSave, /await persistManualReportValue\('bgarage', reportDate/);
  assert.match(indonesiaSave, /await persistManualReportValue\('indonesia', reportDate/);
});
