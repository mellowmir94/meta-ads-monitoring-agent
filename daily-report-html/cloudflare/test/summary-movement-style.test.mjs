import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssPath = new URL('../../src/dashboard.css', import.meta.url);
const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);
const uploadCentrePath = new URL('../../src/data-upload-centre.js', import.meta.url);
const workerPath = new URL('../../cloudflare/src/worker.js', import.meta.url);

test('summary decrease movement uses a red cell with regular black text', async () => {
  const [css, source] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(dashboardPath, 'utf8')
  ]);
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);

  assert.match(css, /\.email-movement\.decrease\s*\{[^}]*background-color:\s*#f8d7da\s*!important;[^}]*color:\s*#000\s*!important;/s);
  assert.match(copyHandler, /cell\.setAttribute\('bgcolor', '#f8d7da'\)/);
  assert.match(copyHandler, /movementText\.setAttribute\('color', '#000000'\)/);
  assert.match(copyHandler, /movementText\.style\.setProperty\('font-weight', '400', 'important'\)/);
  assert.doesNotMatch(copyHandler, /movementText\.setAttribute\('color', '#ff0000'\)/);
});

test('summary header clipboard layout matches the current reference paste dimensions', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);

  assert.match(copyHandler, /clone\.style\.width = '646px'/);
  assert.match(copyHandler, /salesTable\.style\.width = '646px'/);
  assert.match(copyHandler, /var columnWidths = \['122px', '125px', '150px', '129px', '120px'\]/);
  assert.match(copyHandler, /cell\.style\.height = '30px'/);
  assert.match(copyHandler, /intro\.style\.whiteSpace = 'nowrap'/);
  assert.match(copyHandler, /cellText\.style\.setProperty\('font-weight', '400', 'important'\)/);
});

