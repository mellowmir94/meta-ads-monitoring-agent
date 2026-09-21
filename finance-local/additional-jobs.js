// Additional earnings are separate from deduction records and source order rows.
const additionalJobsState = { jobs: [], loaded: false, loading: null, error: '' };
const additionalJobDrafts = new Map();
async function additionalJobsLoad(force = false) {
  if (additionalJobsState.loading) return additionalJobsState.loading;
  if (additionalJobsState.loaded && !force) return additionalJobsState.jobs;
  additionalJobsState.loading = (async () => {
    const jobs = [], seen = new Set(); let next = '';
    do {
      const response = await deductionRequest('/jobs' + (next ? '?after=' + encodeURIComponent(next) : ''));
      if (!Array.isArray(response.jobs)) throw new Error('Additional Jobs could not be loaded. Retry before exporting.');
      jobs.push(...response.jobs); next = response.next || '';
      if (next && seen.has(next)) throw new Error('Additional Jobs register is incomplete.');
      seen.add(next);
    } while (next);
    Object.assign(additionalJobsState, {jobs,loaded:true,error:''}); return jobs;
  })().catch(error => { additionalJobsState.loaded=false; additionalJobsState.error=error.message; throw error; }).finally(() => { additionalJobsState.loading=null; });
  return additionalJobsState.loading;
}
function additionalJobsForScope(rider, start, end) {
  const key = deductionRiderKey(rider);
  return additionalJobsState.jobs.filter(job => job.riderKey === key && job.periodStart >= start && job.periodEnd <= end);
}
function additionalJobDraft(id, rider, dates) {
  const scope = [rider.key,dates.start,dates.end].join('|');
  if (additionalJobDrafts.get(id)?.scope !== scope) additionalJobDrafts.set(id,{scope,enabled:false,rows:[],saving:false});
  const draft=additionalJobDrafts.get(id);
  if(additionalJobsState.loaded&&!draft.baseline){
    const saved=additionalJobsForScope(rider.rider,String(dates.start||'').slice(0,10),String(dates.end||'').slice(0,10));
    draft.baseline=saved.map(job=>({id:job.id,amountCents:job.amountCents,description:job.description}));
    if(!draft.rows.length)draft.rows=saved.map(job=>({id:job.id,description:job.description,amount:(job.amountCents/100).toFixed(2),saved:true}));
  }
  return draft;
}
function additionalJobsMarkup(id, rider, dates, summary) {
  const draft = additionalJobDraft(id,rider,dates), start=String(dates.start||'').slice(0,10), end=String(dates.end||'').slice(0,10);
  const saved = additionalJobsForScope(rider.rider,start,end), cents=saved.reduce((sum,job)=>sum+job.amountCents,0);
  return `<section class="additional-jobs" data-additional-table="${esc(id)}"><label class="deduction-inline-choice"><input type="checkbox" data-additional-toggle ${draft.enabled?'checked':''} ${rider.valid?'':'disabled'}><strong>Additional Job</strong></label><p>Extra jobs outside Line Item Audit. Add a description/reference and RM amount for each job. Save overwrites the saved jobs for this rider and period with exactly the rows shown. Use + Add row for a separate job.</p><div data-additional-editor ${draft.enabled?'':'hidden'}>${additionalJobsEditor(draft)}</div><p data-additional-feedback role="status">${esc(additionalJobsState.error || (!additionalJobsState.loaded?'Loading saved additional jobs…':`${saved.length} saved jobs · ${deductionMoney(cents)} additional commission`))}</p><strong>Statement preview: ${additionalJobsState.loaded && summary.loaded ? esc(deductionMoney(summary.grossCents)+' + '+deductionMoney(cents)+' − '+deductionMoney(Object.values(summary.statementAmounts).reduce((s,n)=>s+n,0))+' = '+deductionMoney(summary.grossCents+cents-Object.values(summary.statementAmounts).reduce((s,n)=>s+n,0))) : 'Loading…'}</strong><small>Line Item Audit commission + saved Additional Jobs − statement deductions. Unsaved rows are not included.</small></section>`;
}
function additionalJobsEditor(draft) {
  const rows=draft.rows.map((row,index)=>{
    const locked=Boolean(draft.payload);
    return `<div class="additional-job-row" data-job-row="${esc(row.id)}"><span>${index+1}</span><label>Job description / reference<input data-job-description maxlength="500" value="${esc(row.description)}" ${locked?'readonly':''}></label><label>Amount (RM)<span class="additional-job-money"><span aria-hidden="true">RM</span><input data-job-amount type="number" inputmode="decimal" placeholder="0.00" step="0.01" min="0.01" max="1000000" value="${esc(row.amount)}" ${locked?'readonly':''}></span></label>${locked?'<span>Retry to confirm save</span>':'<button type="button" data-job-remove aria-label="Remove job '+(index+1)+'">Remove</button>'}</div>`;
  }).join('');
  return `<fieldset ${draft.saving?'disabled':''}><div class="additional-job-rows">${rows}</div><div class="additional-job-actions"><button type="button" data-job-add>+ Add row</button><button type="button" data-job-save>Save Additional Jobs</button></div></fieldset>`;
}
function additionalJobsCanProceed(id) {
  const draft=additionalJobDrafts.get(id),pending=draft?.rows.filter(row=>!row.saved)||[];
  return Boolean(draft?.enabled&&!draft.saving&&pending.length&&pending.every(row=>row.description.trim()&&/^\d+(\.\d{1,2})?$/.test(row.amount)&&Number(row.amount)>0&&Number(row.amount)<=1000000));
}
function additionalJobsHistoryCell(jobs) {
  if(!jobs.length)return '—';
  return '<strong style="color:var(--success)">+ '+esc(deductionMoney(jobs.reduce((sum,job)=>sum+job.amountCents,0)))+'</strong><small>'+jobs.length+' additional job'+(jobs.length===1?'':'s')+' · earnings, not deductions</small><details><summary>View jobs</summary>'+jobs.map(job=>'<p><strong>'+esc(job.reference)+'</strong><br>'+esc(job.description)+'<br>+ '+esc(deductionMoney(job.amountCents))+'</p>').join('')+'</details>';
}
function additionalJobsHistoryRender(view) {
  if(!view)return;
  view.querySelector('[data-additional-history]')?.remove();
  view.querySelectorAll('[data-additional-only-row]').forEach(row=>row.remove());
  const body=view.querySelector('[data-deduction-history-body]');if(!body||!deductionState.loaded)return;
  const filters=deductionHistoryFilters(view),scope=deductionWorkflowScope,used=new Set();
  const allGroups=deductionHistoryGroups(deductionState.records);
  const matching=(group,job)=>deductionRiderKey(group.rider)===job.riderKey&&group.periodStart===job.periodStart&&group.periodEnd===job.periodEnd;
  for(const row of body.querySelectorAll('[data-deduction-batch-id]')){
    const group=allGroups.find(group=>group.id===row.dataset.deductionBatchId),cell=row.querySelector('[data-additional-history-cell]');
    const jobs=group?additionalJobsState.jobs.filter(job=>matching(group,job)&&!used.has(job.reference)):[];
    jobs.forEach(job=>used.add(job.reference));
    if(cell)cell.innerHTML=additionalJobsState.loaded?additionalJobsHistoryCell(jobs):esc(additionalJobsState.error||'Loading jobs…');
  }
  // Job-only scopes have no deduction batch. Keep them in the same table without
  // manufacturing deductions, payment schedules, completion flags or delete actions.
  if(scope.tab==='completed'||scope.installment||scope.progress||scope.dueStart||scope.dueEnd||filters.type||filters.status||filters.timing||filters.month)return;
  const standalone=additionalJobsState.jobs.filter(job=>!allGroups.some(group=>matching(group,job))&&
    (!filters.search||deductionRiderKey([job.rider,job.reference,job.description].join(' ')).includes(filters.search))&&
    (!filters.periodStart||job.periodStart>=filters.periodStart)&&(!filters.periodEnd||job.periodEnd<=filters.periodEnd)&&
    (!scope.month||job.periodStart.slice(0,7)<=scope.month&&job.periodEnd.slice(0,7)>=scope.month));
  const grouped=new Map();
  for(const job of standalone){const key=[job.riderKey,job.periodStart,job.periodEnd].join('|');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(job);}
  let number=body.querySelectorAll('tr').length;
  for(const jobs of grouped.values()){
    const job=jobs[0],row=document.createElement('tr');row.setAttribute('data-additional-only-row','');
    row.innerHTML='<td>'+(++number)+'</td><td>—</td><td><strong>'+esc(job.rider)+'</strong><small>Additional Jobs only</small></td>'+ '<td>—</td>'.repeat(4)+'<td>'+additionalJobsHistoryCell(jobs)+'</td><td><small>Included in rider Excel/PDF statements from Commission Rider.</small></td><td>'+esc(job.periodStart+' - '+job.periodEnd)+'</td><td>'+esc(deductionMoney(0))+'</td><td>—</td><td>Saved earnings</td><td>'+esc(job.createdBy||'')+'</td>';
    body.append(row);
  }
  if(grouped.size){view.querySelector('[data-deduction-history-empty]').hidden=true;view.querySelector('[data-deduction-history-feedback]').textContent+=' '+grouped.size+' Additional Job-only rider period'+(grouped.size===1?'':'s')+' shown separately; deduction counts are unchanged.';}
}
document.addEventListener('input', event => {
  const row=event.target.closest?.('[data-job-row]'), host=row?.closest('[data-additional-table]'); if(!host)return;
  const draft=additionalJobDrafts.get(host.dataset.additionalTable), item=draft?.rows.find(item=>item.id===row.dataset.jobRow);
  if(item&&!draft.payload&&!draft.saving){item.description=row.querySelector('[data-job-description]').value;item.amount=row.querySelector('[data-job-amount]').value;item.saved=false;}
  deductionUpdateInline(host.closest('.deduction-workspace'));
});
document.addEventListener('change',event=>{
  if(!event.target.matches?.('[data-additional-toggle]'))return;
  const host=event.target.closest('[data-additional-table]'),draft=additionalJobDrafts.get(host.dataset.additionalTable);
  draft.enabled=event.target.checked;
  if(draft.enabled&&!draft.rows.length)draft.rows.push({id:crypto.randomUUID(),description:'Additional Job',amount:''});
  const editor=host.querySelector('[data-additional-editor]');editor.hidden=!draft.enabled;editor.innerHTML=additionalJobsEditor(draft);
  deductionUpdateInline(host.closest('.deduction-workspace'));
});
document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-job-add],[data-job-remove],[data-job-save]');if(!button)return;
  const host=button.closest('[data-additional-table]'),id=host.dataset.additionalTable,draft=additionalJobDrafts.get(id),editor=host.querySelector('[data-additional-editor]'),feedback=host.querySelector('[data-additional-feedback]');
  if(draft.saving||draft.payload&&!button.hasAttribute('data-job-save'))return;
  if(button.hasAttribute('data-job-add')){draft.rows.push({id:crypto.randomUUID(),description:'Additional Job',amount:''});editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));return;}
  if(button.hasAttribute('data-job-remove')){draft.rows=draft.rows.filter(row=>row.id!==button.closest('[data-job-row]').dataset.jobRow);draft.rows.forEach(row=>row.saved=false);editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));return;}
  await additionalJobsSave(host);
});

