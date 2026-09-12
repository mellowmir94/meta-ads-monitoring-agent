// Table-local saved views. Embedded in index.html to preserve the standalone dashboard.
const AUDIT_VIEWS_KEY = 'ledger-finance-audit-views-v1';
const AUDIT_DEFAULTS_VERSION = 2;
const AUDIT_TEMPLATE_LIBRARY_ID = 'commission-main:table';
const auditViews = { tables: {}, data: new Map(), pending: new Set(), errors: new Map(), chain: Promise.resolve(), activeContext: false };

function auditTemplateLibrary(id = AUDIT_TEMPLATE_LIBRARY_ID) {
  return auditViews.tables[id] ||= { slots: [], active: null };
}

function auditIdentity(id) {
  if (id === 'commission-main:table') return { id, panelId: 'commission-main', viewId: 'commission-main', copyId: '' };
  const copy = readTableCopies().find(item => tableCopyId(item) === id && item.panelId === 'commission-main' && !item.sourceKey);
  return copy ? { id, panelId: copy.panelId, viewId: id, copyId: copy.id } : null;
}

function auditScope() {
  const id = 'commission-main', chart = chartState(panels.find(panel => panel.id === id));
  return structuredClone({ dates: state.dates[id], filters: state.filters[id] || {}, chart: { selection: chart.selection || '', selections: chart.selections || [], statusSelection: chart.statusSelection || '' }, exception: state.exceptionMode[id] || (state.exceptionOnly[id] ? 'review' : '') });
}

const AUDIT_DASHBOARD_FILTER_COLUMNS = new Set(['branch_name', 'arrival_status', 'order_status', 'level', 'battery_size', 'sales_source', 'rider_category']);

function auditTableOverrideKeys(id) {
  const filters = state.tableColumnFilters[id] || {};
  const keys = Object.entries(filters)
    .filter(([, spec]) => spec && Array.isArray(spec.values) && spec.values.length)
    .map(([key]) => key)
    .filter(key => AUDIT_DASHBOARD_FILTER_COLUMNS.has(key));
  if (state.openTableFilter?.tableId === id && AUDIT_DASHBOARD_FILTER_COLUMNS.has(state.openTableFilter.columnKey)) keys.push(state.openTableFilter.columnKey);
  return [...new Set(keys)];
}

function auditEffectiveScope(id) {
  const entry = auditViews.tables[id];
  const scope = auditScope();
  if (entry?.dateOverride && entry.scope?.dates) scope.dates = structuredClone(entry.scope.dates);
  for (const key of auditTableOverrideKeys(id)) scope.filters[key] = [];
  return scope;
}

function auditCapture(id) {
  const identity = auditIdentity(id);
  if (!identity) return null;
  const { viewId } = identity;
  return structuredClone({ scope: auditEffectiveScope(id), dateOverride: Boolean(auditViews.tables[id]?.dateOverride), columns: state.hiddenColumns[viewId] || [], columnFilters: state.tableColumnFilters[id] || {}, search: state.search[id] ?? state.search[viewId] ?? '', sort: state.sort[viewId] || null, compact: Boolean(state.compactTables[viewId]), deductionFilter: auditViews.tables[id]?.deductionFilter || '' });
}

function auditApplyDashboardScope(scope) {
  const panelId = 'commission-main';
  state.filters[panelId] = structuredClone(scope.filters || {});
  state.dates[panelId] = structuredClone(scope.dates);
  state.dateDrafts[panelId] = structuredClone(scope.dates);
  Object.assign(chartState(panels.find(panel => panel.id === panelId)), scope.chart || {});
  state.exceptionMode[panelId] = scope.exception || '';
  state.exceptionOnly[panelId] = false;
  state.pages[panelId] = 1;
  state.openFilter = null;
  state.timeRangeOpen = null;
  state.grafanaScopeHydrated[panelId] = true;
  state.grafanaFilterDirty[panelId] = true;
}

function auditResetTableToDashboard(id) {
  const identity = auditIdentity(id);
  if (!identity) return;
  const entry = auditViews.tables[id] ||= { slots: [], active: null };
  entry.scope = null;
  entry.dateOverride = false;
  entry.deductionFilter = '';
  entry.active = null;
  state.tableColumnFilters[id] = {};
  delete state.tableColumnFilterDrafts[id];
  state.search[id] = '';
  state.searchDraft[id] = '';
  if (state.openTableFilter?.tableId === id) state.openTableFilter = null;
  auditViews.errors.delete(id);
}

