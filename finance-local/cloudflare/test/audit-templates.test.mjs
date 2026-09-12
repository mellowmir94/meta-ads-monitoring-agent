import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../audit-templates.js', import.meta.url), 'utf8');
test('master and table template libraries stay separate', () => {
  const main = 'commission-main', id = main + ':table', copy = main + ':copy:table-test';
  const state = Object.fromEntries(['dates','filters','charts','exceptionMode','exceptionOnly','hiddenColumns','tableColumnFilters','tableColumnFilterDrafts','search','searchDraft','sort','compactTables','data','imports'].map(key => [key, {}]));
  state.dates[main] = { start:'2026-09-01 00:00:00', end:'2026-09-07 23:59:59' };
  state.filters[main] = { arrival_status: ['pending'] };
  state.hiddenColumns[main] = ['paymenttotal'];
  state.tableColumnFilters[id] = { rider_name: ['Rider A'] };
  state.search[id] = 'Rider A';
  state.sort[main] = { key:'created_at', direction:'asc' };
  state.api = { loaded: {}, loading: {} };
  const ctx = vm.createContext({ state, structuredClone, console, panels:[{id:main}], chartState:()=>({statusSelection:'paid',selections:['Johor']}), readTableCopies:()=>[{id:'table-test',panelId:main,sourceKey:''}], tableCopyId:c=>c.panelId+':copy:'+c.id, validApiDateRange:()=>'', document:{addEventListener(){}}, localStorage:{setItem(){}}, LOCAL_PREVIEW:true, rows:()=>[], panelScopeMemo:new Map(), renderRowsCache:null });
  vm.runInContext(source + '\n globalThis.views = auditViews;', ctx);
  ctx.views.tables[id] = {slots:[],active:null};
  ctx.auditSaveSlot(id,0,'Pending');
  ctx.auditCloneView(id,copy);
  assert.equal(ctx.views.tables[copy].slots.filter(Boolean).length,0);
  assert.equal(ctx.auditTemplateLibrary().slots[0].name,'Pending');
  ctx.auditSaveSlot(copy,0,'Insurance');
  assert.equal(ctx.auditTemplateLibrary(copy).slots[0].name,'Insurance');
  assert.equal(ctx.auditTemplateLibrary(id).slots[0].name,'Pending');
  state.tableColumnFilters[id].rider_name.push('B');
  state.search[id]='changed';
  ctx.auditInstall(copy,ctx.auditTemplateLibrary(copy).slots[0].filterState);
  ctx.views.tables[copy].active = 0;
  assert.equal(state.search[copy],'Rider A');
  assert.equal(state.search[id],'changed');
  ctx.auditInstall(id,ctx.auditTemplateLibrary().slots[0].filterState);
  assert.equal(state.search[id],'Rider A');
  assert.deepEqual(state.tableColumnFilters[id],{rider_name:['Rider A']});
  assert.deepEqual(state.hiddenColumns[main],['paymenttotal']);
  assert.deepEqual(state.sort[main],{key:'created_at',direction:'asc'});
  for (let index = 1; index < 7; index++) ctx.auditSaveSlot(id, ctx.views.tables[id].slots.length, 'Template ' + (index + 1));
  assert.equal(ctx.auditTemplateLibrary().slots.length, 7);
  const before=structuredClone(state);
  assert.throws(()=>ctx.withAuditTable(id,()=>{throw new Error('test');}),/test/);
  for(const key of Object.keys(before)) assert.deepEqual(JSON.parse(JSON.stringify(state[key])),JSON.parse(JSON.stringify(before[key])));
  assert.equal(ctx.views.activeContext,false);
});

test('quick ranges use Malaysia dates and Monday to Sunday weeks', () => {
  const ctx = vm.createContext({ structuredClone, console, Intl, Date, document:{addEventListener(){}}, localStorage:{setItem(){}}, Map });
  vm.runInContext(source, ctx);
  const now = new Date('2026-09-10T01:00:00Z');
  assert.deepEqual({ ...ctx.auditQuickRange('today', now) }, { start:'2026-09-10 00:00:00', end:'2026-09-10 23:59:59' });
  assert.deepEqual({ ...ctx.auditQuickRange('last-week', now) }, { start:'2026-08-31 00:00:00', end:'2026-09-06 23:59:59' });
  assert.deepEqual({ ...ctx.auditQuickRange('this-month', now) }, { start:'2026-09-01 00:00:00', end:'2026-09-30 23:59:59' });
  assert.deepEqual({ ...ctx.auditQuickRange('previous-month', now) }, { start:'2026-08-01 00:00:00', end:'2026-08-31 23:59:59' });
});

