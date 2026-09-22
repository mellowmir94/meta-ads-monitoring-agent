// One source decision is shared by dashboard, saved templates and all exports.
const financeSource = { ready: null, live: true, weeks: [], rows: new Map(), busy: false, message: '', selected: '', epoch: 0 };
function financePreviousWeek() {
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }) + 'T00:00:00Z');
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) - 7);
  return today.toISOString().slice(0,10);
}
function financeWeekEnd(start) { return new Date(Date.parse(start + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0,10); }
async function financeSourceCall(path, input) {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),path==='sync'?100000:30000);
  try {
    const response = await fetch('/api/data-source/' + path, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, ...(input ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Data source is unavailable.');
    return data;
  } catch(error) { if (error.name === 'AbortError') throw Error('Data request timed out. The last saved week is unchanged; check Settings and retry.'); throw error; }
  finally { clearTimeout(timer); }
}
function financeSourceReady() {
  if (LOCAL_PREVIEW) return Promise.resolve();
  return financeSource.ready ||= financeSourceCall('settings').then(data => { financeSource.live = data.live; financeSource.weeks = data.weeks; }).catch(error => { financeSource.ready = null; throw error; });
}
function financeSourceClear(clearDisplayed = false) {
  financeSource.epoch++;
  financeSource.rows.clear();
  deductionStatementRowsCache.clear(); deductionStatementPayloadCache.clear(); additionalJobsStatementCache.clear();
  auditViews.data.clear(); auditViews.errors.clear();
  state.api.loaded['commission-main'] = false;
  delete state.metricRows['commission-main'];
  if (clearDisplayed) {
    state.data['commission-main'] = [];
    delete state.imports['commission-main'];
    delete state.grafanaTables['commission-main'];
  }
}
function financeSourceMarkup() {
  const start = financeSource.selected ||= financePreviousWeek();
  return `<div class="dashboard-tab-settings"><label><input type="checkbox" data-source-live ${financeSource.live?'checked':''} ${financeSource.busy?'disabled':''}> Live data ${financeSource.live?'ON':'OFF'}</label><p>ON uses current Grafana figures. OFF uses a saved Monday–Sunday week, including both weekly KPI totals. Table filters remain local.</p><label>Sync data · Week starting Monday<input type="date" data-source-week value="${esc(start)}" ${financeSource.busy?'disabled':''}></label><p>Week ends ${esc(financeWeekEnd(start))}</p><div><button class="button primary" data-source-sync ${financeSource.busy?'disabled':''}>${financeSource.busy?'Syncing…':'Sync now'}</button> <button class="button" data-source-use ${financeSource.busy?'disabled':''}>Use this week</button></div><p role="status">${esc(financeSource.message)}</p><p>Sync replaces only the selected week's saved copy. Existing deductions and Additional Jobs are unchanged.</p><div style="overflow:auto"><table><thead><tr><th>Week</th><th>Rows</th><th>Last updated</th><th>Status</th></tr></thead><tbody>${financeSource.weeks.map(week=>`<tr><td>${esc(week.start)} – ${esc(week.end)}</td><td>${week.rowCount}</td><td>${esc(formatFinanceDateTime(week.updatedAt))}</td><td>Synced</td></tr>`).join('') || '<tr><td colspan="4">No synced weeks yet.</td></tr>'}</tbody></table></div></div>`;
}
function financeSourceDialog() { showFinanceDialog('Data Source', 'Commission Rider · Live data and shared weekly snapshots', financeSourceMarkup()); }
async function financeSourceUseWeek() {
  const start = financeSource.selected || financePreviousWeek();
  if (new Date(start + 'T00:00:00Z').getUTCDay() !== 1) throw Error('Select a Monday.');
  state.dates['commission-main'] = { start, end: financeWeekEnd(start) };
  state.dateDrafts['commission-main'] = structuredClone(state.dates['commission-main']);
  state.grafanaScopeHydrated['commission-main'] = true;
  state.grafanaFilterDirty['commission-main'] = true;
  financeSourceClear(true);
  await loadGrafanaData('commission-main',true);
}
async function financeSourcePayload(url) {
  await financeSourceReady();
  if (financeSource.live) return null;
  const parsed = new URL(url,location.origin);
  if (parsed.searchParams.get('panel') !== 'commission-main') throw Error('Live data is OFF. Synced data is available for Commission Rider only.');
  const start = (parsed.searchParams.get('from') || state.dates['commission-main']?.start || '').slice(0,10);
  const end = (parsed.searchParams.get('to') || state.dates['commission-main']?.end || '').slice(0,10);
  const key = start + '|' + end;
  if (!financeSource.rows.has(key)) {
    const pending = financeSourceCall('data?from=' + encodeURIComponent(start) + '&to=' + encodeURIComponent(end)).catch(error=>{financeSource.rows.delete(key);throw error;});
    financeSource.rows.set(key,pending);
  }
  const saved = await financeSource.rows.get(key), payload = { ...saved };
  // Filter the stored detail rows using the same dashboard field matching rules.
  // The independently sourced KPI cards remain explicitly whole-week totals.
  const filters = JSON.parse(parsed.searchParams.get('filters') || '{}');
  const panel = panels.find(panel=>panel.id==='commission-main');
  const canonical = await canonicalizeFinancePayloadRows(panel,saved);
  payload.rows = canonical.filter(row => (filtersForPanel(panel)||[]).every(filter=>{
    const selected = filters[filter.key];
    if (!selected?.length || selected.includes('$__all') || selected.includes('All')) return true;
    if (!rowHasFilterField(row,filter)) return true;
    const value = rowValue(row,filter);
    return (!value && filter.includeMissing) || selected.some(candidate=>filterMatchesValue(filter,candidate,value));
  }));
  delete payload.packedRows; payload.rowCount = payload.rows.length;
  payload.source = 'Synced data · Last updated ' + formatFinanceDateTime(saved.syncedAt) + ' · KPI cards: full week';
  return { response: { ok: true, status: 200 }, payload, elapsedMs: 0 };
}
document.addEventListener('click',async event=>{
  const button = event.target.closest('[data-source-settings],[data-source-sync],[data-source-use]');
  if (!button || financeSource.busy) return;
  try {
    await financeSourceReady();
    if (button.hasAttribute('data-source-settings')) { financeSourceDialog(); return; }
    if (button.hasAttribute('data-source-use')) { await financeSourceUseWeek(); return; }
    const start = financeSource.selected || financePreviousWeek();
    if (new Date(start+'T00:00:00Z').getUTCDay() !== 1) throw Error('Select a Monday.');
    financeSource.busy = true; financeSource.message = 'Loading the complete table and both KPI sources…'; financeSourceDialog();
    const result = await financeSourceCall('sync',{start,end:financeWeekEnd(start)});
    financeSource.weeks = (await financeSourceCall('settings')).weeks;
    if (!financeSource.live) financeSourceClear();
    financeSource.message = result.backupWarning || 'Week synced successfully.';
    if (!financeSource.live) await financeSourceUseWeek();
  } catch(error) { financeSource.message = error.message; }
  finally { financeSource.busy = false; if (!button.hasAttribute('data-source-settings')) financeSourceDialog(); }
});
document.addEventListener('change',async event=>{
  if (event.target.matches('[data-source-week]')) {
    if (event.target.value) financeSource.selected = event.target.value;
    financeSourceDialog(); return;
  }
  if (!event.target.matches('[data-source-live]')) return;
  try {
    const result = await financeSourceCall('settings',{live:event.target.checked});
    financeSource.live = result.live;
    for (const entry of financePanelControllers.values()) entry.controller.abort();
    financeSourceClear(true);
    if (!financeSource.live) await financeSourceUseWeek();
    else await loadGrafanaData('commission-main',true);
    financeSource.message = financeSource.live ? 'Live data ON.' : 'Live data OFF. Downloads use the saved week.';
  } catch(error) { financeSource.message = error.message; }
  financeSourceDialog();
});
