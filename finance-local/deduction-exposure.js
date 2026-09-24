// Read-only installment aggregation. Completion uses the History reconciliation rule.
const deductionExposureScope = { period: '', type: '', installment: '', progress: '', metric: 'amount' };
const deductionExposureStages = { statement: 'Awaiting statement', reconciliation: 'Awaiting reconciliation', completed: 'Completed' };
function deductionExposurePeriodScope(period) {
  if (!period) return {};
  if (period.startsWith('month:')) return { month: period.slice(6) };
  const today = deductionToday();
  if (period === 'this-month') return { month: today.slice(0, 7) };
  if (period === 'overdue') return { dueEnd: deductionAddDays(today, -1) };
  const week = deductionWeekBounds(today);
  if (period === 'this-week') return { dueStart: week.start, dueEnd: week.end };
  if (period === 'next-week') return { dueStart: deductionAddDays(week.start, 7), dueEnd: deductionAddDays(week.end, 7) };
  return {};
}
function deductionExposureRows(records, scope) {
  const rows = [];
  const paymentScope = { ...scope, ...deductionExposurePeriodScope(scope.period) };
  for (const record of records) {
    if (['cancelled', 'rejected', 'reversed'].includes(record.status)) continue;
    if (scope.type && record.type !== scope.type) continue;
    const items = deductionHistoryProgress(record).items;
    items.forEach((item, index) => {
      if (!window.LedgerHistoryWorkflow.installmentMatches(item, index, items.length, paymentScope)) return;
      const stage = window.LedgerHistoryWorkflow.installmentCompleted(item) ? 'completed' : item.statementSentAt ? 'reconciliation' : 'statement';
      if (scope.period === 'overdue' && stage === 'completed') return;
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
  const groups = Object.entries(deductionTypes).filter(([type]) => !scope.type || type === scope.type).map(([type, name]) => ({ type, name, totals: Object.fromEntries(Object.keys(deductionExposureStages).map(stage => [stage, rows.filter(row => row.type === type && row.stage === stage).reduce((sum, row) => sum + measure(row), 0)])) }));
  const options = (values, selected) => values.map(([value, text]) => `<option value="${esc(value)}"${selected === value ? ' selected' : ''}>${esc(text)}</option>`).join('');
  const maxPayment = Math.max(1, ...deductionState.records.map(record => deductionHistoryProgress(record).items.length));
  const months = [...new Set(deductionState.records.flatMap(record => deductionHistoryProgress(record).items.map(item => String(item.dueDate || '').slice(0, 7))).filter(month => /^\d{4}-\d{2}$/.test(month)))].sort().reverse();
  const periods = [['', 'All payment dates'], ['overdue', 'Overdue · outstanding'], ['this-week', 'Due this week'], ['next-week', 'Due next week'], ['this-month', 'Due this month'], ...months.map(month => ['month:' + month, month])];
  const controls = `<div class="deduction-exposure-filter-head"><strong>Focus payments</strong><button type="button" data-exposure-reset>Reset filters</button></div><div class="deduction-exposure-filters"><label>Due period<select data-exposure-field="period">${options(periods,scope.period)}</select></label><label>Deduction type<select data-exposure-field="type">${options([['','All deductions'],...Object.entries(deductionTypes)],scope.type)}</select></label><label>Payment number<select data-exposure-field="installment">${options([['','All payments'],['single','1/1 only'],['later','Payment 2 onwards'],['final','Final installment'], ...Array.from({length:maxPayment}, (_,i) => ['exact:'+(i+1),'Payment '+(i+1)])],scope.installment)}</select></label><label>Progress<select data-exposure-field="progress">${options([['','All progress'],...Object.entries(deductionExposureStages)],scope.progress)}</select></label><label>Measure<select data-exposure-field="metric">${options([['amount','Amount (RM)'],['count','Payment count']],scope.metric)}</select></label></div>`;
  const bars = groups.map(group => {
    const total = Object.values(group.totals).reduce((sum,value) => sum+value,0);
    const stageRows = Object.entries(group.totals);
    return `<article class="deduction-exposure-row" data-deduction-type="${esc(group.type)}"><div class="deduction-exposure-row-head"><strong>${esc(group.name)}</strong><span>${esc(label(total))}</span></div><div class="deduction-exposure-track" role="group" aria-label="${esc(group.name)} payment progress">${total ? stageRows.filter(([,value]) => value > 0).map(([stage,value]) => `<button type="button" class="deduction-exposure-segment is-${stage}" style="width:${value/total*100}%" data-exposure-type="${esc(group.type)}" data-exposure-stage="${stage}" title="${esc(group.name+' · '+deductionExposureStages[stage]+': '+label(value))}" aria-label="${esc('Open History: '+group.name+' · '+deductionExposureStages[stage]+': '+label(value))}"></button>`).join('') : '<span class="deduction-exposure-no-payments">No payments in scope</span>'}</div><div class="deduction-exposure-values">${stageRows.map(([stage,value]) => `<button type="button" data-exposure-type="${esc(group.type)}" data-exposure-stage="${stage}" ${value ? '' : 'disabled'}><i class="is-${stage}"></i><span>${esc(deductionExposureStages[stage])}</span><strong>${esc(label(value))}</strong></button>`).join('')}</div></article>`;
  }).join('');
  const body = !deductionState.loaded ? `<div class="empty-state" role="status">${esc(deductionState.error || 'Loading deduction history…')}<button type="button" data-exposure-retry>Retry</button></div>` : !rows.length ? '<div class="empty-state">No installments match these filters. Try another due period or reset the filters.</div>' : `<div class="deduction-exposure-summary"><span>Outstanding in scope<strong>${esc(label(rows.filter(row => row.stage !== 'completed').reduce((sum,row) => sum+measure(row),0)))}</strong></span><span>Completed in scope<strong>${esc(label(rows.filter(row => row.stage === 'completed').reduce((sum,row) => sum+measure(row),0)))}</strong></span></div><div class="deduction-exposure-groups">${bars}</div>`;
  return `<section class="secondary-visual finance-visual deduction-exposure" data-visual-key="commission-main:trend" data-default-columns="4" data-min-height="360" aria-label="Deduction Exposure by Installment Progress"><div class="secondary-visual-head"><div><strong>Deduction Exposure by Installment Progress</strong><span>Full Deduction History · Filter by payment due date, type and stage</span></div></div>${controls}${body}<p class="commission-status-note">Each bar shows the stage mix within one deduction type; compare amounts or counts above the bars. Click a segment or stage amount to open matching History payments. Statement download is not confirmed payment completion. Commission filters do not change this chart.</p></section>`;
}
document.addEventListener('change', event => {
  const field = event.target.dataset?.exposureField;
  if (!Object.hasOwn(deductionExposureScope, field)) return;
  deductionExposureScope[field] = event.target.value;
  render();
});
document.addEventListener('click', async event => {
  if (event.target.closest('[data-exposure-reset]')) { Object.assign(deductionExposureScope, {period:'',type:'',installment:'',progress:'',metric:'amount'}); render(); return; }
  if (event.target.closest('[data-exposure-retry]')) { try { await deductionLoad(); } catch {} render(); return; }
  const button = event.target.closest('[data-exposure-type]');
  if (!button) return;
  const type = button.dataset.exposureType, progress = button.dataset.exposureStage;
  await deductionHistoryOpen();
  const view = document.getElementById('deductionHistoryView');
  if (!view) return;
  // Clear unrelated History filters so a click cannot silently hide chart matches.
  view.querySelectorAll('.deduction-history-toolbar input, .deduction-history-toolbar select, [data-history-more] input, [data-history-more] select').forEach(control => { control.value = ''; });
  const periodScope = deductionExposurePeriodScope(deductionExposureScope.period);
  Object.assign(deductionWorkflowScope, {tab:'all',month:periodScope.month || '',installment:deductionExposureScope.installment,progress,dueStart:periodScope.dueStart || '',dueEnd:periodScope.dueEnd || ''});
  view.querySelector('[data-deduction-history-type]').value = type;
  deductionHistoryRender();
});