test('a table column filter overrides only its matching dashboard filter', () => {
  const main = 'commission-main', id = main + ':table';
  const state = Object.fromEntries(['dates','filters','charts','exceptionMode','exceptionOnly','hiddenColumns','tableColumnFilters','tableColumnFilterDrafts','search','searchDraft','sort','compactTables','data','imports'].map(key => [key, {}]));
  state.dates[main] = { start:'2026-09-01 00:00:00', end:'2026-09-07 23:59:59' };
  state.filters[main] = { level:['NO COMMISSION'], arrival_status:['arrived'], branch_name:['HQ KINRARA'] };
  state.tableColumnFilters[id] = { level:{ mode:'include', values:['LOW'] } };
  const ctx = vm.createContext({ state, structuredClone, console, panels:[{id:main}], chartState:()=>({}), readTableCopies:()=>[], tableCopyId:()=>'', document:{addEventListener(){}}, localStorage:{setItem(){}}, Map });
  vm.runInContext(source, ctx);
  const scope = ctx.auditEffectiveScope(id);
  assert.equal(JSON.stringify(scope.filters.level), '[]');
  assert.equal(JSON.stringify(scope.filters.arrival_status), '["arrived"]');
  assert.equal(JSON.stringify(scope.filters.branch_name), '["HQ KINRARA"]');
  assert.equal(JSON.stringify(state.filters[main].level), '["NO COMMISSION"]');
});

test('tables continue following live top filters for fields without a local override', () => {
  const main = 'commission-main', id = main + ':table';
  const state = Object.fromEntries(['dates','filters','charts','exceptionMode','exceptionOnly','hiddenColumns','tableColumnFilters','tableColumnFilterDrafts','search','searchDraft','sort','compactTables','data','imports'].map(key => [key, {}]));
  state.dates[main] = { start:'2026-09-01 00:00:00', end:'2026-09-07 23:59:59' };
  state.filters[main] = { level:['LOW'], arrival_status:['arrived'] };
  state.tableColumnFilters[id] = { level:{ mode:'include', values:['HIGH'] } };
  const ctx = vm.createContext({ state, structuredClone, console, panels:[{id:main}], chartState:()=>({}), readTableCopies:()=>[], tableCopyId:()=>'', document:{addEventListener(){}}, localStorage:{setItem(){}}, Map });
  vm.runInContext(source + '\n auditViews.tables["' + id + '"] = { scope: { dates: state.dates["' + main + '"], filters: { level:["OLD"], arrival_status:["pending"] } }, dateOverride: false };', ctx);
  state.filters[main].arrival_status = ['pending', 'arrived'];
  const scope = ctx.auditEffectiveScope(id);
  assert.equal(JSON.stringify(scope.filters.level), '[]');
  assert.equal(JSON.stringify(scope.filters.arrival_status), '["pending","arrived"]');
});

test('applying a template restores its saved scope into the visible top filters', () => {
  const main = 'commission-main';
  const state = Object.fromEntries(['dates','dateDrafts','filters','charts','exceptionMode','exceptionOnly','pages','grafanaScopeHydrated','grafanaFilterDirty'].map(key => [key, {}]));
  state.filters[main] = { level:['LOW'] };
  state.dates[main] = { start:'2026-09-08 00:00:00', end:'2026-09-10 23:59:59' };
  const chart = {};
  const ctx = vm.createContext({ state, structuredClone, console, panels:[{id:main}], chartState:()=>chart, document:{addEventListener(){}}, localStorage:{setItem(){}}, Map });
  vm.runInContext(source, ctx);
  ctx.auditApplyDashboardScope({ filters:{ level:['NO COMMISSION'], arrival_status:['pending'] }, dates:{ start:'2026-09-01 00:00:00', end:'2026-09-07 23:59:59' }, chart:{ statusSelection:'Pending' }, exception:'data-checks' });
  assert.equal(JSON.stringify(state.filters[main]), '{"level":["NO COMMISSION"],"arrival_status":["pending"]}');
  assert.equal(state.dates[main].start, '2026-09-01 00:00:00');
  assert.equal(chart.statusSelection, 'Pending');
  assert.equal(state.exceptionMode[main], 'data-checks');
  assert.equal(state.grafanaFilterDirty[main], true);
});