function auditUseAllDashboardFilters() {
  const panelId = 'commission-main';
  const panel = panels.find(item => item.id === panelId);
  state.filters[panelId] = Object.fromEntries(filtersForPanel(panel).map(filter => [filter.key, []]));
  Object.assign(chartState(panel), { selection: '', selections: [], statusSelection: '' });
  state.exceptionMode[panelId] = '';
  state.exceptionOnly[panelId] = false;
  state.pages[panelId] = 1;
  state.openFilter = null;
  state.timeRangeOpen = null;
  state.grafanaScopeHydrated[panelId] = true;
  state.grafanaFilterDirty[panelId] = true;
}

function auditStable(value) {
  if (Array.isArray(value)) return '[' + value.map(auditStable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + auditStable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function auditWrite() {
  const tables = {};
  for (const [id, entry] of Object.entries(auditViews.tables)) {
    const last = auditCapture(id) || entry.last;
    tables[id] = { slots: entry.slots || [], active: entry.active ?? null, last };
    entry.last = last;
  }
  localStorage.setItem(AUDIT_VIEWS_KEY, JSON.stringify({ version: 1, defaultsVersion: AUDIT_DEFAULTS_VERSION, tables, dashboard: auditScope() }));
}

function auditInstall(id, view) {
  const identity = auditIdentity(id);
  if (!identity || !view?.scope || !Array.isArray(view.columns) || !view.columnFilters || typeof view.search !== 'string') throw new Error('This saved view is invalid. Save a new template.');
  const error = validApiDateRange(view.scope.dates, identity.panelId);
  if (error) throw new Error(error);
  const entry = auditViews.tables[id] ||= { slots: [], active: null };
  entry.scope = structuredClone(view.scope);
  entry.dateOverride = Boolean(view.dateOverride);
  entry.deductionFilter = ['insurance', 'battery-tester', 'manual', 'epf'].includes(view.deductionFilter) ? view.deductionFilter : '';
  state.hiddenColumns[identity.viewId] = structuredClone(view.columns);
  state.tableColumnFilters[id] = structuredClone(view.columnFilters);
  delete state.tableColumnFilterDrafts[id];
  state.search[id] = view.search;
  state.searchDraft[id] = view.search;
  state.sort[identity.viewId] = structuredClone(view.sort);
  state.compactTables[identity.viewId] = Boolean(view.compact);
  if (state.openTableFilter?.tableId === id) state.openTableFilter = null;
  auditViews.errors.delete(id);
}

function auditSaveSlot(id, index, name, renameOnly = false) {
  const entry = auditViews.tables[id];
  const library = auditTemplateLibrary(id);
  if (!entry || !Number.isInteger(index) || index < 0 || index > library.slots.length) throw new Error('Choose a valid template.');
  name = String(name || '').trim().slice(0, 80);
  if (!name) throw new Error('Enter a template name.');
  const previous = library.slots[index], now = new Date().toISOString();
  if (renameOnly && !previous) throw new Error('Save this template first.');
  const filterState = renameOnly ? structuredClone(previous.filterState) : auditCapture(id);
  if (!renameOnly && id === AUDIT_TEMPLATE_LIBRARY_ID) {
    const dashboardScope = auditScope();
    if (filterState.dateOverride) dashboardScope.dates = structuredClone(filterState.scope.dates);
    filterState.scope = dashboardScope;
  }
  library.slots[index] = { id: previous?.id || 'template-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), name, filterState, createdAt: previous?.createdAt || now, updatedAt: now };
  if (!renameOnly) entry.active = index;
}

function auditRestore() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIT_VIEWS_KEY) || 'null');
    if (saved?.version !== 1 || !saved.tables) return;
    if (saved.dashboard?.dates && !validApiDateRange(saved.dashboard.dates, 'commission-main')) {
      state.filters['commission-main'] = saved.dashboard.filters || {};
      state.dates['commission-main'] = saved.dashboard.dates;
      state.dateDrafts['commission-main'] = structuredClone(saved.dashboard.dates);
      Object.assign(chartState(panels.find(panel => panel.id === 'commission-main')), saved.dashboard.chart || {});
      state.exceptionMode['commission-main'] = saved.dashboard.exception || '';
      state.grafanaFilterDirty['commission-main'] = true;
    }
    for (const [id, entry] of Object.entries(saved.tables)) {
      if (!id.startsWith('commission-main:') || !Array.isArray(entry.slots)) continue;
      const activeSlot = Number.isInteger(entry.active) ? entry.slots[entry.active] : null;
      const slots = entry.slots.filter(Boolean);
      const activeIndex = activeSlot ? slots.findIndex(slot => slot.id === activeSlot.id) : -1;
      const active = activeIndex >= 0 ? activeIndex : null;
      const last = entry.last ? structuredClone(entry.last) : null;
      if (saved.defaultsVersion !== AUDIT_DEFAULTS_VERSION && active == null && last) last.sort = { key: 'created_at', dir: 'asc' };
      auditViews.tables[id] = { slots, active, last };
      if (auditIdentity(id) && last) {
        try { auditInstall(id, last); } catch { auditViews.errors.set(id, 'The saved view could not be restored. Choose a template or current dashboard filters.'); }
      }
    }
  } catch { /* Invalid browser storage must not prevent dashboard entry. */ }
}

