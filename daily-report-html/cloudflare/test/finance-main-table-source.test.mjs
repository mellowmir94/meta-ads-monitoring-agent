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
  const h = harness([panel(20, 'Main Table (Latest)', 'SELECT latest'), panel(19, 'Main Table', 'SELECT main')]);
  const result = await h.run();
  assert.equal(result.panel.title, 'Main Table');
  assert.equal(result.target.rawSql, 'SELECT main');
  assert.equal(h.requests.length, 1);
});

test('Main Table is still selected if Grafana moves it or changes its numeric ID', async () => {
  const h = harness([panel(20, 'Main Table (Latest)', 'SELECT latest'), { type: 'row', panels: [panel(83, 'Main Table', 'SELECT main')] }]);
  assert.equal((await h.run()).panel.id, 83);
});

test('a missing Main Table fails instead of silently querying Latest', async () => {
  await assert.rejects(harness([panel(20, 'Main Table (Latest)', 'SELECT latest')]).run(), /Main Table.*not found/);
});

test('duplicate Main Table titles fail instead of picking an arbitrary query', async () => {
  await assert.rejects(harness([panel(19, 'Main Table', 'SELECT first'), panel(20, 'Main Table', 'SELECT second')]).run(), /Main Table.*ambiguous/);
});
