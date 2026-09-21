// Read-only installment aggregation. Completion uses the History reconciliation rule.
const deductionExposureScope = { month: '', installment: '', progress: '', metric: 'amount' };
const deductionExposureStages = { statement: 'Awaiting statement', reconciliation: 'Awaiting reconciliation', completed: 'Completed' };
function deductionExposureRows(records, scope) {
  const rows = [];
  for (const record of records) {
    if (['cancelled', 'rejected', 'reversed'].includes(record.status)) continue;
    const items = deductionHistoryProgress(record).items;
    items.forEach((item, index) => {
      if (!window.LedgerHistoryWorkflow.installmentMatches(item, index, items.length, scope)) return;
      const stage = window.LedgerHistoryWorkflow.installmentCompleted(item) ? 'completed' : item.statementSentAt ? 'reconciliation' : 'statement';
      rows.push({ type: record.type, stage, cents: deductionInstallmentAmount(record, item) });
    });
  }
  return rows;
}
function deductionExposureChart() {
  const scope = deductionExposureScope;
  const rows = deductionState.loaded ? deductionExposureRows(deductionState.records, scope) : [];
  const amount = scope.metric === 'amount';
  const measure = row => amount ? row.cents : 1;
  const label = value => amount ? deductionMoney(value) : formatNumber(value) + ' payments';
  const groups = Object.entries(deductionTypes).map(([type, name]) => ({ type, name, totals: Object.fromEntries(Object.keys(deductionExposureStages).map(stage => [stage, rows.filter(row => row.type === type && row.stage === stage).reduce((sum, row) => sum + measure(row), 0)])) }));
  const maximum = Math.max(1, ...groups.map(group => Object.values(group.totals).reduce((sum, value) => sum + value, 0)));
  const options = (values, selected) => values.map(([value, text]) => `<option value="${esc(value)}"${selected === value ? ' selected' : ''}>${esc(text)}</option>`).join('');
  const maxPayment = Math.max(1, ...deductionState.records.map(record => deductionHistoryProgress(record).items.length));
  const controls = `<div class="deduction-exposure-filters"><label>Payment month<input type="month" data-exposure-field="month" value="${esc(scope.month)}"></label><label>Payment number<select data-exposure-field="installment">${options([['','All payments'],['single','1/1 only'],['later','Payment 2 onwards'],['final','Final installment'], ...Array.from({length:maxPayment}, (_,i) => ['exact:'+(i+1),'Payment '+(i+1)])],scope.installment)}</select></label><label>Progress<select data-exposure-field="progress">${options([['','All progress'],...Object.entries(deductionExposureStages)],scope.progress)}</select></label><label>Show<select data-exposure-field="metric">${options([['amount','Amount (RM)'],['count','Payment count']],scope.metric)}</select></label><button type="button" data-exposure-reset>Reset</button></div>`;
  const bars = groups.map(group => `<div class="deduction-exposure-row"><div><strong>${esc(group.name)}</strong><span>${esc(label(Object.values(group.totals).reduce((sum,value) => sum+value,0)))}</span></div><div class="deduction-exposure-track">${Object.entries(group.totals).filter(([,value]) => value > 0).map(([stage,value]) => `<button type="button" class="deduction-exposure-segment is-${stage}" style="width:${value/maximum*100}%" data-exposure-type="${esc(group.type)}" data-exposure-stage="${stage}" title="${esc(group.name+' · '+deductionExposureStages[stage]+': '+label(value))}" aria-label="${esc('Open History: '+group.name+' · '+deductionExposureStages[stage]+': '+label(value))}"></button>`).join('')}</div><div class="deduction-exposure-values">${Object.entries(group.totals).map(([stage,value]) => `<button type="button" data-exposure-type="${esc(group.type)}" data-exposure-stage="${stage}" ${value ? '' : 'disabled'}><i class="is-${stage}"></i>${esc(deductionExposureStages[stage])}: ${esc(label(value))}</button>`).join('')}</div></div>`).join('');
  const body = !deductionState.loaded ? `<div class="empty-state" role="status">${esc(deductionState.error || 'Loading deduction history…')}<button type="button" data-exposure-retry>Retry</button></div>` : !rows.length ? '<div class="empty-state">No installments match these payment filters.</div>' : `<div class="deduction-exposure-summary"><span>Outstanding in scope<strong>${esc(label(rows.filter(row => row.stage !== 'completed').reduce((sum,row) => sum+measure(row),0)))}</strong></span><span>Completed in scope<strong>${esc(label(rows.filter(row => row.stage === 'completed').reduce((sum,row) => sum+measure(row),0)))}</strong></span></div>${bars}`;
  return `<section class="secondary-visual finance-visual deduction-exposure" data-visual-key="commission-main:trend" data-default-columns="4" data-min-height="360" aria-label="Deduction Exposure by Installment Progress"><div class="secondary-visual-head"><div><strong>Deduction Exposure by Installment Progress</strong><span>Full Deduction History · ${scope.month ? esc(scope.month) : 'All payment months'}</span></div></div>${controls}${body}<p class="commission-status-note">Each installment is counted once. Outstanding includes upcoming payments. Statement recorded/downloaded is not confirmed payment completion. Final installments remain outstanding until completed. Click a bar or value to open matching History requests; other deductions may remain visible for context. Commission dashboard filters do not change this chart.</p></section>`;
}
document.addEventListener('change', event => {
  const field = event.target.dataset?.exposureField;
  if (!Object.hasOwn(deductionExposureScope, field)) return;
  deductionExposureScope[field] = event.target.value;
  render();
});
document.addEventListener('click', async event => {
  if (event.target.closest('[data-exposure-reset]')) { Object.assign(deductionExposureScope, {month:'',installment:'',progress:'',metric:'amount'}); render(); return; }
  if (event.target.closest('[data-exposure-retry]')) { try { await deductionLoad(); } catch {} render(); return; }
  const button = event.target.closest('[data-exposure-type]');
  if (!button) return;
  const type = button.dataset.exposureType, progress = button.dataset.exposureStage;
  await deductionHistoryOpen();
  const view = document.getElementById('deductionHistoryView');
  if (!view) return;
  // Clear unrelated History filters so a click cannot silently hide chart matches.
  view.querySelectorAll('.deduction-history-toolbar input, .deduction-history-toolbar select, [data-history-more] input, [data-history-more] select').forEach(control => { control.value = ''; });
  Object.assign(deductionWorkflowScope, {tab:'all',month:deductionExposureScope.month,installment:deductionExposureScope.installment,progress,dueStart:'',dueEnd:''});
  view.querySelector('[data-deduction-history-type]').value = type;
  deductionHistoryRender();
});
