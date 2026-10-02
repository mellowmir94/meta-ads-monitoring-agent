import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
function harness(panels) {
  const requests = [];
  const context = {
    Map, Date, encodeURIComponent,
    FINANCE_PANEL_CACHE_SECONDS: 600,
    financePanelCache: new Map(), financeDashboardCache: new Map(), financeDashboardRequests: new Map(),
    fetch: async url => {
      requests.push(url);
      return { ok: true, json: async () => ({ dashboard: { panels } }) };
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const FINANCE_PANEL_MAP ='), source.indexOf('// Keep the Finance filter bar')), context);
  vm.runInContext(source.slice(source.indexOf('function nestedPanels('), source.indexOf('function removeTemplateCondition(')), context);
  vm.runInContext(source.slice(source.indexOf('async function financePanelTarget('), source.indexOf('function buildFinanceQuery(')), context);
  return {
    requests,
    run: () => vm.runInContext("financePanelTarget({ GRAFANA_URL: 'https://grafana.test', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture' }, FINANCE_PANEL_MAP['commission-main'], { forceFresh: true })", context)
  };
}
const panel = (id, title, rawSql) => ({ id, title, type: 'table', targets: [{ rawSql }] });

test('Commission resolves exactly Main Table, not Main Table (Latest)', async () => {
  const h = harness([panel(20, 'Main Table (Latest)', 'SELECT latest'), panel(25, 'Main Table', 'SELECT main')]);
  const result = await h.run();
  assert.equal(result.panel.title, 'Main Table');
  assert.equal(result.target.rawSql, 'SELECT main');
  assert.equal(h.requests.length, 1);
});

test('Main Table resolves inside nested rows without changing its pinned source ID', async () => {
  const h = harness([panel(20, 'Main Table (Latest)', 'SELECT latest'), { type: 'row', panels: [panel(25, 'Main Table', 'SELECT main')] }]);
  assert.equal((await h.run()).panel.id, 25);
});

test('a missing Main Table fails instead of silently querying Latest', async () => {
  await assert.rejects(harness([panel(20, 'Main Table (Latest)', 'SELECT latest')]).run(), /Main Table.*not found/);
});

test('the Main Table row heading does not make its queryable table ambiguous', async () => {
  const h = harness([
    { id: 18, title: 'Main Table', type: 'row', panels: [panel(25, 'Main Table', 'SELECT main')] },
    panel(20, 'Main Table (Latest)', 'SELECT latest')
  ]);
  const result = await h.run();
  assert.equal(result.panel.id, 25);
  assert.equal(result.target.rawSql, 'SELECT main');
});

test('an empty same-name table placeholder is not a data source', async () => {
  const h = harness([{ id: 17, title: 'Main Table', type: 'table', targets: [] }, panel(25, 'Main Table', 'SELECT main')]);
  assert.equal((await h.run()).panel.id, 25);
});

test('live Grafana duplicate titles select full-width Main Table 25, not the smaller table 26', async () => {
  const h = harness([
    { ...panel(25, 'Main Table', 'SELECT main'), gridPos: { h: 20, w: 24, x: 0, y: 10 } },
    { ...panel(20, 'Main Table (Latest)', 'SELECT latest'), gridPos: { h: 20, w: 24, x: 0, y: 30 } },
    { ...panel(26, 'Main Table', 'SELECT other'), gridPos: { h: 5, w: 5, x: 0, y: 50 } }
  ]);
  const result = await h.run();
  assert.equal(result.panel.id, 25);
  assert.equal(result.target.rawSql, 'SELECT main');
});

test('a missing pinned panel never falls back to the other Main Table', async () => {
  await assert.rejects(harness([panel(26, 'Main Table', 'SELECT other')]).run(), /Main Table.*not found/);
});

test('a renamed or non-table panel 25 never becomes the Commission source', async () => {
  await assert.rejects(harness([panel(25, 'Main Table (Latest)', 'SELECT latest'), panel(26, 'Main Table', 'SELECT other')]).run(), /Main Table.*not found/);
  await assert.rejects(harness([{ ...panel(25, 'Main Table', 'SELECT row'), type: 'row' }]).run(), /Main Table.*not found/);
});

test('a pinned table with only hidden SQL targets cannot become the data source', async () => {
  const hidden = panel(25, 'Main Table', 'SELECT hidden');
  hidden.targets[0].hide = true;
  await assert.rejects(harness([hidden, panel(26, 'Main Table', 'SELECT other')]).run(), /Main Table.*not found/);
});