test('Full Summary tables keep bold headers and totals with regular values', async () => {
  const [css, source] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(dashboardPath, 'utf8')
  ]);
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);
  const summaryStart = source.indexOf('function renderEmailSummary()');
  const summaryEnd = source.indexOf('function renderOperationsSummary()', summaryStart);
  const summaryRenderer = source.slice(summaryStart, summaryEnd);

  assert.match(css, /\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-table tbody td \{\s*font-weight: 400 !important;/s);
  assert.match(css, /\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-table thead th,\s*\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-table \.email-column-row th,\s*\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-table \.email-state-title th \{\s*font-weight: 700 !important;/s);
  assert.match(css, /\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-table tbody \.email-total-row > td,[\s\S]*font-weight: 700 !important;/s);
  assert.match(css, /\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-b2w-input \{\s*font-weight: 400 !important;/s);
  assert.match(css, /\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-section-lead \{\s*font-weight: 400 !important;/s);
  assert.match(css, /\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-section-lead strong \{\s*font-weight: 700 !important;/s);
  assert.match(copyHandler, /var fullSummaryCopy = !summaryHeaderCopy && !operationsSummaryCopy && !bgarageSummaryCopy && !indonesiaSummaryCopy/);
  assert.match(copyHandler, /clone\.querySelectorAll\('\.email-summary-document \.email-table'\)/);
  assert.match(copyHandler, /table\.querySelectorAll\('tbody td'\)/);
  assert.match(copyHandler, /tbody td strong, tbody \.email-total-row > td, tbody \.email-total-row > td \*, tbody td\.email-tier-total/);
  assert.match(copyHandler, /text\.style\.fontWeight = \(fullSummaryCopy \|\| operationsSummaryCopy \|\| bgarageSummaryCopy \|\| indonesiaSummaryCopy\) \? '400' : '700'/);
  assert.match(copyHandler, /prepareCopiedBGarageTables\(clone, bgarageSummaryCopy \|\| indonesiaSummaryCopy \|\| fullSummaryCopy\)/);
  assert.match(summaryRenderer, /var salesBody = [^\n]*formatNumber\(row\.b2b2c\) \+ '<\/td><td>' \+ formatNumber\(totalSales\(row\)\)/);
  assert.match(css, /\.email-summary-document:not\(\.operations-summary-document\):not\(\[data-copy-variant\]\) \.email-bgarage-table tbody tr:not\(\.email-total-row\) td:not\(:first-child\)[\s\S]*font-weight: 400 !important;/s);
  assert.match(copyHandler, /clone\.querySelectorAll\('\.email-section-lead'\)\.forEach\(function\(element\) \{ element\.style\.fontWeight = '400'; \}\)/);
});

test('Full Summary clipboard locks the rendered table and cell widths for Outlook', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);

  assert.match(copyHandler, /if \(fullSummaryCopy\) \{[\s\S]*var sourceTables = Array\.from\(source\.querySelectorAll\('table'\)\)/);
  assert.match(copyHandler, /var tableWidth = Math\.round\(sourceTable\.getBoundingClientRect\(\)\.width\)/);
  assert.match(copyHandler, /copiedTable\.setAttribute\('width', String\(tableWidth\)\)/);
  assert.match(copyHandler, /var cellWidth = Math\.round\(sourceCell\.getBoundingClientRect\(\)\.width\)/);
  assert.match(copyHandler, /copiedCell\.setAttribute\('width', String\(cellWidth\)\)/);
});

test('B2C and B2B2C performance tables share one independent local date shortcut', async () => {
  const [css, source] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(dashboardPath, 'utf8')
  ]);
  const summaryStart = source.indexOf('function renderEmailSummary()');
  const summaryEnd = source.indexOf('function renderOperationsSummary()', summaryStart);
  const summary = source.slice(summaryStart, summaryEnd);

  assert.match(source, /b2cStateSummaryPreset: 'previous'/);
  assert.match(source, /emailRankingCollapsed: true/);
  assert.match(source, /function b2cStateSummaryWindow\(\)/);
  assert.match(source, /allowed\.indexOf\(state\.b2cStateSummaryPreset\) !== -1 \? state\.b2cStateSummaryPreset : 'previous'/);
  assert.match(source, /preset === 'previous'\) \{ from = reportTo; to = reportTo; \}/);
  assert.doesNotMatch(source, /preset === 'previous'\) \{ from = shiftIsoDate\(reportTo, -1\)/);
  assert.match(source, /\['all', 'previous', 'fri-sun', '7d', '14d', 'month'\]/);
  assert.match(source, /preset === 'fri-sun'\) \{[\s\S]*?to = shiftIsoDate\(reportTo, -weekday\);[\s\S]*?from = shiftIsoDate\(to, -2\);/);
  assert.match(source, /'fri-sun': 'Previous Fri-Sun'/);
  assert.match(source, /function b2cStateSummaryFilterMarkup\(\)/);
  assert.match(source, /data-b2c-state-summary-range/);
  assert.match(source, /state\.b2cStateSummaryPreset = button\.getAttribute\('data-b2c-state-summary-range'\)/);
  assert.match(source, /if \(state\.view === 'special'\) \{[\s\S]*state\.b2cStateSummaryPreset = 'previous';[\s\S]*resetSummaryNetworkSales\(\);/);
  assert.match(source, /state\.emailRankingCollapsed \? 'Show weekly tables' : 'Hide weekly tables'/);
  assert.match(summary, /b2cStateWindow\.preset === 'report' \? normalNetworks : emailPitstopNetworks/);
  assert.match(summary, /var achievementNetworks = state\.weekendAverageActive && b2cStateWindow\.preset === 'report' \? emailPitstopNetworks/);
  assert.match(summary, /var hqRows = emailVisibleB2cRows\(summaryNetworks\.b2c\), bpRows = summaryNetworks\.bp/);
  assert.match(summary, /emailStateSummary\(hqRows, 'B2C', \{ localFilter: true \}\)/);
  assert.match(source, /weeklyRankingPreset: 'current'/);
  assert.match(source, /function weeklyRankingWindow\(\)/);
  assert.match(source, /state\.weeklyRankingPreset === 'previous-week'/);
  assert.match(source, /data-weekly-ranking-previous/);
  assert.match(source, /Previous week/);
  assert.match(summary, /emailWeeklyTopBottom\(weeklyHqRows, 'Pitstop', \{ showFilter: true/);
  assert.match(summary, /emailTierSummary\(achievementHqRows, 'B2C'\)/);
  assert.match(summary, /emailPitstopDetails\(achievementHqRows, 'B2C'\)/);
  assert.match(summary, /emailStateSummary\(bpRows, 'BP'\)/);
  assert.match(summary, /emailWeeklyTopBottom\(weeklyNetworks\.bp, 'BP'/);
  assert.match(summary, /emailTierSummary\(achievementBpRows, 'BP'\)/);
  assert.match(summary, /emailPitstopDetails\(achievementBpRows, 'B2B2C'\)/);
  assert.match(source, /aria-label="B2C and B2B2C performance table date filter"/);
  assert.match(source, /if \(state\.weekendAverageActive\) \{[\s\S]*state\.b2cStateSummaryPreset = 'report';[\s\S]*resetSummaryNetworkSales\(\);/);
  assert.match(css, /\.email-local-summary-heading \{ display: flex;/);
  assert.match(css, /\.email-local-filter-button\.is-active \{[^}]*background: #0a8c7e;[^}]*color: #fff;/s);
  assert.match(source, /data-copy-exclude><span class="email-local-summary-filter-status/);
  assert.match(source, /clone\.querySelectorAll\('\.email-local-summary-heading'\)/);
  assert.match(source, /heading\.style\.display = 'block'/);
});

test('Summary performance shortcut fetches Grafana sales and accumulates fixed daily tier targets', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const syncStart = source.indexOf('async function syncSummaryNetworkSales()');
  const syncEnd = source.indexOf('function scheduleSummaryNetworkSalesSync', syncStart);
  const snapshotStart = source.indexOf('function emailLatestPitstopSnapshot');
  const snapshotEnd = source.indexOf('function applyGrafanaSummarySales', snapshotStart);
  const sync = source.slice(syncStart, syncEnd);
  const snapshot = source.slice(snapshotStart, snapshotEnd);

  assert.match(source, /function targetForTier\(value\) \{ var tier = canonicalTier\(value\); return tier === 'Tier 1' \? 12 : tier === 'Tier 2' \? 9 : tier === 'Tier 3' \? 7 : 0; \}/);
  assert.match(sync, /fetchPitstopPerformance\(summaryWindow\.from, summaryWindow\.to, controller\.signal\)/);
  assert.match(sync, /var salesMap = grafanaPitstopSalesMap\(payload\)/);
  assert.match(sync, /state\.summaryNetworkSalesByKey = salesMap/);
  assert.match(source, /scheduleSummaryNetworkSalesSync\(0\)/);
  assert.match(source, /if \(summarySalesMap\) summaryNetworkOptions\.salesMap = summarySalesMap/);
  assert.match(snapshot, /var localDays = grafanaDateRange\(selectedFrom, selectedTo\)\.length \|\| 1/);
  assert.match(snapshot, /var dailyTarget = targetForTier\(row\.tier\) \|\| numberValue\(row\.target\), target = dailyTarget \* localDays/);
  assert.match(snapshot, /salesMap: localSalesMap, zeroUnmatched: true/);
  assert.match(source, /!summaryNetworkDataReady\(b2cStateWindow\)/);
});

test('Summary operational tables use comfortable header-led widths on screen and in Outlook', async () => {
  const [source, css] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);

  assert.match(source, /rsa: \[100, 150, 154, 124, 130, 100\]/);
  assert.match(source, /resq: \[100, 150, 156, 128, 152, 136\]/);
  assert.match(source, /warranty: \[100, 228, 238, 234\]/);
  assert.match(source, /function operationsTableStart\(key, className\)/);
  assert.match(source, /operationsTableStart\('rsa', 'operations-rsa-table'\)/);
  assert.match(source, /operationsTableStart\('resq', 'operations-resq-table'\)/);
  assert.match(source, /operationsTableStart\('warranty', 'operations-warranty-table'\)/);
  assert.match(css, /\.operations-fit-table \{[\s\S]*width: var\(--operations-table-width\);[\s\S]*table-layout: fixed;/);
  assert.match(copyHandler, /table\.getAttribute\('data-operations-table'\)/);
  assert.match(copyHandler, /operationsTableWidths\(tableKey\)\.map/);
  assert.match(source, /id="emailSummaryContent" data-copy-variant="operations-summary"/);
});

test('BGarage clipboard matches the requested Outlook bold hierarchy and status colors', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);
  const prepStart = source.indexOf('function prepareCopiedBGarageTables(');
  const prepEnd = source.indexOf('async function copyEmailSummary(', prepStart);
  const prepHandler = source.slice(prepStart, prepEnd);

  assert.match(copyHandler, /var copyVariant = source\.getAttribute\('data-copy-variant'\)/);
  assert.match(copyHandler, /var bgarageSummaryCopy = copyVariant === 'bgarage-summary' \|\| state\.view === 'bgarage-summary'/);
  assert.match(copyHandler, /var indonesiaSummaryCopy = !bgarageSummaryCopy && \(copyVariant === 'indonesia-summary'/);
  assert.match(copyHandler, /var operationsSummaryCopy = !indonesiaSummaryCopy && !bgarageSummaryCopy && \(copyVariant === 'operations-summary'/);
  assert.match(source, /data-copy-variant="' \+ viewMode \+ '-summary"/);
  assert.match(prepHandler, /var columnWidths = \[140, 116, 117, 104, 88, 112, 120, 116, 137\]/);
  assert.match(prepHandler, /amount\.style\.fontWeight = regularBody \? '400' : '700'/);
  assert.match(copyHandler, /var statusColors = \{ achieved: '#c7ecd3', near: '#f7d326', below: '#f7dada', critical: '#f7dada', na: '#eceff1' \}/);
  assert.match(copyHandler, /var isOutlet = cell\.cellIndex === 0/);
  assert.match(copyHandler, /font-weight', isOutlet \? '700' : '400', 'important'/);
  assert.match(copyHandler, /tbody \.email-total-row td/);
});

test('Indonesia clipboard uses the grouped Outlook table layout', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const headerStart = source.indexOf('function manualIndonesiaHeader(');
  const renderStart = source.indexOf('function renderManualSummaryCombined(');
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const indonesiaHeader = source.slice(headerStart, renderStart);
  const copyHandler = source.slice(copyStart, copyEnd);

  assert.match(indonesiaHeader, /Total ' \+ manualIndonesiaMonthName\(\) \+ ' Sales/);
  assert.match(indonesiaHeader, /<th colspan="6">' \+ salesLabel/);
  assert.match(indonesiaHeader, /<th colspan="4">BATERIKU SALES<\/th><th colspan="2">PARTNER SALES/);
  assert.match(indonesiaHeader, /<th>Charge<\/th><th>Warranty<\/th><th>Battery<\/th>/);
  assert.match(copyHandler, /var indonesiaSummaryCopy = !bgarageSummaryCopy && \(copyVariant === 'indonesia-summary'/);
  assert.match(copyHandler, /var indonesiaWidths = \[130, 130, 75, 100, 87, 88, 80, 82, 82, 88, 80, 86, 82, 88, 82\]/);
  assert.match(copyHandler, /table\.querySelectorAll\('thead \.email-indonesia-group-row th'\)/);
  assert.match(copyHandler, /cell\.setAttribute\('bgcolor', '#cfe5d5'\)/);
  assert.match(copyHandler, /tbody tr:not\(\.email-total-row\) td/);
  assert.doesNotMatch(source, /if \(section === 'daily'\) result\.baterikuCharge = 0/);
});

test('Indonesia dashboard total rows remain bold after editing', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /\.indonesia-summary-view \.manual-indonesia-table \.email-total-row > td,\s*\.indonesia-summary-view \.manual-indonesia-table \.email-total-row > td \*\s*\{\s*font-weight: 700 !important;/s);
});

test('Indonesia Summary has an editable yesterday-capped reporting date excluded from copy', async () => {
  const source = await readFile(dashboardPath, 'utf8');

  assert.match(source, /function indonesiaSummaryLatestDate\(\)/);
  assert.match(source, /function normalizeIndonesiaSummaryDate\(value\)/);
  assert.match(source, /data-indonesia-summary-date/);
  assert.match(source, /manual-reporting-date-editor" data-copy-exclude/);
  assert.match(source, /input\.addEventListener\('change', function\(\) \{ setIndonesiaSummaryDate\(input\.value\); \}\)/);
  assert.match(source, /if \(latest && date > latest\) date = latest/);
  assert.doesNotMatch(source, /if \(state\.view === 'indonesia-summary'\) state\.indonesiaSummaryDate = ''/);
});

test('BGarage Summary has an editable yesterday-capped reporting date and updates the main tab', async () => {
  const source = await readFile(dashboardPath, 'utf8');

  assert.match(source, /function bgarageSummaryLatestDate\(\)/);
  assert.match(source, /function normalizeBGarageSummaryDate\(value\)/);
  assert.match(source, /data-bgarage-summary-date/);
  assert.match(source, /manual-reporting-date-editor" data-copy-exclude/);
  assert.match(source, /input\.addEventListener\('change', function\(\) \{ setBGarageSummaryDate\(input\.value\); \}\)/);
  assert.doesNotMatch(source, /if \(state\.view === 'bgarage-summary'\) state\.bgarageSummaryDate = ''/);
  assert.match(source, /main BGarage performance tab was updated for/);
});

test('BGarage performance uses the shared Report Window for aggregation', async () => {
  const [source, css] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);

  assert.match(source, /function setCustomReportRangeBound\(bound, value\)/);
  assert.match(source, /getElementById\('fromDate'\)\.addEventListener\('change', function\(event\) \{ setCustomReportRangeBound\('from', event\.target\.value\); \}\)/);
  assert.match(source, /getElementById\('toDate'\)\.addEventListener\('change', function\(event\) \{ setCustomReportRangeBound\('to', event\.target\.value\); \}\)/);
  assert.match(source, /bgarageRowsForPeriod\(\)/);
  assert.doesNotMatch(source, /function bgarageRangeControls\(\)/);
  assert.doesNotMatch(source, /data-bgarage-range-from/);
  assert.doesNotMatch(css, /\.bgarage-range-toolbar/);
});

test('Indonesia Summary cumulative values are calculated from month-to-date daily rows', async () => {
  const source = await readFile(dashboardPath, 'utf8');

  assert.match(source, /function manualIndonesiaCumulativeForReportDate\(reportDate, dailyOverride\)/);
  assert.match(source, /var monthStart = reportDate\.slice\(0, 7\) \+ '-01'/);
  assert.match(source, /manualIndonesiaCumulativeForReportDate\(reportDate\)/);
  assert.match(source, /indonesiaManualRow\(indonesiaCumulative, 'cumulative', false, false\)/);
  assert.match(source, /updateManualIndonesiaCalculations\(true\)/);
});

test('Summary Indonesia hides the BGarage section on screen', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /\.email-summary-document \[hidden\] \{\s*display: none !important;/s);
});

test('Indonesia summary has no sign-off in the dashboard or copied report', async () => {
  const source = await readFile(dashboardPath, 'utf8');

  assert.doesNotMatch(source, /Thanks, and Best Regards\./);
});

test('all Summary tabs render and copy dates as DD.MM.YYYY', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const operationsStart = source.indexOf('function renderOperationsSummary()');
  const indonesiaStart = source.indexOf('function renderIndonesiaSummary()', operationsStart);
  const manualStart = source.indexOf('function renderManualSummaryCombined(viewMode)');
  const manualViewStart = source.indexOf('function renderManualSummaryView(viewMode)', manualStart);
  const headerStart = source.indexOf('function renderSummaryHeader()');
  const servicesStart = source.indexOf('function renderServices()', headerStart);
  const operations = source.slice(operationsStart, indonesiaStart);
  const manual = source.slice(manualStart, manualViewStart);
  const header = source.slice(headerStart, servicesStart);

  assert.match(source, /function formatSummaryDate\(iso\) \{[\s\S]*match\[3\] \+ '\.' \+ match\[2\] \+ '\.' \+ match\[1\]/);
  assert.match(operations, /formatSummaryDate\(row\.date\)/);
  assert.doesNotMatch(operations, /formatDate\(row\.date, true\)/);
  assert.match(manual, /formatSummaryDate\(reportDate\)/);
  assert.match(source, /formatSummaryDate\(manualEntryDate\('indonesia'\)\)/);
  assert.match(header, /formatSummaryDate\(row\.date\)/);
  assert.match(header, /formatSummaryDate\(reportDate\)/);
  assert.doesNotMatch(header, /emailOrdinalDate\(reportDate\)/);
  assert.match(source.slice(source.indexOf('function renderEmailSummary()'), headerStart), /formatSummaryDate\(row\.date\)/);
  assert.doesNotMatch(source.slice(source.indexOf('function renderEmailSummary()'), headerStart), /formatDate\(row\.date, true\)/);
});

test('Summary tables preserve dates and values while allowing long headers to wrap', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /\.email-summary-view > \.email-summary-document \{\s*width: 100%;\s*max-width: none;\s*\}/s);
  assert.match(css, /\.email-summary-document \.email-table th \{[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;[\s\S]*white-space: normal;/);
  assert.match(css, /\.email-summary-document \.email-table td \{[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;[\s\S]*white-space: nowrap;/);
  assert.match(css, /\.email-summary-document \.email-table-scroll \{[\s\S]*max-width: 100%;/);
});

test('Summary table headers align first column left and remaining headers center', async () => {
  const [css, source] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(dashboardPath, 'utf8')
  ]);
  assert.match(css, /\.email-table thead th \{ text-align: center; \}/);
  assert.match(css, /\.email-table thead tr:first-child th:first-child,\s*\.email-table tbody td:first-child \{ text-align: left; \}/);
  const copyStart = source.indexOf('async function copyEmailSummary(');
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);
  assert.match(copyHandler, /clone\.querySelectorAll\('thead th'\)\.forEach\(function\(cell\) \{ cell\.style\.textAlign = 'center'; \}\)/);
  assert.match(copyHandler, /clone\.querySelectorAll\('thead tr:first-child th:first-child, \.email-table \.email-column-row th:first-child'\)/);
  assert.match(copyHandler, /clone\.querySelectorAll\('\.email-detail-table td:not\(:first-child\), \.email-detail-table \.email-column-row th:not\(:first-child\)'\)/);
  assert.match(copyHandler, /\.email-detail-table td:nth-child\(2\), \.email-detail-table td:nth-child\(3\), \.email-detail-table td:nth-child\(4\)/);
});

test('B2C, B2B2C, and BP detail tables match the reference order, widths, and alignment', async () => {
  const [css, source] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(dashboardPath, 'utf8')
  ]);

  assert.match(css, /.email-detail-table \.email-column-row th:nth-child\(1\),\s*\.email-detail-table td:nth-child\(1\) \{ width: max-content; min-width: 32px; text-align: center; white-space: nowrap; \}/s);
  assert.match(css, /\.email-summary-document \.email-detail-table \.email-column-row th:first-child,[\s\S]*\.email-summary-document \.email-detail-table tbody td:first-child \{ text-align: center !important; \}/s);
  assert.match(css, /.email-detail-table \.email-column-row th:nth-child\(2\),\s*\.email-detail-table td:nth-child\(2\) \{ min-width: 220px; text-align: left; \}/s);
  assert.match(css, /.email-detail-table \.email-column-row th:nth-child\(3\),[\s\S]*\.email-detail-table td:nth-child\(4\) \{ text-align: left; \}/s);
  assert.match(css, /.email-detail-table \.email-column-row th:nth-child\(5\),[\s\S]*\.email-detail-table td:nth-child\(8\) \{ text-align: center; \}/s);
  assert.match(css, /\.email-detail-table \{ width: 776px; min-width: 776px; max-width: 776px; table-layout: fixed;/);
  assert.match(css, /\.email-detail-table \.email-state-title th,\s*\.email-detail-table \.email-state-title td \{[\s\S]*background: #cee5d4;/);
  assert.match(css, /\.email-summary-document \.email-detail-table th,\s*\.email-summary-document \.email-detail-table td \{[\s\S]*white-space: nowrap;/);
  assert.match(source, /<colgroup><col width="32"><col width="244"><col width="100"><col width="108"><col width="58"><col width="48"><col width="100"><col width="86"><\/colgroup>/);
  assert.match(source, /hq: \['JOHOR', 'MELAKA', 'N\.SEMBILAN', 'PUTRAJAYA', 'KUALA LUMPUR', 'SELANGOR', 'PERAK', 'PENANG', 'KEDAH', 'PERLIS', 'KELANTAN', 'TERENGGANU', 'PAHANG', 'SABAH', 'SARAWAK'\]/);
  assert.match(source, /var stateBandStyle = ' bgcolor="#cee5d4" style="background-color:#cee5d4"'/);
  assert.match(source, /<tr class="email-state-title"><td' \+ stateBandStyle \+ ' aria-hidden="true"><\/td><th' \+ stateBandStyle \+ ' scope="row">/);
  assert.match(source, /escapeHtml\(String\(row\.region \|\| ''\)\.toUpperCase\(\)\)/);
  assert.match(source, /escapeHtml\(emailSummaryStateLabel\(row\.state\)\)/);
  assert.match(source, /if \(stateName === 'Penang'\) return 'PENANG';/);
  assert.doesNotMatch(source, /return 'P\.PINANG';/);
  assert.match(source, /var largestNoLength = noCells\.reduce\(function\(maxLength, cell\)/);
  assert.match(source, /var noWidth = Math\.max\(32, largestNoLength \* 8 \+ 14\)/);
  assert.match(source, /clone\.querySelectorAll\('\.email-detail-table td:first-child, \.email-detail-table \.email-column-row th:first-child'\)\.forEach\(function\(cell\) \{ cell\.style\.setProperty\('text-align', 'center', 'important'\); \}\)/);
  assert.match(source, /cell\.setAttribute\('bgcolor', '#cee5d4'\)/);
  assert.match(source, /var detailColumnWidths = \[noWidth, 244, 100, 108, 58, 48, 100, 86\]/);
  assert.match(source, /cell\.setAttribute\('nowrap', 'nowrap'\)/);
  assert.match(source, /cell\.style\.setProperty\('overflow-wrap', 'normal', 'important'\)/);
  assert.match(source, /cell\.style\.setProperty\('word-break', 'normal', 'important'\)/);
});

test('reviewed state corrections assign Presint 15 and Teluk Intan without changing sales', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const helperStart = source.indexOf('var PITSTOP_STATE_CORRECTIONS');
  const helperEnd = source.indexOf('function regionForState(', helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  const reportedPitstopState = new Function('cleanKey', 'canonicalState', `${helperSource}; return reportedPitstopState;`)(
    value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
    value => String(value || '').trim() || 'Unassigned'
  );

  assert.equal(reportedPitstopState('HQ PRESINT 15 PUTRAJAYA', 'Selangor'), 'Putrajaya');
  assert.equal(reportedPitstopState('BP PUTRAJAYA', 'Selangor'), 'Putrajaya');
  assert.equal(reportedPitstopState(' bp putrajaya ', 'Selangor'), 'Putrajaya');
  assert.equal(reportedPitstopState('BP PUCHONG', 'Selangor'), 'Selangor');
  assert.equal(reportedPitstopState('HQ TELUK INTAN', 'Penang'), 'Perak');
  assert.equal(reportedPitstopState('BP TELUK INTAN (JLN CHANGKAT JONG)', 'Penang'), 'Perak');
  assert.equal(reportedPitstopState('HQ SETAPAK', 'Kuala Lumpur'), 'Kuala Lumpur');
  assert.match(source, /var stateName = reportedPitstopState\(name, cell\(row, \['state'\], 2\)\)/);
  assert.match(source, /var uploadedState = reportedPitstopState\(name, cell\(row, \['state'\], 3\)\)/);
  assert.match(source, /state: master \? master\.state : uploadedState/);
});

test('Summary clipboard replaces CSS-only achievement dots with Outlook-safe colored circles', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const prepareStart = source.indexOf('function prepareCopiedStatusDots(');
  const copyStart = source.indexOf('async function copyEmailSummary(', prepareStart);
  const prepareHandler = source.slice(prepareStart, copyStart);
  const copyEnd = source.indexOf('function printSpecialView', copyStart);
  const copyHandler = source.slice(copyStart, copyEnd);

  assert.match(prepareHandler, /var colors = \{ green: '#43c98d', yellow: '#edb72d', red: '#e63f56' \}/);
  assert.match(prepareHandler, /var glyphs = \{ green: String\.fromCodePoint\(128994\), yellow: String\.fromCodePoint\(128993\), red: String\.fromCodePoint\(128308\) \}/);
  assert.match(prepareHandler, /document\.createElement\('font'\)/);
  assert.match(prepareHandler, /circle\.setAttribute\('color', color\)/);
  assert.match(prepareHandler, /circle\.setAttribute\('face', 'Segoe UI Emoji'\)/);
  assert.match(prepareHandler, /circle\.textContent = glyphs\[status\]/);
  assert.match(prepareHandler, /inLegend = !!dot\.closest\('\.email-legend'\)/);
  assert.doesNotMatch(prepareHandler, /String\.fromCharCode\(9679\)/);
  assert.match(prepareHandler, /dot\.replaceWith\(circle\)/);
  assert.match(source, /<table class="email-legend" role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td>/);
  assert.match(copyHandler, /var copiedLegend = clone\.querySelector\('\.email-legend'\)/);
  assert.match(copyHandler, /copiedLegend\.setAttribute\('width', '360'\)/);
  assert.match(copyHandler, /row\.setAttribute\('height', '24'\)/);
  assert.match(copyHandler, /cell\.setAttribute\('height', '24'\)/);
  assert.match(copyHandler, /cell\.setAttribute\('nowrap', 'nowrap'\)/);
  assert.match(copyHandler, /cell\.style\.setProperty\('mso-line-height-rule', 'exactly'\)/);
  assert.match(copyHandler, /cell\.style\.setProperty\('white-space', 'nowrap', 'important'\)/);
  assert.match(copyHandler, /prepareCopiedStatusDots\(clone\)/);
});

test('Pitstop achievement status follows the fixed green, yellow, and red target rules', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const helperStart = source.indexOf('function pitstopStatusValue(');
  const helperEnd = source.indexOf('function normalizePayload(', helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  const pitstopStatusValue = new Function('numberValue', `${helperSource}; return pitstopStatusValue;`)(value => Number(value) || 0);

  assert.equal(pitstopStatusValue(12, 12), 'green');
  assert.equal(pitstopStatusValue(13, 12), 'green');
  assert.equal(pitstopStatusValue(11, 12), 'yellow');
  assert.equal(pitstopStatusValue(8, 9), 'yellow');
  assert.equal(pitstopStatusValue(6, 7), 'yellow');
  assert.equal(pitstopStatusValue(7, 9), 'red');
  assert.equal(pitstopStatusValue(5, 7), 'red');
  assert.equal(pitstopStatusValue(62, 63), 'yellow');
  assert.equal(pitstopStatusValue(90, 100), 'yellow');
  assert.equal(pitstopStatusValue(89, 100), 'red');
  assert.equal(pitstopStatusValue(0, 0), 'red');
  assert.doesNotMatch(source, /performanceStatus\([^\n]*pitstopThresholds/);
  assert.match(source, /row\.status = pitstopStatusValue\(row\.sales, row\.target\)/);
  assert.match(source, /row\.status = pitstopStatusValue\(sales, target\)/);
});

test('Summary-managed operational data drives the matching dashboard tabs', async () => {
  const [source, uploadCentre, worker] = await Promise.all([
    readFile(dashboardPath, 'utf8'),
    readFile(uploadCentrePath, 'utf8'),
    readFile(workerPath, 'utf8')
  ]);
  const operationsStart = source.indexOf('function renderOperationsSummary()');
  const indonesiaStart = source.indexOf('function renderIndonesiaSummary()', operationsStart);
  const servicesStart = source.indexOf('function renderServicesEnhanced()');
  const renderStart = source.indexOf('function render()', servicesStart);
  const operations = source.slice(operationsStart, indonesiaStart);
  const services = source.slice(servicesStart, renderStart);

  assert.match(operations, /serviceRows = rowsInRange\(\)/);
  assert.match(services, /var rows = rowsInRange\(\)/);
  assert.match(source, /function manualBGarageRowsForWindow\(from, to\)/);
  assert.match(source, /!manualDates\[row\.date\]/);
  assert.match(source, /function manualIndonesiaRowsForWindow\(from, to\)/);
  assert.match(source, /function indonesiaRowsForWindow\(from, to\)/);
  assert.match(source, /manualRows = manualIndonesiaRowsForWindow\(from, to\)/);
  assert.match(source, /baterikuCharge: numberValue\(daily\.baterikuCharge\)/);
  assert.match(source, /baterikuWarranty: numberValue\(daily\.baterikuWarranty\)/);
  assert.match(source, /var rows = indonesiaRowsInRange\(\)/);
  assert.match(source, /main Indonesia tab was updated for/);
  assert.match(source, /<th>Charge<\/th><th>Warranty<\/th>/);
  assert.match(uploadCentre, /var EXPECTED_SHEETS = \['Pitstop Master'\]/);
  assert.match(uploadCentre, /var REQUIRED_SHEETS = \['Pitstop Master'\]/);
  assert.match(worker, /\['serviceWarranty', 'bgarage', 'indonesia', 'pitstopMaster', 'pitstopRelocations', 'settings'\]/);
});
