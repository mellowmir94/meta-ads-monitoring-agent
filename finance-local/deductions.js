// Table-scoped shortcuts over the shared active deduction register.
const deductionState = { records: [], actor: null, approvalAvailable: false, loaded: false, loading: null, error: '' };
const deductionTypes = { epf: 'EPF', insurance: 'Insurance', 'battery-tester': 'OBD / Battery Tester', manual: 'Special Case' };
const deductionRiderKey = value => String(value || '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
const deductionMoney = cents => formatMoney(Number(cents || 0) / 100);
const deductionStatus = record => record.status || record.approvalStatus || 'approved';
const deductionDisplayStatus = value => ({ approved: 'applied', pending: 'applied' }[typeof value === 'string' ? value : deductionStatus(value)] || (typeof value === 'string' ? value : deductionStatus(value)));
const deductionDrafts = new Map();
const deductionHistorySelected = new Set();

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
  const rider = deductionSingleRider(dataRows), amounts = { epf: 0, insurance: 0, 'battery-tester': 0, manual: 0 };
  let pendingCents = 0, legacyCount = 0;
  if (deductionState.loaded && rider.valid && scopeStart && scopeEnd) deductionState.records.forEach(record => {
    if (rider.key !== (record.riderKey || deductionRiderKey(record.rider)) || ['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record))) return;
    for (const item of deductionInstallments(record)) {
      const amount = deductionInstallmentAmount(record, item);
      if (item.status === 'applied') {
        // New applications belong to a settlement week; legacy records retain the due-date basis.
        const hasSettlement = Boolean(item.settlementPeriodStart && item.settlementPeriodEnd);
        const included = hasSettlement ? item.settlementPeriodStart >= scopeStart && item.settlementPeriodEnd <= scopeEnd : item.dueDate >= scopeStart && item.dueDate <= scopeEnd;
        if (included) { amounts[record.type] = (amounts[record.type] || 0) + amount; if (!hasSettlement) legacyCount++; }
      } else if (['pending', 'approved', 'scheduled'].includes(item.status) && item.dueDate >= scopeStart && item.dueDate <= scopeEnd) pendingCents += amount;
    }
  });
  const approvedCents = Object.values(amounts).reduce((sum, value) => sum + value, 0);
  return { loaded: deductionState.loaded, error: deductionState.error, riderValid: rider.valid, grossCents, amounts, approvedCents, appliedCents: approvedCents, pendingCents, netCents: grossCents - approvedCents, legacyCount };
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
    '<div class="deduction-choice-grid">' + card('epf', field('epf', '25.00', true), 'Fixed hold · next month’s EPF<br>Full-week table total ≥ RM300 · max 4/month') + card('insurance', field('insurance', draft.amounts.insurance), 'Amount per payment · 2 weekly payments') +
    card('battery-tester', '<select aria-label="Battery Tester payment plan" data-deduction-inline-battery-plan' + disabled + '><option value="fixed-2"' + (draft.batteryPlan === 'fixed-2' ? ' selected' : '') + '>2 × RM50 · RM100 total</option><option value="fixed-7"' + (draft.batteryPlan === 'fixed-7' ? ' selected' : '') + '>7 × RM40 · RM280 total</option><option value="manual"' + (draft.batteryPlan === 'manual' ? ' selected' : '') + '>Manual · set amount and payments</option></select>' + field('battery-tester', draft.batteryPlan === 'manual' ? draft.amounts['battery-tester'] : draft.batteryPlan === 'fixed-7' ? '40.00' : '50.00', draft.batteryPlan !== 'manual') + '<label class="deduction-payment-count"><span>Payments</span><input aria-label="Battery Tester number of payments" type="number" min="1" max="52" step="1" inputmode="numeric" data-deduction-inline-battery-count value="' + esc(draft.batteryPlan === 'fixed-7' ? '7' : draft.batteryPlan === 'fixed-2' ? '2' : String(draft.batteryCount || 3)) + '"' + (draft.batteryPlan !== 'manual' ? ' readonly' : '') + disabled + '></label>', 'Fixed weekly schedule or Finance-set weekly payments') + card('manual', field('manual', draft.amounts.manual, false, true) + '<label class="deduction-payment-count"><span>Payments</span><input aria-label="Special Case number of payments" type="number" min="1" max="52" step="1" inputmode="numeric" data-deduction-inline-manual-count value="' + esc(String(draft.manualCount || 1)) + '"' + disabled + '></label><strong class="deduction-payment-breakdown" data-deduction-inline-breakdown="manual"></strong>', 'Enter the total deduction, then split it into weekly payments') + '</div>' +
    '<div class="deduction-settlement-strip"><div><span>Gross commission</span><strong>' + esc(deductionMoney(summary.grossCents)) + '</strong></div><span class="deduction-equation-sign" aria-hidden="true">−</span><div><span>Applied deductions</span><strong>' + esc(enabled ? deductionMoney(summary.approvedCents) : '—') + '</strong><small>' + esc(enabled ? 'Saved deductions are applied immediately' : 'Requires one rider and a complete register') + '</small></div><span class="deduction-equation-sign" aria-hidden="true">=</span><div class="commission-net-total' + (summary.netCents < 0 ? ' is-negative' : '') + '"><span>Net commission</span><strong>' + esc(enabled ? deductionMoney(summary.netCents) : '—') + '</strong></div></div>' +
    (summary.legacyCount ? '<p class="deduction-legacy-note">' + summary.legacyCount + ' legacy applied payment(s) use their original due date for this report.</p>' : '') +
    '<footer class="deduction-inline-actions"><button type="button" data-deduction-history-open>History</button><div><strong data-deduction-inline-preview>Deduction preview: —</strong><span data-deduction-inline-message>' + esc(enabled ? 'Choose one or more types. Saving applies the full deduction immediately.' : error || 'Waiting for the deduction register.') + '</span></div><strong class="deduction-inline-total">Total Deducted: ' + esc(enabled ? deductionMoney(summary.approvedCents) : '—') + '</strong><button type="button" data-deduction-inline-create' + (enabled && draft.selected.length ? '' : ' disabled') + '>Review deduction</button></footer></section>';
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
    const count = type === 'insurance' ? 2 : type === 'battery-tester' ? draft.batteryPlan === 'fixed-7' ? 7 : draft.batteryPlan === 'fixed-2' ? 2 : draft.batteryCount : type === 'manual' ? draft.manualCount : 1;
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
  const message = summary.querySelector('[data-deduction-inline-message]'); if (message && choices.length) message.textContent = valid ? 'Not deducted yet. Review dates and reasons before saving.' : 'Enter a valid amount for every selected deduction.';
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
function deductionCreate(id, row, requestedType = 'manual', draft = {}) { return deductionCreateBatch(id, [requestedType || 'manual'], { [requestedType || 'manual']: draft }); }

function deductionCreateBatch(id, selectedTypes, drafts = {}) {
  const candidates = deductionRows(id, true), rider = deductionSingleRider(candidates), types = [...new Set(selectedTypes)].filter(type => deductionTypes[type]);
  const dialog = deductionDialog('Create deduction request'), body = dialog.querySelector('[data-deduction-body]');
  if (!rider.valid || !deductionState.loaded || !types.length) {
    body.innerHTML = '<div class="deduction-feedback is-error" role="alert">' + esc(!rider.valid ? rider.message : !deductionState.loaded ? 'Load the complete deduction register before creating a request.' : 'Choose at least one deduction type.') + '</div>'; return;
  }
  const dates = auditCapture(id)?.scope?.dates || {}, periodStart = String(dates.start || '').slice(0, 10), periodEnd = String(dates.end || '').slice(0, 10);
  const gross = candidates.reduce((sum, row) => sum + numberValue(row.commission), 0), monday = deductionNextMonday(periodEnd), today = deductionToday();
  const lineMarkup = types.map(type => {
    const plan = type === 'battery-tester' ? drafts[type]?.pricingMode || 'fixed-2' : type === 'epf' ? 'fixed-epf' : 'manual';
    const count = type === 'insurance' ? 2 : type === 'battery-tester' ? plan === 'fixed-7' ? 7 : plan === 'fixed-2' ? 2 : Math.max(1, Math.min(52, Number(drafts[type]?.installmentCount) || 3)) : type === 'manual' ? Math.max(1, Math.min(52, Number(drafts[type]?.installmentCount) || 1)) : 1;
    const amount = type === 'epf' ? '25.00' : type === 'battery-tester' && plan !== 'manual' ? plan === 'fixed-7' ? '40.00' : '50.00' : drafts[type]?.amount || '';
    const fixedSchedule = type === 'insurance' || type === 'battery-tester' && plan !== 'manual', subtype = { epf: 'EPF', insurance: 'insurance', 'battery-tester': 'battery tester' }[type];
    return '<fieldset class="deduction-line" data-deduction-line="' + type + '"><legend>' + esc(deductionTypes[type]) + '</legend><div class="deduction-line-fields">' +
      (type === 'battery-tester' ? '<label>Payment plan<select data-line-plan><option value="fixed-2"' + (plan === 'fixed-2' ? ' selected' : '') + '>2 × RM50 · RM100 total</option><option value="fixed-7"' + (plan === 'fixed-7' ? ' selected' : '') + '>7 × RM40 · RM280 total</option><option value="manual"' + (plan === 'manual' ? ' selected' : '') + '>Manual · set amount and payments</option></select></label>' : '') +
      '<label>' + (type === 'epf' ? 'Fixed hold (RM)' : type === 'manual' ? 'Total deduction (RM)' : 'Amount per payment (RM)') + '<input data-line-amount type="number" min="0.01" max="1000000" step="0.01" value="' + esc(amount) + '"' + (type === 'epf' || type === 'battery-tester' && plan !== 'manual' ? ' readonly' : '') + ' required></label>' +
      '<label>' + (type === 'epf' ? 'Hold date' : count > 1 ? 'Repayment plan start' : 'Deduction date') + '<input data-line-date type="date" value="' + esc(fixedSchedule ? monday : today) + '"' + (fixedSchedule ? ' readonly' : ' max="' + today + '"') + ' required></label>' +
      (type === 'battery-tester' || type === 'manual' ? '<label>Payments<input data-line-count type="number" min="1" max="52" step="1" value="' + count + '"' + (type === 'battery-tester' && plan !== 'manual' ? ' readonly' : '') + ' required></label>' : '') +
      (subtype ? '<input data-line-subtype type="hidden" value="' + subtype + '">' : '<label>Reason category<select data-line-subtype><option value="accident">Accident</option><option value="ganti rugi lost item">Ganti rugi lost item</option><option value="repair accident">Repair accident</option><option value="other">Other</option></select></label>') +
      (type === 'battery-tester' || type === 'manual' ? '' : '<input type="hidden" data-line-count value="' + count + '">') + '</div><p class="deduction-line-rule" data-line-rule></p><label class="deduction-line-reason">Reason / remarks <span>(optional)</span><textarea data-line-reason maxlength="2000" rows="2" placeholder="Add supporting notes if needed"></textarea></label></fieldset>';
  }).join('');
  const epfBlocked = types.includes('epf') && (!deductionFullWeek(periodStart, periodEnd) || gross < 300);
  const epfStatus = !types.includes('epf') ? '' : '<div class="deduction-eligibility' + (epfBlocked ? ' is-error' : '') + '" role="status" data-deduction-eligibility>' + (deductionFullWeek(periodStart, periodEnd) ? (gross >= 300 ? 'EPF eligible · recorded table commission ' + esc(formatMoney(gross)) + '. Saving activates the schedule.' : 'EPF requires at least RM300 commission in this filtered week.') : 'EPF requires exactly one full Monday–Sunday week. Change this table’s date range, then reopen this request.') + '</div>';
  body.innerHTML = '<form class="deduction-batch-form"><div class="deduction-request-context"><div><span>Rider</span><strong>' + esc(rider.rider) + '</strong></div><div><span>Commission period</span><strong>' + esc(periodStart + ' — ' + periodEnd) + '</strong></div><div><span>Filtered gross commission</span><strong>' + esc(formatMoney(gross)) + '</strong></div><div><span>Result</span><strong>Applied immediately</strong></div></div><p class="deduction-note">Each selected type becomes its own auditable record. Saving applies the full amount and immediately reduces net commission.</p><label class="deduction-maker-field">Created by (self-declared)<input name="createdBy" maxlength="200" autocomplete="name" required placeholder="Finance staff name"></label>' + epfStatus + '<div class="deduction-lines">' + lineMarkup + '</div><div class="deduction-submit-bar"><div><strong data-deduction-request-total></strong><p role="alert" data-deduction-error></p></div><button type="submit"' + (epfBlocked ? ' disabled' : '') + '>Save and apply</button></div></form>';
  const form = body.querySelector('form'), identity = deductionRequestIdentity(), submit = form.querySelector('[type="submit"]'); let saving = false;
  const updateLines = () => {
    let total = 0;
    form.querySelectorAll('[data-deduction-line]').forEach(line => {
      const type = line.dataset.deductionLine, amount = line.querySelector('[data-line-amount]'), count = Number(line.querySelector('[data-line-count]').value), date = line.querySelector('[data-line-date]').value;
      const enteredCents = Math.round(Number(amount.value || 0) * 100), manualTotal = type === 'manual';
      const evenlySplit = !manualTotal || Number.isInteger(count) && count > 0 && enteredCents % count === 0;
      amount.setCustomValidity(evenlySplit ? '' : 'Total must split evenly across payments to the nearest cent.');
      total += manualTotal ? enteredCents : enteredCents * count;
      const monthCount = deductionState.records.filter(record => record.type === 'epf' && (record.riderKey || deductionRiderKey(record.rider)) === rider.key && String(record.deductionDate || '').slice(0, 7) === date.slice(0, 7) && !['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record))).length;
      line.querySelector('[data-line-rule]').textContent = type === 'epf' ? 'Held on ' + date + ' → EPF contribution ' + deductionNextMonth(date) + ' · ' + monthCount + '/4 active holds in payment month' : manualTotal && count > 1 && evenlySplit ? deductionMoney(enteredCents / count) + ' × ' + count + ' = ' + deductionMoney(enteredCents) + ' total · final payment ' + deductionAddDays(date, 7 * (count - 1)) : count > 1 ? deductionMoney(enteredCents) + ' × ' + count + ' = ' + deductionMoney(enteredCents * count) + ' total · final payment ' + deductionAddDays(date, 7 * (count - 1)) : 'One-off payment · ' + deductionMoney(enteredCents);
    });
    form.querySelector('[data-deduction-request-total]').textContent = 'Total applied: ' + deductionMoney(total);
  };
  form.querySelectorAll('[data-line-plan]').forEach(select => { select.onchange = () => {
    const line = select.closest('[data-deduction-line]'), amount = line.querySelector('[data-line-amount]'), count = line.querySelector('[data-line-count]'), date = line.querySelector('[data-line-date]'), manual = select.value === 'manual';
    amount.value = manual ? '' : select.value === 'fixed-7' ? '40.00' : '50.00'; amount.readOnly = !manual; count.value = manual ? '3' : select.value === 'fixed-7' ? '7' : '2'; count.readOnly = !manual; date.value = manual ? today : monday; date.readOnly = !manual;
    date.removeAttribute('max'); updateLines();
  }; });
  form.addEventListener('input', updateLines); form.addEventListener('change', updateLines); updateLines();
  form.onsubmit = async event => {
    event.preventDefault(); const error = form.querySelector('[data-deduction-error]'); if (saving || epfBlocked || !form.reportValidity()) return;
    const current = deductionSingleRider(deductionRows(id, true)), currentDates = auditCapture(id)?.scope?.dates || {};
    if (!current.valid || current.key !== rider.key || String(currentDates.start || '').slice(0, 10) !== periodStart || String(currentDates.end || '').slice(0, 10) !== periodEnd) { error.textContent = 'The table rider or period changed. Close and reopen the request.'; return; }
    const lines = [...form.querySelectorAll('[data-deduction-line]')].map(line => { const type = line.dataset.deductionLine, count = Number(line.querySelector('[data-line-count]').value), entered = Number(line.querySelector('[data-line-amount]').value); return { type, subtype: line.querySelector('[data-line-subtype]').value, pricingMode: line.querySelector('[data-line-plan]')?.value || (type === 'epf' ? 'fixed-epf' : 'manual'), amount: type === 'manual' ? (entered / count).toFixed(2) : entered.toFixed(2), installmentCount: String(count), deductionDate: line.querySelector('[data-line-date]').value, periodStart, periodEnd, ...(type === 'epf' ? { weeklyCommission: gross.toFixed(2) } : {}), reason: line.querySelector('[data-line-reason]').value.trim() }; });
    const input = { rider: rider.rider, orderId: '', grossCommission: gross.toFixed(2), periodStart, periodEnd, createdBy: form.elements.createdBy.value.trim(), lines };
    saving = true; submit.disabled = true; error.textContent = 'Applying deduction…';
    try { const saved = await deductionRequest('/create-batch', { ...input, requestId: identity(input) }); deductionDrafts.delete(id); await deductionRefreshAfterSave(body, saved.records || [], saved.backupWarning); }
    catch (reason) { error.textContent = reason.message + ' Your unchanged retry uses the same request reference.'; saving = false; submit.disabled = false; }
  };
}

function deductionHistoryFilters(view) {
  return { search: deductionRiderKey(view?.querySelector('[data-deduction-history-search]')?.value), status: view?.querySelector('[data-deduction-history-status]')?.value || '', type: view?.querySelector('[data-deduction-history-type]')?.value || '', due: view?.querySelector('[data-deduction-history-due]')?.value || '', month: view?.querySelector('[data-deduction-history-month]')?.value || '' };
}
function deductionHistoryProgress(record, today = deductionToday()) {
  const items = deductionInstallments(record), active = !['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record)), scheduled = items.filter(item => item.status === 'scheduled' && active), applied = items.filter(item => item.status === 'applied');
  const nextDue = scheduled.map(item => item.dueDate).filter(Boolean).sort()[0] || '';
  return { items, paidCount: applied.length, count: items.length, nextDue, due: scheduled.some(item => item.dueDate <= today), overdue: scheduled.some(item => item.dueDate < today), appliedCents: applied.reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0), remainingCents: scheduled.reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0), reversedCents: items.filter(item => item.status === 'reversed').reduce((sum, item) => sum + deductionInstallmentAmount(record, item), 0) };
}
function deductionFilteredHistory(records, filters, today = deductionToday()) {
  return records.filter(record => {
    if (filters.status && deductionStatus(record) !== filters.status || filters.type && record.type !== filters.type) return false;
    if (filters.month && (record.type !== 'epf' || (record.epfContributionMonth || deductionNextMonth(record.deductionDate)) !== filters.month)) return false;
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
  if (record.type === 'epf') return 'Held ' + (record.deductionDate || '—') + ' · EPF ' + (record.epfContributionMonth || deductionNextMonth(record.deductionDate));
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
function deductionHistoryTypeCell(group, type, checker) {
  const record = group.records.find(item => item.type === type); if (!record) return '<td class="deduction-type-cell is-empty">—</td>';
  const progress = deductionHistoryProgress(record), total = progress.items.reduce((sum, installment) => sum + deductionInstallmentAmount(record, installment), 0);
  return '<td class="deduction-type-cell" data-deduction-record-id="' + esc(record.id) + '"><strong>' + esc(deductionMoney(total)) + '</strong><small>' + esc(deductionPlanLabel(record)) + '</small><span class="deduction-history-status ' + esc(deductionStatus(record)) + '">' + esc(deductionDisplayStatus(record)) + '</span>' + (record.reason ? '<small>Reason: ' + esc(record.reason) + '</small>' : '') + '<div class="deduction-type-actions">' + deductionHistoryActions(record, checker) + '</div></td>';
}
function deductionHistoryEnsure() {
  const commission = document.getElementById('tab-commission'); if (!commission) return null;
  document.querySelectorAll('.deduction-history-nav, .deduction-history-mobile').forEach(button => button.remove());
  let view = document.getElementById('deductionHistoryView');
  if (!view) {
    view = document.createElement('section'); view.id = 'deductionHistoryView'; view.className = 'deduction-history-view'; view.hidden = true;
    view.innerHTML = '<header class="deduction-history-head"><div><p>Commission Rider</p><h2>Rider deduction history</h2><span>Every saved request is applied immediately. Each deduction has its own column and audit actions.</span></div><div class="deduction-history-head-actions"><button type="button" data-deduction-history-export="excel">Export Excel</button><button type="button" data-deduction-history-export="pdf" disabled>Export checked Rider PDF</button><button type="button" data-deduction-history-close>← Back to Commission Rider</button></div></header><div data-deduction-history-feedback role="status"></div><section class="deduction-history-kpis" data-deduction-history-kpis></section><div class="deduction-history-toolbar"><label>Search<input type="search" data-deduction-history-search placeholder="Rider, reference or reason"></label><label>Status<select data-deduction-history-status><option value="">All statuses</option>' + ['applied', 'rejected', 'cancelled', 'reversed'].map(value => '<option>' + value + '</option>').join('') + '</select></label><label>Deduction<select data-deduction-history-type><option value="">All types</option>' + Object.entries(deductionTypes).map(([value, label]) => '<option value="' + value + '">' + esc(label) + '</option>').join('') + '</select></label><label>EPF contribution month<input type="month" data-deduction-history-month></label></div><div class="deduction-history-table-wrap"><table><thead><tr><th class="deduction-export-check">PDF</th><th>Rider / batch</th><th>EPF</th><th>Insurance</th><th>OBD / Battery Tester</th><th>Special Case</th><th>Commission period</th><th>Payment progress</th><th>Applied</th><th>Remaining</th><th>Status</th><th>Created by</th></tr></thead><tbody data-deduction-history-body></tbody></table></div><p class="deduction-history-empty" data-deduction-history-empty hidden>No deductions match these filters.</p>';
    commission.append(view);
  } return view;
}
function deductionHistoryRender() {
  const view = deductionHistoryEnsure(); if (!view) return;
  const shown = deductionFilteredHistory(deductionState.records, deductionHistoryFilters(view)), groups = deductionHistoryGroups(shown), totals = deductionHistoryTotals(shown), checker = ['checker', 'admin'].includes(deductionState.actor?.role);
  const visibleIds = new Set(groups.map(group => group.id)); [...deductionHistorySelected].forEach(id => { if (!visibleIds.has(id)) deductionHistorySelected.delete(id); });
  view.querySelectorAll('[data-deduction-history-export]').forEach(button => { button.disabled = !deductionState.loaded || button.dataset.deductionHistoryExport === 'pdf' && deductionHistorySelected.size !== 1; });
  view.querySelector('[data-deduction-history-feedback]').textContent = deductionState.loaded ? groups.length + ' request' + (groups.length === 1 ? '' : 's') + ' shown, containing ' + shown.length + ' deduction record' + (shown.length === 1 ? '' : 's') + '. Totals follow the filters below.' : deductionState.error || 'Loading the complete deduction register…';
  view.querySelector('[data-deduction-history-kpis]').innerHTML = [['Total deducted', deductionMoney(totals.appliedCents)], ['Applied installments', formatNumber(totals.appliedInstallments)], ['Deduction records', formatNumber(totals.recordCount)], ['Remaining', deductionMoney(totals.remainingCents)], ['Reversed payments', deductionMoney(totals.reversedCents)]].map(([label, value]) => '<article><span>' + esc(label) + '</span><strong>' + esc(deductionState.loaded ? value : '—') + '</strong></article>').join('');
  view.querySelector('[data-deduction-history-body]').innerHTML = deductionState.loaded ? groups.map(group => {
    const p = group.progress;
    return '<tr data-deduction-batch-id="' + esc(group.id) + '"><td class="deduction-export-check"><div class="deduction-row-controls"><input type="checkbox" data-deduction-history-select aria-label="Select ' + esc(group.rider) + ' request for Rider PDF"' + (deductionHistorySelected.has(group.id) ? ' checked' : '') + '><button type="button" data-deduction-delete-batch aria-label="Delete ' + esc(group.rider) + ' deduction request" title="Delete request">×</button></div></td><td><strong>' + esc(group.rider) + '</strong><small>' + group.records.length + ' deductions in one request</small><small>' + esc(group.references.join(' | ')) + '</small></td>' + deductionHistoryTypeCell(group, 'epf', checker) + deductionHistoryTypeCell(group, 'insurance', checker) + deductionHistoryTypeCell(group, 'battery-tester', checker) + deductionHistoryTypeCell(group, 'manual', checker) + '<td>' + esc((group.periodStart || '-') + ' - ' + (group.periodEnd || '-')) + '</td><td><strong>' + p.paidCount + ' / ' + p.count + ' applied</strong><small>' + esc(p.remainingCents ? 'Converting remaining deductions…' : 'Fully applied') + '</small></td><td>' + esc(deductionMoney(p.appliedCents)) + '</td><td>' + esc(deductionMoney(p.remainingCents)) + '</td><td><span class="deduction-history-status ' + esc(group.status) + '">' + esc(deductionDisplayStatus(group.status)) + '</span></td><td>' + esc(group.createdBy || '-') + '<small>' + esc(formatGrafanaTimestamp(group.createdAt)) + '</small></td></tr>';
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
  const active = records.filter(record => (record.riderKey || deductionRiderKey(record.rider)) === rider.key && (!start || record.periodStart === start) && (!end || record.periodEnd === end) && !['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record)));
  if (!active.length) throw new Error('No selected deductions match this rider and the current Commission Rider table period.');
  const commissionColumn = payload.columns.find(column => String(column.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'commission');
  if (!commissionColumn) throw new Error('The Commission Rider table has no commission column.');
  const grossCents = Math.round(payload.rows.reduce((sum, row) => sum + numberValue(commissionColumn.value(row)), 0) * 100);
  const appliedCents = active.reduce((sum, record) => sum + deductionHistoryProgress(record).appliedCents, 0);
  const commissionIndex = payload.columns.indexOf(commissionColumn), row = (label, value) => payload.columns.map((_column, index) => index === 0 ? label : index === commissionIndex ? value : '');
  const typeRows = [...new Set(active.map(record => record.type))].map(type => {
    const matching = active.filter(record => record.type === type), cents = matching.reduce((sum, record) => sum + deductionHistoryProgress(record).items.reduce((itemSum, item) => itemSum + deductionInstallmentAmount(record, item), 0), 0), statuses = [...new Set(matching.map(deductionDisplayStatus))];
    return row((deductionTypes[type] || type).toUpperCase() + ' (' + statuses.join('/') + ')', '- ' + deductionMoney(cents));
  });
  const footer = payload.footer || row('Filtered total', deductionMoney(grossCents));
  const netCents = grossCents - appliedCents;
  const filename = rider.rider.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 160) || 'Rider';
  return { ...payload, title: rider.rider, filename: filename + '-Commission-Statement', pdfFilename: filename + '.pdf', period: (start && end ? start + ' - ' + end : payload.period) + ' | saved deductions are applied immediately', summary: { label: 'Net Commission', value: deductionMoney(netCents) }, footerRows: [footer, ...typeRows, row('APPLIED DEDUCTIONS', '- ' + deductionMoney(appliedCents)), row('NET COMMISSION', deductionMoney(netCents))] };
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
    body.innerHTML = context + '<p class="deduction-note">' + esc(deductionPlanLabel(record)) + ' · ' + esc(record.reason || '') + '</p>' + (record.type === 'epf' && record.reportedWeeklyCommissionCents ? '<p class="deduction-eligibility">Recorded weekly commission ' + esc(deductionMoney(record.reportedWeeklyCommissionCents)) + ' · current filtered table at request time</p>' : '') + '<h4>Payment schedule</h4><div class="deduction-audit-table"><table><thead><tr><th>Payment</th><th>Due</th><th>Amount</th><th>Status</th><th>Paid / commission period</th></tr></thead><tbody>' + progress.items.map((item, index) => '<tr><td>' + (index + 1) + '</td><td>' + esc(item.dueDate) + '</td><td>' + esc(deductionMoney(deductionInstallmentAmount(record, item))) + '</td><td>' + esc(item.status) + '</td><td>' + esc(item.paymentDate || '—') + '<small>' + esc(item.settlementPeriodStart ? item.settlementPeriodStart + ' — ' + item.settlementPeriodEnd : item.status === 'applied' ? 'Legacy · due-date reporting' : '') + '</small></td></tr>').join('') + '</tbody></table></div><h4>Audit trail</h4><ol class="deduction-audit-list">' + (record.audit || []).map(item => '<li><div><strong>' + esc(item.action) + '</strong><span>' + esc(formatGrafanaTimestamp(item.at) || item.at) + '</span></div><p>' + esc(item.by || '—') + ' · ' + esc(item.reason || 'No additional remarks') + '</p>' + (item.amountCents != null ? '<small>' + esc(deductionMoney(item.amountCents)) + '</small>' : '') + '<details><summary>Full event details</summary><pre>' + esc(JSON.stringify(item, null, 2)) + '</pre></details></li>').join('') + '</ol>'; return;
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
  document.getElementById('tab-commission')?.classList.add('deduction-history-active'); view.hidden = false;
  try { await deductionLoad(); } catch {} deductionHistoryRender(); view.scrollIntoView({ block: 'start' });
}
function deductionHistoryClose() { document.getElementById('tab-commission')?.classList.remove('deduction-history-active'); const view = document.getElementById('deductionHistoryView'); if (view) view.hidden = true; }
function deductionDeleteBatchDialog(batchId) {
  const group = deductionHistoryGroups(deductionState.records).find(item => item.id === batchId), dialog = deductionDialog('Delete deduction request'), body = dialog.querySelector('[data-deduction-body]');
  if (!group) { body.innerHTML = '<div class="deduction-feedback is-error" role="alert">Deduction request batch not found. Refresh History and try again.</div>'; return; }
  const locked = group.records.some(record => (record.audit || []).some(item => ['applied', 'reversed'].includes(item.action)) || deductionInstallments(record).some(item => item.status === 'reversed'));
  body.innerHTML = '<form class="deduction-form deduction-delete-form"><div class="deduction-delete-warning"><strong>' + esc(group.rider) + '</strong><span>' + group.records.length + ' deduction record' + (group.records.length === 1 ? '' : 's') + ' · ' + esc((group.periodStart || '—') + ' to ' + (group.periodEnd || '—')) + '</span></div>' + (locked ? '<div class="deduction-feedback is-error" role="alert">This request has later payment or reversal activity and cannot be deleted. Keep it for the audit trail.</div>' : '<p class="deduction-note">This permanently removes the entire request and its deduction from active History. A deletion audit record remains in the protected backup.</p><label>4-digit deletion PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required placeholder="••••"></label><p class="deduction-wide" role="alert" data-deduction-error></p><div class="deduction-wide deduction-submit-bar"><span>This action cannot be undone.</span><button type="submit" class="deduction-danger-button">Delete request</button></div>') + '</form>';
  if (locked) return;
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
  if (cards.length && !deductionState.loaded && !deductionState.loading && !deductionState.error) void deductionLoad().then(() => render()).catch(() => render());
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
  if (event.target.matches?.('[data-deduction-history-status], [data-deduction-history-type], [data-deduction-history-due], [data-deduction-history-month]')) return deductionHistoryRender();
  const summary = event.target.closest?.('.deduction-workspace'); if (!summary) return;
  if (event.target.matches('[data-deduction-inline-battery-plan]')) {
    const amount = summary.querySelector('[data-deduction-inline-amount="battery-tester"]'), count = summary.querySelector('[data-deduction-inline-battery-count]'); amount.value = event.target.value === 'manual' ? '' : event.target.value === 'fixed-7' ? '40.00' : '50.00'; amount.readOnly = event.target.value !== 'manual'; count.value = event.target.value === 'manual' ? '3' : event.target.value === 'fixed-7' ? '7' : '2'; count.readOnly = event.target.value !== 'manual'; if (!amount.readOnly) amount.focus();
  } deductionUpdateInline(summary);
});
document.addEventListener('click', async event => {
  if (event.target.closest?.('[data-deduction-history-open]')) { event.preventDefault(); return deductionHistoryOpen(); }
  if (event.target.closest?.('[data-deduction-history-close]')) { event.preventDefault(); return deductionHistoryClose(); }
  if (event.target.closest?.('[data-deduction-retry]')) { event.preventDefault(); try { await deductionLoad(); } catch {} render(); deductionHistoryRender(); return; }
  const exported = event.target.closest?.('[data-deduction-history-export]');
  if (exported) { event.preventDefault(); try { await deductionHistoryExport(exported.dataset.deductionHistoryExport); } catch (error) { deductionHistoryEnsure().querySelector('[data-deduction-history-feedback]').textContent = error.message; } return; }
  const deleteBatch = event.target.closest?.('[data-deduction-delete-batch]'); if (deleteBatch) { event.preventDefault(); return deductionDeleteBatchDialog(deleteBatch.closest('[data-deduction-batch-id]')?.dataset.deductionBatchId); }
  const action = event.target.closest?.('[data-deduction-action]'); if (action) { event.preventDefault(); return deductionActionDialog(action.closest('[data-deduction-record-id]')?.dataset.deductionRecordId, action.dataset.deductionAction); }
  const button = event.target.closest?.('[data-deduction-inline-create], [data-deduction-create], [data-deduction-register]'); if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation(); if (button.hasAttribute('data-deduction-register')) return deductionHistoryOpen();
  const summary = button.closest('.deduction-workspace'), id = summary?.dataset.deductionTable || button.dataset.deductionTable || button.closest('[data-audit-table]')?.dataset.auditTable;
  if (!auditIdentity(id)) return;
  if (!summary) return deductionCreateBatch(id, [button.dataset.deductionCreate || 'manual']);
  deductionUpdateInline(summary); if (button.disabled) return;
  const draft = deductionDrafts.get(id), drafts = {};
  draft.selected.forEach(type => { drafts[type] = { amount: draft.amounts[type], pricingMode: type === 'battery-tester' ? draft.batteryPlan : type === 'epf' ? 'fixed-epf' : 'manual', ...(type === 'battery-tester' ? { installmentCount: draft.batteryCount } : type === 'manual' ? { installmentCount: draft.manualCount } : {}) }; }); return deductionCreateBatch(id, draft.selected, drafts);
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