function auditDataKey(scope) { return auditStable({ dates: scope.dates, filters: scope.filters }); }

function auditLoad(id, scope) {
  const key = auditDataKey(scope);
  if (auditViews.data.has(key) || auditViews.pending.has(key) || auditViews.errors.has(id)) return;
  auditViews.pending.add(key);
  auditViews.chain = auditViews.chain.catch(() => {}).then(async () => {
    try {
      const filters = Object.fromEntries(Object.entries(scope.filters || {}).map(([name, values]) => [name, values.length ? values : ['$__all']]));
      const params = new URLSearchParams({ panel: 'commission-main', scope: 'selection', part: 'primary', from: scope.dates.start, to: scope.dates.end, filters: JSON.stringify(filters), revision: 'commission-kpi-v9' });
      const { response, payload } = await requestFinancePayload(FINANCE_API_ENDPOINT + '?' + params, 'audit-template:' + key);
      if (!response.ok) throw new Error(payload.error || 'Unable to load the saved table period.');
      if (payload.truncated) throw new Error('This period returned incomplete data. Choose a smaller date range.');
      const panel = panels.find(item => item.id === 'commission-main');
      const data = await canonicalizeFinancePayloadRows(panel, payload);
      auditViews.data.set(key, { rows: data, meta: { apiFrom: payload.from || scope.dates.start, apiTo: payload.to || scope.dates.end, metricRowsScope: payload.metricRowsScope || '', filterOptions: payload.filterOptions || null } });
    } catch (error) { if (auditDataKey(auditEffectiveScope(id)) === key) auditViews.errors.set(id, error.message || 'Unable to load the table.'); }
    finally { auditViews.pending.delete(key); render(); }
  });
}

function withAuditTable(id, read) {
  if (auditViews.activeContext || !auditIdentity(id)) return read();
  const entry = auditViews.tables[id];
  const overrideKeys = auditTableOverrideKeys(id);
  const scope = (entry?.dateOverride || overrideKeys.length) ? auditEffectiveScope(id) : null;
  const panelId = 'commission-main';
  let source;
  if (scope) {
    const key = auditDataKey(scope);
    source = auditViews.data.get(key);
    if (!source && auditDataKey(scope) === auditDataKey(auditScope()) && state.api.loaded[panelId] && !state.api.loading[panelId]) source = { rows: rows(panelId), meta: state.imports[panelId] };
    if (!source && LOCAL_PREVIEW) source = { rows: rows(panelId), meta: {} };
    if (!source) { auditLoad(id, scope); return []; }
  }
  const swaps = { search: state.search[id] ?? state.search[panelId] ?? '' };
  if (scope) Object.assign(swaps, { dates: scope.dates, filters: scope.filters, charts: { ...chartState(panels.find(panel => panel.id === panelId)), ...scope.chart }, exceptionMode: scope.exception, exceptionOnly: false, data: source.rows, imports: source.meta });
  const previous = Object.fromEntries(Object.keys(swaps).map(key => [key, state[key][panelId]]));
  const cache = renderRowsCache;
  auditViews.activeContext = true;
  renderRowsCache = null;
  try {
    for (const [key, value] of Object.entries(swaps)) state[key][panelId] = value;
    panelScopeMemo.clear();
    return read();
  } finally {
    for (const [key, value] of Object.entries(previous)) state[key][panelId] = value;
    panelScopeMemo.clear();
    renderRowsCache = cache;
    auditViews.activeContext = false;
  }
}