async function additionalJobsSave(host) {
  const id=host.dataset.additionalTable,draft=additionalJobDrafts.get(id),editor=host.querySelector('[data-additional-editor]'),feedback=host.querySelector('[data-additional-feedback]');
  if(draft.saving)return false;
  const pending=draft.rows,rider=deductionSingleRider(deductionRows(id,true)),dates=auditCapture(id)?.scope?.dates||{};
  if(!pending.length){feedback.textContent='All entered jobs are already saved. Use + Add row for another job.';return;}
  if(!rider.valid||draft.scope!==[rider.key,dates.start,dates.end].join('|')){feedback.textContent='Rider or period changed. Review the selection first.';return;}
  if(!pending.length||pending.some(row=>!row.description.trim()||!/^\d+(\.\d{1,2})?$/.test(row.amount)||Number(row.amount)<=0||Number(row.amount)>1000000)){feedback.textContent='Enter a description and RM0.01–RM1,000,000 (up to 2 decimals) for every new job.';return;}
  draft.saving=true;editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));let warning='';
  try {
    // One atomic replacement makes the saved total equal exactly these boxes.
    // Retain the same request on uncertain retries; previous versions stay audited.
    draft.payload ||= {requestId:crypto.randomUUID(),rider:rider.rider,periodStart:String(dates.start).slice(0,10),periodEnd:String(dates.end).slice(0,10),expectedJobs:draft.baseline||[],rows:pending.map(row=>({description:row.description.trim(),amount:row.amount}))};
    const result=await deductionRequest('/save-jobs',draft.payload);
    warning=result.backupWarning||'';
    draft.rows=result.jobs.map(job=>({id:job.id,description:job.description,amount:(job.amountCents/100).toFixed(2),saved:true}));
    draft.baseline=result.jobs.map(job=>({id:job.id,description:job.description,amountCents:job.amountCents}));draft.payload=null;
    await additionalJobsLoad(true);deductionStatementPayloadCache.clear();draft.saving=false;render();
    const current=document.querySelector('[data-additional-table="'+id+'"] [data-additional-feedback]');if(current)current.textContent=warning||'Additional Jobs saved in History and included in rider Excel/PDF statements.';
    return true;
  }catch(error){feedback.textContent=error.message+' Saved rows are preserved. Retry to continue without duplicates.';}
  finally{draft.saving=false;if(editor.isConnected){editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));}}
}
