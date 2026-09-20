// Embedded in the dashboard's existing scope by scripts/sync-history-workflow.cjs.
const deductionWorkflowScope = { tab: 'active', installment: '', progress: '', month: '', dueStart: '', dueEnd: '' };
const deductionHistoryPdfInclusions = new Set();
function deductionStatementLabel(record, item, index) {
  const downloaded = item.statementDownloaded || (record.audit || []).some(entry => entry.action === 'statement-sent' && entry.installmentIndex === index && /PDF downloaded/i.test(entry.reason || ''));
  return downloaded ? 'Statement downloaded' : 'Statement recorded';
}
function deductionWorkflowIncluded(group, option) {
  const key = deductionHistoryPdfSelectionKey(group, option.record.type, option);
  return !deductionHistoryPdfExclusions.has(key) && (!window.LedgerHistoryWorkflow.installmentCompleted(option.item) || deductionHistoryPdfInclusions.has(key));
}
function deductionWorkflowGroups(filters, stage = deductionWorkflowScope.tab) {
  const byPaymentDate = deductionWorkflowScope.month || deductionWorkflowScope.dueStart || deductionWorkflowScope.dueEnd;
  const eligible = new Set(deductionFilteredHistory(deductionState.records, byPaymentDate ? { ...filters, periodStart: '', periodEnd: '' } : filters).map(record => record.id));
  return deductionHistoryGroups(deductionState.records).filter(group => {
    const groupStage = window.LedgerHistoryWorkflow.batchStage(group.records);
    if (stage !== 'all' && stage !== groupStage) return false;
    return group.records.some(record => eligible.has(record.id) && deductionHistoryProgress(record).items.some((item, index, items) => {
      if (!window.LedgerHistoryWorkflow.installmentMatches(item, index, items.length, deductionWorkflowScope)) return stage === 'all' && !deductionWorkflowScope.installment && !deductionWorkflowScope.progress && !deductionWorkflowScope.month && !deductionWorkflowScope.dueStart && !deductionWorkflowScope.dueEnd && ['cancelled', 'reversed'].includes(item.status);
      const option = deductionHistoryPaymentOptions({ records: [record] }).find(option => option.index === index);
      return !filters.timing || filters.timing === 'complete' ? !filters.timing || deductionRecordMatchesPaymentState(record, 'complete') : option?.state === filters.timing;
    }));
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function deductionWorkflowControls(view, filters) {
  let host = view.querySelector('[data-deduction-workflow]');
  if (!host) { host = document.createElement('section'); host.className = 'deduction-workflow-controls'; host.dataset.deductionWorkflow = ''; view.querySelector('.deduction-history-toolbar').before(host); }
  const maximum = Math.max(1, ...deductionState.records.map(record => deductionHistoryProgress(record).items.length));
  const toolbar = view.querySelector('.deduction-history-toolbar');
  let advanced = view.querySelector('[data-history-more]');
  if (!advanced) {
    advanced = document.createElement('details');
    advanced.dataset.historyMore = '';
    advanced.innerHTML = '<summary>More filters</summary><div class="deduction-workflow-filters" data-history-advanced></div>';
    toolbar.after(advanced);
    const container = advanced.querySelector('[data-history-advanced]');
    for (const selector of ['[data-deduction-history-status]', '[data-deduction-history-timing]', '[data-deduction-history-month]']) {
      const control = toolbar.querySelector(selector);
      if (control) container.append(control.closest('label'));
    }
    const range = toolbar.querySelector('[data-deduction-history-range-host]');
    if (range) container.append(range);
  }
  host.innerHTML = '<nav aria-label="Deduction history views">' + [['active','Active requests'],['completed','Completed requests'],['all','All history']].map(([key,label]) => '<button type="button" data-history-stage="' + key + '" aria-pressed="' + (deductionWorkflowScope.tab === key) + '">' + label + ' <span>' + deductionWorkflowGroups(filters, key).length + '</span></button>').join('') + '</nav><p>' + deductionState.records.length + ' saved deduction records across ' + deductionHistoryGroups(deductionState.records).length + ' requests. Tab counts follow the current filters.</p>';
  let primary = toolbar.querySelector('[data-history-primary]');
  if (!primary) {
    primary = document.createElement('div');
    primary.dataset.historyPrimary = '';
    primary.className = 'deduction-workflow-filters';
    toolbar.append(primary);
  }
  primary.innerHTML = '<label>Payment number<select data-history-installment><option value="">All payment numbers</option><option value="single">1/1 only</option><option value="later">Payment 2 onwards</option><option value="final">Final installment</option>' + Array.from({ length: maximum }, (_, index) => '<option value="exact:' + (index + 1) + '">Payment ' + (index + 1) + '</option>').join('') + '</select></label><label>Progress<select data-history-progress><option value="">All progress</option><option value="statement">Awaiting statement</option><option value="reconciliation">Awaiting reconciliation</option><option value="completed">Completed</option></select></label><label>Payment month<input type="month" data-history-payment-month value="' + esc(deductionWorkflowScope.month) + '"></label>';
  primary.querySelector('[data-history-installment]').value = deductionWorkflowScope.installment;
  primary.querySelector('[data-history-progress]').value = deductionWorkflowScope.progress;
  let dates = advanced.querySelector('[data-history-dates]');
  if (!dates) {
    dates = document.createElement('div'); dates.dataset.historyDates = ''; dates.className = 'deduction-workflow-filters'; advanced.append(dates);
  }
  dates.innerHTML = '<label>Due from<input type="date" data-history-due-start value="' + esc(deductionWorkflowScope.dueStart) + '"></label><label>Due through<input type="date" data-history-due-end value="' + esc(deductionWorkflowScope.dueEnd) + '"></label><button type="button" data-history-due-preset="month">This month</button><button type="button" data-history-due-preset="week">This week</button><button type="button" data-history-due-preset="next">Next week</button><button type="button" data-history-due-preset="all">All payment dates</button>';
  const advancedCount = [filters.status, filters.timing, filters.month, filters.periodStart || filters.periodEnd, deductionWorkflowScope.dueStart || deductionWorkflowScope.dueEnd].filter(Boolean).length;
  advanced.querySelector('summary').textContent = 'More filters' + (advancedCount ? ' · ' + advancedCount + ' active' : '');

}
function deductionWorkflowPaymentMarkup(group, record, selected) {
  const items = deductionHistoryProgress(record).items;
  const completed = items.filter(window.LedgerHistoryWorkflow.installmentCompleted).length;
  const matches = items.map((item, index) => ({ item, index })).filter(({item,index}) => window.LedgerHistoryWorkflow.installmentMatches(item, index, items.length, deductionWorkflowScope));
  const filtered = deductionWorkflowScope.progress || deductionWorkflowScope.installment || deductionWorkflowScope.month || deductionWorkflowScope.dueStart || deductionWorkflowScope.dueEnd;
  let markup = '<div class="deduction-reconciliation"><strong>' + completed + ' of ' + items.length + ' completed</strong>';
  if (filtered) markup += '<small>' + (matches.length ? 'Matches: ' + matches.map(({item,index}) => 'Payment ' + (index + 1) + '/' + items.length + ' (' + deductionDateLabel(item.dueDate) + ')').join(' · ') : 'No matching installment — kept visible for context') + '</small>';
  if (selected) {
    const done = window.LedgerHistoryWorkflow.installmentCompleted(selected.item), active = selected.item.status === 'applied' && !['cancelled','rejected','reversed'].includes(record.status);
    const single = selected.count === 1;
    const remaining = selected.count - selected.index - 1;
    const badge = 'Payment ' + (selected.index + 1) + '/' + selected.count + ' · ' + (remaining ? remaining + ' payment' + (remaining === 1 ? '' : 's') + ' after this' : 'Final payment') + (done ? ' · Completed' : ' · ' + (selected.item.statementSentAt ? 'Awaiting reconciliation' : 'Awaiting statement'));
    const completionBlocked = !done && (selected.item.dueDate > deductionToday() || single && !selected.item.statementSentAt);
    const completionTitle = selected.item.dueDate > deductionToday() ? 'Available on or after the installment due date' : single && !selected.item.statementSentAt ? 'Download the PDF first to record the statement download' : '';
    markup += '<span class="deduction-progress-badge' + (done ? ' is-completed' : '') + '">' + badge + '</span>';
    if (active) markup += '<button type="button" data-history-reconcile="' + (done ? 'reopen' : 'complete') + '" data-history-payment-index="' + selected.index + '"' + (completionBlocked ? ' disabled title="' + completionTitle + '"' : '') + '>' + (done ? 'Reopen installment' : 'Confirm installment completed') + '</button>';
    if (active && !done && !selected.item.statementSentAt) markup += '<details><summary>Statement actions</summary><button type="button" data-history-mark-sent data-history-payment-index="' + selected.index + '"' + (selected.item.dueDate > deductionToday() ? ' disabled title="This payment is upcoming"' : '') + '>Confirm statement handled manually</button></details>';
    if (done) markup += '<small>Completed by ' + esc(selected.item.completion.by) + ' · ' + esc(formatGrafanaTimestamp(selected.item.completion.changedAt)) + '. Tick Include in PDF to reprint.</small>';
  }
  return markup + '</div>';
}
async function deductionWorkflowAction(button) {
  const id = button.closest('[data-deduction-record-id]')?.dataset.deductionRecordId;
  const record = deductionState.records.find(record => record.id === id), index = Number(button.dataset.historyPaymentIndex), item = record?.installments?.[index];
  if (!item) return;
  const sending = button.hasAttribute('data-history-mark-sent'), reopening = button.dataset.historyReconcile === 'reopen';
  const dialog = deductionDialog(sending ? 'Confirm statement sent' : reopening ? 'Reopen installment' : 'Confirm installment completed');
  const body = dialog.querySelector('[data-deduction-body]');
  body.innerHTML = '<h3>' + esc(record.rider) + '</h3><p>' + esc(record.reference) + ' · ' + esc(deductionTypes[record.type]) + ' · Payment ' + (index + 1) + '/' + record.installments.length + ' · ' + esc(deductionMoney(deductionInstallmentAmount(record, item))) + ' · Due ' + esc(deductionDateLabel(item.dueDate)) + '</p><p>' + (sending ? 'Confirm that the statement was actually sent to the rider. Downloading alone does not send it.' : reopening ? 'This returns the installment to active follow-up. It does not reverse the financial deduction. The previous completion remains in the audit trail.' : 'Confirm that this installment was reconciled against the rider payout. This records completion only; it does not deduct the amount again.') + '</p><form class="deduction-form"><label class="deduction-wide">' + (reopening ? 'Reopening reason' : 'Finance note') + '<textarea name="reason" required maxlength="2000" rows="3"></textarea></label><label class="deduction-wide"><input type="checkbox" required> I have verified the selected rider and installment.</label><div class="deduction-wide"><p role="alert" data-completion-feedback></p><button type="submit">' + (sending ? 'Confirm sent' : reopening ? 'Reopen installment' : 'Confirm completion') + '</button></div></form>';
  const form = body.querySelector('form'), feedback = body.querySelector('[data-completion-feedback]');
  const requestId = crypto.randomUUID();
  const expectedCompletionAt = item.completion?.version || item.completion?.changedAt || '';
  form.addEventListener('submit', async event => {
    event.preventDefault(); const submit = form.querySelector('button'); submit.disabled = true;
    try {
      const saved = await deductionRequest(sending ? '/mark-sent' : reopening ? '/reopen-installment' : '/complete-installment', { recordId: id, installmentIndex: index, expectedCompletionAt, expectedDueDate: item.dueDate, expectedAmountCents: deductionInstallmentAmount(record, item), expectedInstallmentCount: record.installments.length, reconciled: !reopening, reason: form.elements.reason.value, requestId });
      feedback.textContent = saved.backupWarning || 'Saved. Refreshing history…';
      await deductionLoad(); deductionHistoryRender();
      feedback.textContent = saved.backupWarning || 'Saved successfully. Close this dialog to continue.';
      form.querySelectorAll('input,textarea').forEach(input => input.disabled = true);
    } catch (error) { feedback.textContent = error.message; submit.disabled = false; }
  });
}