function auditPeriod(id, fallback) {
  const dates = auditViews.tables[id]?.scope?.dates;
  return dates ? formatFinanceDate(dates.start) + ' - ' + formatFinanceDate(dates.end) : fallback;
}

function auditQuickRange(key, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const shift = amount => new Date(day.getTime() + amount * 86400000);
  const text = value => value.getUTCFullYear() + '-' + String(value.getUTCMonth() + 1).padStart(2, '0') + '-' + String(value.getUTCDate()).padStart(2, '0');
  let start = day, end = day;
  if (key === 'yesterday') start = end = shift(-1);
  else if (key === 'this-week') { start = shift(-((day.getUTCDay() + 6) % 7)); end = new Date(start.getTime() + 6 * 86400000); }
  else if (key === 'last-week') { end = shift(-((day.getUTCDay() + 6) % 7) - 1); start = new Date(end.getTime() - 6 * 86400000); }
  else if (key === 'this-month') { start = new Date(Date.UTC(parts.year, parts.month - 1, 1)); end = new Date(Date.UTC(parts.year, parts.month, 0)); }
  else if (key === 'previous-month') { start = new Date(Date.UTC(parts.year, parts.month - 2, 1)); end = new Date(Date.UTC(parts.year, parts.month - 1, 0)); }
  else if (key !== 'today') throw new Error('Choose a valid quick range.');
  return { start: text(start) + ' 00:00:00', end: text(end) + ' 23:59:59' };
}

function auditCalendarMarkup(monthKey, range) {
  const [year, month] = monthKey.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const first = new Date(monthStart);
  first.setUTCDate(1 - monthStart.getUTCDay());
  const start = String(range.start || '').slice(0, 10), end = String(range.end || '').slice(0, 10);
  const iso = date => date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  const title = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first); date.setUTCDate(first.getUTCDate() + index);
    const value = iso(date), outside = date.getUTCMonth() !== monthStart.getUTCMonth();
    return '<button type="button" class="audit-calendar-day' + (outside ? ' outside' : '') + (value >= start && value <= end ? ' in-range' : '') + (value === start ? ' range-start' : '') + (value === end ? ' range-end' : '') + '" data-audit-calendar-date="' + value + '" aria-label="' + value + '">' + date.getUTCDate() + '</button>';
  }).join('');
  return '<div class="audit-calendar-head"><button type="button" data-audit-calendar-month="-1" aria-label="Previous month">‹</button><strong>' + title + '</strong><button type="button" data-audit-calendar-month="1" aria-label="Next month">›</button></div><div class="audit-calendar-weekdays">' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => '<span>' + day + '</span>').join('') + '</div><div class="audit-calendar-days">' + days + '</div><div class="audit-calendar-boundaries"><span><small>From</small>' + start + '</span><span><small>To</small>' + end + '</span></div><input type="hidden" name="start" value="' + start + ' 00:00:00"><input type="hidden" name="end" value="' + end + ' 23:59:59">';
}

function auditExportPeriod(panelId, sourceKey, copyId, fallback) {
  return panelId === 'commission-main' && !sourceKey ? auditPeriod(copyId ? 'commission-main:copy:' + copyId : 'commission-main:table', fallback) : fallback;
}

function auditRestoreCopy(id) {
  const entry = auditViews.tables[id];
  if (entry?.last && state.search[id] === undefined) auditInstall(id, entry.last);
}

function auditCloneView(sourceId, targetId) {
  const view = auditCapture(sourceId);
  if (!view) return;
  auditViews.tables[targetId] = { slots: [], active: null };
  auditInstall(targetId, view);
  auditWrite();
}

function auditNotify(id, message) {
  const card = [...document.querySelectorAll('[data-audit-table]')].find(el => el.dataset.auditTable === id);
  const status = card?.querySelector('[data-audit-message]');
  if (status) status.textContent = message;
}

