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
  return additionalJobDrafts.get(id);
}
function additionalJobsMarkup(id, rider, dates, summary) {
  const draft = additionalJobDraft(id,rider,dates), start=String(dates.start||'').slice(0,10), end=String(dates.end||'').slice(0,10);
  const saved = additionalJobsForScope(rider.rider,start,end), cents=saved.reduce((sum,job)=>sum+job.amountCents,0);
  return `<section class="additional-jobs" data-additional-table="${esc(id)}"><label class="deduction-inline-choice"><input type="checkbox" data-additional-toggle ${draft.enabled?'checked':''} ${rider.valid?'':'disabled'}><strong>Additional Job</strong></label><p>Extra jobs outside Line Item Audit. Add a description/reference and RM amount for each job. Save jobs separately before exporting.</p><div data-additional-editor ${draft.enabled?'':'hidden'}>${additionalJobsEditor(draft)}</div><p data-additional-feedback role="status">${esc(additionalJobsState.error || (!additionalJobsState.loaded?'Loading saved additional jobs…':`${saved.length} saved jobs · ${deductionMoney(cents)} additional commission`))}</p><strong>Statement preview: ${additionalJobsState.loaded && summary.loaded ? esc(deductionMoney(summary.grossCents)+' + '+deductionMoney(cents)+' − '+deductionMoney(Object.values(summary.statementAmounts).reduce((s,n)=>s+n,0))+' = '+deductionMoney(summary.grossCents+cents-Object.values(summary.statementAmounts).reduce((s,n)=>s+n,0))) : 'Loading…'}</strong><small>Line Item Audit commission + saved Additional Jobs − statement deductions. Unsaved rows are not included.</small></section>`;
}
function additionalJobsEditor(draft) {
  const rows=draft.rows.map((row,index)=>{
    const locked=row.saved||Boolean(row.payload);
    return `<div class="additional-job-row" data-job-row="${esc(row.id)}"><span>${index+1}</span><label>Job description / reference<input data-job-description maxlength="500" value="${esc(row.description)}" ${locked?'readonly':''}></label><label>Amount (RM)<input data-job-amount type="number" inputmode="decimal" placeholder="RM 0.00" step="0.01" min="0.01" max="1000000" value="${esc(row.amount)}" ${locked?'readonly':''}></label>${row.saved?'<span>Saved</span>':locked?'<span>Retry to confirm save</span>':'<button type="button" data-job-remove aria-label="Remove job '+(index+1)+'">Remove</button>'}</div>`;
  }).join('');
  return `<fieldset ${draft.saving?'disabled':''}><div class="additional-job-rows">${rows}</div><div class="additional-job-actions"><button type="button" data-job-add>+ Add row</button><button type="button" data-job-save>Save Additional Jobs</button></div></fieldset>`;
}
function additionalJobsHistoryRender(view) {
  if (!view) return;
  let host=view.querySelector('[data-additional-history]');
  if (!host) { host=document.createElement('section'); host.dataset.additionalHistory=''; host.className='additional-jobs'; view.append(host); }
  const filters=deductionHistoryFilters(view), search=filters.search, month=deductionWorkflowScope.month;
  const jobs=additionalJobsState.jobs.filter(job => (!search || deductionRiderKey([job.rider,job.reference,job.description].join(' ')).includes(search)) && (!month || job.periodStart.slice(0,7)<=month && job.periodEnd.slice(0,7)>=month) && (!filters.periodStart || job.periodStart>=filters.periodStart) && (!filters.periodEnd || job.periodEnd<=filters.periodEnd));
  host.innerHTML='<h3>Additional Job History</h3><p>Separate earnings, not deductions. Uses rider search and commission period / payment month; deduction type and installment progress do not apply.</p>'+(!additionalJobsState.loaded?'<p>'+esc(additionalJobsState.error||'Loading…')+'</p>':'<p>'+jobs.length+' jobs · '+esc(deductionMoney(jobs.reduce((sum,job)=>sum+job.amountCents,0)))+'</p><div class="additional-job-history-table"><table><thead><tr><th>No.</th><th>Reference</th><th>Rider</th><th>Commission period</th><th>Job</th><th>Amount</th><th>Saved by</th></tr></thead><tbody>'+jobs.map((job,index)=>'<tr><td>'+(index+1)+'</td><td>'+esc(job.reference)+'</td><td>'+esc(job.rider)+'</td><td>'+esc(job.periodStart+' - '+job.periodEnd)+'</td><td>'+esc(job.description)+'</td><td>'+esc(deductionMoney(job.amountCents))+'</td><td>'+esc(job.createdBy+' · '+job.createdAt)+'</td></tr>').join('')+'</tbody></table></div>');
}
document.addEventListener('input', event => {
  const row=event.target.closest?.('[data-job-row]'), host=row?.closest('[data-additional-table]'); if(!host)return;
  const draft=additionalJobDrafts.get(host.dataset.additionalTable), item=draft?.rows.find(item=>item.id===row.dataset.jobRow);
  if(item&&!item.saved&&!item.payload&&!draft.saving){item.description=row.querySelector('[data-job-description]').value;item.amount=row.querySelector('[data-job-amount]').value;}
});
document.addEventListener('change',event=>{
  if(!event.target.matches?.('[data-additional-toggle]'))return;
  const host=event.target.closest('[data-additional-table]'),draft=additionalJobDrafts.get(host.dataset.additionalTable);
  draft.enabled=event.target.checked;
  if(draft.enabled&&!draft.rows.length)draft.rows.push({id:crypto.randomUUID(),description:'',amount:''});
  const editor=host.querySelector('[data-additional-editor]');editor.hidden=!draft.enabled;editor.innerHTML=additionalJobsEditor(draft);
});
document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-job-add],[data-job-remove],[data-job-save]');if(!button)return;
  const host=button.closest('[data-additional-table]'),id=host.dataset.additionalTable,draft=additionalJobDrafts.get(id),editor=host.querySelector('[data-additional-editor]'),feedback=host.querySelector('[data-additional-feedback]');
  if(draft.saving)return;
  if(button.hasAttribute('data-job-add')){draft.rows.push({id:crypto.randomUUID(),description:'',amount:''});editor.innerHTML=additionalJobsEditor(draft);return;}
  if(button.hasAttribute('data-job-remove')){draft.rows=draft.rows.filter(row=>row.id!==button.closest('[data-job-row]').dataset.jobRow);editor.innerHTML=additionalJobsEditor(draft);return;}
  const pending=draft.rows.filter(row=>!row.saved),rider=deductionSingleRider(deductionRows(id,true)),dates=auditCapture(id)?.scope?.dates||{};
  if(!pending.length){feedback.textContent='All entered jobs are already saved. Use + Add row for another job.';return;}
  if(!rider.valid||draft.scope!==[rider.key,dates.start,dates.end].join('|')){feedback.textContent='Rider or period changed. Review the selection first.';return;}
  if(!pending.length||pending.some(row=>!row.description.trim()||!/^\d+(\.\d{1,2})?$/.test(row.amount)||Number(row.amount)<=0||Number(row.amount)>1000000)){feedback.textContent='Enter a description and RM0.01–RM1,000,000 (up to 2 decimals) for every new job.';return;}
  draft.saving=true;editor.innerHTML=additionalJobsEditor(draft);let warning='';
  try {
    // Each row has its own idempotency key; a interrupted large save resumes safely.
    for(const row of pending){
      row.payload ||= {requestId:row.id,rider:rider.rider,periodStart:String(dates.start).slice(0,10),periodEnd:String(dates.end).slice(0,10),description:row.description.trim(),amount:row.amount};
      const result=await deductionRequest('/save-job',row.payload); row.saved=true;
    if(result.backupWarning)warning=result.backupWarning;
      feedback.textContent=draft.rows.filter(item=>item.saved).length+' jobs saved…';
    }
    await additionalJobsLoad(true);deductionStatementPayloadCache.clear();draft.saving=false;render();
    const current=document.querySelector('[data-additional-table="'+id+'"] [data-additional-feedback]');if(current)current.textContent=warning||'Additional Jobs saved in History and included in rider Excel/PDF statements.';
  }catch(error){feedback.textContent=error.message+' Saved rows are preserved. Retry to continue without duplicates.';}
  finally{draft.saving=false;if(editor.isConnected)editor.innerHTML=additionalJobsEditor(draft);}
});
