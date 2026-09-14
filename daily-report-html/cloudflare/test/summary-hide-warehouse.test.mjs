import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);
const source = await readFile(dashboardPath, 'utf8');
const helperStart = source.indexOf('  function emailVisibleB2cRows(rows)');
const helperEnd = source.indexOf('  function emailTierNames(rows)', helperStart);

function helperContext(hidden) {
  const context = vm.createContext({
    state: { emailWarehouseHidden: hidden },
    canonicalChannel: value => String(value || '').toUpperCase(),
    escapeHtml: value => String(value)
  });
  vm.runInContext(source.slice(helperStart, helperEnd), context);
  return context;
}

test('Daily Report Summary hides warehouse rows by default', () => {
  assert.match(source, /emailWarehouseHidden: true/);
  const context = helperContext(true);
  const rows = [
    { name: 'HQ PERLING', channel: 'HQ' },
    { name: 'WH NILAI', channel: 'WH' },
    { name: 'WH LEGACY DEPOT', channel: '' },
    { name: 'WH INDERA MAHKOTA', channel: 'HQ' },
    { name: 'WH GONG BADAK', channel: 'HQ' },
    { name: 'WH PENGKALAN CHEPA', channel: 'HQ' },
    { name: 'WH SUNGAI PETANI', channel: 'HQ' },
    { name: 'WH BUTTERWORTH', channel: 'HQ' },
    { name: 'WH IPOH', channel: 'HQ' },
    { name: 'WH KAJANG SG CHUA', channel: 'HQ' },
    { name: 'WH INDAHPURA KULAI', channel: 'HQ' },
    { name: 'WH YONG PENG', channel: 'HQ' },
    { name: 'HQ WAREHOUSE NILAI', channel: 'HQ' },
    { name: 'WAREHOUSE SEREMBAN', channel: '' },
    { name: 'BP CHERAS', channel: 'BP' }
  ];

  assert.deepEqual(Array.from(context.emailVisibleB2cRows(rows), row => row.name), ['HQ PERLING', 'BP CHERAS']);
  assert.match(context.emailWarehouseToggleButton(), /class="[^"]*is-active[^"]*"/);
  assert.match(context.emailWarehouseToggleButton(), /aria-pressed="true"/);
  assert.match(context.emailWarehouseToggleButton(), />Show WH</);
});

test('Show WH restores warehouse rows without changing source data', () => {
  const context = helperContext(false);
  const rows = [{ name: 'HQ PERLING', channel: 'HQ' }, { name: 'WH NILAI', channel: 'WH' }];

  assert.equal(context.emailVisibleB2cRows(rows).length, 2);
  assert.equal(rows.length, 2);
  assert.match(context.emailWarehouseToggleButton(), />Hide WH</);
  assert.doesNotMatch(context.emailWarehouseToggleButton(), /is-active/);
});

test('WH visibility applies to every B2C performance table and copied snapshot', () => {
  const summaryStart = source.indexOf('function renderEmailSummary()');
  const summaryEnd = source.indexOf('function renderOperationsSummary()', summaryStart);
  const summary = source.slice(summaryStart, summaryEnd);

  assert.match(summary, /hqRows = emailVisibleB2cRows\(summaryNetworks\.b2c\)/);
  assert.match(summary, /achievementHqRows = emailVisibleB2cRows\(achievementNetworks\.b2c\)/);
  assert.match(summary, /weeklyHqRows = emailVisibleB2cRows\(weeklyNetworks\.b2c\)/);
  assert.match(summary, /emailStateSummary\(hqRows, 'B2C'/);
  assert.match(summary, /emailWeeklyTopBottom\(weeklyHqRows, 'Pitstop'/);
  assert.match(summary, /emailTierSummary\(achievementHqRows, 'B2C'\)/);
  assert.match(summary, /emailPitstopDetails\(achievementHqRows, 'B2C'\)/);
  assert.match(source, /hideWarehouse: state\.emailWarehouseHidden/);
  assert.match(source, /state\.emailWarehouseHidden = !state\.emailWarehouseHidden; render\(\);/);
});
