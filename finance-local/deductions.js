// Table-scoped shortcuts over the shared pending deduction register.
const deductionState = { records: [], actor: null, approvalAvailable: false, loaded: false, loading: null, error: '' };
const deductionTypes = { epf: 'EPF', insurance: 'Insurance', 'battery-tester': 'OBD / Battery Tester', manual: 'Special Case' };
const deductionRiderKey = value => String(value || '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
const deductionMoney = cents => formatMoney(Number(cents || 0) / 100);
const deductionStatus = record => record.status || record.approvalStatus || 'pending';
const deductionDrafts = new Map();

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
  const field = (type, value, readonly = false) => '<label class="deduction-amount-field"><span>RM</span><input aria-label="' + esc(deductionTypes[type]) + ' amount per payment" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" data-deduction-inline-amount="' + type + '" value="' + esc(value || '') + '" placeholder="0.00"' + (readonly ? ' readonly' : '') + disabled + '></label>';
  const card = (type, controls, help) => '<article class="deduction-choice-card' + (selected(type) ? ' is-selected' : '') + '">' + choice(type) + controls + '<small>' + help + '</small><span class="deduction-card-applied">Applied <b>' + esc(enabled ? deductionMoney(summary.amounts[type]) : '—') + '</b></span></article>';
  const error = summary.error || (!rider.valid ? rider.message : '');
  return '<section class="commission-deduction-summary deduction-workspace" data-deduction-table="' + esc(tableId) + '" aria-label="Commission deduction calculation"><header class="deduction-workspace-head"><div><span class="deduction-eyebrow">Commission deduction formula</span><h3>' + esc(rider.valid ? rider.rider : 'Select one rider to prepare deductions') + '</h3><p>' + esc(String(dates.start || '').slice(0, 10) + ' — ' + String(dates.end || '').slice(0, 10)) + ' <span>· ' + formatNumber(dataRows.length) + ' filtered rows</span></p></div></header>' +
    (error ? '<div class="deduction-feedback is-error" role="alert">' + esc(error) + (summary.error ? ' <button type="button" data-deduction-retry>Retry register</button>' : '') + '</div>' : !summary.loaded ? '<div class="deduction-feedback" role="status">Loading deduction register…</div>' : '') +
    '<div class="deduction-choice-grid">' + card('epf', field('epf', '25.00', true), 'Fixed hold · next month’s EPF<br>Verified full week ≥ RM300 · max 4/month') + card('insurance', field('insurance', draft.amounts.insurance), 'Amount per payment · 2 weekly payments') +
    card('battery-tester', '<select aria-label="Battery Tester payment plan" data-deduction-inline-battery-plan' + disabled + '><option value="fixed-2"' + (draft.batteryPlan === 'fixed-2' ? ' selected' : '') + '>2 × RM50 · RM100 total</option><option value="fixed-7"' + (draft.batteryPlan === 'fixed-7' ? ' selected' : '') + '>7 × RM40 · RM280 total</option><option value="manual"' + (draft.batteryPlan === 'manual' ? ' selected' : '') + '>Manual · set amount and payments</option></select>' + field('battery-tester', draft.batteryPlan === 'manual' ? draft.amounts['battery-tester'] : draft.batteryPlan === 'fixed-7' ? '40.00' : '50.00', draft.batteryPlan !== 'manual') + '<label class="deduction-payment-count"><span>Payments</span><input aria-label="Battery Tester number of payments" type="number" min="1" max="52" step="1" inputmode="numeric" data-deduction-inline-battery-count value="' + esc(draft.batteryPlan === 'fixed-7' ? '7' : draft.batteryPlan === 'fixed-2' ? '2' : String(draft.batteryCount || 3)) + '"' + (draft.batteryPlan !== 'manual' ? ' readonly' : '') + disabled + '></label>', 'Fixed weekly schedule or Finance-set weekly payments') + card('manual', field('manual', draft.amounts.manual) + '<label class="deduction-payment-count"><span>Payments</span><input aria-label="Special Case number of payments" type="number" min="1" max="52" step="1" inputmode="numeric" data-deduction-inline-manual-count value="' + esc(String(draft.manualCount || 1)) + '"' + disabled + '></label>', 'Finance-set amount and weekly payments') + '</div>' +
    '<div class="deduction-settlement-strip"><div><span>Gross commission</span><strong>' + esc(deductionMoney(summary.grossCents)) + '</strong></div><span class="deduction-equation-sign" aria-hidden="true">−</span><div><span>Applied deductions</span><strong>' + esc(enabled ? deductionMoney(summary.approvedCents) : '—') + '</strong><small>' + esc(enabled ? deductionMoney(summary.pendingCents) + ' pending / scheduled, not deducted' : 'Requires one rider and a complete register') + '</small></div><span class="deduction-equation-sign" aria-hidden="true">=</span><div class="commission-net-total' + (summary.netCents < 0 ? ' is-negative' : '') + '"><span>Net commission</span><strong>' + esc(enabled ? deductionMoney(summary.netCents) : '—') + '</strong></div></div>' +
    (summary.legacyCount ? '<p class="deduction-legacy-note">' + summary.legacyCount + ' legacy applied payment(s) use their original due date for this report.</p>' : '') +
    '<footer class="deduction-inline-actions"><button type="button" data-deduction-history-open>History</button><div><strong data-deduction-inline-preview>Request preview: —</strong><span data-deduction-inline-message>' + esc(enabled ? 'Choose one or more types. Creating a request does not reduce net commission.' : error || 'Waiting for the deduction register.') + '</span></div><strong class="deduction-inline-total">Total Deducted: ' + esc(enabled ? deductionMoney(summary.approvedCents) : '—') + '</strong><button type="button" data-deduction-inline-create' + (enabled && draft.selected.length ? '' : ' disabled') + '>Review deduction request</button></footer></section>';
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
    total += Math.round((amount || 0) * 100) * count;
  }
  const button = summary.querySelector('[data-deduction-inline-create]'); if (button) button.disabled = !valid || !deductionState.loaded;
  const preview = summary.querySelector('[data-deduction-inline-preview]'); if (preview) preview.textContent = 'Request preview: ' + (choices.length ? deductionMoney(total) + ' across all scheduled payments' : '—');
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
  body.innerHTML = '<section class="deduction-save-success" role="status"><span class="deduction-status-pill">Saved · pending approval</span><h4>Deduction request saved</h4><p>No commission has been deducted. An authorized checker must approve, then apply each payment.</p><ul>' + records.map(record => '<li><span>' + esc(deductionTypes[record.type] || record.type || 'Deduction') + '</span><strong>' + esc(record.reference || record.id) + '</strong></li>').join('') + '</ul><p data-deduction-refresh-message>Refreshing the register…</p><button type="button" data-deduction-done>Done</button></section>';
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
      '<label>' + (type === 'epf' ? 'Fixed hold (RM)' : 'Amount per payment (RM)') + '<input data-line-amount type="number" min="0.01" max="1000000" step="0.01" value="' + esc(amount) + '"' + (type === 'epf' || type === 'battery-tester' && plan !== 'manual' ? ' readonly' : '') + ' required></label>' +
      '<label>' + (type === 'epf' ? 'Payment / hold date' : type === 'manual' ? 'First payment date' : count > 1 ? 'First scheduled payment' : 'Payment date') + '<input data-line-date type="date" value="' + esc(fixedSchedule ? monday : today) + '"' + (fixedSchedule ? ' readonly' : ' max="' + today + '"') + ' required></label>' +
      (type === 'battery-tester' || type === 'manual' ? '<label>Payments<input data-line-count type="number" min="1" max="52" step="1" value="' + count + '"' + (type === 'battery-tester' && plan !== 'manual' ? ' readonly' : '') + ' required></label>' : '') +
      (subtype ? '<input data-line-subtype type="hidden" value="' + subtype + '">' : '<label>Reason category<select data-line-subtype><option value="accident">Accident</option><option value="ganti rugi lost item">Ganti rugi lost item</option><option value="repair accident">Repair accident</option><option value="other">Other</option></select></label>') +
      (type === 'battery-tester' || type === 'manual' ? '' : '<input type="hidden" data-line-count value="' + count + '">') + '</div><p class="deduction-line-rule" data-line-rule></p><label class="deduction-line-reason">Reason / remarks <span>(optional)</span><textarea data-line-reason maxlength="2000" rows="2" placeholder="Add supporting notes if needed"></textarea></label></fieldset>';
  }).join('');
  body.innerHTML = '<form class="deduction-batch-form"><div class="deduction-request-context"><div><span>Rider</span><strong>' + esc(rider.rider) + '</strong></div><div><span>Commission period</span><strong>' + esc(periodStart + ' — ' + periodEnd) + '</strong></div><div><span>Filtered gross commission</span><strong>' + esc(formatMoney(gross)) + '</strong></div><div><span>Initial status</span><strong>Pending approval</strong></div></div><p class="deduction-note">Each selected type becomes its own auditable record. Only an applied payment reduces net commission.</p><label class="deduction-maker-field">Created by (self-declared)<input name="createdBy" maxlength="200" autocomplete="name" required placeholder="Finance staff name"></label>' +
    (types.includes('epf') ? '<div class="deduction-eligibility" role="status" data-deduction-eligibility>Checking the rider’s complete weekly commission…</div>' : '') + '<div class="deduction-lines">' + lineMarkup + '</div><div class="deduction-submit-bar"><div><strong data-deduction-request-total></strong><p role="alert" data-deduction-error></p></div><button type="submit"' + (types.includes('epf') ? ' disabled' : '') + '>Save ' + types.length + ' pending deduction' + (types.length === 1 ? '' : 's') + '</button></div></form>';
  const form = body.querySelector('form'), identity = deductionRequestIdentity(), submit = form.querySelector('[type="submit"]'); let eligibility = null, saving = false, blocked = false;
  const updateLines = () => {
    let total = 0;
    form.querySelectorAll('[data-deduction-line]').forEach(line => {
      const type = line.dataset.deductionLine, amount = line.querySelector('[data-line-amount]'), count = Number(line.querySelector('[data-line-count]').value), date = line.querySelector('[data-line-date]').value;
      total += Math.round(Number(amount.value || 0) * 100) * count;
      const monthCount = deductionState.records.filter(record => record.type === 'epf' && (record.riderKey || deductionRiderKey(record.rider)) === rider.key && String(record.deductionDate || '').slice(0, 7) === date.slice(0, 7) && !['rejected', 'cancelled', 'reversed'].includes(deductionStatus(record))).length;
      line.querySelector('[data-line-rule]').textContent = type === 'epf' ? 'Held on ' + date + ' → EPF contribution ' + deductionNextMonth(date) + ' · ' + monthCount + '/4 active holds in payment month' : count > 1 ? count + ' weekly payments · ' + deductionMoney(Math.round(Number(amount.value || 0) * 100) * count) + ' total · final payment ' + deductionAddDays(date, 7 * (count - 1)) : 'One-off payment · ' + deductionMoney(Math.round(Number(amount.value || 0) * 100));
    });
    form.querySelector('[data-deduction-request-total]').textContent = 'Scheduled request total: ' + deductionMoney(total);
  };
  form.querySelectorAll('[data-line-plan]').forEach(select => { select.onchange = () => {
    const line = select.closest('[data-deduction-line]'), amount = line.querySelector('[data-line-amount]'), count = line.querySelector('[data-line-count]'), date = line.querySelector('[data-line-date]'), manual = select.value === 'manual';
    amount.value = manual ? '' : select.value === 'fixed-7' ? '40.00' : '50.00'; amount.readOnly = !manual; count.value = manual ? '3' : select.value === 'fixed-7' ? '7' : '2'; count.readOnly = !manual; date.value = manual ? today : monday; date.readOnly = !manual;
    date.removeAttribute('max'); updateLines();
  }; });
  form.addEventListener('input', updateLines); form.addEventListener('change', updateLines); updateLines();
  if (types.includes('epf')) {
    const status = form.querySelector('[data-deduction-eligibility]');
    if (!deductionFullWeek(periodStart, periodEnd)) { blocked = true; status.classList.add('is-error'); status.textContent = 'EPF requires exactly one full Monday–Sunday week. Change this table’s date range, then reopen this request.'; }
    else {
      void deductionRequest('/eligibility?rider=' + encodeURIComponent(rider.rider) + '&periodStart=' + periodStart + '&periodEnd=' + periodEnd).then(result => {
        if (!dialog.isConnected) return;
        if (!Number.isInteger(result.amountCents) || result.periodStart !== periodStart || result.periodEnd !== periodEnd || !result.verifiedAt || !result.source) throw new Error('Weekly commission verification returned incomplete evidence. Retry this request.');
        eligibility = result; blocked = !result.eligible || result.amountCents < 30000; status.classList.toggle('is-error', blocked);
        status.textContent = (blocked ? 'Not eligible' : 'Verified eligible') + ' · complete week ' + deductionMoney(result.amountCents) + ' · ' + result.rowCount + ' source rows · ' + result.source + '. The server checks again when saving.'; submit.disabled = blocked || saving;
      }).catch(error => { blocked = true; status.classList.add('is-error'); status.textContent = error.message + ' EPF cannot be saved until verification succeeds.'; submit.disabled = true; });
    }
  }
  form.onsubmit = async event => {
    event.preventDefault(); const error = form.querySelector('[data-deduction-error]'); if (saving || blocked || types.includes('epf') && !eligibility || !form.reportValidity()) return;
    const current = deductionSingleRider(deductionRows(id, true)), currentDates = auditCapture(id)?.scope?.dates || {};
    if (!current.valid || current.key !== rider.key || String(currentDates.start || '').slice(0, 10) !== periodStart || String(currentDates.end || '').slice(0, 10) !== periodEnd) { error.textContent = 'The table rider or period changed. Close and reopen the request.'; return; }
    const lines = [...form.querySelectorAll('[data-deduction-line]')].map(line => ({ type: line.dataset.deductionLine, subtype: line.querySelector('[data-line-subtype]').value, pricingMode: line.querySelector('[data-line-plan]')?.value || (line.dataset.deductionLine === 'epf' ? 'fixed-epf' : 'manual'), amount: line.querySelector('[data-line-amount]').value, installmentCount: line.querySelector('[data-line-count]').value, deductionDate: line.querySelector('[data-line-date]').value, periodStart, periodEnd, ...(line.dataset.deductionLine === 'epf' ? { weeklyCommission: (eligibility.amountCents / 100).toFixed(2) } : {}), reason: line.querySelector('[data-line-reason]').value.trim() }));
    const input = { rider: rider.rider, orderId: '', grossCommission: gross.toFixed(2), periodStart, periodEnd, createdBy: form.elements.createdBy.value.trim(), lines };
    saving = true; submit.disabled = true; error.textContent = 'Saving pending records…';
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
    if (deductionStatus(record) === 'pending') total.pendingCount++; if (deductionStatus(record) === 'approved') total.approvedCents += p.remainingCents; return total;
  }, { appliedCents: 0, remainingCents: 0, reversedCents: 0, pendingCount: 0, approvedCents: 0 });
}
function deductionPlanLabel(record) {
  if (record.type === 'epf') return 'Held ' + (record.deductionDate || '—') + ' · EPF ' + (record.epfContributionMonth || deductionNextMonth(record.deductionDate));
  if (record.type === 'insurance') return '2 weekly payments';
  if (record.type === 'battery-tester') return record.pricingMode === 'fixed-2' ? '2 × RM50' : record.pricingMode === 'fixed-7' ? '7 × RM40' : 'Manual · ' + Number(record.installmentCount || 1) + ' weekly payment' + (Number(record.installmentCount || 1) === 1 ? '' : 's');
  if (record.type === 'manual') return Number(record.installmentCount || 1) + ' weekly payment' + (Number(record.installmentCount || 1) === 1 ? '' : 's');
  return 'One-off';
}
function deductionHistoryEnsure() {
  const commission = document.getElementById('tab-commission'); if (!commission) return null;
  document.querySelectorAll('.deduction-history-nav, .deduction-history-mobile').forEach(button => button.remove());
  let view = document.getElementById('deductionHistoryView');
  if (!view) {
    view = document.createElement('section'); view.id = 'deductionHistoryView'; view.className = 'deduction-history-view'; view.hidden = true;
    view.innerHTML = '<header class="deduction-history-head"><div><p>Commission Rider</p><h2>Rider deduction history</h2><span>Requests, payment schedules and a permanent audit trail.</span></div><div class="deduction-history-head-actions"><button type="button" data-deduction-history-export="excel">Export Excel</button><button type="button" data-deduction-history-export="pdf">Export PDF</button><button type="button" data-deduction-history-close>← Back to Commission Rider</button></div></header><div data-deduction-history-feedback role="status"></div><section class="deduction-history-kpis" data-deduction-history-kpis></section><div class="deduction-history-toolbar"><label>Search<input type="search" data-deduction-history-search placeholder="Rider, reference or reason"></label><label>Status<select data-deduction-history-status><option value="">All statuses</option>' + ['pending', 'approved', 'applied', 'rejected', 'cancelled', 'reversed'].map(value => '<option>' + value + '</option>').join('') + '</select></label><label>Deduction<select data-deduction-history-type><option value="">All types</option>' + Object.entries(deductionTypes).map(([value, label]) => '<option value="' + value + '">' + esc(label) + '</option>').join('') + '</select></label><label>Schedule<select data-deduction-history-due><option value="">Any due date</option><option value="due">Due through today</option><option value="overdue">Overdue</option></select></label><label>EPF contribution month<input type="month" data-deduction-history-month></label></div><div class="deduction-history-table-wrap"><table><thead><tr><th>Rider / reference</th><th>Deduction / plan</th><th>Commission period</th><th>Payment progress</th><th>Applied</th><th>Remaining</th><th>Status</th><th>Created by</th><th>Actions</th></tr></thead><tbody data-deduction-history-body></tbody></table></div><p class="deduction-history-empty" data-deduction-history-empty hidden>No deductions match these filters.</p>';
    commission.append(view);
  } return view;
}
function deductionHistoryRender() {
  const view = deductionHistoryEnsure(); if (!view) return;
  const shown = deductionFilteredHistory(deductionState.records, deductionHistoryFilters(view)), totals = deductionHistoryTotals(shown), checker = ['checker', 'admin'].includes(deductionState.actor?.role);
  view.querySelectorAll('[data-deduction-history-export]').forEach(button => { button.disabled = !deductionState.loaded; });
  view.querySelector('[data-deduction-history-feedback]').textContent = deductionState.loaded ? shown.length + ' matching records · totals follow the filters below' : deductionState.error || 'Loading the complete deduction register…';
  view.querySelector('[data-deduction-history-kpis]').innerHTML = [['Applied deductions', deductionMoney(totals.appliedCents)], ['Approved · not applied', deductionMoney(totals.approvedCents)], ['Remaining scheduled', deductionMoney(totals.remainingCents)], ['Reversed payments', deductionMoney(totals.reversedCents)], ['Pending requests', formatNumber(totals.pendingCount)]].map(([label, value]) => '<article><span>' + esc(label) + '</span><strong>' + esc(deductionState.loaded ? value : '—') + '</strong></article>').join('');
  view.querySelector('[data-deduction-history-body]').innerHTML = deductionState.loaded ? shown.map(record => {
    const status = deductionStatus(record), p = deductionHistoryProgress(record); let actions = '<button type="button" data-deduction-action="view">Details</button>';
    if (status === 'pending') actions += (checker ? '<button type="button" data-deduction-action="approve">Approve</button><button type="button" data-deduction-action="reject">Reject</button>' : '') + '<button type="button" data-deduction-action="cancel">Cancel</button>';
    if (checker && status === 'approved' && p.remainingCents) actions += '<button type="button" data-deduction-action="apply">Apply payment</button>';
    if (checker && p.appliedCents) actions += '<button type="button" data-deduction-action="reverse">Reverse payment</button>';
    return '<tr data-deduction-record-id="' + esc(record.id) + '"><td><strong>' + esc(record.rider) + '</strong><small>' + esc(record.reference || record.id) + '</small></td><td><strong>' + esc(deductionTypes[record.type] || record.type) + '</strong><small>' + esc(deductionPlanLabel(record)) + '</small></td><td>' + esc((record.periodStart || '—') + ' — ' + (record.periodEnd || '—')) + '</td><td><strong>' + p.paidCount + ' / ' + p.count + ' applied</strong><small' + (p.overdue ? ' class="deduction-overdue"' : '') + '>' + esc(p.nextDue ? (p.overdue ? 'Overdue · ' : 'Next · ') + p.nextDue : 'No scheduled payments') + '</small></td><td>' + esc(deductionMoney(p.appliedCents)) + '</td><td>' + esc(deductionMoney(p.remainingCents)) + '</td><td><span class="deduction-history-status ' + esc(status) + '">' + esc(status) + '</span></td><td>' + esc(record.createdBy || '—') + '<small>' + esc(formatGrafanaTimestamp(record.createdAt)) + '</small></td><td class="deduction-history-actions">' + actions + '</td></tr>';
  }).join('') : '<tr><td colspan="9">History is unavailable until the full register loads. <button type="button" data-deduction-retry>Retry register</button></td></tr>';
  view.querySelector('[data-deduction-history-empty]').hidden = !deductionState.loaded || shown.length > 0;
}
async function deductionHistoryExport(format) {
  await deductionLoad();
  if (!deductionState.loaded) throw new Error('Load the complete deduction register before exporting.');
  await ensureFinanceExportBundle(format);
  deductionHistoryRender();
  const records = deductionFilteredHistory(deductionState.records, deductionHistoryFilters(deductionHistoryEnsure()));
  const columns = [['rider', 'Rider'], ['reference', 'Reference'], ['type', 'Deduction'], ['plan', 'Plan / contribution'], ['period', 'Commission period'], ['progress', 'Payments applied'], ['applied', 'Applied'], ['remaining', 'Remaining'], ['nextDue', 'Next due'], ['status', 'Status'], ['createdBy', 'Created by'], ['reason', 'Reason'], ['schedule', 'Payment schedule']].map(([key, label]) => ({ key, label, value: row => row[key] }));
  const rows = records.map(record => { const p = deductionHistoryProgress(record); return { rider: record.rider, reference: record.reference || record.id, type: deductionTypes[record.type] || record.type, plan: deductionPlanLabel(record), period: (record.periodStart || '') + ' — ' + (record.periodEnd || ''), progress: p.paidCount + '/' + p.count, applied: deductionMoney(p.appliedCents), remaining: deductionMoney(p.remainingCents), nextDue: p.nextDue, status: deductionStatus(record), createdBy: record.createdBy, reason: record.reason, schedule: p.items.map(item => item.dueDate + ' ' + item.status + (item.paymentDate ? ' paid ' + item.paymentDate : '') + (item.settlementPeriodStart ? ' commission ' + item.settlementPeriodStart + '–' + item.settlementPeriodEnd : '')).join(' | ') }; });
  const payload = { title: 'Rider Deduction History', panelTitle: 'Commission Rider', filename: 'Commission-Rider-Deduction-History', columns, rows, period: 'Current history filters · applied payments only reduce commission' };
  if (format === 'pdf') await downloadPdfTable(payload); else await downloadExcelTable(payload);
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
    body.innerHTML = context + '<p class="deduction-note">' + esc(deductionPlanLabel(record)) + ' · ' + esc(record.reason || '') + '</p>' + (record.epfVerification ? '<p class="deduction-eligibility">Verified weekly commission ' + esc(deductionMoney(record.epfVerification.amountCents)) + ' · ' + esc(record.epfVerification.source) + ' · ' + esc(formatGrafanaTimestamp(record.epfVerification.verifiedAt)) + '</p>' : '') + '<h4>Payment schedule</h4><div class="deduction-audit-table"><table><thead><tr><th>Payment</th><th>Due</th><th>Amount</th><th>Status</th><th>Paid / commission period</th></tr></thead><tbody>' + progress.items.map((item, index) => '<tr><td>' + (index + 1) + '</td><td>' + esc(item.dueDate) + '</td><td>' + esc(deductionMoney(deductionInstallmentAmount(record, item))) + '</td><td>' + esc(item.status) + '</td><td>' + esc(item.paymentDate || '—') + '<small>' + esc(item.settlementPeriodStart ? item.settlementPeriodStart + ' — ' + item.settlementPeriodEnd : item.status === 'applied' ? 'Legacy · due-date reporting' : '') + '</small></td></tr>').join('') + '</tbody></table></div><h4>Audit trail</h4><ol class="deduction-audit-list">' + (record.audit || []).map(item => '<li><div><strong>' + esc(item.action) + '</strong><span>' + esc(formatGrafanaTimestamp(item.at) || item.at) + '</span></div><p>' + esc(item.by || '—') + ' · ' + esc(item.reason || 'No additional remarks') + '</p>' + (item.amountCents != null ? '<small>' + esc(deductionMoney(item.amountCents)) + '</small>' : '') + '<details><summary>Full event details</summary><pre>' + esc(JSON.stringify(item, null, 2)) + '</pre></details></li>').join('') + '</ol>'; return;
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
  if (event.target.matches?.('[data-deduction-inline-amount]')) deductionUpdateInline(event.target.closest('.deduction-workspace'));
});