test('Use current dashboard filters resets the master and table filters to All', () => {
  const main = 'commission-main', id = main + ':table', copy = main + ':copy:copy-a';
  const state = Object.fromEntries(['filters','charts','exceptionMode','exceptionOnly','pages','grafanaScopeHydrated','grafanaFilterDirty','tableColumnFilters','tableColumnFilterDrafts','search','searchDraft'].map(key => [key, {}]));
  state.filters[main] = { branch_name:['HQ KINRARA'], arrival_status:['arrived'], order_status:['completed'] };
  state.tableColumnFilters[id] = { order_status:{ mode:'include', values:['completed'] } };
  state.tableColumnFilters[copy] = { arrival_status:{ mode:'include', values:['pending'] } };
  state.search[id] = 'rider'; state.search[copy] = 'order';
  const chart = { selection:'Johor', selections:['Johor'], statusSelection:'completed' };
  const ctx = vm.createContext({
    state, structuredClone, console, panels:[{id:main}], chartState:()=>chart,
    filtersForPanel:()=>[{key:'branch_name'},{key:'arrival_status'},{key:'order_status'}],
    readTableCopies:()=>[{id:'copy-a',panelId:main,sourceKey:''}], tableCopyId:item=>item.panelId+':copy:'+item.id,
    document:{addEventListener(){}}, localStorage:{setItem(){}}, Map
  });
  vm.runInContext(source + '\n auditViews.tables["' + id + '"] = { active:0, scope:{} }; auditViews.tables["' + copy + '"] = { active:0, scope:{} };', ctx);
  ctx.auditUseAllDashboardFilters();
  ctx.auditResetTableToDashboard(id);
  ctx.auditResetTableToDashboard(copy);

  assert.equal(JSON.stringify(state.filters[main]), '{"branch_name":[],"arrival_status":[],"order_status":[]}');
  assert.equal(JSON.stringify(state.tableColumnFilters[id]), '{}');
  assert.equal(JSON.stringify(state.tableColumnFilters[copy]), '{}');
  assert.equal(state.search[id], '');
  assert.equal(state.search[copy], '');
  assert.equal(chart.selection, '');
  assert.equal(chart.statusSelection, '');
  assert.equal(state.grafanaFilterDirty[main], true);
  assert.match(source, /if \(id === AUDIT_TEMPLATE_LIBRARY_ID\) \{\s+auditUseAllDashboardFilters\(\);/u);
});

test('compact table calendar renders six weeks and preserves the selected range', () => {
  const ctx = vm.createContext({ structuredClone, console, Intl, Date, document:{addEventListener(){}}, localStorage:{setItem(){}}, Map });
  vm.runInContext(source, ctx);
  const markup = ctx.auditCalendarMarkup('2026-09', { start:'2026-09-04 00:00:00', end:'2026-09-10 23:59:59' });
  assert.equal((markup.match(/data-audit-calendar-date=/g) || []).length, 42);
  assert.match(markup, /September 2026/);
  assert.match(markup, /range-start[^>]+data-audit-calendar-date="2026-09-04"/);
  assert.match(markup, /range-end[^>]+data-audit-calendar-date="2026-09-10"/);
});

test('saved-template control defaults to current dashboard filters', () => {
  assert.ok(source.includes(": 'Use current dashboard filters')"));
  assert.match(source, /Using current dashboard filters/);
});

test('saved templates grow dynamically and migrate old empty slots', () => {
  assert.match(source, /data-audit-action="add">\+ Add template/);
  assert.match(source, /const slots = entry\.slots\.filter\(Boolean\)/);
  assert.match(source, /library\.slots\.map\(\(slot, index\)/);
  assert.doesNotMatch(source, /slice\(0, 3\)|\[0, 1, 2\]\.map/);
});

test('master apply updates every table while a table-button apply remains local', () => {
  assert.match(source, /if \(id === AUDIT_TEMPLATE_LIBRARY_ID\) \{\s*auditApplyDashboardScope\(view\.scope\);\s*for \(const tableId of Object\.keys\(auditViews\.tables\)\)/);
  assert.match(source, /\} else \{\s*auditInstall\(id, view\);\s*entry\.active = index;/);
  assert.match(source, /id === AUDIT_TEMPLATE_LIBRARY_ID && !LOCAL_PREVIEW/);
});

test('older saved defaults migrate once to created_at oldest-first', () => {
  assert.match(source, /saved\.defaultsVersion !== AUDIT_DEFAULTS_VERSION && active == null/);
  assert.match(source, /last\.sort = \{ key: 'created_at', dir: 'asc' \}/);
  assert.match(source, /defaultsVersion: AUDIT_DEFAULTS_VERSION/);
});

test('main template control is beside Arrange visuals while copies keep local controls', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="arrangeVisualsButton"[^>]*>Arrange visuals<\/button>\s*<div id="auditHeaderTemplateSlot" hidden><\/div>/);
  assert.match(source, /audit-header-template-menu/);
  assert.match(source, />Template Filter<\/summary>/);
  assert.match(source, /if \(copy\) \{\s*toolbar\.innerHTML = tableControls \+ '<details class="audit-template-menu">/);
  assert.match(source, /else \{\s*toolbar\.innerHTML = quickRangeControl;/);
  assert.match(source, /const tableControls = dateControl \+ quickRangeControl/);
});
