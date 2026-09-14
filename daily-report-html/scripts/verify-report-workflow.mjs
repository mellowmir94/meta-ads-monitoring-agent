import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeArchive } from '../cloudflare/test/helpers/report-store.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const css = await fs.readFile(path.join(root, 'src/dashboard.css'), 'utf8');
let js = await fs.readFile(path.join(root, 'src/dashboard.js'), 'utf8');
js = js.replace("  if (document.readyState === 'loading')", `  window.__test = { state, seedPayload, render, rowsInRange, refreshDashboard, setRange, setCustomReportRangeBound, setBGarageSummaryDate, setIndonesiaSummaryDate, manualEntryDate, saveManualServiceValues, saveManualBGarageSummary, saveManualIndonesiaSummary, summaryCopyBlockReason, emailLatestBGarageSnapshot, indonesiaRowsForWindow, emailPitstopNetworks, b2cStateSummaryWindow, mappedGrafanaPitstops, serviceChartPriorValue, serviceStackedSvg, pitstopStatusValue, clearSavedDrafts, acceptManualPayload, copyEmailSummary, reportReadiness, reportVersionSnapshot, readRecoverableDrafts };
  if (document.readyState === 'loading')`);
const template = await fs.readFile(path.join(root, 'src/dashboard.html'), 'utf8');
const html = template.replace('/* INLINE_CSS */', () => css).replace('/* INLINE_APP */', () => js).replace('/* INLINE_LOGO */', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=');
assert.ok(html.includes('window.__test'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], writes = [];
page.on('pageerror', error => errors.push(error.message));
let failB2w = false;
let loseArchiveResponse = true;
const dates = Array.from({ length: 24 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
const bgRow = { outlet: 'BGarage Kajang', dailyTarget: 100, dailyActual: 70, mtdActual: 700, monthlyTarget: 3000, referrals: 2, conversions: 1, pickDrop: 0, intakeActual: 2, intakeTarget: 5 };
const idRow = { pitstop: 'Cengkareng', totalLead: 20, pendingLead: 2, cancelledLead: 1, baterikuJumpstart: 3, baterikuCharge: 1, baterikuWarranty: 2, baterikuBattery: 4, partnerJumpstart: 1, partnerBattery: 2 };
const stores = {
  b2w: { values: Object.fromEntries(dates.map(date => [date, 30])), revisions: {} },
  rsa: { values: Object.fromEntries(dates.map(date => [date, { rsaJumpstart: 10, rsaTyrePatch: 4, rsaFuel: 1 }])), revisions: {} },
  bgarage: { values: Object.fromEntries(dates.map(date => [date, { rows: [bgRow] }])), revisions: {} },
  indonesia: { values: Object.fromEntries(dates.map(date => [date, { daily: idRow }])), revisions: {} }
};
const workbook = { data: {
  sourceName: 'Workflow test master', dailySales: dates.map(date => ({ date, b2c: 999, b2b2c: 999 })),
  pitstopMaster: [
    { No: 1, Name: 'HQ PERLING', Channel: 'HQ', State: 'JOHOR', Region: 'SOUTHERN', Tier: 'Tier 1', Country: 'MY', Status: 'active' },
    { No: 2, Name: 'BP JOHOR JAYA', Channel: 'BP', State: 'JOHOR', Region: 'SOUTHERN', Tier: 'Tier 2', Country: 'MY', Status: 'active' }
  ],
  bgarage: [{ date: '2026-08-23', ...bgRow, dailyActual: 9999 }],
  indonesia: [{ date: '2026-08-23', ...idRow, totalLead: 9999 }]
} };
const archive = makeArchive(workbook, stores);
await page.clock.setFixedTime(new Date('2026-08-24T04:00:00Z'));
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { write: async items => { window.__clipboardHtml = await (await items[0].getType('text/html')).text(); } } });
  window.ClipboardItem = class { constructor(items) { this.items = items; } getType(type) { return this.items[type]; } };
});
await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
  const send = (body, status = 200) => route.fulfill({ contentType: 'application/json', status, body: JSON.stringify(body) });
  if (url.pathname === '/api/data') return send(workbook);
  if (url.pathname === '/api/report-versions') {
    const reply = await archive.call(request.method() === 'POST' ? request.postDataJSON() : null, url.searchParams.toString(), request.method());
    if (request.method() === 'POST' && reply.status === 201 && loseArchiveResponse) { loseArchiveResponse = false; return route.abort('failed'); }
    return send(await reply.json(), reply.status);
  }
  const kind = { '/api/b2w': 'b2w', '/api/rsa-values': 'rsa', '/api/bgarage-summary-values': 'bgarage', '/api/indonesia-summary-values': 'indonesia' }[url.pathname];
  if (kind) {
    if (request.method() === 'PUT') {
      const body = request.postDataJSON(); writes.push({ kind, body });
      if (kind === 'b2w' && failB2w) return send({ error: 'Test B2W outage' }, 503);
      const updates = body.updates || [body];
      for (const update of updates) {
        const key = kind === 'rsa' ? update.date + ':' + update.field : update.date;
        if (update.expectedRevision !== (stores[kind].revisions[key] || 0)) return send({ error: 'Newer saved record exists.', current: stores[kind] }, 409);
        if (kind === 'rsa') stores[kind].values[update.date][update.field] = update.value;
        else stores[kind].values[update.date] = update.value;
        stores[kind].revisions[key] = (stores[kind].revisions[key] || 0) + 1;
      }
    }
    return send({ ...stores[kind], updatedAt: '2026-08-24T04:00:00Z' });
  }
  const from = url.searchParams.get('from') || '2026-08-01', to = url.searchParams.get('to') || '2026-08-23';
  const rangeDates = dates.filter(date => date >= from && date <= to);
  if (url.pathname === '/api/pitstop-performance') return send({ from, to, source: 'Grafana HQ/BP performance panels', generatedAt: '2026-08-24T04:00:00Z', pitstops: [
    { date: to, channel: 'HQ', pitstop: 'HQ PERLING', sales: rangeDates.length * 11 },
    { date: to, channel: 'BP', pitstop: 'BP JOHOR JAYA', sales: rangeDates.length * 9 }
  ], channelTotals: { hq: rangeDates.length * 11, bp: rangeDates.length * 9 } });
  if (url.pathname === '/api/email-sales') return send({ from, to, source: 'Grafana Order - Daily', rows: rangeDates.map(date => ({ date, b2c: 12, b2b2c: 10, all: 22, movingAverageAll: 22 })) });
  if (url.pathname === '/api/resq') return send({ from, to, rows: rangeDates.map(date => ({ date, resQSelangor: 1, resQJb: 2, resQPahang: 0, resQPenang: 0 })) });
  if (url.pathname === '/api/warranty') return send({ from, to, rows: rangeDates.map(date => ({ date, warranty1st: 5, warranty2nd: 1, warranty3rd: 0 })) });
  if (url.pathname.includes('concurrency')) return send({ admitted: true, status: 'admitted', active: true, state: 'active' });
  return send({ ok: true, authenticated: true, rows: [] });
});
const open = async view => page.evaluate(view => { __test.state.view = view; __test.render(); }, view);
const confirm = async () => { await page.getByRole('button', { name: 'Overwrite & save', exact: true }).click(); };
try {
  await page.goto('https://dashboard.test/');
  await page.waitForFunction(() => window.__test && !__test.state.cloudLoading && Object.values(__test.state.manualSourcesReady).every(Boolean));
  console.log('Initial state:', await page.evaluate(() => ({ master: __test.state.data.pitstopMaster.length, errors: __test.state.data.dataIssues })));
  await page.evaluate(() => __test.setRange('7d'));
  await page.waitForTimeout(700);
  for (const view of ['overview', 'pitstops', 'services', 'bgarage', 'indonesia', 'special', 'summary-header', 'operations-summary', 'bgarage-summary', 'indonesia-summary']) await open(view);
  assert.deepEqual(errors, [], 'all views render without uncaught errors');
  const before = await page.evaluate(() => [__test.state.from, __test.state.to]);
  await open('indonesia-summary');
  const input = page.locator('[data-indonesia-manual-input][data-manual-field="totalLead"]');
  await input.fill('27');
  await page.evaluate(() => __test.refreshDashboard());
  assert.equal(await input.inputValue(), '27', 'draft survives refresh');
  assert.deepEqual(await page.evaluate(() => [__test.state.from, __test.state.to]), before, 'refresh preserves analysis range');
  await page.evaluate(() => __test.setIndonesiaSummaryDate('2026-08-22'));
  assert.equal(await input.inputValue(), '20');
  await page.evaluate(() => __test.setIndonesiaSummaryDate('2026-08-23'));
  assert.equal(await input.inputValue(), '27', 'draft is scoped to entry date');
  assert.deepEqual(await page.evaluate(() => [__test.state.from, __test.state.to]), before, 'entry date does not change global filter');
  const save = page.evaluate(() => __test.saveManualIndonesiaSummary());
  await page.locator('#overwriteConfirmAccept').click();
  await save;
  assert.equal(stores.indonesia.values['2026-08-23'].daily.totalLead, 27);
  assert.equal(await page.evaluate(() => __test.indonesiaRowsForWindow('2026-08-23', '2026-08-23')[0].totalLead), 27);
  await input.fill('28');
  stores.indonesia.values['2026-08-23'].daily.totalLead = 30;
  stores.indonesia.revisions['2026-08-23'] = 2;
  const conflictSave = page.evaluate(() => __test.saveManualIndonesiaSummary());
  await page.locator('#overwriteConfirmAccept').click();
  await page.getByRole('heading', { name: 'Another session changed INDONESIA' }).waitFor();
  await page.locator('#overwriteConfirmAccept').click();
  await conflictSave;
  assert.equal(stores.indonesia.values['2026-08-23'].daily.totalLead, 30, 'conflict does not overwrite the newer server record');
  assert.equal(await input.inputValue(), '28', 'conflict retains the draft');
  const reviewedSave = page.evaluate(() => __test.saveManualIndonesiaSummary());
  await page.locator('#overwriteConfirmAccept').click();
  await reviewedSave;
  assert.equal(stores.indonesia.values['2026-08-23'].daily.totalLead, 28);
  assert.equal(await page.evaluate(() => __test.emailLatestBGarageSnapshot('2026-08-23')[0].dailyActual), 70, 'combined report uses saved BGarage, not workbook');
  await open('operations-summary');
  await page.locator('[data-rsa-input][data-rsa-date="2026-08-23"][data-rsa-field="rsaFuel"]').fill('3');
  await page.locator('[data-b2w-input][data-b2w-date="2026-08-23"]').fill('31');
  failB2w = true;
  const partial = page.evaluate(() => __test.saveManualServiceValues());
  await page.locator('#overwriteConfirmAccept').click();
  await partial;
  assert.equal(stores.rsa.values['2026-08-23'].rsaFuel, 3);
  assert.equal(await page.locator('[data-b2w-input][data-b2w-date="2026-08-23"]').inputValue(), '31');
  assert.equal(await page.evaluate(() => __test.state.summaryDirty.operations), true);
  assert.equal(writes.find(write => write.kind === 'b2w').body.updates.length, 1, 'only edited cells are sent');
  failB2w = false;
  const retry = page.evaluate(() => __test.saveManualServiceValues());
  await page.locator('#overwriteConfirmAccept').click();
  await retry;
  assert.equal(writes.filter(write => write.kind === 'rsa').length, 1, 'successful partial save is not resent');
  await open('special');
  await page.waitForTimeout(500);
  await page.locator('[data-b2c-state-summary-range="7d"]').click();
  await page.waitForTimeout(600);
  assert.deepEqual(await page.evaluate(() => { const w = __test.b2cStateSummaryWindow(); const n = __test.emailPitstopNetworks(w.to, { periodFrom: w.from, periodTo: w.to, salesMap: __test.state.summaryNetworkSalesByKey }); return [n.b2c[0].sales, n.b2c[0].target, n.bp[0].target]; }), [77, 84, 63]);
  assert.deepEqual(await page.evaluate(() => [__test.state.from, __test.state.to]), before);
  assert.equal(await page.evaluate(() => __test.pitstopStatusValue(11, 12)), 'yellow');
  assert.equal(await page.evaluate(() => __test.pitstopStatusValue(10, 12)), 'red');
  assert.equal(await page.evaluate(() => __test.pitstopStatusValue(12, 12)), 'green');
  // Inject mapping failures only in the isolated browser fixture, never in production.
  const originalMapping = await page.evaluate(() => ({ master: __test.state.data.pitstopMaster, audits: __test.state.pitstopReconciliation }));
  const longMissingName = 'BP NEW BRANCH ' + 'LONG LOCATION NAME '.repeat(8) + '<untrusted>';
  await page.evaluate(name => {
    const { state, b2cStateSummaryWindow, mappedGrafanaPitstops, render } = __test;
    const range = b2cStateSummaryWindow();
    state.data.pitstopMaster.push({ ...state.data.pitstopMaster[0] });
    mappedGrafanaPitstops({ from: range.from, to: range.to, pitstops: [
      { date: range.to, channel: 'HQ', pitstop: 'HQ PERLING', sales: 77 },
      { date: range.to, channel: 'BP', pitstop: 'BP JOHOR JAYA', sales: 63 },
      { date: range.to, channel: 'BP', pitstop: name, sales: 19 },
      { date: range.to, channel: 'BP', pitstop: 'BP ZERO SALES MISSING', sales: 0 }
    ] });
    render();
  }, longMissingName);
  const mappingAlert = page.getByRole('alert', { name: 'Pitstop reconciliation' });
  assert.equal(await mappingAlert.locator('li').count(), 3);
  assert.ok((await mappingAlert.innerText()).includes(longMissingName));
  assert.ok((await mappingAlert.innerText()).includes('ambiguous Master name'));
  assert.ok((await mappingAlert.innerText()).includes('96 sales excluded'));
  assert.equal(await mappingAlert.locator('untrusted').count(), 0, 'source names are escaped');
  assert.equal(await mappingAlert.getByRole('link', { name: 'Review Pitstop Master' }).getAttribute('href'), '/upload/');
  assert.match(await page.evaluate(() => __test.summaryCopyBlockReason(true)), /mapping issue/);
  assert.equal(await page.locator('[data-workflow-action="finalise"]').isDisabled(), true);
  await fs.mkdir(path.join(root, 'artifacts/workflow'), { recursive: true });
  await mappingAlert.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/mapping-alert-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await mappingAlert.scrollIntoViewIfNeeded();
  assert.ok(await mappingAlert.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth), 'long names fit inside mobile alert');
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/mapping-alert-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(original => {
    __test.state.data.pitstopMaster = original.master;
    __test.state.pitstopReconciliation = original.audits;
    __test.render();
  }, originalMapping);
  assert.equal(await page.getByRole('alert', { name: 'Pitstop reconciliation' }).count(), 0);
  assert.ok((await page.getByRole('status', { name: 'Pitstop reconciliation' }).innerText()).includes('Pitstop sales reconciled'));
  console.log('Copy gate:', await page.evaluate(() => __test.summaryCopyBlockReason(true)));
  await page.evaluate(() => __test.copyEmailSummary());
  const clipboard = await page.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.__clipboardHtml || '', 'text/html');
    const tables = Array.from(doc.querySelectorAll('table'));
    return { text: doc.body.textContent, inputs: doc.querySelectorAll('input,button').length, tables: tables.length, dots: doc.querySelectorAll('img').length, html: window.__clipboardHtml || '' };
  });
  assert.ok(clipboard.tables > 8);
  assert.ok(!clipboard.text.includes('Weekly Top 3'), 'hidden weekly tables are omitted, not just styled hidden');
  await page.locator('[data-email-ranking-toggle]').click();
  await page.evaluate(() => __test.copyEmailSummary());
  const expandedCopy = await page.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.__clipboardHtml || '', 'text/html');
    return { text: doc.body.textContent, tables: doc.querySelectorAll('table').length };
  });
  assert.ok(expandedCopy.text.includes('Weekly Top 3'), 'visible weekly tables are included');
  assert.equal(expandedCopy.tables, clipboard.tables + 4);
  await page.locator('[data-email-ranking-toggle]').click();
  assert.equal(clipboard.inputs, 0, 'copied report has values, not input controls');
  assert.ok(clipboard.text.includes('HQ PERLING'));
  assert.ok(clipboard.text.includes('28'), 'copied Summary includes the latest saved Indonesia record');
  assert.ok(!clipboard.text.includes('9999'), 'copied Summary excludes stale workbook values');
  assert.ok(clipboard.dots > 0 || /color:.*(?:#|rgb)/.test(clipboard.html), 'achievement indicators have copy-safe color content');
  await fs.mkdir(path.join(root, 'artifacts/workflow'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/workflow/outlook-paste-sample.html'), clipboard.html);
  assert.equal(await page.evaluate(() => __test.reportReadiness().filter(row => row.ready).length), 9);
  assert.equal(await page.evaluate(() => __test.reportVersionSnapshot().master.fingerprint.length), 64);
  const finalise = page.locator('[data-workflow-action="finalise"]');
  await finalise.click();
  await page.getByRole('button', { name: 'Finalise version 1', exact: true }).click();
  await page.getByText('Retry will use this same snapshot.', { exact: false }).waitFor();
  assert.equal(await page.locator('#reportVersionNote').isDisabled(), true, 'uncertain submission keeps its original content for idempotent retry');
  await page.getByRole('button', { name: 'Finalise version 1', exact: true }).click();
  await page.getByRole('button', { name: 'Copy this version', exact: true }).waitFor();
  assert.equal((await (await archive.call()).json()).latest, 1, 'a lost response and retry create only one version');
  const archived = await (await archive.call(null, 'date=2026-08-23&version=1')).json();
  assert.equal(archived.snapshot.filters.network.from, '2026-08-17');
  assert.equal(archived.snapshot.rules.tierDailyTargets.join(','), '12,9,7');
  assert.ok(!archived.html.includes('Weekly Top 3'));
  assert.ok(archived.html.includes('HQ PERLING'));
  assert.ok(archived.html.includes(String.fromCodePoint(128994)), 'sanitizer preserves colored achievement circles');
  await page.getByRole('button', { name: 'Copy this version', exact: true }).click();
  await page.waitForFunction(expected => window.__clipboardHtml === expected, archived.html);
  assert.equal(await page.evaluate(() => window.__clipboardHtml), archived.html);
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/finalised-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/finalised-mobile.png') });
  assert.ok(await page.locator('#reportArchiveDialog').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  await page.locator('#reportArchiveClose').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await finalise.click();
  await page.getByRole('button', { name: 'Finalise version 2', exact: true }).click();
  assert.match(await page.locator('.report-archive-status').innerText(), /Enter a reason/);
  await page.locator('#reportVersionNote').fill('Reviewed updated source snapshot');
  await page.getByRole('button', { name: 'Finalise version 2', exact: true }).click();
  await page.getByRole('button', { name: 'Copy this version', exact: true }).waitFor();
  assert.equal((await (await archive.call()).json()).latest, 2);
  await page.locator('#reportArchiveClose').click();

  // Recovery is explicit, never an automatic server write, and keeps date/revision ownership.
  await open('operations-summary');
  await page.locator('[data-rsa-input][data-rsa-date="2026-08-23"][data-rsa-field="rsaFuel"]').fill('8');
  await page.locator('[data-b2w-input][data-b2w-date="2026-08-23"]').fill('35');
  const writesBeforeReload = writes.length;
  stores.rsa.values['2026-08-23'].rsaFuel = 7;
  stores.rsa.revisions['2026-08-23:rsaFuel'] = 2;
  await page.reload();
  await page.waitForFunction(() => window.__test && !__test.state.cloudLoading && Object.values(__test.state.manualSourcesReady).every(Boolean));
  assert.equal(await page.evaluate(() => Object.keys(__test.state.summaryDrafts).length), 0);
  await page.getByRole('button', { name: 'Recover drafts', exact: true }).click();
  assert.equal(writes.length, writesBeforeReload);
  assert.equal(await page.locator('[data-rsa-input][data-rsa-date="2026-08-23"][data-rsa-field="rsaFuel"]').inputValue(), '8');
  assert.equal(await page.locator('[data-b2w-input][data-b2w-date="2026-08-23"]').inputValue(), '35');
  assert.equal(await page.evaluate(() => Object.values(__test.state.summaryDrafts).find(d => d.kind === 'rsa').revision), 1, 'recovery retains stale revision, not the latest server revision');
  await page.getByRole('button', { name: 'Review edits', exact: true }).click();
  const b2wDraft = page.locator('.draft-review-row').filter({ hasText: 'B2W' });
  await b2wDraft.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.locator('#overwriteConfirmAccept').click();
  assert.equal(await page.evaluate(() => Object.keys(__test.state.summaryDrafts).length), 1, 'individual discard preserves other drafts');
  await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  await page.locator('#overwriteConfirmAccept').click();
  assert.equal(writes.length, writesBeforeReload);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('daily-report-drafts-v1:')).length), 0);
  await page.evaluate(() => __test.setRange('7d'));
  await open('special');
  await page.waitForTimeout(600);
  await page.locator('[data-workflow-action="versions"]').click();
  await page.locator('[data-report-version="1"]').click();
  await page.getByRole('button', { name: 'Copy this version', exact: true }).click();
  await page.waitForFunction(expected => window.__clipboardHtml === expected, archived.html);
  assert.equal(await page.evaluate(() => window.__clipboardHtml), archived.html, 'version 1 remains byte-identical after live source values change');
  await page.locator('#reportArchiveClose').click();

  // Missing fields link directly to the relevant dated editor.
  await page.evaluate(() => { delete __test.state.manualRsaValues['2026-08-23'].rsaFuel; __test.render(); });
  assert.equal(await finalise.isDisabled(), true);
  await page.locator('.report-readiness-row').filter({ hasText: 'RSA' }).getByRole('button', { name: 'Review', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-rsa-date')), '2026-08-23');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-rsa-field')), 'rsaFuel');
  await open('special');
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/summary-desktop.png') });
  await open('services');
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/services-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await open('special');
  await page.screenshot({ path: path.join(root, 'artifacts/workflow/summary-mobile.png') });
  await page.evaluate(() => { delete __test.state.manualRsaValues['2026-08-23'].rsaFuel; __test.state.resqApiAvailable = false; __test.state.warrantyApiAvailable = false; __test.state.emailSalesSyncRange = ''; __test.render(); });
  assert.ok(await page.evaluate(() => Number.isNaN(__test.rowsInRange().at(-1).rsaFuel)));
  assert.ok(await page.evaluate(() => Number.isNaN(__test.rowsInRange().at(-1).resQ)));
  assert.ok(await page.evaluate(() => !!__test.summaryCopyBlockReason(true)), 'missing sources block copy');
  await open('services');
  assert.equal(await page.locator('svg [y="NaN"], svg [height="NaN"]').count(), 0);
  assert.match(await page.locator('[data-service-card-index="3"]').innerText(), /Repeat rate\s+N\/A/i);
  await open('overview');
  assert.equal(await page.locator('svg [y="NaN"], svg [height="NaN"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: all tabs, exact targets, source isolation, partial saves, conflicts, recovery after reload, per-field discard, readiness links, immutable report versions, revision reason, archived copy and responsive screenshots.');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Page:', (await page.locator('body').innerText().catch(() => 'unavailable')).slice(-3500));
  throw error;
} finally { await browser.close(); }
