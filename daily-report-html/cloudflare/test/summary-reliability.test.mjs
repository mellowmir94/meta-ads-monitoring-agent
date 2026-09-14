import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);
const htmlPath = new URL('../../src/dashboard.html', import.meta.url);
const cssPath = new URL('../../src/dashboard.css', import.meta.url);
const buildPath = new URL('../../build-cloudflare.mjs', import.meta.url);
const workerPath = new URL('../../cloudflare/src/worker.js', import.meta.url);

test('Summary shows section-specific source health and explicit refresh controls', async () => {
  const [source, css] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);

  assert.match(source, /function summarySourceHealthEntries\(view\)/);
  assert.match(source, /summaryHealthEntry\('workbook', 'Workbook'/);
  for (const key of ['emailSales', 'pitstop', 'rsaManual', 'b2wManual', 'resq', 'warranty', 'bgarageManual', 'indonesiaManual']) {
    assert.match(source, new RegExp(`summaryHealthEntry\\('${key}'`));
  }
  assert.match(source, /data-refresh-summary/);
  assert.match(source, /state\.cloudLoading \? 'Refreshing\.\.\.' : 'Refresh data'/);
  assert.match(css, /\.summary-source-health \{/);
  assert.match(css, /\.summary-health-item\.is-fallback/);
  assert.match(css, /\.summary-health-item\.is-error/);
});

test('one mapping registry owns aliases, geography, corrections, and report ordering', async () => {
  const source = await readFile(dashboardPath, 'utf8');

  assert.match(source, /var REPORT_MAPPING_REGISTRY = \{/);
  assert.match(source, /stateAliases: \{/);
  assert.match(source, /stateRegions: \{/);
  assert.match(source, /REPORT_MAPPING_REGISTRY\.pitstopStateOverrides = PITSTOP_STATE_CORRECTIONS/);
  assert.match(source, /REPORT_MAPPING_REGISTRY\.summary\.stateOrder = SUMMARY_STATE_ORDER/);
  assert.match(source, /REPORT_MAPPING_REGISTRY\.summary\.pitstopOrder = SUMMARY_PITSTOP_ORDER/);
  assert.match(source, /REPORT_MAPPING_REGISTRY\.stateAliases\[key\]/);
  assert.match(source, /REPORT_MAPPING_REGISTRY\.stateRegions\[stateName\]/);
});

test('Summary copy uses a completed immutable snapshot and blocks unsaved edits', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copySource = source.slice(copyStart, copyEnd);

  assert.match(source, /summaryCopySnapshot: null/);
  assert.match(source, /function captureSummaryCopySnapshot\(\)/);
  assert.match(source, /html: source\.outerHTML/);
  assert.match(source, /function markSummaryDirty\(kind\)/);
  assert.match(source, /Save the edited values before copying/);
  assert.match(source, /disabled title=/);
  assert.match(copySource, /var snapshotHost = createSummarySnapshotHost\(\)/);
  assert.match(copySource, /var source = snapshotHost && snapshotHost\.querySelector\('#emailSummaryContent'\)/);
});

test('Full Summary copy does not wait for independent BGarage or Indonesia inputs', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const start = source.indexOf('function summaryCopyBlockReason(ignoreSnapshot)');
  const end = source.indexOf('function summaryCopyButton', start);
  const copyRules = source.slice(start, end);

  assert.match(copyRules, /key !== 'bgarageManual' && key !== 'indonesiaManual'/);
  assert.doesNotMatch(copyRules, /BGarage and Indonesia values are still loading/);
  assert.doesNotMatch(copyRules, /BGarage has no saved record/);
  assert.doesNotMatch(copyRules, /Save the BGarage\/Indonesia drafts before copying the combined report/);
  assert.match(source, /function reportReadiness\(\)/);
  assert.match(source, /\['bgarage', 'indonesia'\]\.forEach/);
});

test('Full Summary copy permits incomplete RSA and B2W entries while keeping Operations strict', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const start = source.indexOf('function summaryCopyBlockReason(ignoreSnapshot)');
  const end = source.indexOf('function summaryCopyButton', start);
  const copyRules = source.slice(start, end);

  assert.match(copyRules, /if \(view === 'operations-summary'\) \{\s*var incomplete = rowsInRange\(\)/);
  assert.doesNotMatch(copyRules, /view === 'special' \|\| view === 'operations-summary'\) \{\s*var incomplete/);
  assert.match(source, /\['rsa', 'b2w'\]\.forEach/);
});

test('live source fetches retain a recent successful range and force refresh bypasses caches', async () => {
  const [source, worker] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(workerPath, 'utf8')
  ]);

  assert.match(source, /SOURCE_SNAPSHOT_STORAGE_KEY/);
  assert.match(source, /function rememberSuccessfulSourceSnapshot/);
  assert.match(source, /function recoverSuccessfulSourceSnapshot/);
  assert.match(source, /state\.sourceFallbacks\[sourceKey\]/);
  assert.match(source, /state\.forceDataRefresh \? '&refresh=1' : ''/);
  assert.match(source, /clearLiveDataCachesForRefresh\(\)/);
  assert.equal((worker.match(/searchParams\.get\('refresh'\) === '1' \? null : await cache\.match\(cacheKey\)/g) || []).length, 5);
});

test('hosted builds expose a deterministic version and prevent stale HTML caching', async () => {
  const [source, html, build, worker] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(htmlPath, 'utf8'),
    readFile(buildPath, 'utf8'),
    readFile(workerPath, 'utf8')
  ]);

  assert.match(build, /createHash\('sha256'\)/);
  assert.match(build, /window\.__DASHBOARD_BUILD_ID__/);
  assert.match(build, /version\.json/);
  assert.match(html, /id="appVersionNotice"/);
  assert.match(source, /fetch\('\/version\.json\?check=' \+ Date\.now\(\)/);
  assert.match(source, /payload\.buildId === window\.__DASHBOARD_BUILD_ID__/);
  assert.match(worker, /pathname === '\/version\.json'/);
  assert.match(worker, /no-store, max-age=0, must-revalidate/);
});

test('Summary views do not expose Print or PDF buttons', async () => {
  const [source, css] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);

  assert.doesNotMatch(source, /data-print-special/);
  assert.doesNotMatch(source, /Print \/ save PDF/i);
  assert.doesNotMatch(css, /special-print-button/);
});

test('BGarage status classification centers the achievement thresholds', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /\.email-summary-document \.email-classification th:first-child,\s*\.email-summary-document \.email-classification td:first-child \{ text-align: center !important; \}/);
});