function auditMount() {
  const headerSlot = document.getElementById('auditHeaderTemplateSlot');
  if (headerSlot) { headerSlot.hidden = true; headerSlot.innerHTML = ''; }
  const cards = [...document.querySelectorAll('#commission-main-ledger, .table-copy[data-table-copy]')];
  for (const card of cards) {
    const copy = card.dataset.tableCopy && readTableCopies().find(item => item.id === card.dataset.tableCopy);
    const id = copy ? tableCopyId(copy) : 'commission-main:table';
    if (!auditIdentity(id)) continue;
    if (copy?.title === 'Line Item Audit — Copy 1') card.querySelector('h4').textContent = 'Line Item Audit';
    card.dataset.auditTable = id;
    const entry = auditViews.tables[id] ||= { slots: [], active: null };
    const current = auditCapture(id);
    const library = auditTemplateLibrary(id);
    const active = library.slots[entry.active];
    const modified = active && auditStable(active.filterState) !== auditStable(current);
    const dates = current.scope.dates;
    let toolbar = card.querySelector('.audit-template-controls');
    if (!toolbar) { toolbar = document.createElement('div'); toolbar.className = 'audit-template-controls'; card.querySelector('.ledger-actions')?.prepend(toolbar); }
    const effectiveScope = auditEffectiveScope(id);
    const busy = (entry.dateOverride || auditTableOverrideKeys(id).length) && auditViews.pending.has(auditDataKey(effectiveScope));
    const quickRanges = [['today', 'Today'], ['yesterday', 'Yesterday'], ['this-week', 'This week'], ['last-week', 'Last week (Mon-Sun)'], ['this-month', 'This month'], ['previous-month', 'Previous month']];
    const templateSlots = library.slots.length ? library.slots.map((slot, index) => {
      return '<div class="audit-template-slot"><button class="button" type="button" data-audit-action="apply" data-audit-slot="' + index + '" ' + (busy ? 'disabled' : '') + ' aria-pressed="' + (entry.active === index) + '">' + esc(slot.name) + '</button><div><button type="button" data-audit-action="update" data-audit-slot="' + index + '">Update</button><button type="button" data-audit-action="rename" data-audit-slot="' + index + '">Rename</button><button type="button" data-audit-action="clear" data-audit-slot="' + index + '">Delete</button></div></div>';
    }).join('') : '<p class="audit-template-empty">No saved templates yet.</p>';
    const message = auditViews.errors.get(id) || (busy ? 'Loading table…' : modified ? 'Filters modified' : active ? 'Template active' : 'Using current dashboard filters');
    const templateBody = '<div class="audit-template-context"><strong>' + esc(active ? active.name : 'Use current dashboard filters') + '</strong><span>' + esc(message) + '</span></div><button class="audit-template-dashboard" type="button" data-audit-action="dashboard" aria-pressed="' + (!active && !entry.scope) + '">Use current dashboard filters</button>' + templateSlots + '<button class="audit-template-add" type="button" data-audit-action="add">+ Add template</button>';
    const dateControl = '<button type="button" class="button" data-audit-date title="Custom table date range">' + esc(formatFinanceDate(dates.start) + ' – ' + formatFinanceDate(dates.end)) + '</button>';
    const quickRangeControl = '<details class="audit-quick-menu"><summary class="button">Quick ranges</summary><div class="audit-quick-popover"><strong>Quick ranges</strong><span>Malaysia time</span><div>' + quickRanges.map(range => '<button type="button" data-audit-quick="' + range[0] + '">' + range[1] + '</button>').join('') + '</div></div></details>';
    const tableControls = dateControl + quickRangeControl;
    if (copy) {
      toolbar.innerHTML = tableControls + '<details class="audit-template-menu"><summary class="button" title="' + esc(active ? active.name + (modified ? ' · Modified' : '') : 'Use current dashboard filters') + '">Template Filter</summary><div class="audit-template-popover">' + templateBody + '</div></details>';
    } else {
      toolbar.innerHTML = quickRangeControl;
      if (headerSlot && !card.closest('[data-tab-panel]')?.hidden) {
        headerSlot.hidden = false;
        headerSlot.innerHTML = '<details class="audit-template-menu audit-header-template-menu" data-audit-table="' + id + '"><summary class="button" aria-label="Template Filter" title="' + esc(active ? active.name + (modified ? ' · Modified' : '') : 'Use current dashboard filters') + '">Template Filter</summary><div class="audit-template-popover">' + templateBody + '</div><span class="sr-only" data-audit-message role="status" aria-live="polite">' + esc(message) + '</span></details>';
      }
    }
    const search = card.querySelector('[data-search="commission-main"]');
    if (search) search.value = state.searchDraft[id] ?? current.search;
    if (auditViews.errors.has(id)) {
      const body = card.querySelector('tbody');
      if (body && !body.children.length) body.textContent = '';
    }
  }
  try { auditWrite(); } catch { document.querySelectorAll('[data-audit-message]').forEach(el => { el.textContent = 'Browser storage unavailable; changes cannot be saved.'; }); }
}

