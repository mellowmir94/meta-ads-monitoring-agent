import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
function source(name) {
  const match = html.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n      \\}`));
  assert.ok(match, name);
  return match[0];
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('only the active dashboard loads; hidden tabs do not start API work', async () => {
  const panels = ['commission', 'reimbursement', 'branch', 'hq'].map((id) => ({ id }));
  const calls = [], idle = [], paints = [];
  const gates = new Map(panels.map((panel) => [panel.id, deferred()]));
  const state = { api: { loaded: {}, loading: {}, errors: {} } };
  const c = vm.createContext({ panels, state, CORE_FINANCE_PANEL_IDS: new Set(panels.map((p) => p.id)),
    activeTabPanels: () => [panels[0]], setStatus: () => {}, render: () => paints.push(Boolean(state.api.loaded.commission)),
    scheduleFinanceIdle: (fn) => idle.push(fn), loadGrafanaSupplemental: () => {},
    loadGrafanaData: async (id) => { calls.push(id); await gates.get(id).promise; state.api.loaded[id] = true; } });
  vm.runInContext(source('loadActiveTabData'), c);
  const loading = c.loadActiveTabData(false);
  assert.deepEqual(calls, ['commission']);
  gates.get('commission').resolve();
  await loading;
  assert.ok(paints.includes(true));
  assert.equal(state.api.loaded.reimbursement, undefined);
  assert.equal(state.api.loaded.branch, undefined);
  assert.equal(state.api.loaded.hq, undefined);
  idle.splice(0).forEach((fn) => fn());
  assert.deepEqual(calls, ['commission']);
});

test('an optional active tab loads when it is the current page', async () => {
  const panels = [{ id: 'core' }, { id: 'optional' }], calls = [];
  const c = vm.createContext({ panels, state: { api: { loaded: {}, loading: {}, errors: {} } }, CORE_FINANCE_PANEL_IDS: new Set(['core']),
    activeTabPanels: () => [panels[1]], setStatus: () => {}, render: () => {}, scheduleFinanceIdle: () => {},
    loadGrafanaData: async (id) => calls.push(id) });
  vm.runInContext(source('loadActiveTabData'), c);
  await c.loadActiveTabData(false);
  assert.deepEqual(calls, ['optional']);
});

test('same-scope loads share fetching and parsing; new filters and Refresh do not', async () => {
  const state = { dates: {}, filters: {}, grafanaFilterDirty: {}, grafanaScopeHydrated: {} }, calls = [];
  const c = vm.createContext({ state, financePanelLoadPromises: new Map(), performGrafanaDataLoad: () => { const gate = deferred(); calls.push(gate); return gate.promise; } });
  vm.runInContext(source('financeLoadScopeKey') + '\n' + source('loadGrafanaData'), c);
  const first = c.loadGrafanaData('commission-main');
  assert.equal(c.loadGrafanaData('commission-main'), first);
  assert.equal(calls.length, 1);
  state.filters['commission-main'] = { level: ['HIGH'] };
  const changed = c.loadGrafanaData('commission-main');
  const refreshed = c.loadGrafanaData('commission-main', true);
  assert.equal(calls.length, 3);
  assert.notEqual(first, changed); assert.notEqual(changed, refreshed);
  calls.forEach((gate) => gate.resolve());
  await Promise.all([first, changed, refreshed]);
  assert.equal(c.financePanelLoadPromises.size, 0);
});

test('an old response finishing parsing cannot overwrite a newer scope', async () => {
  const panel = { id: 'plain', title: 'Test table' }, oldParsing = deferred();
  const state = { api: { loaded: {}, loading: {}, errors: {} }, dates: {}, data: {}, grafanaTables: {}, imports: {}, dateDrafts: {} };
  let requestNumber = 0;
  const c = vm.createContext({ state, panels: [panel], Symbol, URLSearchParams,
    financePanelLoadTokens: new Map(), financePanelScopeVersions: new Map(), FINANCE_API_ENDPOINT: '/api/grafana/finance',
    activePanel: () => panel, setStatus: () => {}, render: () => {}, rows: (id) => state.data[id] || [],
    requestFinancePayload: async () => ({ response: { ok: true, status: 200 }, payload: { rows: [{ value: ++requestNumber }] }, elapsedMs: 1 }),
    canonicalizeFinancePayloadRows: async (_panel, payload) => payload.rows[0].value === 1 ? oldParsing.promise : payload.rows,
    normalizeFinanceBoundary: () => '', formatNumber: String, formatFinanceDate: String });
  vm.runInContext(source('performGrafanaDataLoad'), c);
  const old = c.performGrafanaDataLoad(panel.id, true);
  await tick();
  await c.performGrafanaDataLoad(panel.id, true);
  assert.equal(state.data.plain[0].value, 2);
  oldParsing.resolve([{ value: 1 }]);
  await old;
  assert.equal(state.data.plain[0].value, 2);
});

test('foreground requests use high priority; supplemental/background requests use low priority', async () => {
  const requests = [];
  const c = vm.createContext({ AbortController, performance, financeInflightRequests: new Map(), financePanelControllers: new Map(),
    activePanel: () => ({ id: 'commission-main' }),
    fetch: async (_url, options) => { requests.push(options); return { json: async () => ({ rows: [] }) }; } });
  vm.runInContext(source('requestFinancePayload'), c);
  await c.requestFinancePayload('/primary', 'commission-main');
  await c.requestFinancePayload('/other', 'reimbursement-details');
  await c.requestFinancePayload('/options', 'commission-main:options');
  assert.deepEqual(requests.map((request) => request.priority), ['high', 'low', 'low']);
  assert.ok(requests.every((request) => request.credentials === 'same-origin'));
  assert.doesNotMatch(html, /<link rel="preload" as="fetch" href="\/api\/grafana\/finance/);
});

test('Commission exact-refresh policy and guarded supplemental scope remain intact', () => {
  const primary = source('performGrafanaDataLoad'), supplemental = source('loadGrafanaSupplemental');
  assert.match(primary, /params\.set\("refresh", "1"\)/);
  assert.match(primary, /params\.set\("filters", financeGrafanaFilterParam\(panelId\)\)/);
  assert.match(supplemental, /financePanelScopeVersions\.get\(panelId\) !== scopeVersion/);
  assert.match(supplemental, /payload\.code === "queue_required"/);
});
