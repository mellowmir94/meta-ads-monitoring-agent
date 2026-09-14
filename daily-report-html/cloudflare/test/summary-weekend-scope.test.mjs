import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);

test('weekend averaging is scoped to summary tier and detail tables', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const summaryStart = source.indexOf('function renderEmailSummary()');
  const headerStart = source.indexOf('function renderSummaryHeader()');
  const servicesStart = source.indexOf('function renderServices()');
  const summary = source.slice(summaryStart, headerStart);
  const header = source.slice(headerStart, servicesStart);

  assert.match(summary, /salesRows = normalSalesRows/);
  assert.doesNotMatch(summary, /weekendAverageSalesRows\(/);
  assert.match(summary, /emailStateSummary\(hqRows, 'B2C', \{ localFilter: true \}\)/);
  assert.match(summary, /state\.weekendAverageActive && b2cStateWindow\.preset === 'report'/);
  assert.match(summary, /var weeklyNetworks = state\.weeklyRankingPreset === 'previous-week'/);
  assert.match(summary, /weeklyHqRows = emailVisibleB2cRows\(weeklyNetworks\.b2c\)/);
  assert.match(summary, /emailWeeklyTopBottom\(weeklyHqRows, 'Pitstop', \{ showFilter: true/);
  assert.match(summary, /emailTierSummary\(achievementHqRows, 'B2C'\)/);
  assert.match(summary, /emailPitstopDetails\(achievementHqRows, 'B2C'\)/);
  assert.match(summary, /emailStateSummary\(bpRows, 'BP'\)/);
  assert.match(summary, /emailWeeklyTopBottom\(weeklyNetworks\.bp, 'BP'/);
  assert.match(summary, /emailTierSummary\(achievementBpRows, 'BP'\)/);
  assert.match(summary, /emailPitstopDetails\(achievementBpRows, 'B2B2C'\)/);
  assert.match(summary, /weekendAverageButton\(\)/);
  assert.match(summary, /weekendAverageStatus\(reportDate\)/);

  assert.match(header, /salesRows = normalSalesRows/);
  assert.doesNotMatch(header, /weekendAverageSalesRows\(/);
  assert.doesNotMatch(header, /weekendAverageButton\(/);
});

test('weekend achievement snapshot uses only Fri-Sun daily rows', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const snapshotStart = source.indexOf('function emailLatestPitstopSnapshot');
  const applyStart = source.indexOf('function applyGrafanaSummarySales');
  const snapshot = source.slice(snapshotStart, applyStart);

  assert.match(snapshot, /localPeriod = !weekendAverage && options && options\.periodFrom !== undefined/);
  assert.match(snapshot, /selectedFrom = weekendAverage \? weekendWindow\.from : localPeriod \? String\(options\.periodFrom \|\| ''\) : state\.from/);
  assert.match(snapshot, /selectedTo = weekendAverage \? weekendWindow\.to : localPeriod && options\.periodTo !== undefined \? String\(options\.periodTo \|\| ''\) : reportDate/);
  assert.match(snapshot, /state\.weekendPitstopSyncKey === weekendWindow\.key/);
  assert.match(snapshot, /salesMap: weekendMap/);
  assert.match(snapshot, /weekendAverage: true, days: weekendDays, useMap: false/);
  assert.match(snapshot, /aggregateEmailPitstopSnapshot\(weekendAverage \|\| localPeriod \? datedRows/);
  assert.match(snapshot, /return applyGrafanaSummarySales\(snapshot, localPeriod \? \{ useMap: false \} : undefined\)/);
});

test('weekend sales are fetched from the dedicated Fri-Sun pitstop range', async () => {
  const source = await readFile(dashboardPath, 'utf8');
  const syncStart = source.indexOf('async function syncWeekendAverageSales');
  const scheduleStart = source.indexOf('function scheduleWeekendSalesSync');
  const sync = source.slice(syncStart, scheduleStart);

  assert.match(sync, /fetchPitstopPerformance\(window\.from, window\.to/);
  assert.match(sync, /grafanaPitstopSalesMap\(payload\)/);
  assert.match(sync, /state\.weekendPitstopSalesByKey = weekendMap/);
  assert.doesNotMatch(sync, /\/api\/email-sales/);
});