function auditDialog(id, mode, index) {
  document.getElementById('audit-template-dialog')?.remove();
  const entry = auditViews.tables[id], library = auditTemplateLibrary(id), slot = library.slots[index];
  const dialog = document.createElement('dialog'); dialog.id = 'audit-template-dialog'; dialog.className = 'audit-template-dialog';
  const dateMode = mode === 'date';
  const title = dateMode ? 'Table date range' : mode === 'clear' ? 'Delete template?' : mode === 'update' ? 'Overwrite saved filters?' : mode === 'rename' ? 'Rename template' : 'Save current filters';
  const dates = auditCapture(id).scope.dates;
  let calendarDraft = { start: dates.start, end: dates.end }, calendarMonth = dates.start.slice(0, 7), calendarAnchor = '';
  dialog.innerHTML = '<form><h3>' + title + '</h3>' + (dateMode ? '<p class="audit-calendar-help">Select a start and end date. Full days use Malaysia time.</p><section class="audit-date-calendar" aria-label="Select table date range"></section>' : mode === 'clear' ? '<p>Delete ' + esc(slot.name) + '? The current table filters will stay as they are.</p>' : '<label>Template name<input name="name" maxlength="80" required value="' + esc(slot?.name || 'Template ' + (index + 1)) + '"></label>' + (mode === 'update' ? '<p>This replaces the saved filters in this table’s template.</p>' : '')) + '<p role="alert" data-audit-error></p><div><button type="button" data-cancel>Cancel</button><button type="submit">' + (dateMode ? 'Apply range' : mode === 'clear' ? 'Delete' : 'Save') + '</button></div></form>';
  document.body.append(dialog);
  if (dateMode) {
    const shell = dialog.querySelector('.audit-date-calendar');
    const draw = () => { shell.innerHTML = auditCalendarMarkup(calendarMonth, calendarDraft); };
    shell.onclick = event => {
      const monthButton = event.target.closest('[data-audit-calendar-month]');
      if (monthButton) {
        const [year, month] = calendarMonth.split('-').map(Number), next = new Date(Date.UTC(year, month - 1 + Number(monthButton.dataset.auditCalendarMonth), 1));
        calendarMonth = next.getUTCFullYear() + '-' + String(next.getUTCMonth() + 1).padStart(2, '0'); draw(); return;
      }
      const dayButton = event.target.closest('[data-audit-calendar-date]');
      if (!dayButton) return;
      const value = dayButton.dataset.auditCalendarDate;
      if (!calendarAnchor) { calendarAnchor = value; calendarDraft = { start: value + ' 00:00:00', end: value + ' 23:59:59' }; }
      else { const start = calendarAnchor <= value ? calendarAnchor : value, end = calendarAnchor <= value ? value : calendarAnchor; calendarDraft = { start: start + ' 00:00:00', end: end + ' 23:59:59' }; calendarAnchor = ''; }
      draw();
    };
    draw();
  }
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { dialog.remove(); document.querySelector('[data-audit-table="' + id + '"] .audit-template-menu summary')?.focus(); });
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const before = structuredClone(entry);
    try {
      const form = new FormData(event.target);
      if (dateMode) {
        const view = auditCapture(id);
        view.scope.dates = { start: String(form.get('start')), end: String(form.get('end')) };
        view.dateOverride = true;
        auditInstall(id, view);
      } else if (mode === 'clear') {
        library.slots.splice(index, 1);
        if (entry.active === index) { entry.active = null; entry.scope = null; }
        else if (entry.active > index) entry.active--;
      }
      else {
        const name = String(form.get('name') || '').trim();
        if (!name) throw new Error('Enter a template name.');
        auditSaveSlot(id, index, name, mode === 'rename');
      }
      auditWrite(); dialog.close(); render(); auditNotify(id, dateMode ? 'Table dates applied' : mode === 'clear' ? 'Template deleted' : 'Template saved');
    } catch (error) { auditViews.tables[id] = before; dialog.querySelector('[data-audit-error]').textContent = error.message; }
  };
  dialog.showModal();
}

