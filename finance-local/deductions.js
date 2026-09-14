// Table-scoped shortcuts over the shared active deduction register.
const deductionState = { records: [], actor: null, approvalAvailable: false, loaded: false, loading: null, error: '' };
const deductionTypes = { epf: 'EPF', insurance: 'Insurance', 'battery-tester': 'OBD / Battery Tester', manual: 'Special Case' };
const deductionRiderKey = value => String(value || '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
const deductionMoney = cents => formatMoney(Number(cents || 0) / 100);
const deductionStatus = record => record.status || record.approvalStatus || 'approved';
const deductionDisplayStatus = value => ({ approved: 'applied', pending: 'applied' }[typeof value === 'string' ? value : deductionStatus(value)] || (typeof value === 'string' ? value : deductionStatus(value)));
const deductionDrafts = new Map();
const deductionHistorySelected = new Set();
const deductionHistoryPaymentSelections = new Map();
const deductionHistoryRangePicker = { open: false, anchor: '', month: '', draftStart: '', draftEnd: '', recent: [] };
const deductionHolidayCache = new Map();
const deductionStatementPayloadCache = new Map();
const DEDUCTION_STATEMENT_PREFETCH_TTL_MS = 120000;

async function deductionRequest(path = '', body) {
  const response = await fetch('/api/deductions' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({ error: 'Deduction service is unavailable. Please retry.' }));
  if (!response.ok) throw new Error(payload.error || 'Unable to load deductions.');
  return payload;
}
async function deductionLoad() {
  if (deductionState.loading) return deductionState.loading;
  deductionState.loading = (async () => {
    try {
      const records = [], cursors = new Set(); let next = '', actor = null, approvalAvailable = false;
      do {
        const data = await deductionRequest(next ? '?after=' + encodeURIComponent(next) : '');
        if (!Array.isArray(data.records)) throw new Error('Incomplete deduction register. Refresh before creating or exporting deductions.');
        records.push(...data.records); actor = data.actor || actor; approvalAvailable ||= Boolean(data.approvalAvailable); next = data.next || '';
        if (next && cursors.has(next)) throw new Error('Incomplete deduction register. Please retry.');
        if (next) cursors.add(next);
      } while (next);
      Object.assign(deductionState, { records, actor, approvalAvailable, loaded: true, error: '' });
    } catch (error) { deductionState.loaded = false; deductionState.error = error.message; throw error; }
    finally { deductionState.loading = null; }
  })();
  return deductionState.loading;
}
function deductionAddDays(value, days) {
  const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Number(days || 0)); return date.toISOString().slice(0, 10);
}
function deductionToday() { return auditQuickRange('today').start.slice(0, 10); }
function deductionNextMonday(value) {
  const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) ? deductionAddDays(value, ((8 - date.getUTCDay()) % 7) || 7) : '';
}
function deductionWeekBounds(value) {
  const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return null;
  const start = deductionAddDays(value, -((date.getUTCDay() + 6) % 7)); return { start, end: deductionAddDays(start, 6) };
}
function deductionFullWeek(start, end) { const week = deductionWeekBounds(start); return Boolean(week && start === week.start && end === week.end); }
function deductionNextMonth(value) {
  const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return '';
  date.setUTCMonth(date.getUTCMonth() + 1, 1); return date.toISOString().slice(0, 7);
}
function deductionFirstFourThursdayWeeks(month) {
  const first = String(month || '').slice(0, 7) + '-01', date = new Date(first + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-01$/.test(first) || !Number.isFinite(date.getTime())) return [];
  const firstThursday = deductionAddDays(first, (4 - date.getUTCDay() + 7) % 7);
  return Array.from({ length: 4 }, (_, index) => deductionWeekBounds(deductionAddDays(firstThursday, index * 7)));
}
function deductionEpfSchedule(anchorDate, holidays = new Set()) {
  const anchor = /^\d{4}-\d{2}$/.test(String(anchorDate || '')) ? String(anchorDate) + '-01' : String(anchorDate || '').slice(0, 10);
  let firstWeek = deductionWeekBounds(anchor);
  if (!firstWeek) return [];
  const firstThursday = deductionAddDays(firstWeek.start, 3), firstWednesday = deductionAddDays(firstThursday, -1);
  const firstDueDate = holidays.has(firstWednesday) ? deductionAddDays(firstThursday, 1) : firstThursday;
  if (firstDueDate < anchor) firstWeek = deductionWeekBounds(deductionAddDays(firstWeek.start, 7));
  return Array.from({ length: 4 }, (_, index) => deductionWeekBounds(deductionAddDays(firstWeek.start, index * 7))).map(week => {
    const thursday = deductionAddDays(week.start, 3), wednesday = deductionAddDays(thursday, -1), shifted = holidays.has(wednesday);
    return { dueDate: shifted ? deductionAddDays(thursday, 1) : thursday, thursday, wednesday, shifted, week };
  });
}
async function deductionPublicHolidays(year) {
  if (!deductionHolidayCache.has(year)) deductionHolidayCache.set(year, fetch('/api/public-holidays?year=' + encodeURIComponent(year), { credentials: 'same-origin' }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Holiday calendar unavailable.');
    return { dates: new Set([year + '-09-16', ...(Array.isArray(data.dates) ? data.dates : [])]), warning: data.warning || '', source: data.source || 'Government of Malaysia' };
  }).catch(() => ({ dates: new Set([year + '-09-16']), warning: 'The live holiday calendar could not be checked. Malaysia Day remains included; review other dates in History.', source: 'Government of Malaysia' })));
  return deductionHolidayCache.get(year);
}
function deductionSingleRider(rows) {
  const riders = new Map();
  for (const row of rows) {
    const key = deductionRiderKey(row.rider_name);
    if (!key) return { valid: false, message: 'A row has no rider_name. Filter to one valid rider before creating a deduction.' };
    if (!riders.has(key)) riders.set(key, String(row.rider_name).trim().replace(/\s+/g, ' '));
  }
  if (riders.size > 1) return { valid: false, message: 'More than 1 rider_name found. Filter to one rider before creating a deduction.' };
  if (!riders.size) return { valid: false, message: 'No rider selected. Filter the table to one rider.' };
  return { valid: true, key: [...riders.keys()][0], rider: [...riders.values()][0], message: '' };
}
function deductionInstallments(record) {
  if (Array.isArray(record.installments) && record.installments.length) return record.installments;
  return Array.from({ length: Number(record.installmentCount || 1) }, (_, index) => ({ index, dueDate: deductionAddDays(record.deductionDate, Number(record.installmentIntervalDays || 7) * index), status: deductionStatus(record) === 'approved' ? 'scheduled' : deductionStatus(record) }));
}
function deductionInstallmentAmount(record, item) { return Number(item.amountCents ?? record.amountCents ?? 0); }
function deductionStatementAmountForRecord(record, items) {
  if (!items.length) return 0;
  if (record.type === 'epf') return 2500;
  if (record.type === 'insurance') return deductionInstallmentAmount(record, items[0]);
  if (record.type === 'battery-tester') {
    if (record.pricingMode === 'fixed-2' || Number(record.installmentCount) === 2 && Number(record.amountCents) === 5000) return 5000;
    if (record.pricingMode === 'fixed-7' || Number(record.installmentCount) === 7 && Number(record.amountCents) === 4000) return 4000;
  }
  return items.reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0);
}
function deductionInstallmentSettlement(record, item, position = 0) {
  const index = Number.isInteger(Number(item?.index)) ? Number(item.index) : position;
  if (record.type === 'epf') {
    if (index === 0 && record.periodStart && record.periodEnd) return { start: record.periodStart, end: record.periodEnd };
    const scheduledWeek = deductionWeekBounds(item?.dueDate); if (scheduledWeek) return scheduledWeek;
  }
  return item?.settlementPeriodStart && item?.settlementPeriodEnd ? { start: item.settlementPeriodStart, end: item.settlementPeriodEnd } : null;
}
function deductionDateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[3] + '/' + match[2] + '/' + match[1] : String(value || '—');
}
function deductionPeriodLabel(period) {
  return period?.start && period?.end ? deductionDateLabel(period.start) + ' – ' + deductionDateLabel(period.end) : '—';
}
function deductionMatches(record, row) {
  if (['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record)) || deductionRiderKey(row.rider_name) !== record.riderKey) return false;
  if (record.orderId) return String(row.order_id || '') === record.orderId;
  const day = formatGrafanaTimestamp(row.created_at).slice(0, 10); return Boolean(day && record.periodStart && day >= record.periodStart && day <= record.periodEnd);
}
function deductionFilterRows(tableId, dataRows) {
  // Retired compatibility seam: a stale saved template must never hide Finance rows.
  return dataRows;
}
function deductionRows(id, ignoreDeduction = false) {
  const identity = auditIdentity(id); if (!identity) return [];
  const entry = auditViews.tables[id], active = entry?.deductionFilter;
  if (ignoreDeduction && entry) entry.deductionFilter = '';
  try { return identity.copyId ? tableCopyRows(tableCopyContext(identity.copyId)) : primaryTableRows(panels.find(panel => panel.id === identity.panelId)); }
  finally { if (ignoreDeduction && entry) entry.deductionFilter = active; }
}
function deductionSummaryForRows(dataRows, dates) {
  const grossCents = Math.round(dataRows.reduce((sum, row) => sum + numberValue(row.commission), 0) * 100);
  const rowDates = dataRows.map(row => formatGrafanaTimestamp(row.created_at).slice(0, 10)).filter(Boolean).sort();
  const scopeStart = String(dates?.start || rowDates[0] || '').slice(0, 10), scopeEnd = String(dates?.end || rowDates.at(-1) || '').slice(0, 10);
  const rider = deductionSingleRider(dataRows), amounts = { epf: 0, insurance: 0, 'battery-tester': 0, manual: 0 }, statementAmounts = { epf: 0, insurance: 0, 'battery-tester': 0, manual: 0 };
  let pendingCents = 0, legacyCount = 0;
  if (deductionState.loaded && rider.valid && scopeStart && scopeEnd) deductionState.records.forEach(record => {
    if (rider.key !== (record.riderKey || deductionRiderKey(record.rider)) || ['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record))) return;
    const includedApplied = [];
    for (const [index, item] of deductionInstallments(record).entries()) {
      const amount = deductionInstallmentAmount(record, item);
      if (item.status === 'applied') {
        // New applications belong to a settlement week; legacy records retain the due-date basis.
        const settlement = deductionInstallmentSettlement(record, item, index), hasSettlement = Boolean(settlement);
        const included = hasSettlement ? settlement.start >= scopeStart && settlement.end <= scopeEnd : item.dueDate >= scopeStart && item.dueDate <= scopeEnd;
        if (included) { amounts[record.type] = (amounts[record.type] || 0) + amount; includedApplied.push(item); if (!hasSettlement) legacyCount++; }
      } else if (['pending', 'approved', 'scheduled'].includes(item.status) && item.dueDate >= scopeStart && item.dueDate <= scopeEnd) pendingCents += amount;
    }
    statementAmounts[record.type] = (statementAmounts[record.type] || 0) + deductionStatementAmountForRecord(record, includedApplied);
  });
  const approvedCents = Object.values(amounts).reduce((sum, value) => sum + value, 0);
  return { loaded: deductionState.loaded, error: deductionState.error, riderValid: rider.valid, grossCents, amounts, statementAmounts, approvedCents, appliedCents: approvedCents, pendingCents, netCents: grossCents - approvedCents, legacyCount };
}
function deductionDraftFor(id, rider, dates) {
  const key = [rider.key || '', dates.start || '', dates.end || ''].join('|');
  if (deductionDrafts.get(id)?.scope !== key) deductionDrafts.set(id, { scope: key, selected: [], amounts: {}, batteryPlan: 'fixed-2', batteryCount: 3, manualCount: 1 });
  return deductionDrafts.get(id);
}
function deductionSummaryMarkup(dataRows, tableId) {
  const dates = auditCapture(tableId)?.scope?.dates || {}, rider = deductionSingleRider(dataRows);
  // The deduction workspace is relevant only after Finance has narrowed the table to one rider.
  // It must never compete with the normal multi-rider table workflow.
  if (!rider.valid) return '';
  const summary = deductionSummaryForRows(dataRows, dates);
  const enabled = rider.valid && summary.loaded, draft = deductionDraftFor(tableId, rider, dates), disabled = enabled ? '' : ' disabled';
  const selected = type => draft.selected.includes(type);
  const choice = type => '<label class="deduction-inline-choice"><input type="checkbox" value="' + type + '" data-deduction-inline-type' + (selected(type) ? ' checked' : '') + disabled + '><strong>' + esc(deductionTypes[type]) + '</strong></label>';
  const field = (type, value, readonly = false, total = false) => '<label class="deduction-amount-field"><span>RM</span><input aria-label="' + esc(deductionTypes[type]) + (total ? ' total amount' : ' amount per payment') + '" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" data-deduction-inline-amount="' + type + '" value="' + esc(value || '') + '" placeholder="0.00"' + (readonly ? ' readonly' : '') + disabled + '></label>';
  const card = (type, controls, help) => '<article class="deduction-choice-card' + (selected(type) ? ' is-selected' : '') + '">' + choice(type) + controls + '<small>' + help + '</small><span class="deduction-card-applied">Applied <b>' + esc(enabled ? deductionMoney(summary.amounts[type]) : '—') + '</b></span></article>';
  const error = summary.error || (!rider.valid ? rider.message : '');
  return '<section class="commission-deduction-summary deduction-workspace" data-deduction-table="' + esc(tableId) + '" aria-label="Commission deduction calculation"><header class="deduction-workspace-head"><div><span class="deduction-eyebrow">Commission deduction formula</span><h3>' + esc(rider.valid ? rider.rider : 'Select one rider to prepare deductions') + '</h3><p>' + esc(String(dates.start || '').slice(0, 10) + ' — ' + String(dates.end || '').slice(0, 10)) + ' <span>· ' + formatNumber(dataRows.length) + ' filtered rows</span></p></div></header>' +
    (error ? '<div class="deduction-feedback is-error" role="alert">' + esc(error) + (summary.error ? ' <button type="button" data-deduction-retry>Retry register</button>' : '') + '</div>' : !summary.loaded ? '<div class="deduction-feedback" role="status">Loading deduction register…</div>' : '') +
    '<div class="deduction-choice-grid">' + card('epf', field('epf', '25.00', true), 'RM25 × first 4 weeks · RM100 monthly<br>Thursday; Friday when Wednesday is a holiday') + card('insurance', field('insurance', draft.amounts.insurance), 'Amount per payment · 2 weekly payments') +
    card('battery-tester', '<select aria-label="Battery Tester payment plan" data-deduction-inline-battery-plan' + disabled + '><option value="fixed-2"' + (draft.batteryPlan === 'fixed-2' ? ' selected' : '') + '>2 × RM50 · RM100 total</option><option value="fixed-7"' + (draft.batteryPlan === 'fixed-7' ? ' selected' : '') + '>7 × RM40 · RM280 total</option><option value="manual"' + (draft.batteryPlan === 'manual' ? ' selected' : '') + '>Manual · set amount and payments</option></select>' + field('battery-tester', draft.batteryPlan === 'manual' ? draft.amounts['battery-tester'] : draft.batteryPlan === 'fixed-7' ? '40.00' : '50.00', draft.batteryPlan !== 'manual') + '<label class="deduction-payment-count"><span>Payments</span><input aria-label="Battery Tester number of payments" type="number" min="1" max="52" step="1" inputmode="numeric" data-deduction-inline-battery-count value="' + esc(draft.batteryPlan === 'fixed-7' ? '7' : draft.batteryPlan === 'fixed-2' ? '2' : String(draft.batteryCount || 3)) + '"' + (draft.batteryPlan !== 'manual' ? ' readonly' : '') + disabled + '></label>', 'Fixed weekly schedule or Finance-set weekly payments') + card('manual', field('manual', draft.amounts.manual, false, true) + '<label class="deduction-payment-count"><span>Payments</span><input aria-label="Special Case number of payments" type="number" min="1" max="52" step="1" inputmode="numeric" data-deduction-inline-manual-count value="' + esc(String(draft.manualCount || 1)) + '"' + disabled + '></label><strong class="deduction-payment-breakdown" data-deduction-inline-breakdown="manual"></strong>', 'Enter the total deduction, then split it into weekly payments') + '</div>' +
    '<div class="deduction-settlement-strip"><div><span>Gross commission</span><strong>' + esc(deductionMoney(summary.grossCents)) + '</strong></div><span class="deduction-equation-sign" aria-hidden="true">−</span><div><span>Applied deductions</span><strong>' + esc(enabled ? deductionMoney(summary.approvedCents) : '—') + '</strong><small>' + esc(enabled ? 'Saved deductions are applied immediately' : 'Requires one rider and a complete register') + '</small></div><span class="deduction-equation-sign" aria-hidden="true">=</span><div class="commission-net-total' + (summary.netCents < 0 ? ' is-negative' : '') + '"><span>Net commission</span><strong>' + esc(enabled ? deductionMoney(summary.netCents) : '—') + '</strong></div></div>' +
    (summary.legacyCount ? '<p class="deduction-legacy-note">' + summary.legacyCount + ' legacy applied payment(s) use their original due date for this report.</p>' : '') +
    '<footer class="deduction-inline-actions"><button type="button" data-deduction-history-open>History</button><div><strong data-deduction-inline-preview>Deduction preview: —</strong><span data-deduction-inline-message>' + esc(enabled ? 'Choose one or more types, then Proceed. Dates and remarks can be edited in History.' : error || 'Waiting for the deduction register.') + '</span></div><strong class="deduction-inline-total">Total Deducted: ' + esc(enabled ? deductionMoney(summary.approvedCents) : '—') + '</strong><button type="button" data-deduction-inline-create' + (enabled && draft.selected.length ? '' : ' disabled') + '>Proceed</button></footer></section>';
}
function deductionUpdateInline(summary) {
  if (!summary) return;
  const draft = deductionDrafts.get(summary.dataset.deductionTable); if (!draft) return;
  const choices = [...summary.querySelectorAll('[data-deduction-inline-type]:checked')]; draft.selected = choices.map(input => input.value);
  draft.batteryPlan = summary.querySelector('[data-deduction-inline-battery-plan]')?.value || 'fixed-2';
  draft.batteryCount = Number(summary.querySelector('[data-deduction-inline-battery-count]')?.value) || 0;
  draft.manualCount = Number(summary.querySelector('[data-deduction-inline-manual-count]')?.value) || 0;
  summary.querySelectorAll('[data-deduction-inline-amount]').forEach(input => { draft.amounts[input.dataset.deductionInlineAmount] = input.value; });
  summary.querySelectorAll('.deduction-choice-card').forEach(card => card.classList.toggle('is-selected', Boolean(card.querySelector('[data-deduction-inline-type]:checked'))));
  let total = 0, valid = Boolean(choices.length);
  for (const type of draft.selected) {
    const amount = Number(draft.amounts[type]);
    if (!(amount > 0) || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) valid = false;
    const count = type === 'insurance' ? 2 : type === 'battery-tester' ? draft.batteryPlan === 'fixed-7' ? 7 : draft.batteryPlan === 'fixed-2' ? 2 : draft.batteryCount : type === 'manual' ? draft.manualCount : type === 'epf' ? 4 : 1;
    if (!Number.isInteger(count) || count < 1 || count > 52) valid = false;
    const cents = Math.round((amount || 0) * 100);
    if (type === 'manual') {
      const evenlySplit = Number.isInteger(count) && count > 0 && cents % count === 0;
      if (!evenlySplit) valid = false;
      total += cents;
      const breakdown = summary.querySelector('[data-deduction-inline-breakdown="manual"]');
      if (breakdown) breakdown.textContent = evenlySplit ? deductionMoney(cents / count) + ' × ' + count + ' = ' + deductionMoney(cents) + ' total' : 'Total must split evenly to cents';
    } else total += cents * count;
  }
  const button = summary.querySelector('[data-deduction-inline-create]'); if (button) button.disabled = !valid || !deductionState.loaded;
  const preview = summary.querySelector('[data-deduction-inline-preview]'); if (preview) preview.textContent = 'Deduction preview: ' + (choices.length ? deductionMoney(total) + ' applied in full' : '—');
  const message = summary.querySelector('[data-deduction-inline-message]'); if (message && choices.length) message.textContent = valid ? 'Ready. Proceed applies the deduction and opens History.' : 'Enter a valid amount for every selected deduction.';
}
function deductionDialog(title) {
  document.getElementById('deductionDialog')?.remove();
  const dialog = document.createElement('dialog'); dialog.id = 'deductionDialog'; dialog.className = 'audit-template-dialog deduction-dialog deduction-workflow-dialog'; dialog.setAttribute('aria-labelledby', 'deductionDialogTitle');
  dialog.innerHTML = '<header><div><span class="deduction-eyebrow">Commission Rider</span><h3 id="deductionDialogTitle">' + esc(title) + '</h3></div><button type="button" data-deduction-close aria-label="Close deduction dialog">×</button></header><div data-deduction-body></div>';
  dialog.querySelector('[data-deduction-close]').onclick = () => dialog.close(); dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal(); return dialog;
}
function deductionRequestIdentity() {
  let content = '', requestId = '';
  return input => { const next = JSON.stringify(input); if (content !== next) { content = next; requestId = crypto.randomUUID(); } return requestId; };
}
async function deductionRefreshAfterSave(body, records, backupWarning = '') {
  // Success is final even if refreshing later fails: never expose the submit button again.
  body.innerHTML = '<section class="deduction-save-success" role="status"><span class="deduction-status-pill">Saved · applied</span><h4>Deduction applied</h4><p>The full selected deduction now reduces this rider’s commission. The payment split remains available for reference.</p><ul>' + records.map(record => '<li><span>' + esc(deductionTypes[record.type] || record.type || 'Deduction') + '</span><strong>' + esc(record.reference || record.id) + '</strong></li>').join('') + '</ul><p data-deduction-refresh-message>Refreshing the register…</p><button type="button" data-deduction-done>Done</button></section>';
  if (backupWarning) body.querySelector('[data-deduction-refresh-message]').insertAdjacentHTML('beforebegin', '<p class="deduction-feedback is-error">Saved centrally. ' + esc(backupWarning) + ' Do not create this request again.</p>');
  body.querySelector('[data-deduction-done]').onclick = () => body.closest('dialog').close(); deductionState.loaded = false;
  try { await deductionLoad(); body.querySelector('[data-deduction-refresh-message]').textContent = 'The register is up to date.'; }
  catch { body.querySelector('[data-deduction-refresh-message]').textContent = 'Your request is saved. Register refresh failed; use Retry register before exporting.'; }
  render();
}
function deductionCreate(id, row, requestedType = 'manual', draft = {}) { return deductionProceedBatch(id, [requestedType || 'manual'], { [requestedType || 'manual']: draft }); }

async function deductionProceedBatch(id, selectedTypes, drafts = {}, sourceButton) {
  const candidates = deductionRows(id, true), rider = deductionSingleRider(candidates), types = [...new Set(selectedTypes)].filter(type => deductionTypes[type]);
  const summary = sourceButton?.closest('.deduction-workspace') || document.querySelector('[data-deduction-table="' + id + '"]');
  const message = summary?.querySelector('[data-deduction-inline-message]');
  if (!rider.valid || !deductionState.loaded || !types.length) { if (message) message.textContent = !rider.valid ? rider.message : !deductionState.loaded ? 'Load the complete deduction register before proceeding.' : 'Choose at least one deduction type.'; return; }
  const dates = auditCapture(id)?.scope?.dates || {}, periodStart = String(dates.start || '').slice(0, 10), periodEnd = String(dates.end || '').slice(0, 10);
  const gross = candidates.reduce((sum, row) => sum + numberValue(row.commission), 0), monday = deductionNextMonday(periodEnd), today = deductionToday();
  if (types.includes('epf') && (!deductionFullWeek(periodStart, periodEnd) || gross < 300)) { if (message) message.textContent = !deductionFullWeek(periodStart, periodEnd) ? 'EPF requires exactly one full Monday–Sunday week.' : 'EPF requires at least RM300 commission in this filtered week.'; return; }
  if (sourceButton?.dataset.deductionSaving === 'true') return;
  if (sourceButton) { sourceButton.dataset.deductionSaving = 'true'; sourceButton.disabled = true; sourceButton.textContent = 'Proceeding…'; }
  if (message) message.textContent = types.includes('epf') ? 'Preparing the EPF dates and applying deductions…' : 'Applying deductions…';
  // Start from the current operating week, never from a past commission week.
  // If Finance is preparing a future commission week, start from that week.
  const epfAnchorDate = periodStart > today ? periodStart : today;
  const preliminaryEpfSchedule = deductionEpfSchedule(epfAnchorDate);
  const epfScheduleMonth = String(preliminaryEpfSchedule[0]?.dueDate || epfAnchorDate).slice(0, 7);
  try {
    let holidays = new Set();
    if (types.includes('epf')) {
      const years = [...new Set(preliminaryEpfSchedule.map(item => Number(item.wednesday.slice(0, 4))))];
      const calendars = await Promise.all(years.map(year => deductionPublicHolidays(year)));
      holidays = new Set(calendars.flatMap(calendar => [...calendar.dates]));
    }
    const epfSchedule = deductionEpfSchedule(epfAnchorDate, holidays);
    const current = deductionSingleRider(deductionRows(id, true)), currentDates = auditCapture(id)?.scope?.dates || {};
    if (!current.valid || current.key !== rider.key || String(currentDates.start || '').slice(0, 10) !== periodStart || String(currentDates.end || '').slice(0, 10) !== periodEnd) throw new Error('The table rider or period changed. Review the filter and try again.');
    const lines = types.map(type => {
      const plan = type === 'battery-tester' ? drafts[type]?.pricingMode || 'fixed-2' : type === 'epf' ? 'fixed-epf' : 'manual';
      const count = type === 'insurance' ? 2 : type === 'battery-tester' ? plan === 'fixed-7' ? 7 : plan === 'fixed-2' ? 2 : Number(drafts[type]?.installmentCount || 3) : type === 'manual' ? Number(drafts[type]?.installmentCount || 1) : 4;
      const entered = type === 'epf' ? 25 : type === 'battery-tester' && plan !== 'manual' ? plan === 'fixed-7' ? 40 : 50 : Number(drafts[type]?.amount);
      const amount = type === 'manual' ? entered / count : entered;
      if (!Number.isInteger(count) || count < 1 || count > 52 || !(amount > 0) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error('Enter a valid amount and payment count for every selected deduction.');
      return { type, subtype: { epf: 'EPF', insurance: 'insurance', 'battery-tester': 'battery tester', manual: 'other' }[type], pricingMode: plan, amount: amount.toFixed(2), installmentCount: String(count), deductionDate: type === 'epf' ? epfSchedule[0].dueDate : type === 'insurance' || type === 'battery-tester' && plan !== 'manual' ? monday : today, periodStart, periodEnd, ...(type === 'epf' ? { weeklyCommission: gross.toFixed(2), epfScheduleMonth, installmentDates: epfSchedule.map(item => item.dueDate) } : {}), reason: '' };
    });
    const draft = deductionDrafts.get(id) || {}, input = { rider: rider.rider, orderId: '', grossCommission: gross.toFixed(2), periodStart, periodEnd, createdBy: deductionState.actor?.name || 'Finance', lines };
    const content = JSON.stringify(input); if (draft.requestContent !== content || !draft.requestId) { draft.requestContent = content; draft.requestId = crypto.randomUUID(); deductionDrafts.set(id, draft); }
    const saved = await deductionRequest('/create-batch', { ...input, requestId: draft.requestId });
    deductionDrafts.delete(id); deductionState.loaded = false;
    let refreshWarning = '';
    try { await deductionLoad(); } catch { refreshWarning = 'The deduction was applied, but History refresh failed. Use Retry register; do not proceed again.'; }
    render(); await deductionHistoryOpen();
    const feedback = deductionHistoryEnsure()?.querySelector('[data-deduction-history-feedback]');
    if (feedback && (saved.backupWarning || refreshWarning)) feedback.textContent = ['Deduction applied.', saved.backupWarning, refreshWarning].filter(Boolean).join(' ');
  } catch (reason) {
    if (message) message.textContent = reason.message;
    if (sourceButton) { sourceButton.dataset.deductionSaving = 'false'; sourceButton.disabled = false; sourceButton.textContent = 'Proceed'; }
  }
}

function deductionHistoryFilters(view) {
  return { search: deductionRiderKey(view?.querySelector('[data-deduction-history-search]')?.value), status: view?.querySelector('[data-deduction-history-status]')?.value || '', type: view?.querySelector('[data-deduction-history-type]')?.value || '', due: view?.querySelector('[data-deduction-history-due]')?.value || '', timing: view?.querySelector('[data-deduction-history-timing]')?.value || '', month: view?.querySelector('[data-deduction-history-month]')?.value || '', periodStart: view?.querySelector('[data-deduction-history-period-start]')?.value || '', periodEnd: view?.querySelector('[data-deduction-history-period-end]')?.value || '' };
}
function deductionHistoryCommissionRange() {
  const dates = typeof auditCapture === 'function' ? auditCapture('commission-main-ledger')?.scope?.dates : state?.dates?.['commission-main'];
  return { start: String(dates?.start || '').slice(0, 10), end: String(dates?.end || '').slice(0, 10) };
}
function deductionHistoryUseCommissionRange(view) {
  const range = deductionHistoryCommissionRange();
  const start = view?.querySelector('[data-deduction-history-period-start]'), end = view?.querySelector('[data-deduction-history-period-end]');
  if (start) start.value = range.start;
  if (end) end.value = range.end;
  deductionHistoryRangeSetDraft(range.start, range.end);
  deductionHistoryRangePicker.open = false;
  deductionHistoryRenderRangePicker(view);
}
function deductionHistoryProgress(record, today = deductionToday()) {
  const items = deductionInstallments(record), active = !['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record)), scheduled = items.filter(item => item.status === 'scheduled' && active), applied = items.filter(item => item.status === 'applied');
  const nextDue = scheduled.map(item => item.dueDate).filter(Boolean).sort()[0] || '';
  return { items, paidCount: applied.length, count: items.length, nextDue, due: scheduled.some(item => item.dueDate <= today), overdue: scheduled.some(item => item.dueDate < today), appliedCents: applied.reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0), remainingCents: scheduled.reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0), reversedCents: items.filter(item => item.status === 'reversed').reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0) };
}
function deductionScheduleNotice(record, today = deductionToday()) {
  const items = deductionInstallments(record).map((item, index) => ({ ...item, index: Number.isInteger(Number(item.index)) ? Number(item.index) : index })).filter(item => item.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  if (!items.length) return null;
  const currentIndex = items.findLastIndex(item => item.dueDate <= today);
  const index = currentIndex >= 0 ? currentIndex : 0, item = items[index], next = items[index + 1];
  if (currentIndex < 0) return { state: 'upcoming', payment: index + 1, count: items.length, start: item.dueDate, end: next ? deductionAddDays(next.dueDate, -1) : item.dueDate };
  if (!next && today > item.dueDate) return { state: 'complete', payment: index + 1, count: items.length, start: item.dueDate, end: item.dueDate };
  return { state: 'current', payment: index + 1, count: items.length, start: item.dueDate, end: next ? deductionAddDays(next.dueDate, -1) : item.dueDate };
}
function deductionGroupScheduleProgress(records, today = deductionToday()) {
  const candidates = records.map(record => ({ record, notice: deductionScheduleNotice(record, today) })).filter(item => item.notice);
  if (!candidates.length) return null;
  const active = candidates.filter(item => item.notice.state === 'current'), upcoming = candidates.filter(item => item.notice.state === 'upcoming'), selected = (active.length ? active : upcoming.length ? upcoming : candidates).sort((left, right) => right.notice.count - left.notice.count || right.notice.payment - left.notice.payment)[0];
  return { ...selected, label: selected.notice.payment + '/' + selected.notice.count + ' payment', ready: selected.notice.state === 'current' };
}
function deductionGroupMatchesTiming(group, timing, today = deductionToday()) {
  if (!timing) return true;
  const options = deductionHistoryPaymentOptions(group, today);
  if (timing === 'complete') return options.length > 0 && options.every(option => option.state === 'sent');
  return options.some(option => option.state === timing);
}
function deductionRecordMatchesPaymentState(record, timing, today = deductionToday()) {
  if (!record) return false;
  const options = deductionHistoryPaymentOptions({ records: [record] }, today);
  if (timing === 'complete') return options.length > 0 && options.every(option => option.state === 'sent');
  return options.some(option => option.state === timing);
}
function deductionGroupMatchesTypePaymentFilters(group, typeTimings = {}, today = deductionToday()) {
  return Object.entries(typeTimings).every(([type, timing]) => !timing || deductionRecordMatchesPaymentState(group.records.find(record => record.type === type), timing, today));
}
function deductionHistoryPaymentOptions(group, today = deductionToday()) {
  return group.records.flatMap(record => {
    const progress = deductionHistoryProgress(record, today), count = progress.items.length;
    return progress.items.map((item, index) => {
      // EPF payment 1 is the opening RM25 deduction for the selected
      // commission statement. It is intentionally available immediately,
      // while the PDF still discloses its scheduled deduction date.
      const openingEpfPayment = record.type === 'epf' && index === 0;
      return { record, item, index, count, key: record.id + '|' + index, label: (deductionTypes[record.type] || record.type) + ' · Payment ' + (index + 1) + '/' + count, amountCents: deductionInstallmentAmount(record, item), state: item.statementSentAt ? 'sent' : openingEpfPayment || item.dueDate <= today ? 'ready' : 'upcoming' };
    });
  });
}
function deductionPaymentMatchesCommissionRange(option, periodStart = '', periodEnd = '') {
  if (!periodStart && !periodEnd) return true;
  const settlement = deductionInstallmentSettlement(option.record, option.item, option.index), start = settlement?.start || option.item.dueDate, end = settlement?.end || option.item.dueDate;
  return Boolean(start && end && (!periodStart || end >= periodStart) && (!periodEnd || start <= periodEnd));
}
function deductionHistorySelectedPayment(group, type, today = deductionToday(), timing = '', periodStart = '', periodEnd = '') {
  const options = deductionHistoryPaymentOptions(group, today).filter(option => option.record.type === type && deductionPaymentMatchesCommissionRange(option, periodStart, periodEnd)), selected = deductionHistoryPaymentSelections.get(group.id + '|' + type);
  const queueState = timing === 'complete' ? 'sent' : timing;
  return options.find(option => option.key === selected) || options.find(option => option.state === queueState) || options.find(option => option.state === 'ready') || options.find(option => option.state === 'upcoming') || options[0] || null;
}
function deductionHistoryPaymentCell(group, type, today = deductionToday(), timing = '', periodStart = '', periodEnd = '') {
  const options = deductionHistoryPaymentOptions(group, today).filter(option => option.record.type === type), selected = deductionHistorySelectedPayment(group, type, today, timing, periodStart, periodEnd);
  if (!selected) return '<strong>—</strong>';
  const status = selected.state === 'sent' ? '✓ Sent to rider' : selected.state === 'ready' ? 'Ready to download' : 'Upcoming';
  return '<label class="deduction-history-payment-picker"><span>Payment</span><select data-deduction-history-type-payment-select data-deduction-history-payment-type="' + esc(type) + '">' + options.map(option => '<option value="' + esc(option.key) + '"' + (option.key === selected.key ? ' selected' : '') + '>' + esc('Payment ' + (option.index + 1) + '/' + option.count + ' · ' + deductionDateLabel(option.item.dueDate) + ' · ' + deductionMoney(option.amountCents)) + '</option>').join('') + '</select></label><span class="deduction-download-ready ' + (selected.state === 'sent' ? 'is-sent' : selected.state === 'upcoming' ? 'is-upcoming' : '') + '">' + esc(status) + '</span>';
}
function deductionHistoryDownloadOptions(group, typeTimings = {}, today = deductionToday(), periodStart = '', periodEnd = '') {
  return group.records.map(record => deductionHistorySelectedPayment(group, record.type, today, typeTimings[record.type] || '', periodStart, periodEnd)).filter(Boolean);
}
function deductionHistoryDownloadCell(group, typeTimings = {}, today = deductionToday(), periodStart = '', periodEnd = '') {
  const selected = deductionHistoryDownloadOptions(group, typeTimings, today, periodStart, periodEnd), downloadable = selected.filter(option => option.state !== 'upcoming'), upcoming = selected.filter(option => option.state === 'upcoming');
  if (!downloadable.length) return '<td class="deduction-history-download-cell"><small>Available when the selected payment date is reached.</small></td>';
  const labels = downloadable.map(option => (deductionTypes[option.record.type] || option.record.type) + ' payment ' + (option.index + 1)).join(' · ');
  const sent = downloadable.every(option => option.state === 'sent');
  return '<td class="deduction-history-download-cell"><div class="deduction-history-download-item"><strong>' + esc(downloadable.length + ' selected payment' + (downloadable.length === 1 ? '' : 's')) + '</strong><small>' + esc(labels) + '</small>' + (upcoming.length ? '<small>' + esc(upcoming.length + ' future payment' + (upcoming.length === 1 ? ' is' : 's are') + ' excluded until due.') + '</small>' : '') + (sent ? '<span class="deduction-download-ready is-sent">✓ Sent to rider</span>' : '<span class="deduction-download-ready">Ready to download</span>') + '<button type="button" data-deduction-history-batch-download>Download PDF</button></div></td>';
}
function deductionRecordMatchesCommissionRange(record, start = '', end = '') {
  if (!start && !end) return true;
  return deductionHistoryProgress(record).items.some((item, index) => {
    return deductionPaymentMatchesCommissionRange({ record, item, index }, start, end);
  });
}
function deductionFilteredHistory(records, filters, today = deductionToday()) {
  return records.filter(record => {
    if (filters.status && deductionStatus(record) !== filters.status || filters.type && record.type !== filters.type) return false;
    if (filters.month && (record.type !== 'epf' || (record.epfContributionMonth || deductionNextMonth(record.deductionDate)) !== filters.month)) return false;
    if (!deductionRecordMatchesCommissionRange(record, filters.periodStart, filters.periodEnd)) return false;
    const p = deductionHistoryProgress(record, today); if (filters.due === 'due' && !p.due || filters.due === 'overdue' && !p.overdue) return false;
    return !filters.search || deductionRiderKey([record.rider, record.reference, record.id, record.orderId, record.reason, record.subtype].join(' ')).includes(filters.search);
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function deductionHistoryTotals(records) {
  return records.reduce((total, record) => { const p = deductionHistoryProgress(record); total.appliedCents += p.appliedCents; total.remainingCents += p.remainingCents; total.reversedCents += p.reversedCents;
    total.appliedInstallments += p.paidCount; total.recordCount += 1; return total;
  }, { appliedCents: 0, remainingCents: 0, reversedCents: 0, appliedInstallments: 0, recordCount: 0 });
}
function deductionHistoryGroups(records) {
  const groups = new Map(), typeOrder = ['epf', 'insurance', 'battery-tester', 'manual'];
  records.forEach(record => {
    const key = record.batchId || record.id;
    if (!groups.has(key)) groups.set(key, { id: key, records: [] });
    groups.get(key).records.push(record);
  });
  return [...groups.values()].map(group => {
    group.records.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
    const first = group.records[0], statuses = [...new Set(group.records.map(deductionStatus))];
    const progress = group.records.reduce((total, record) => {
      const item = deductionHistoryProgress(record);
      total.paidCount += item.paidCount; total.count += item.count; total.appliedCents += item.appliedCents; total.remainingCents += item.remainingCents; total.reversedCents += item.reversedCents;
      if (item.nextDue && (!total.nextDue || item.nextDue < total.nextDue)) total.nextDue = item.nextDue;
      total.due ||= item.due; total.overdue ||= item.overdue; return total;
    }, { paidCount: 0, count: 0, appliedCents: 0, remainingCents: 0, reversedCents: 0, nextDue: '', due: false, overdue: false });
    return { ...group, rider: first.rider, riderKey: first.riderKey || deductionRiderKey(first.rider), periodStart: first.periodStart, periodEnd: first.periodEnd, createdBy: first.createdBy, createdAt: first.createdAt, references: group.records.map(record => record.reference || record.id), status: statuses.length === 1 ? statuses[0] : 'mixed', progress };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function deductionPlanLabel(record) {
  if (record.type === 'epf') return Number(record.installmentCount || 1) === 4 ? 'RM25 × 4 = RM100 total · ' + (record.epfScheduleMonth || String(record.deductionDate || '').slice(0, 7)) : 'Held ' + (record.deductionDate || '—') + ' · EPF ' + (record.epfContributionMonth || deductionNextMonth(record.deductionDate));
  const count = Number(record.installmentCount || 1), amount = Number(record.amountCents || 0), calculation = deductionMoney(amount) + ' × ' + count + ' = ' + deductionMoney(amount * count) + ' total';
  if (record.type === 'insurance') return calculation + ' · weekly';
  if (record.type === 'battery-tester') return calculation + (record.pricingMode === 'manual' ? ' · Finance-set' : '');
  if (record.type === 'manual') return calculation + ' · weekly';
  return 'One-off';
}
function deductionHistoryActions(record, checker) {
  const progress = deductionHistoryProgress(record); let buttons = '<button type="button" data-deduction-action="view">Details</button>';
  if (checker && progress.appliedCents) buttons += '<button type="button" data-deduction-action="reverse">Reverse payment</button>';
  return buttons;
}
function deductionHistoryTypeHeader(_type, label) {
  return '<th class="deduction-type-heading">' + esc(label) + '</th>';
}
function deductionHistoryTypeCell(group, type, checker, timing = '', periodStart = '', periodEnd = '') {
  const record = group.records.find(item => item.type === type); if (!record) return '<td class="deduction-type-cell is-empty">—</td>';
  const progress = deductionHistoryProgress(record), total = progress.items.reduce((sum, installment) => sum + deductionInstallmentAmount(record, installment), 0), selected = deductionHistorySelectedPayment(group, type, deductionToday(), timing, periodStart, periodEnd), noticeLabel = selected ? (selected.state === 'ready' ? 'Ongoing' : selected.state === 'sent' ? 'Sent to rider' : selected.state === 'upcoming' ? 'Upcoming' : 'Completed') + ' · Payment ' + (selected.index + 1) : '';
  return '<td class="deduction-type-cell" data-deduction-record-id="' + esc(record.id) + '"><strong>' + esc(deductionMoney(total)) + '</strong><small>' + esc(deductionPlanLabel(record)) + '</small>' + (selected ? '<span class="deduction-payment-notice ' + esc(selected.state) + '">' + esc(noticeLabel) + '<small>' + esc(deductionDateLabel(selected.item.dueDate)) + '</small></span>' + deductionHistoryPaymentCell(group, type, deductionToday(), timing, periodStart, periodEnd) : '<small>No payment in this Commission Rider range.</small>') + '<span class="deduction-history-status ' + esc(deductionStatus(record)) + '">' + esc(deductionDisplayStatus(record)) + '</span>' + (record.reason ? '<small>Reason: ' + esc(record.reason) + '</small>' : '') + '<div class="deduction-type-actions">' + deductionHistoryActions(record, checker) + '</div></td>';
}
function deductionHistoryRangeDisplay(value, end = false) {
  const date = String(value || '').slice(0, 10); return date ? date + (end ? ' 23:59:59' : ' 00:00:00') : 'Select date';
}
function deductionHistoryRangeMonthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number); return new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function deductionHistoryRangePickerMarkup(view) {
  const start = view?.querySelector('[data-deduction-history-period-start]')?.value || '', end = view?.querySelector('[data-deduction-history-period-end]')?.value || '', picker = deductionHistoryRangePicker;
  if (!picker.draftStart) { picker.draftStart = start; picker.draftEnd = end; }
  if (!picker.month) picker.month = (picker.draftStart || start || deductionToday()).slice(0, 7);
  const [year, month] = picker.month.split('-').map(Number), monthStart = new Date(Date.UTC(year, month - 1, 1)), first = new Date(monthStart); first.setUTCDate(1 - first.getUTCDay());
  const dateText = date => date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  const calendar = Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setUTCDate(first.getUTCDate() + index); const value = dateText(date), outside = date.getUTCMonth() !== monthStart.getUTCMonth(), selected = picker.draftStart && picker.draftEnd && value >= picker.draftStart && value <= picker.draftEnd, edge = value === picker.draftStart || value === picker.draftEnd; return '<button type="button" class="deduction-history-range-day' + (outside ? ' is-outside' : '') + (selected ? ' is-selected' : '') + (edge ? ' is-edge' : '') + '" data-deduction-history-range-day="' + value + '" aria-label="' + value + '">' + date.getUTCDate() + '</button>'; }).join('');
  const triggerText = start && end ? deductionDateLabel(start) + ' – ' + deductionDateLabel(end) : 'Select range';
  const quick = [['today', 'Today'], ['yesterday', 'Yesterday'], ['this-week', 'This week'], ['last-week', 'Last week (Mon–Sun)'], ['this-month', 'This month'], ['previous-month', 'Previous month']];
  return '<div class="deduction-history-range-control"><span>date_range</span><button type="button" class="deduction-history-range-trigger" data-deduction-history-range-toggle aria-expanded="' + String(picker.open) + '"><b>◷</b><strong>' + esc(triggerText) + '</strong><small>UTC</small><i>⌄</i></button><input type="hidden" data-deduction-history-period-start value="' + esc(start) + '"><input type="hidden" data-deduction-history-period-end value="' + esc(end) + '">' + (picker.open ? '<section class="deduction-history-range-popover" aria-label="Commission Rider date range"><div class="deduction-history-range-calendar"><header><button type="button" data-deduction-history-range-month="-1" aria-label="Previous month">‹</button><strong>' + esc(deductionHistoryRangeMonthLabel(picker.month)) + '</strong><button type="button" data-deduction-history-range-month="1" aria-label="Next month">›</button></header><div class="deduction-history-range-weekdays">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => '<span>' + day + '</span>').join('') + '</div><div class="deduction-history-range-days">' + calendar + '</div></div><div class="deduction-history-range-side"><h4>Absolute time range</h4><label>From<input readonly value="' + esc(deductionHistoryRangeDisplay(picker.draftStart)) + '"></label><label>To<input readonly value="' + esc(deductionHistoryRangeDisplay(picker.draftEnd, true)) + '"></label><button type="button" class="deduction-history-range-apply" data-deduction-history-range-apply>Apply time range</button><h4>Quick ranges</h4><div class="deduction-history-range-quick">' + quick.map(([key, label]) => '<button type="button" data-deduction-history-range-quick="' + key + '">' + label + '</button>').join('') + '</div></div></section>' : '') + '</div>';
}
function deductionHistoryRenderRangePicker(view) {
  const host = view?.querySelector('[data-deduction-history-range-host]'); if (host) host.innerHTML = deductionHistoryRangePickerMarkup(view);
}
function deductionHistoryRangeSetDraft(start, end) {
  const picker = deductionHistoryRangePicker; picker.draftStart = start; picker.draftEnd = end; picker.anchor = '';
  if (start) picker.month = start.slice(0, 7);
}
function deductionHistoryRangeMonthShift(monthKey, amount) {
  const [year, month] = String(monthKey || deductionToday().slice(0, 7)).split('-').map(Number), date = new Date(Date.UTC(year, month - 1 + Number(amount || 0), 1));
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}
function deductionHistoryRangeQuick(key) {
  if (typeof auditQuickRange === 'function') {
    const range = auditQuickRange(key);
    if (range?.start && range?.end) return { start: String(range.start).slice(0, 10), end: String(range.end).slice(0, 10) };
  }
  const today = deductionToday(), date = new Date(today + 'T00:00:00Z'), shift = amount => new Date(date.getTime() + amount * 86400000), text = value => value.toISOString().slice(0, 10);
  if (key === 'yesterday') return { start: text(shift(-1)), end: text(shift(-1)) };
  if (key === 'this-week' || key === 'last-week') { const mondayOffset = -((date.getUTCDay() + 6) % 7) + (key === 'last-week' ? -7 : 0), start = shift(mondayOffset); return { start: text(start), end: text(new Date(start.getTime() + 6 * 86400000)) }; }
  if (key === 'this-month' || key === 'previous-month') { const month = date.getUTCMonth() + (key === 'previous-month' ? -1 : 0), year = date.getUTCFullYear(), start = new Date(Date.UTC(year, month, 1)), end = new Date(Date.UTC(year, month + 1, 0)); return { start: text(start), end: text(end) }; }
  return { start: today, end: today };
}
function deductionHistoryRangeRemember(start, end) {
  if (!start || !end) return;
  const value = start + ' to ' + end;
  deductionHistoryRangePicker.recent = [value, ...deductionHistoryRangePicker.recent.filter(item => item !== value)].slice(0, 5);
}
function deductionHistoryEnsure() {
  const commission = document.getElementById('tab-commission'); if (!commission) return null;
  const commissionRange = deductionHistoryCommissionRange();
  document.querySelectorAll('.deduction-history-nav, .deduction-history-mobile').forEach(button => button.remove());
  let view = document.getElementById('deductionHistoryView');
  if (!view) {
    view = document.createElement('section'); view.id = 'deductionHistoryView'; view.className = 'deduction-history-view'; view.hidden = true;
    view.innerHTML = '<header class="deduction-history-head"><div><p>Commission Rider</p><h2>Rider deduction history</h2><span>Every saved request is applied immediately. Each deduction has its own column and audit actions.</span></div><div class="deduction-history-head-actions"><button type="button" data-deduction-history-export="excel">Export Excel</button><button type="button" data-deduction-history-export="pdf" disabled>Export checked Rider PDF</button><button type="button" data-deduction-history-close>← Back to Commission Rider</button></div></header><div data-deduction-history-feedback role="status"></div><section class="deduction-history-kpis" data-deduction-history-kpis></section><div class="deduction-history-toolbar"><label>Search<input type="search" data-deduction-history-search placeholder="Rider, reference or reason"></label><label>Status<select data-deduction-history-status><option value="">All statuses</option>' + ['applied', 'rejected', 'cancelled', 'reversed'].map(value => '<option>' + value + '</option>').join('') + '</select></label><label>Deduction<select data-deduction-history-type><option value="">All types</option>' + Object.entries(deductionTypes).map(([value, label]) => '<option value="' + value + '">' + esc(label) + '</option>').join('') + '</select></label><label>Payment schedule<select data-deduction-history-timing><option value="">All payments</option><option value="ready">Ready to download</option><option value="sent">Sent to rider</option><option value="upcoming">Upcoming</option><option value="complete">Completed</option></select></label><div data-deduction-history-range-host><input type="hidden" data-deduction-history-period-start value="' + esc(commissionRange.start) + '"><input type="hidden" data-deduction-history-period-end value="' + esc(commissionRange.end) + '"></div><label>EPF contribution month<input type="month" data-deduction-history-month></label></div><div class="deduction-history-table-wrap"><table><thead><tr><th class="deduction-export-check">PDF</th><th>Rider / batch</th>' + deductionHistoryTypeHeader('epf', 'EPF') + deductionHistoryTypeHeader('insurance', 'Insurance') + deductionHistoryTypeHeader('battery-tester', 'OBD / Battery Tester') + deductionHistoryTypeHeader('manual', 'Special Case') + '<th>Download PDF</th><th>Commission period</th><th>Applied</th><th>Remaining</th><th>Status</th><th>Created by</th></tr></thead><tbody data-deduction-history-body></tbody></table></div><p class="deduction-history-empty" data-deduction-history-empty hidden>No deductions match these filters.</p>';
    commission.append(view);
  } deductionHistoryRenderRangePicker(view); return view;
}
function deductionHistoryRender() {
  const view = deductionHistoryEnsure(); if (!view) return;
  const filters = deductionHistoryFilters(view), baseRecords = deductionFilteredHistory(deductionState.records, filters), groups = deductionHistoryGroups(baseRecords).filter(group => deductionGroupMatchesTiming(group, filters.timing)), shown = groups.flatMap(group => group.records), totals = deductionHistoryTotals(shown), checker = ['checker', 'admin'].includes(deductionState.actor?.role);
  const visibleIds = new Set(groups.map(group => group.id)); [...deductionHistorySelected].forEach(id => { if (!visibleIds.has(id)) deductionHistorySelected.delete(id); });
  view.querySelectorAll('[data-deduction-history-export]').forEach(button => { button.disabled = !deductionState.loaded || button.dataset.deductionHistoryExport === 'pdf' && deductionHistorySelected.size !== 1; });
  view.querySelector('[data-deduction-history-feedback]').textContent = deductionState.loaded ? groups.length + ' request' + (groups.length === 1 ? '' : 's') + ' shown, containing ' + shown.length + ' deduction record' + (shown.length === 1 ? '' : 's') + '. Totals follow the filters below.' : deductionState.error || 'Loading the complete deduction register…';
  view.querySelector('[data-deduction-history-kpis]').innerHTML = [['Total deducted', deductionMoney(totals.appliedCents)], ['Applied installments', formatNumber(totals.appliedInstallments)], ['Deduction records', formatNumber(totals.recordCount)], ['Remaining', deductionMoney(totals.remainingCents)], ['Reversed payments', deductionMoney(totals.reversedCents)]].map(([label, value]) => '<article><span>' + esc(label) + '</span><strong>' + esc(deductionState.loaded ? value : '—') + '</strong></article>').join('');
  view.querySelector('[data-deduction-history-body]').innerHTML = deductionState.loaded ? groups.map(group => {
    const p = group.progress;
    return '<tr data-deduction-batch-id="' + esc(group.id) + '"><td class="deduction-export-check"><div class="deduction-row-controls"><input type="checkbox" data-deduction-history-select aria-label="Select ' + esc(group.rider) + ' request for Rider PDF"' + (deductionHistorySelected.has(group.id) ? ' checked' : '') + '><button type="button" data-deduction-delete-batch aria-label="Delete ' + esc(group.rider) + ' deduction request" title="Delete request">×</button></div></td><td><strong>' + esc(group.rider) + '</strong><small>' + group.records.length + ' deductions in one request</small><small>' + esc(group.references.join(' | ')) + '</small></td>' + deductionHistoryTypeCell(group, 'epf', checker, '', filters.periodStart, filters.periodEnd) + deductionHistoryTypeCell(group, 'insurance', checker, '', filters.periodStart, filters.periodEnd) + deductionHistoryTypeCell(group, 'battery-tester', checker, '', filters.periodStart, filters.periodEnd) + deductionHistoryTypeCell(group, 'manual', checker, '', filters.periodStart, filters.periodEnd) + deductionHistoryDownloadCell(group, {}, deductionToday(), filters.periodStart, filters.periodEnd) + '<td>' + esc((group.periodStart || '-') + ' - ' + (group.periodEnd || '-')) + '</td><td>' + esc(deductionMoney(p.appliedCents)) + '</td><td>' + esc(deductionMoney(p.remainingCents)) + '</td><td><span class="deduction-history-status ' + esc(group.status) + '">' + esc(deductionDisplayStatus(group.status)) + '</span></td><td>' + esc(group.createdBy || '-') + '<small>' + esc(formatGrafanaTimestamp(group.createdAt)) + '</small></td></tr>';
  }).join('') : '<tr><td colspan="12">History is unavailable until the full register loads. <button type="button" data-deduction-retry>Retry register</button></td></tr>';
  view.querySelector('[data-deduction-history-empty]').hidden = !deductionState.loaded || shown.length > 0;
}
function deductionHistoryStatementPayload(records) {
  if (typeof financeTableExportPayload !== 'function') throw new Error('The Commission Rider table is not ready for PDF export.');
  const payload = financeTableExportPayload('commission-main');
  if (!payload?.rows?.length || !payload.columns?.length) throw new Error('Return to Commission Rider and load the filtered rider table before exporting the PDF.');
  const rider = deductionSingleRider(payload.rows);
  if (!rider.valid) throw new Error('Filter the Commission Rider table to one rider before exporting the rider PDF.');
  const dates = auditCapture('commission-main-ledger')?.scope?.dates || {};
  const start = String(dates.start || '').slice(0, 10), end = String(dates.end || '').slice(0, 10);
  const active = records.filter(record => (record.riderKey || deductionRiderKey(record.rider)) === rider.key && !['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record)));
  if (!active.length) throw new Error('No selected deductions match this rider.');
  const periodItems = record => deductionHistoryProgress(record).items.filter((item, index) => {
    if (item.status !== 'applied') return false;
    if (!start || !end) return true;
    const settlement = deductionInstallmentSettlement(record, item, index);
    const itemStart = settlement?.start || item.dueDate, itemEnd = settlement?.end || item.dueDate;
    return Boolean(itemStart && itemEnd && itemStart >= start && itemEnd <= end);
  });
  const commissionColumn = payload.columns.find(column => String(column.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'commission');
  if (!commissionColumn) throw new Error('The Commission Rider table has no commission column.');
  const grossCents = Math.round(payload.rows.reduce((sum, row) => sum + numberValue(commissionColumn.value(row)), 0) * 100);
  const activeTypes = [...new Set(active.map(record => record.type))];
  const typeAmounts = new Map(activeTypes.map(type => {
    const cents = active.filter(record => record.type === type).reduce((sum, record) => sum + deductionStatementAmountForRecord(record, periodItems(record)), 0);
    return [type, type === 'epf' && cents > 0 ? 2500 : cents];
  }));
  const appliedCents = [...typeAmounts.values()].reduce((sum, cents) => sum + cents, 0);
  const commissionIndex = payload.columns.indexOf(commissionColumn), row = (label, value) => payload.columns.map((_column, index) => index === 0 ? label : index === commissionIndex ? value : '');
  const typeRows = activeTypes.map(type => {
    const matching = active.filter(record => record.type === type), cents = typeAmounts.get(type) || 0, statuses = [...new Set(matching.map(deductionDisplayStatus))];
    return cents > 0 ? row((deductionTypes[type] || type).toUpperCase() + ' (' + statuses.join('/') + ')', '- ' + deductionMoney(cents)) : null;
  }).filter(Boolean);
  const footer = payload.footer || row('Filtered total', deductionMoney(grossCents));
  const netCents = grossCents - appliedCents;
  const filename = rider.rider.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 160) || 'Rider';
  return { ...payload, title: rider.rider, filename: filename + '-Commission-Statement', pdfFilename: filename + '.pdf', period: (start && end ? start + ' - ' + end : payload.period) + ' | saved deductions are applied immediately', summary: { label: 'Net Commission', value: deductionMoney(netCents) }, footerRows: [footer, ...typeRows, row('APPLIED DEDUCTIONS', '- ' + deductionMoney(appliedCents)), row('NET COMMISSION', deductionMoney(netCents))] };
}
function deductionPaymentStatementCacheKey(record, index, commissionRange = null) {
  const item = deductionHistoryProgress(record).items[index] || {};
  return [record.id, index, item.dueDate, item.settlementPeriodStart, item.settlementPeriodEnd, commissionRange?.start || '', commissionRange?.end || '', record.amountCents, record.installmentCount, record.pricingMode, record.updatedAt].join('|');
}
async function deductionFreshPaymentStatementPayload(record, index, commissionRange = null) {
  const progress = deductionHistoryProgress(record), item = progress.items[index];
  if (!item) throw new Error('This payment is no longer available. Refresh History and try again.');
  if (item.status !== 'applied') throw new Error('Only saved, applied deductions can be downloaded.');
  const selectedRange = commissionRange?.start && commissionRange?.end ? { start: String(commissionRange.start).slice(0, 10), end: String(commissionRange.end).slice(0, 10) } : null;
  const period = selectedRange || deductionInstallmentSettlement(record, item, index) || deductionWeekBounds(item.dueDate);
  if (!period?.start || !period?.end) throw new Error('This payment does not have a Commission Rider period. Edit the payment details first.');
  const panel = panels?.find(panel => panel.id === 'commission-main');
  if (!panel || typeof requestFinancePayload !== 'function' || typeof canonicalizeFinancePayloadRows !== 'function' || typeof visibleTableColumns !== 'function') throw new Error('Commission Rider export is not ready. Return to Commission Rider and try again.');
  const params = new URLSearchParams({ panel: 'commission-main', scope: 'selection', part: 'primary', from: period.start + ' 00:00:00', to: period.end + ' 23:59:59', filters: typeof financeGrafanaFilterParam === 'function' ? financeGrafanaFilterParam('commission-main') : '{}', revision: 'commission-kpi-v9', refresh: '1' });
  const { response, payload } = await requestFinancePayload(FINANCE_API_ENDPOINT + '?' + params.toString(), 'deduction-payment:' + record.id + ':' + index, true);
  if (!response.ok) throw new Error(payload?.error || 'Grafana could not return Commission Rider data for this payment.');
  if (payload?.truncated) throw new Error('The Commission Rider result is incomplete. Narrow dashboard filters before exporting this payment.');
  const allRows = await canonicalizeFinancePayloadRows(panel, payload), riderKey = record.riderKey || deductionRiderKey(record.rider), rows = allRows.filter(row => deductionRiderKey(row.rider_name) === riderKey);
  if (!rows.length) throw new Error('Grafana returned no Commission Rider rows for this rider and payment period.');
  const columns = visibleTableColumns(panel).map(column => ({ key: column.key, label: column.label, value: row => row[column.key] }));
  const commissionColumn = columns.find(column => String(column.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'commission');
  if (!commissionColumn) throw new Error('The Commission Rider table has no commission column.');
  const quantityColumn = columns.find(column => String(column.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'quantity');
  const grossCents = Math.round(rows.reduce((sum, row) => sum + numberValue(commissionColumn.value(row)), 0) * 100), deductedCents = deductionStatementAmountForRecord(record, [item]), netCents = grossCents - deductedCents, commissionIndex = columns.indexOf(commissionColumn);
  const footerRow = (label, value, valueColumnIndex = commissionIndex) => columns.map((_column, columnIndex) => columnIndex === 0 ? label : columnIndex === valueColumnIndex ? value : '');
  const paymentDateColumnIndex = quantityColumn ? columns.indexOf(quantityColumn) : Math.max(1, commissionIndex - 1);
  const paymentRow = (label, date, amount) => columns.map((_column, columnIndex) => columnIndex === 0 ? label : columnIndex === paymentDateColumnIndex ? date : columnIndex === commissionIndex ? amount : '');
  const filteredTotal = columns.map(column => column === columns[0] ? 'Filtered total' : column === quantityColumn ? formatNumber(rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)) : column === commissionColumn ? deductionMoney(grossCents) : '');
  const payment = Number.isInteger(Number(item.index)) ? Number(item.index) + 1 : index + 1, paymentCount = Number(record.installmentCount || progress.items.length || payment), type = (deductionTypes[record.type] || record.type || 'Deduction').toUpperCase(), filename = String(record.rider || 'Rider').trim().replace(/\s+/g, '_').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 160) || 'Rider';
  return { title: record.rider, panelTitle: 'Commission Rider', filename: filename + '_payment-' + paymentCount, pdfFilename: filename + '_payment-' + paymentCount + '.pdf', columns, rows, period: type + ' · Payment ' + payment + ' of ' + paymentCount + ' · Deduction date: ' + deductionDateLabel(item.dueDate) + ' · Commission period: ' + deductionPeriodLabel(period) + ' · refreshed from Grafana', summary: { label: 'Net Commission', value: deductionMoney(netCents) }, footerRows: [filteredTotal, paymentRow(type + ' — PAYMENT ' + payment + ' OF ' + paymentCount, deductionDateLabel(item.dueDate), '- ' + deductionMoney(deductedCents)), footerRow('TOTAL DEDUCTED', '- ' + deductionMoney(deductedCents)), footerRow('NET COMMISSION', deductionMoney(netCents))] };
}
function deductionPrefetchPaymentStatement(record, index, commissionRange = null) {
  const key = deductionPaymentStatementCacheKey(record, index, commissionRange), existing = deductionStatementPayloadCache.get(key);
  if (existing && Date.now() - existing.loadedAt < DEDUCTION_STATEMENT_PREFETCH_TTL_MS) return existing.promise;
  const entry = { loadedAt: Date.now(), promise: deductionFreshPaymentStatementPayload(record, index, commissionRange) };
  deductionStatementPayloadCache.set(key, entry);
  entry.promise.catch(() => { if (deductionStatementPayloadCache.get(key) === entry) deductionStatementPayloadCache.delete(key); });
  return entry.promise;
}
async function deductionPaymentStatementPayload(record, index, commissionRange = null) {
  return deductionPrefetchPaymentStatement(record, index, commissionRange);
}
async function deductionCombinedPaymentStatementPayload(options, commissionRange = null) {
  const payments = options.filter(option => option && option.state !== 'upcoming');
  if (!payments.length) throw new Error('No selected payment is ready to download yet.');
  const periods = payments.map(option => deductionInstallmentSettlement(option.record, option.item, option.index) || deductionWeekBounds(option.item.dueDate));
  const periodKeys = new Set(periods.map(period => (period?.start || '') + '|' + (period?.end || '')));
  const selectedRange = commissionRange?.start && commissionRange?.end ? { start: String(commissionRange.start).slice(0, 10), end: String(commissionRange.end).slice(0, 10) } : null;
  if (!selectedRange && (periodKeys.size !== 1 || !periods[0]?.start || !periods[0]?.end)) throw new Error('Choose payments from the same Commission period before downloading one combined PDF.');
  // The History date_range is the authoritative PDF table scope. Without it,
  // preserve the single-payment-week behavior for direct payment downloads.
  const pdfPeriod = selectedRange || periods[0];
  const payload = await deductionPaymentStatementPayload(payments[0].record, payments[0].index, selectedRange), columns = payload.columns || [];
  const commissionColumn = columns.find(column => String(column.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'commission');
  if (!commissionColumn) throw new Error('The Commission Rider table has no commission column.');
  const commissionIndex = columns.indexOf(commissionColumn), quantityColumn = columns.find(column => String(column.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'quantity'), paymentDateColumnIndex = quantityColumn ? columns.indexOf(quantityColumn) : Math.max(1, commissionIndex - 1);
  const grossCents = Math.round((payload.rows || []).reduce((sum, row) => sum + numberValue(commissionColumn.value(row)), 0) * 100), deductedCents = payments.reduce((sum, option) => sum + deductionStatementAmountForRecord(option.record, [option.item]), 0), netCents = grossCents - deductedCents;
  const footerRow = (label, value, valueColumnIndex = commissionIndex) => columns.map((_column, columnIndex) => columnIndex === 0 ? label : columnIndex === valueColumnIndex ? value : '');
  const paymentRow = (label, date, amount) => columns.map((_column, columnIndex) => columnIndex === 0 ? label : columnIndex === paymentDateColumnIndex ? date : columnIndex === commissionIndex ? amount : '');
  const filteredTotal = columns.map(column => column === columns[0] ? 'Filtered total' : column === quantityColumn ? formatNumber((payload.rows || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)) : column === commissionColumn ? deductionMoney(grossCents) : '');
  const paymentRows = payments.map(option => paymentRow((deductionTypes[option.record.type] || option.record.type).toUpperCase() + ' — PAYMENT ' + (option.index + 1) + ' OF ' + option.count, deductionDateLabel(option.item.dueDate), '- ' + deductionMoney(deductionStatementAmountForRecord(option.record, [option.item]))));
  const filename = String(payments[0].record.rider || 'Rider').trim().replace(/\s+/g, '_').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 160) || 'Rider', highestPaymentCount = Math.max(...payments.map(option => option.count));
  const statementDetails = payments.map(option => (deductionTypes[option.record.type] || option.record.type) + ' · Payment ' + (option.index + 1) + ' of ' + option.count + ' · Deduction date: ' + deductionDateLabel(option.item.dueDate)).join(' | ');
  return { ...payload, filename: filename + '_payment-' + highestPaymentCount, pdfFilename: filename + '_payment-' + highestPaymentCount + '.pdf', period: statementDetails + ' · Commission period: ' + deductionPeriodLabel(pdfPeriod) + ' · refreshed from Grafana', summary: { label: 'Net Commission', value: deductionMoney(netCents) }, footerRows: [filteredTotal, ...paymentRows, footerRow('TOTAL DEDUCTED', '- ' + deductionMoney(deductedCents)), footerRow('NET COMMISSION', deductionMoney(netCents))] };
}
async function deductionHistoryDownloadBatch(groupId, button) {
  const group = deductionHistoryGroups(deductionState.records).find(item => item.id === groupId);
  if (!group) throw new Error('This deduction request is no longer available. Refresh History and try again.');
  const filters = deductionHistoryFilters(deductionHistoryEnsure()), options = deductionHistoryDownloadOptions(group, {}, deductionToday(), filters.periodStart, filters.periodEnd).filter(option => option.state !== 'upcoming');
  if (!options.length) throw new Error('No selected payment is ready to download yet.');
  button.disabled = true;
  const view = deductionHistoryEnsure(), feedback = view?.querySelector('[data-deduction-history-feedback]');
  if (feedback) feedback.textContent = 'Preparing one PDF for ' + options.length + ' selected payment' + (options.length === 1 ? '' : 's') + '…';
  try {
    const [, payload] = await Promise.all([ensureFinanceExportBundle('pdf'), deductionCombinedPaymentStatementPayload(options, { start: filters.periodStart, end: filters.periodEnd })]);
    const downloaded = await downloadPdfTable(payload);
    if (!downloaded) { if (feedback) feedback.textContent = 'PDF download was cancelled.'; return; }
    const unsent = options.filter(option => option.state !== 'sent');
    const results = await Promise.all(unsent.map(async option => {
      const saved = await deductionRequest('/mark-sent', { recordId: option.record.id, installmentIndex: option.index, requestId: crypto.randomUUID() });
      Object.assign(option.item, { statementSentAt: saved.statementSentAt, statementSentBy: saved.statementSentBy });
    }));
    void results;
    deductionHistoryRender();
    const nextFeedback = deductionHistoryEnsure()?.querySelector('[data-deduction-history-feedback]');
    if (nextFeedback) nextFeedback.textContent = 'Combined PDF downloaded and selected payments marked sent to rider.';
  } catch (error) {
    if (feedback) feedback.textContent = error.message || 'The combined payment PDF could not be downloaded.';
    throw error;
  } finally { if (button.isConnected) button.disabled = false; }
}
async function deductionHistoryExport(format) {
  await deductionLoad();
  if (!deductionState.loaded) throw new Error('Load the complete deduction register before exporting.');
  await ensureFinanceExportBundle(format);
  deductionHistoryRender();
  const records = deductionFilteredHistory(deductionState.records, deductionHistoryFilters(deductionHistoryEnsure()));
  if (format === 'pdf') {
    if (deductionHistorySelected.size !== 1) throw new Error('Tick one request row before exporting the Rider PDF.');
    const selectedId = [...deductionHistorySelected][0], selected = deductionHistoryGroups(records).find(group => group.id === selectedId);
    if (!selected) throw new Error('The checked request is no longer visible. Tick one request row again.');
    await downloadPdfTable(deductionHistoryStatementPayload(selected.records)); return;
  }
  const columns = [['rider', 'Rider'], ['references', 'References'], ['epf', 'EPF'], ['insurance', 'Insurance'], ['battery', 'OBD / Battery Tester'], ['manual', 'Special Case'], ['period', 'Commission period'], ['progress', 'Payments applied'], ['applied', 'Applied'], ['remaining', 'Remaining'], ['status', 'Status'], ['createdBy', 'Created by'], ['schedule', 'Payment breakdown']].map(([key, label]) => ({ key, label, value: row => row[key] }));
  const typeValue = (group, type) => { const record = group.records.find(item => item.type === type); if (!record) return ''; const progress = deductionHistoryProgress(record), total = progress.items.reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0); return deductionMoney(total) + ' | ' + deductionPlanLabel(record) + ' | ' + deductionDisplayStatus(record) + (record.reason ? ' | ' + record.reason : ''); };
  const rows = deductionHistoryGroups(records).map(group => ({ rider: group.rider, references: group.references.join(' | '), epf: typeValue(group, 'epf'), insurance: typeValue(group, 'insurance'), battery: typeValue(group, 'battery-tester'), manual: typeValue(group, 'manual'), period: (group.periodStart || '') + ' - ' + (group.periodEnd || ''), progress: group.progress.paidCount + '/' + group.progress.count, applied: deductionMoney(group.progress.appliedCents), remaining: deductionMoney(group.progress.remainingCents), status: deductionDisplayStatus(group.status), createdBy: group.createdBy + ' | ' + formatGrafanaTimestamp(group.createdAt), schedule: group.records.map(record => (deductionTypes[record.type] || record.type) + ': ' + deductionHistoryProgress(record).items.map(item => item.dueDate + ' ' + item.status + (item.paymentDate ? ' paid ' + item.paymentDate : '') + (item.settlementPeriodStart ? ' commission ' + item.settlementPeriodStart + '-' + item.settlementPeriodEnd : '')).join(', ')).join(' | ') }));
  await downloadExcelTable({ title: 'Rider Deduction History', panelTitle: 'Commission Rider', filename: 'Commission-Rider-Deduction-History', columns, rows, period: 'One row per request. Saved deductions are applied immediately.' });
}

function deductionDefaultSettlement(record, index) {
  const period = deductionWeekBounds(record.periodStart || record.deductionDate);
  return period ? { start: deductionAddDays(period.start, Number(index || 0) * 7), end: deductionAddDays(period.end, Number(index || 0) * 7) } : null;
}
function deductionActionDialog(recordId, action) {
  const record = deductionState.records.find(item => item.id === recordId); if (!record) return;
  const progress = deductionHistoryProgress(record), labels = { approve: 'Approve deduction', reject: 'Reject deduction', apply: 'Apply scheduled payment', cancel: 'Cancel pending deduction', reverse: 'Reverse applied payment', view: 'Deduction details' };
  const dialog = deductionDialog(labels[action] || 'Deduction action'), body = dialog.querySelector('[data-deduction-body]');
  const context = '<div class="deduction-action-context"><strong>' + esc(record.rider) + '</strong><span>' + esc(record.reference || record.id) + ' · ' + esc(deductionTypes[record.type] || record.type) + '</span></div>';
  if (action === 'view') {
    const editable = progress.items.length > 0, isSpecial = record.type === 'manual', isBattery = record.type === 'battery-tester';
    const displayedAmount = isSpecial ? Number(record.scheduledAmountCents || record.amountCents * record.installmentCount) / 100 : Number(record.amountCents) / 100;
    const planControl = isBattery ? '<label>Payment plan<select data-deduction-detail-plan disabled><option value="fixed-2"' + (record.pricingMode === 'fixed-2' ? ' selected' : '') + '>2 × RM50</option><option value="fixed-7"' + (record.pricingMode === 'fixed-7' ? ' selected' : '') + '>7 × RM40</option><option value="manual"' + (record.pricingMode === 'manual' ? ' selected' : '') + '>Manual</option></select></label>' : '';
    const detailControls = '<div class="deduction-line-fields deduction-detail-controls">' + planControl + '<label>' + (isSpecial ? 'Total deduction (RM)' : 'Amount per payment (RM)') + '<input type="number" min="0.01" max="1000000" step="0.01" value="' + displayedAmount.toFixed(2) + '" data-deduction-detail-amount readonly required></label><label>Payments<input type="number" min="1" max="52" step="1" value="' + Number(record.installmentCount) + '" data-deduction-detail-count readonly required></label></div>';
    const scheduleHead = '<div class="deduction-schedule-head deduction-details-schedule-head"><div><h4>' + (record.type === 'epf' ? 'Monthly EPF schedule' : 'Payment schedule') + '</h4><span>' + esc(deductionPlanLabel(record)) + ' · details are locked by default.</span></div><div><button type="button" data-deduction-detail-toggle aria-pressed="false">Edit details</button><button type="button" data-deduction-detail-save hidden>Save and lock</button></div></div><p class="deduction-calendar-note">Edit amount, manual payment count, dates, or remarks here in History. EPF and fixed-plan rules remain protected.</p><p class="deduction-feedback" data-deduction-detail-feedback hidden></p>';
    body.innerHTML = context + (record.type === 'epf' && record.reportedWeeklyCommissionCents ? '<p class="deduction-eligibility">Recorded weekly commission ' + esc(deductionMoney(record.reportedWeeklyCommissionCents)) + ' · current filtered table at request time</p>' : '') + scheduleHead + detailControls + '<div class="deduction-audit-table"><table><thead><tr><th>Payment</th><th>Deduction date</th><th>Amount</th><th>Status</th><th>Commission week</th></tr></thead><tbody data-deduction-detail-rows></tbody></table></div><section class="deduction-payment-statement" data-deduction-payment-statement aria-live="polite"></section><label class="deduction-line-reason">Reason / remarks <span>(optional)</span><textarea data-deduction-detail-reason maxlength="2000" rows="2" readonly placeholder="Add supporting notes if needed">' + esc(record.reason || '') + '</textarea></label><h4>Audit trail</h4><ol class="deduction-audit-list">' + (record.audit || []).map(item => '<li><div><strong>' + esc(item.action) + '</strong><span>' + esc(formatGrafanaTimestamp(item.at) || item.at) + '</span></div><p>' + esc(item.by || '—') + ' · ' + esc(item.reason || 'No additional remarks') + '</p>' + (item.amountCents != null ? '<small>' + esc(deductionMoney(item.amountCents)) + '</small>' : '') + '<details><summary>Full event details</summary><pre>' + esc(JSON.stringify(item, null, 2)) + '</pre></details></li>').join('') + '</ol>';
    if (editable) {
      const toggle = body.querySelector('[data-deduction-detail-toggle]'), save = body.querySelector('[data-deduction-detail-save]'), rows = body.querySelector('[data-deduction-detail-rows]'), statement = body.querySelector('[data-deduction-payment-statement]'), reasonInput = body.querySelector('[data-deduction-detail-reason]'), amountInput = body.querySelector('[data-deduction-detail-amount]'), countInput = body.querySelector('[data-deduction-detail-count]'), planInput = body.querySelector('[data-deduction-detail-plan]'), feedback = body.querySelector('[data-deduction-detail-feedback]'), identity = deductionRequestIdentity(), deliveryIdentity = deductionRequestIdentity();
      const dateInputs = () => [...rows.querySelectorAll('[data-deduction-detail-date]')];
      const scheduleDates = () => { const inputs = dateInputs(); return inputs.length ? inputs.map(input => input.value) : [...rows.querySelectorAll('[data-deduction-payment-select]')].map(button => button.dataset.deductionPaymentDate); };
      const perPaymentCents = () => { const cents = Math.round(Number(amountInput.value || 0) * 100), count = Number(countInput.value); return isSpecial ? cents / count : cents; };
      let selectedIndex = 0;
      const renderStatement = () => {
        const dates = scheduleDates(), index = Math.max(0, Math.min(selectedIndex, dates.length - 1)), dueDate = dates[index], item = progress.items[index] || { index, status: 'applied' }, settlement = deductionInstallmentSettlement(record, { ...item, dueDate }, index) || deductionWeekBounds(dueDate), payment = index + 1, paymentCount = Math.max(1, Number(countInput.value) || dates.length), amount = deductionStatementAmountForRecord({ ...record, installmentCount: paymentCount, amountCents: Math.round(perPaymentCents()) }, [{ ...item, dueDate, amountCents: Math.round(perPaymentCents()) }]);
        selectedIndex = index;
        rows.querySelectorAll('[data-deduction-payment-select]').forEach(button => { const active = Number(button.dataset.deductionPaymentSelect) === index; button.classList.toggle('is-selected', active); button.setAttribute('aria-pressed', String(active)); });
        const sent = item.statementSentAt ? '<span class="deduction-payment-sent">✓ Sent to rider</span><small>Downloaded by ' + esc(item.statementSentBy || 'Finance') + ' · ' + esc(formatGrafanaTimestamp(item.statementSentAt)) + '</small>' : '<small>Not yet sent to rider</small>';
        statement.innerHTML = '<div class="deduction-payment-statement-copy"><span>Selected payment</span><strong>Payment ' + payment + '/' + paymentCount + '</strong><small>Deduction date: ' + esc(deductionDateLabel(dueDate)) + ' · Commission period: ' + esc(deductionPeriodLabel(settlement)) + '</small></div><div class="deduction-payment-statement-copy"><span>Amount deducted</span><strong>− ' + esc(deductionMoney(amount)) + '</strong><small>' + esc(deductionTypes[record.type] || record.type) + ' · one payment only</small>' + sent + '</div><button type="button" data-deduction-payment-download' + (toggle.getAttribute('aria-pressed') === 'true' ? ' disabled' : '') + '>' + (item.statementSentAt ? 'Download weekly PDF again' : 'Download weekly PDF') + '</button><p data-deduction-payment-feedback></p>';
        void Promise.allSettled([ensureFinanceExportBundle('pdf'), deductionPrefetchPaymentStatement(record, index)]);
        statement.querySelector('[data-deduction-payment-download]').onclick = async event => {
          const button = event.currentTarget, message = statement.querySelector('[data-deduction-payment-feedback]'); button.disabled = true; message.textContent = 'Preparing weekly PDF…';
          try { const [, payload] = await Promise.all([ensureFinanceExportBundle('pdf'), deductionPaymentStatementPayload(record, selectedIndex)]); const downloaded = await downloadPdfTable(payload); if (!downloaded) { message.textContent = 'PDF download was cancelled.'; return; } const saved = await deductionRequest('/mark-sent', { recordId: record.id, installmentIndex: selectedIndex, requestId: deliveryIdentity({ recordId: record.id, installmentIndex: selectedIndex }) }); Object.assign(item, { statementSentAt: saved.statementSentAt, statementSentBy: saved.statementSentBy }); renderStatement(); statement.querySelector('[data-deduction-payment-feedback]').textContent = 'Weekly PDF downloaded and marked sent to rider.'; }
          catch (error) { message.textContent = error.message; message.classList.add('is-error'); }
          finally { button.disabled = toggle.getAttribute('aria-pressed') === 'true'; }
        };
      };
      const syncRows = preferredDates => {
        const count = Math.max(1, Math.min(52, Number(countInput.value) || 1)), existing = preferredDates || scheduleDates(), dates = existing.slice(0, count);
        while (dates.length < count) dates.push(deductionAddDays(dates.at(-1) || record.deductionDate || deductionToday(), 7));
        const cents = perPaymentCents(), locked = toggle.getAttribute('aria-pressed') !== 'true';
        rows.innerHTML = dates.map((dueDate, index) => { const item = progress.items[index], settlement = deductionInstallmentSettlement(record, { ...item, dueDate }, index) || { start: record.periodStart, end: record.periodEnd }, dateControl = locked ? '<button type="button" class="deduction-statement-date" data-deduction-payment-select="' + index + '" data-deduction-payment-date="' + esc(dueDate) + '"><strong>' + esc(deductionDateLabel(dueDate)) + '</strong><small>Select statement</small></button>' : '<input class="deduction-detail-date" type="date" data-deduction-detail-date value="' + esc(dueDate) + '" required>'; return '<tr><td>Payment ' + (index + 1) + '/' + count + '</td><td>' + dateControl + '</td><td>' + esc(Number.isInteger(cents) && cents > 0 ? deductionMoney(cents) : '—') + '</td><td>' + esc(item?.status || 'applied') + '</td><td>' + esc(deductionPeriodLabel(settlement)) + '</td></tr>'; }).join('');
        rows.querySelectorAll('[data-deduction-payment-select]').forEach(button => { button.onclick = () => { selectedIndex = Number(button.dataset.deductionPaymentSelect); renderStatement(); }; });
        renderStatement();
      };
      syncRows(progress.items.map(item => item.dueDate));
      const snapshot = () => ({ dates: scheduleDates(), reason: reasonInput.value, amount: amountInput.value, count: countInput.value, plan: planInput?.value || record.pricingMode });
      let saving = false, original = snapshot();
      const lock = locked => { reasonInput.readOnly = locked; planInput && (planInput.disabled = locked); amountInput.readOnly = locked || record.type === 'epf' || isBattery && planInput.value !== 'manual'; countInput.readOnly = locked || record.type === 'epf' || record.type === 'insurance' || isBattery && planInput.value !== 'manual'; toggle.setAttribute('aria-pressed', String(!locked)); toggle.textContent = locked ? 'Edit details' : 'Cancel edit'; save.hidden = locked; syncRows(); };
      toggle.onclick = () => { const editing = toggle.getAttribute('aria-pressed') === 'true'; if (editing) { amountInput.value = original.amount; countInput.value = original.count; if (planInput) planInput.value = original.plan; reasonInput.value = original.reason; syncRows(original.dates); lock(true); } else { original = snapshot(); lock(false); } };
      planInput?.addEventListener('change', () => { if (planInput.value === 'fixed-2') { amountInput.value = '50.00'; countInput.value = '2'; } else if (planInput.value === 'fixed-7') { amountInput.value = '40.00'; countInput.value = '7'; } else if (Number(countInput.value) < 1) countInput.value = '3'; lock(false); syncRows(); });
      amountInput.addEventListener('input', () => syncRows()); countInput.addEventListener('input', () => syncRows());
      save.onclick = async () => {
        const inputs = dateInputs(); if (saving || !amountInput.reportValidity() || !countInput.reportValidity() || inputs.some(input => !input.reportValidity())) return;
        const count = Number(countInput.value), enteredCents = Math.round(Number(amountInput.value) * 100);
        if (isSpecial && enteredCents % count !== 0) { feedback.hidden = false; feedback.classList.add('is-error'); feedback.textContent = 'The Special Case total must split evenly to the nearest cent.'; return; }
        const payload = { recordId: record.id, pricingMode: planInput?.value || record.pricingMode, amount: ((isSpecial ? enteredCents / count : enteredCents) / 100).toFixed(2), installmentCount: count, installmentDates: inputs.map(input => input.value), reason: reasonInput.value.trim() }; saving = true; save.disabled = true; feedback.hidden = false; feedback.classList.remove('is-error'); feedback.textContent = 'Saving deduction details…';
        try {
          const saved = await deductionRequest('/update-details', { ...payload, requestId: identity(payload) });
          countInput.value = String(saved.installmentCount); reasonInput.value = saved.reason || ''; syncRows(saved.installmentDates); original = snapshot(); lock(true); feedback.textContent = 'Details saved and locked.'; deductionState.loaded = false; await deductionLoad(); deductionHistoryRender();
        } catch (error) { feedback.classList.add('is-error'); feedback.textContent = error.message; }
        finally { saving = false; save.disabled = false; }
      };
    }
    return;
  }
  const selectable = progress.items.map((item, index) => ({ ...item, index: item.index ?? index })).filter(item => action === 'reverse' ? item.status === 'applied' : item.status === 'scheduled' && item.dueDate <= deductionToday());
  if (['apply', 'reverse'].includes(action) && !selectable.length) { body.innerHTML = context + '<div class="deduction-feedback" role="status">' + (action === 'apply' ? 'No scheduled payment is due yet. Future payments cannot be applied.' : 'There are no applied payments to reverse.') + '</div>'; return; }
  const paymentFields = ['apply', 'reverse'].includes(action) ? '<label class="deduction-wide">Select payment<select name="installmentIndex">' + selectable.map(item => '<option value="' + item.index + '">Payment ' + (item.index + 1) + ' · due ' + esc(item.dueDate) + ' · ' + esc(deductionMoney(deductionInstallmentAmount(record, item))) + '</option>').join('') + '</select></label>' : '';
  const defaultPeriod = deductionDefaultSettlement(record, selectable[0]?.index);
  body.innerHTML = context + '<form class="deduction-form deduction-action-form">' + paymentFields + (action === 'apply' ? '<label>Actual payment date<input name="paymentDate" type="date" required max="' + deductionToday() + '" value="' + deductionToday() + '"></label><label>' + (record.type === 'epf' ? 'Verified commission week' : 'Commission week starting Monday') + '<input name="settlementPeriodStart" type="date" required value="' + esc(defaultPeriod?.start || '') + '"' + (record.type === 'epf' ? ' readonly' : '') + '></label><p class="deduction-wide deduction-line-rule" data-deduction-settlement></p><p class="deduction-wide deduction-note">Payment date is when Finance pays the rider. Commission week is the earnings period that this payment reduces.</p>' : '') + '<label class="deduction-wide">Reason / remarks<textarea name="reason" maxlength="2000" rows="3"' + (['reject', 'cancel', 'reverse'].includes(action) ? ' required' : '') + '></textarea></label><div class="deduction-wide deduction-submit-bar"><p role="alert" data-deduction-error></p><button type="submit">Confirm ' + esc(action) + '</button></div></form>';
  const form = body.querySelector('form'), identity = deductionRequestIdentity(); let saving = false;
  const updatePeriod = () => {
    if (!form.elements.paymentDate) return;
    const start = form.elements.settlementPeriodStart.value, week = deductionWeekBounds(start);
    form.querySelector('[data-deduction-settlement]').textContent = week && week.start === start ? 'Reduces commission for ' + week.start + ' — ' + week.end + (record.type === 'epf' ? ' · EPF contribution ' + deductionNextMonth(form.elements.paymentDate.value) : '') : 'The commission week must start on Monday.';
  };
  form.elements.paymentDate?.addEventListener('change', updatePeriod); form.elements.settlementPeriodStart?.addEventListener('change', updatePeriod);
  if (action === 'apply') form.elements.installmentIndex.addEventListener('change', () => { const period = deductionDefaultSettlement(record, form.elements.installmentIndex.value); form.elements.settlementPeriodStart.value = period?.start || ''; updatePeriod(); });
  updatePeriod();
  form.onsubmit = async event => {
    event.preventDefault(); if (saving || !form.reportValidity()) return;
    const input = { recordId, reason: form.elements.reason.value.trim() }, error = form.querySelector('[data-deduction-error]');
    if (form.elements.installmentIndex) input.installmentIndex = Number(form.elements.installmentIndex.value);
    if (action === 'apply') {
      input.paymentDate = form.elements.paymentDate.value; input.settlementPeriodStart = form.elements.settlementPeriodStart.value; input.settlementPeriodEnd = deductionAddDays(input.settlementPeriodStart, 6);
      const item = selectable.find(value => value.index === input.installmentIndex);
      if (!deductionFullWeek(input.settlementPeriodStart, input.settlementPeriodEnd)) { error.textContent = 'Select a full Monday–Sunday commission week.'; return; }
      if (input.paymentDate > deductionToday() || input.paymentDate < item.dueDate) { error.textContent = 'Payment date must be on or after the selected due date and cannot be in the future.'; return; }
    }
    const button = form.querySelector('[type="submit"]'); saving = true; button.disabled = true;
    try {
      const saved = await deductionRequest('/' + action, { ...input, requestId: identity(input) });
      body.innerHTML = context + '<div class="deduction-save-success" role="status"><h4>Action saved</h4><p>The audit trail has been updated.</p>' + (saved.backupWarning ? '<p class="deduction-feedback is-error">' + esc(saved.backupWarning) + ' The action is saved centrally; do not repeat it.</p>' : '') + '<p data-deduction-refresh-message>Refreshing the register…</p><button type="button" data-deduction-done>Done</button></div>';
      body.querySelector('[data-deduction-done]').onclick = () => dialog.close(); deductionState.loaded = false;
      try { await deductionLoad(); body.querySelector('[data-deduction-refresh-message]').textContent = 'The register is up to date.'; } catch { body.querySelector('[data-deduction-refresh-message]').textContent = 'Saved successfully. Refresh failed; retry loading the register, not this action.'; }
      render(); deductionHistoryRender();
    } catch (reason) { error.textContent = reason.message; saving = false; button.disabled = false; }
  };
}
async function deductionHistoryOpen() {
  if (typeof closeTableFullscreen === 'function') closeTableFullscreen();
  const view = deductionHistoryEnsure(); if (!view) return;
  deductionHistoryUseCommissionRange(view);
  document.getElementById('tab-commission')?.classList.add('deduction-history-active'); view.hidden = false;
  try { await deductionLoad(); } catch {} deductionHistoryRender(); view.scrollIntoView({ block: 'start' });
}
function deductionHistoryClose() { document.getElementById('tab-commission')?.classList.remove('deduction-history-active'); const view = document.getElementById('deductionHistoryView'); if (view) view.hidden = true; }
function deductionDeleteBatchDialog(batchId) {
  const group = deductionHistoryGroups(deductionState.records).find(item => item.id === batchId), dialog = deductionDialog('Delete deduction request'), body = dialog.querySelector('[data-deduction-body]');
  if (!group) { body.innerHTML = '<div class="deduction-feedback is-error" role="alert">Deduction request batch not found. Refresh History and try again.</div>'; return; }
  body.innerHTML = '<form class="deduction-form deduction-delete-form"><div class="deduction-delete-warning"><strong>' + esc(group.rider) + '</strong><span>' + group.records.length + ' deduction record' + (group.records.length === 1 ? '' : 's') + ' · ' + esc((group.periodStart || '—') + ' to ' + (group.periodEnd || '—')) + '</span></div><p class="deduction-note">The PIN removes this entire request from active History regardless of its payment or reversal status. A protected deletion audit record remains.</p><label>4-digit deletion PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required placeholder="••••"></label><p class="deduction-wide" role="alert" data-deduction-error></p><div class="deduction-wide deduction-submit-bar"><span>This action cannot be undone.</span><button type="submit" class="deduction-danger-button">Delete request</button></div></form>';
  const form = body.querySelector('form'), button = form.querySelector('[type="submit"]'), identity = deductionRequestIdentity(); let deleting = false;
  form.onsubmit = async event => {
    event.preventDefault(); if (deleting || !form.reportValidity()) return; const error = form.querySelector('[data-deduction-error]'), input = { batchId, pin: form.elements.pin.value };
    deleting = true; button.disabled = true; error.textContent = 'Deleting request…';
    try {
      const result = await deductionRequest('/delete-batch', { ...input, requestId: identity({ batchId }) });
      deductionHistorySelected.delete(batchId); deductionState.loaded = false; await deductionLoad(); deductionHistoryRender();
      body.innerHTML = '<section class="deduction-save-success" role="status"><span class="deduction-status-pill">Deleted</span><h4>Deduction request removed</h4><p>' + esc(String(result.deleted || group.records.length)) + ' deduction record' + (Number(result.deleted || group.records.length) === 1 ? '' : 's') + ' removed from active History.</p><button type="button" data-deduction-done>Done</button></section>';
      body.querySelector('[data-deduction-done]').onclick = () => dialog.close();
    } catch (reason) { error.textContent = reason.message; deleting = false; button.disabled = false; form.elements.pin.select(); }
  };
}
function deductionRegisterDialog() { return deductionHistoryOpen(); }
function deductionCancelDialog(recordId) { return deductionActionDialog(recordId, 'cancel'); }
function deductionMount() {
  deductionHistoryEnsure();
  const cards = [...document.querySelectorAll('#commission-main-ledger, .table-copy[data-audit-table]')];
  // The deduction register powers both the green Commission Rider form and
  // Rider deduction history. Do not request it until Commission Rider opens.
  if (state.activeTab === 'commission' && cards.length && !deductionState.loaded && !deductionState.loading && !deductionState.error) void deductionLoad().then(() => render()).catch(() => render());
  let changed = false;
  cards.forEach(card => {
    card.querySelector('.deduction-menu')?.remove(); card.querySelector('.deduction-filter-notice')?.remove();
    const id = card.dataset.auditTable;
    // Preserve the removal of retired deduction shortcuts without changing table/master filters.
    if (auditViews.tables[id]?.deductionFilter) { auditViews.tables[id].deductionFilter = ''; changed = true; }
    card.querySelectorAll('.deduction-workspace').forEach(deductionUpdateInline);
  });
  if (changed) { try { auditWrite(); } catch {} }
}
document.addEventListener('change', event => {
  if (event.target.matches?.('[data-deduction-history-status], [data-deduction-history-type], [data-deduction-history-due], [data-deduction-history-timing], [data-deduction-history-month], [data-deduction-history-period-start], [data-deduction-history-period-end]')) return deductionHistoryRender();
  const paymentSelector = event.target.closest?.('[data-deduction-history-type-payment-select]');
  if (paymentSelector) {
    const groupId = paymentSelector.closest('[data-deduction-batch-id]')?.dataset.deductionBatchId, type = paymentSelector.dataset.deductionHistoryPaymentType;
    if (!groupId || !type) return;
    deductionHistoryPaymentSelections.set(groupId + '|' + type, paymentSelector.value);
    const group = deductionHistoryGroups(deductionState.records).find(item => item.id === groupId), option = deductionHistoryPaymentOptions(group || { records: [] }).find(item => item.key === paymentSelector.value);
    const range = option && (deductionInstallmentSettlement(option.record, option.item, option.index) || deductionWeekBounds(option.item.dueDate));
    if (range?.start && range?.end) {
      const view = deductionHistoryEnsure(), start = view?.querySelector('[data-deduction-history-period-start]'), end = view?.querySelector('[data-deduction-history-period-end]');
      if (start) start.value = range.start;
      if (end) end.value = range.end;
      deductionHistoryRangeSetDraft(range.start, range.end);
      deductionHistoryRangePicker.open = false;
      deductionHistoryRenderRangePicker(view);
    }
    if (option && option.state !== 'upcoming') void Promise.allSettled([ensureFinanceExportBundle('pdf'), deductionPrefetchPaymentStatement(option.record, option.index)]);
    return deductionHistoryRender();
  }
  const summary = event.target.closest?.('.deduction-workspace'); if (!summary) return;
  if (event.target.matches('[data-deduction-inline-battery-plan]')) {
    const amount = summary.querySelector('[data-deduction-inline-amount="battery-tester"]'), count = summary.querySelector('[data-deduction-inline-battery-count]'); amount.value = event.target.value === 'manual' ? '' : event.target.value === 'fixed-7' ? '40.00' : '50.00'; amount.readOnly = event.target.value !== 'manual'; count.value = event.target.value === 'manual' ? '3' : event.target.value === 'fixed-7' ? '7' : '2'; count.readOnly = event.target.value !== 'manual'; if (!amount.readOnly) amount.focus();
  } deductionUpdateInline(summary);
});
document.addEventListener('click', async event => {
  if (event.target.closest?.('[data-deduction-history-open]')) { event.preventDefault(); return deductionHistoryOpen(); }
  if (event.target.closest?.('[data-deduction-history-close]')) { event.preventDefault(); return deductionHistoryClose(); }
  const rangeToggle = event.target.closest?.('[data-deduction-history-range-toggle]');
  if (rangeToggle) {
    event.preventDefault();
    const view = deductionHistoryEnsure(), start = view?.querySelector('[data-deduction-history-period-start]')?.value || '', end = view?.querySelector('[data-deduction-history-period-end]')?.value || '';
    if (!deductionHistoryRangePicker.open) {
      deductionHistoryRangeSetDraft(start, end);
      if (!deductionHistoryRangePicker.month) deductionHistoryRangePicker.month = (start || deductionToday()).slice(0, 7);
    }
    deductionHistoryRangePicker.open = !deductionHistoryRangePicker.open;
    deductionHistoryRenderRangePicker(view);
    return;
  }
  const rangeMonth = event.target.closest?.('[data-deduction-history-range-month]');
  if (rangeMonth) {
    event.preventDefault();
    deductionHistoryRangePicker.month = deductionHistoryRangeMonthShift(deductionHistoryRangePicker.month, Number(rangeMonth.dataset.deductionHistoryRangeMonth));
    deductionHistoryRenderRangePicker(deductionHistoryEnsure());
    return;
  }
  const rangeDay = event.target.closest?.('[data-deduction-history-range-day]');
  if (rangeDay) {
    event.preventDefault();
    const day = rangeDay.dataset.deductionHistoryRangeDay, picker = deductionHistoryRangePicker;
    if (!picker.anchor || !picker.draftStart || !picker.draftEnd || picker.draftStart !== picker.draftEnd) {
      picker.anchor = day; picker.draftStart = day; picker.draftEnd = day;
    } else {
      picker.draftStart = day < picker.anchor ? day : picker.anchor;
      picker.draftEnd = day > picker.anchor ? day : picker.anchor;
      picker.anchor = '';
    }
    deductionHistoryRenderRangePicker(deductionHistoryEnsure());
    return;
  }
  const rangeQuick = event.target.closest?.('[data-deduction-history-range-quick]');
  if (rangeQuick) {
    event.preventDefault();
    const range = deductionHistoryRangeQuick(rangeQuick.dataset.deductionHistoryRangeQuick);
    deductionHistoryRangeSetDraft(range.start, range.end);
    deductionHistoryRenderRangePicker(deductionHistoryEnsure());
    return;
  }
  if (event.target.closest?.('[data-deduction-history-range-apply]')) {
    event.preventDefault();
    const view = deductionHistoryEnsure(), picker = deductionHistoryRangePicker, start = picker.draftStart, end = picker.draftEnd || picker.draftStart;
    if (!start || !end) return;
    const startInput = view.querySelector('[data-deduction-history-period-start]'), endInput = view.querySelector('[data-deduction-history-period-end]');
    if (startInput) startInput.value = start;
    if (endInput) endInput.value = end;
    deductionHistoryRangeRemember(start, end);
    picker.open = false; picker.anchor = '';
    deductionHistoryRenderRangePicker(view);
    return deductionHistoryRender();
  }
  if (event.target.closest?.('[data-deduction-retry]')) { event.preventDefault(); try { await deductionLoad(); } catch {} render(); deductionHistoryRender(); return; }
  const exported = event.target.closest?.('[data-deduction-history-export]');
  if (exported) { event.preventDefault(); try { await deductionHistoryExport(exported.dataset.deductionHistoryExport); } catch (error) { deductionHistoryEnsure().querySelector('[data-deduction-history-feedback]').textContent = error.message; } return; }
  const batchDownload = event.target.closest?.('[data-deduction-history-batch-download]');
  if (batchDownload) { event.preventDefault(); try { await deductionHistoryDownloadBatch(batchDownload.closest('[data-deduction-batch-id]')?.dataset.deductionBatchId, batchDownload); } catch {} return; }
  const deleteBatch = event.target.closest?.('[data-deduction-delete-batch]'); if (deleteBatch) { event.preventDefault(); return deductionDeleteBatchDialog(deleteBatch.closest('[data-deduction-batch-id]')?.dataset.deductionBatchId); }
  const paymentDetails = event.target.closest?.('[data-deduction-progress-details]'); if (paymentDetails) { event.preventDefault(); return deductionActionDialog(paymentDetails.dataset.deductionProgressDetails, 'view'); }
  const action = event.target.closest?.('[data-deduction-action]'); if (action) { event.preventDefault(); return deductionActionDialog(action.closest('[data-deduction-record-id]')?.dataset.deductionRecordId, action.dataset.deductionAction); }
  const button = event.target.closest?.('[data-deduction-inline-create], [data-deduction-create], [data-deduction-register]'); if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation(); if (button.hasAttribute('data-deduction-register')) return deductionHistoryOpen();
  const summary = button.closest('.deduction-workspace'), id = summary?.dataset.deductionTable || button.dataset.deductionTable || button.closest('[data-audit-table]')?.dataset.auditTable;
  if (!auditIdentity(id)) return;
  if (!summary) return deductionProceedBatch(id, [button.dataset.deductionCreate || 'manual'], {}, button);
  deductionUpdateInline(summary); if (button.disabled) return;
  const draft = deductionDrafts.get(id), drafts = {};
  draft.selected.forEach(type => { drafts[type] = { amount: draft.amounts[type], pricingMode: type === 'battery-tester' ? draft.batteryPlan : type === 'epf' ? 'fixed-epf' : 'manual', ...(type === 'battery-tester' ? { installmentCount: draft.batteryCount } : type === 'manual' ? { installmentCount: draft.manualCount } : {}) }; }); return deductionProceedBatch(id, draft.selected, drafts, button);
}, true);
document.addEventListener('input', event => {
  if (event.target.matches?.('[data-deduction-history-search]')) deductionHistoryRender();
  if (event.target.matches?.('[data-deduction-inline-amount], [data-deduction-inline-manual-count], [data-deduction-inline-battery-count]')) deductionUpdateInline(event.target.closest('.deduction-workspace'));
});
document.addEventListener('change', event => {
  const checkbox = event.target.closest?.('[data-deduction-history-select]'); if (!checkbox) return;
  const id = checkbox.closest('[data-deduction-batch-id]')?.dataset.deductionBatchId; if (!id) return;
  deductionHistorySelected.clear();
  document.querySelectorAll('[data-deduction-history-select]').forEach(input => { if (input !== checkbox) input.checked = false; });
  if (checkbox.checked) deductionHistorySelected.add(id);
  const button = deductionHistoryEnsure()?.querySelector('[data-deduction-history-export="pdf"]'); if (button) button.disabled = deductionHistorySelected.size !== 1 || !deductionState.loaded;
});