function auditHandle(event) {
  const card = event.target.closest?.('[data-audit-table]');
  if (!card) return;
  const id = card.dataset.auditTable;
  const search = event.target.closest('[data-search="commission-main"]');
  if (search && event.type === 'input') { event.stopImmediatePropagation(); state.searchDraft[id] = search.value; return; }
  if ((event.type === 'keydown' && search && event.key === 'Enter') || (event.type === 'click' && event.target.closest('[data-search-submit="commission-main"]'))) {
    event.preventDefault(); event.stopImmediatePropagation();
    state.search[id] = card.querySelector('[data-search]').value; state.searchDraft[id] = state.search[id]; render(); return;
  }
  if (event.type !== 'click') return;
  const button = event.target.closest('[data-audit-action], [data-audit-date], [data-audit-quick]');
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const action = button.dataset.auditAction, index = Number(button.dataset.auditSlot);
  const entry = auditViews.tables[id];
  if (button.hasAttribute('data-audit-date')) return auditDialog(id, 'date', 0);
  if (button.hasAttribute('data-audit-quick')) {
    try {
      const view = auditCapture(id);
      view.scope.dates = auditQuickRange(button.dataset.auditQuick);
      view.dateOverride = true;
      auditInstall(id, view);
      card.querySelector('.audit-quick-menu').open = false;
      auditWrite(); render(); auditNotify(id, 'Quick range applied');
    } catch (error) { auditNotify(id, error.message); }
    return;
  }
  const library = auditTemplateLibrary(id);
  if (action === 'add') return auditDialog(id, 'save', library.slots.length);
  if (action === 'apply') {
    try {
      const view = library.slots[index].filterState;
      if (id === AUDIT_TEMPLATE_LIBRARY_ID) {
        auditApplyDashboardScope(view.scope);
        for (const tableId of Object.keys(auditViews.tables)) {
          if (!auditIdentity(tableId)) continue;
          auditInstall(tableId, view);
          auditViews.tables[tableId].active = tableId === id ? index : null;
        }
      } else {
        auditInstall(id, view);
        entry.active = index;
      }
      auditWrite(); render();
      if (id === AUDIT_TEMPLATE_LIBRARY_ID && !LOCAL_PREVIEW) void loadGrafanaData('commission-main', true, { bypassCache: false }).then(() => render());
    }
    catch (error) { auditNotify(id, error.message); }
  } else if (action === 'dashboard') {
    if (id === AUDIT_TEMPLATE_LIBRARY_ID) {
      auditUseAllDashboardFilters();
      for (const tableId of Object.keys(auditViews.tables)) auditResetTableToDashboard(tableId);
    } else auditResetTableToDashboard(id);
    auditWrite(); render();
    if (id === AUDIT_TEMPLATE_LIBRARY_ID && !LOCAL_PREVIEW) void loadGrafanaData('commission-main', true, { bypassCache: false }).then(() => render());
  } else auditDialog(id, action, index);
}

for (const type of ['click', 'input', 'keydown']) document.addEventListener(type, auditHandle, true);

document.addEventListener('toggle', event => {
  const menu = event.target;
  if (!menu.matches?.('.audit-template-menu, .audit-quick-menu')) return;
  const layer = menu.querySelector('.audit-template-popover, .audit-quick-popover');
  if (!menu.open) { if (layer.matches(':popover-open')) layer.hidePopover(); return; }
  layer.setAttribute('popover', 'manual');
  layer.showPopover();
  document.querySelectorAll('.audit-template-menu[open], .audit-quick-menu[open]').forEach(other => { if (other !== menu) other.open = false; });
  const box = menu.getBoundingClientRect(), popover = layer;
  popover.style.left = Math.max(8, Math.min(box.left, innerWidth - 328)) + 'px';
  popover.style.top = Math.min(box.bottom + 6, Math.max(8, innerHeight - popover.getBoundingClientRect().height - 8)) + 'px';
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.audit-template-menu[open], .audit-quick-menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); });
});
