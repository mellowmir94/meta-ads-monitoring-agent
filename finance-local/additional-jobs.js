// Additional earnings are separate from deduction records and source order rows.
const additionalJobsState = { jobs: [], loaded: false, loadedAt: 0, loading: null, error: '' };
const additionalJobDrafts = new Map();
const additionalJobsStatementCache = new Map();
async function additionalJobsLoad(force = false) {
  if (additionalJobsState.loading) return additionalJobsState.loading;
  // Downloads may call this immediately after History has already loaded the
  // same register. Reuse that fresh result instead of adding another request.
  if (additionalJobsState.loaded && (!force || Date.now() - additionalJobsState.loadedAt < 30000)) return additionalJobsState.jobs;
  additionalJobsState.loading = (async () => {
    const jobs = [], seen = new Set(); let next = '';
    do {
      const response = await deductionRequest('/jobs' + (next ? '?after=' + encodeURIComponent(next) : ''));
      if (!Array.isArray(response.jobs)) throw new Error('Additional Jobs could not be loaded. Retry before exporting.');
      jobs.push(...response.jobs); next = response.next || '';
      if (next && seen.has(next)) throw new Error('Additional Jobs register is incomplete.');
      seen.add(next);
    } while (next);
    Object.assign(additionalJobsState, {jobs,loaded:true,loadedAt:Date.now(),error:''}); return jobs;
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
  return `<fieldset ${draft.saving?'disabled':''}><div class="additional-job-rows">${rows}</div><div class="additional-job-actions"><button type="button" data-job-add>+ Add row</button><button type="button" data-job-save>Save Additional Jobs</button><button type="button" data-job-reset ${draft.payload&&!draft.payload.reset?'disabled':''}>${draft.payload?.reset?'Retry Reset':'Reset Additional Jobs'}</button></div></fieldset>`;
}
function additionalJobsCanProceed(id) {
  const draft=additionalJobDrafts.get(id),pending=draft?.rows||[];
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
  if(scope.tab==='completed'||scope.installment||scope.progress||scope.dueStart||scope.dueEnd||filters.type||(filters.status&&filters.status!=='applied')||filters.timing||filters.month)return;
  const standalone=additionalJobsState.jobs.filter(job=>!allGroups.some(group=>matching(group,job))&&
    (!filters.search||deductionRiderKey([job.rider,job.reference,job.description].join(' ')).includes(filters.search))&&
    (!filters.periodStart||job.periodStart>=filters.periodStart)&&(!filters.periodEnd||job.periodEnd<=filters.periodEnd)&&
    (!scope.month||job.periodStart.slice(0,7)<=scope.month&&job.periodEnd.slice(0,7)>=scope.month));
  const grouped=new Map();
  for(const job of standalone){const key=[job.riderKey,job.periodStart,job.periodEnd].join('|');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(job);}
  let number=body.querySelectorAll('tr').length;
  for(const jobs of grouped.values()){
    const job=jobs[0],row=document.createElement('tr');row.setAttribute('data-additional-only-row','');
    row.dataset.jobRider=job.rider;row.dataset.jobStart=job.periodStart;row.dataset.jobEnd=job.periodEnd;
    row.innerHTML='<td>'+(++number)+'</td><td>—</td><td><strong>'+esc(job.rider)+'</strong><small>Additional Jobs only</small></td>'+ '<td>—</td>'.repeat(4)+'<td>'+additionalJobsHistoryCell(jobs)+'</td><td class="deduction-history-download-cell"><div class="deduction-history-download-item"><strong>'+jobs.length+' Additional Job'+(jobs.length===1?'':'s')+'</strong><small>Ready to download</small><div><label><input type="checkbox" data-statement-file-format="pdf" checked> PDF</label> <label><input type="checkbox" data-statement-file-format="excel"> Excel</label></div><button type="button" data-additional-download>Download</button></div></td><td>'+esc(job.periodStart+' - '+job.periodEnd)+'</td><td>'+esc(deductionMoney(0))+'</td><td>—</td><td><span class="deduction-history-status applied">Applied</span></td><td>'+esc(job.createdBy||'')+'</td>';
    row.dataset.jobSelectionId='jobs:'+JSON.stringify([job.riderKey,job.periodStart,job.periodEnd]);
    row.cells[1].innerHTML='<input type="checkbox" data-deduction-history-select aria-label="Select '+esc(job.rider)+' request for Rider PDF"'+(deductionHistorySelected.has(row.dataset.jobSelectionId)?' checked':'')+'>';
    row.cells[1].className='deduction-export-check';
    row.cells[1].innerHTML='<div class="deduction-row-controls">'+row.cells[1].innerHTML+'<button type="button" data-additional-delete aria-label="Delete '+esc(job.rider)+' Additional Jobs" title="Delete Additional Jobs">×</button></div>';
    body.append(row);
  }
  if(grouped.size){view.querySelector('[data-deduction-history-empty]').hidden=true;view.querySelector('[data-deduction-history-feedback]').textContent+=' '+grouped.size+' Additional Job-only rider period'+(grouped.size===1?'':'s')+' shown separately; deduction counts are unchanged.';}
  deductionHistorySortNumbers(view);
}
// Job-only statements have no deduction installment to select or mark as sent.
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-additional-delete]');if(!button)return;
  const row=button.closest('[data-additional-only-row]'),rider=row.dataset.jobRider,periodStart=row.dataset.jobStart,periodEnd=row.dataset.jobEnd;
  const jobs=additionalJobsForScope(rider,periodStart,periodEnd);
  const expectedJobs=jobs.map(job=>({id:job.id,description:job.description,amountCents:job.amountCents}));
  const dialog=deductionDialog('Delete Additional Jobs'),body=dialog.querySelector('[data-deduction-body]');
  body.innerHTML='<form class="deduction-form deduction-delete-form"><strong>'+esc(rider)+'</strong><p>'+jobs.length+' Additional Jobs · '+esc(periodStart+' - '+periodEnd)+' · '+esc(deductionMoney(jobs.reduce((sum,job)=>sum+job.amountCents,0)))+'</p><p>Remove these jobs from active History and future statements? The audit history is retained. Existing downloaded files are unchanged.</p><label>4-digit deletion PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" required autocomplete="off"></label><p role="alert" data-deduction-error></p><button type="submit" class="deduction-danger-button">Delete Additional Jobs</button></form>';
  const form=body.querySelector('form'),submit=form.querySelector('[type="submit"]'),requestId=crypto.randomUUID();let busy=false;
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;busy=true;submit.disabled=true;
    const feedback=form.querySelector('[data-deduction-error]');feedback.textContent='Removing Additional Jobs…';
    try{
      const result=await deductionRequest('/delete-jobs',{rider,periodStart,periodEnd,expectedJobs,requestId,pin:form.elements.pin.value});
      for(const [id,draft] of additionalJobDrafts)if(draft.scope===[deductionRiderKey(rider),periodStart,periodEnd].join('|'))additionalJobDrafts.delete(id);
      deductionStatementPayloadCache.clear();additionalJobsStatementCache.clear();deductionHistorySelected.delete(row.dataset.jobSelectionId);
      additionalJobsState.loaded=false;
      await additionalJobsLoad(true);render();deductionHistoryRender();
      body.innerHTML='<p role="status">'+Number(result.deleted)+' Additional Jobs removed. Audit history retained.</p><button type="button" data-job-delete-done>Done</button>';
      body.querySelector('[data-job-delete-done]').onclick=()=>dialog.close();
    }catch(error){feedback.textContent=error.message;busy=false;submit.disabled=false;}
  };
});
async function additionalJobsStatementPayload(rider, start, end) {
  if(!rider||!start||!end)throw new Error('A rider and commission period are required.');
  const cacheKey=[deductionRiderKey(rider),start,end].join('|'),cached=additionalJobsStatementCache.get(cacheKey);
  if(cached&&Date.now()-cached.createdAt<30000)return cached.promise;
  const promise=additionalJobsFetchStatementPayload(rider,start,end).catch(error=>{additionalJobsStatementCache.delete(cacheKey);throw error;});
  additionalJobsStatementCache.set(cacheKey,{createdAt:Date.now(),promise});
  return promise;
}
async function additionalJobsFetchStatementPayload(rider, start, end) {
  const panel=panels.find(panel=>panel.id==='commission-main');
  const rows=(await deductionLoadStatementRows(panel,start,end)).filter(row=>deductionRiderKey(row.rider_name)===deductionRiderKey(rider));
  const columns=visibleTableColumns(panel).map(column=>({key:column.key,label:column.label,value:row=>row[column.key]}));
  const index=columns.findIndex(column=>column.key==='commission');
  if(index<0)throw new Error('The Commission Rider table has no commission column.');
  const gross=Math.round(rows.reduce((sum,row)=>sum+numberValue(row.commission),0)*100);
  const footer=(label,value)=>columns.map((_,i)=>i===0?label:i===index?value:'');
  const filename=rider.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,160)||'Rider';
  return {statementScope:{rider,start,end},panelTitle:'Commission Rider',title:rider,filename:filename+'-Commission-Statement',pdfFilename:filename+'-Commission-Statement.pdf',columns,rows,period:'Commission period: '+deductionPeriodLabel({start,end}),summary:{label:'Net Commission',value:deductionMoney(gross)},footerRows:[footer('Filtered total',deductionMoney(gross)),footer('TOTAL DEDUCTIONS',deductionMoney(0))]};
}
document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-additional-download]');if(!button||button.disabled)return;
  const row=button.closest('[data-additional-only-row]'),formats=[...row.querySelectorAll('[data-statement-file-format]:checked')].map(input=>input.dataset.statementFileFormat);
  await additionalJobsDownload(row,button,formats);
});
async function additionalJobsDownload(row,button,formats) {
  if(button.disabled)return;
  const originalLabel=button.textContent;
  if(!formats.length){deductionDownloadFeedback(button,'Select PDF, Excel, or both before downloading.');return;}
  button.disabled=true;button.textContent='Preparing…';button.setAttribute('aria-busy','true');
  try{
    const jobsReady=additionalJobsLoad(true);
    const [,raw]=await Promise.all([Promise.all(formats.map(ensureFinanceExportBundle)),additionalJobsStatementPayload(row.dataset.jobRider,row.dataset.jobStart,row.dataset.jobEnd),jobsReady,financePdfLogo().catch(()=>null)]);
    if(!additionalJobsForScope(row.dataset.jobRider,row.dataset.jobStart,row.dataset.jobEnd).length)throw new Error('These Additional Jobs are no longer available. Refresh History.');
    const payload=await prepareRiderStatement(raw,jobsReady);
    if(formats.includes('excel'))await downloadExcelTable(payload);
    if(formats.includes('pdf')&&!await downloadPdfTable(payload)){deductionDownloadFeedback(button,'PDF download was cancelled.');return;}
    deductionDownloadFeedback(button,formats.map(format=>format==='pdf'?'PDF':'Excel').join(' and ')+' downloaded.');
  }catch(error){deductionDownloadFeedback(button,error.message||'Statement could not be downloaded. Please retry.');}
  finally{button.disabled=false;button.textContent=originalLabel;button.removeAttribute('aria-busy');}
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
  const button=event.target.closest?.('[data-job-add],[data-job-remove],[data-job-save],[data-job-reset]');if(!button)return;
  const host=button.closest('[data-additional-table]'),id=host.dataset.additionalTable,draft=additionalJobDrafts.get(id),editor=host.querySelector('[data-additional-editor]'),feedback=host.querySelector('[data-additional-feedback]');
  if(draft.saving||draft.payload&&!button.hasAttribute('data-job-save')&&!(draft.payload.reset&&button.hasAttribute('data-job-reset')))return;
  if(button.hasAttribute('data-job-reset')){await additionalJobsSave(host,true);return;}
  if(button.hasAttribute('data-job-add')){draft.rows.push({id:crypto.randomUUID(),description:'Additional Job',amount:''});editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));return;}
  if(button.hasAttribute('data-job-remove')){draft.rows=draft.rows.filter(row=>row.id!==button.closest('[data-job-row]').dataset.jobRow);draft.rows.forEach(row=>row.saved=false);editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));return;}
  await additionalJobsSave(host);
});

async function additionalJobsSave(host, reset = false) {
  const id=host.dataset.additionalTable,draft=additionalJobDrafts.get(id),editor=host.querySelector('[data-additional-editor]'),feedback=host.querySelector('[data-additional-feedback]');
  if(draft.saving)return false;
  reset=Boolean(draft.payload?.reset||reset);
  if(!additionalJobsState.loaded||!draft.baseline){feedback.textContent='Wait for saved Additional Jobs to load first.';return false;}
  const pending=draft.rows,rider=deductionSingleRider(deductionRows(id,true)),dates=auditCapture(id)?.scope?.dates||{};
  if(!reset&&!pending.length){feedback.textContent='All entered jobs are already saved. Use + Add row for another job.';return;}
  if(!rider.valid||draft.scope!==[rider.key,dates.start,dates.end].join('|')){feedback.textContent='Rider or period changed. Review the selection first.';return;}
  if(!reset&&(!pending.length||pending.some(row=>!row.description.trim()||!/^\d+(\.\d{1,2})?$/.test(row.amount)||Number(row.amount)<=0||Number(row.amount)>1000000))){feedback.textContent='Enter a description and RM0.01–RM1,000,000 (up to 2 decimals) for every new job.';return;}
  draft.saving=true;editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));let warning='';
  try {
    // One atomic replacement makes the saved total equal exactly these boxes.
    // Retain the same request on uncertain retries; previous versions stay audited.
    draft.payload ||= {requestId:crypto.randomUUID(),rider:rider.rider,periodStart:String(dates.start).slice(0,10),periodEnd:String(dates.end).slice(0,10),expectedJobs:draft.baseline||[],...(reset?{reset:true}:{}),rows:reset?[]:pending.map(row=>({description:row.description.trim(),amount:row.amount}))};
    const result=await deductionRequest('/save-jobs',draft.payload);
    warning=result.backupWarning||'';
    draft.rows=result.jobs.map(job=>({id:job.id,description:job.description,amount:(job.amountCents/100).toFixed(2),saved:true}));
    draft.baseline=result.jobs.map(job=>({id:job.id,description:job.description,amountCents:job.amountCents}));draft.payload=null;
    if(reset)draft.rows=[{id:crypto.randomUUID(),description:'Additional Job',amount:'0.00'}];
    additionalJobsState.loaded=false;
    await additionalJobsLoad(true);deductionStatementPayloadCache.clear();additionalJobsStatementCache.clear();draft.saving=false;render();
    const current=document.querySelector('[data-additional-table="'+id+'"] [data-additional-feedback]');if(current)current.textContent=warning||(reset?'Additional Jobs reset to RM 0.00.':'Additional Jobs saved in History and included in rider Excel/PDF statements.');
    return true;
  }catch(error){feedback.textContent=error.message+' Saved rows are preserved. Retry to continue without duplicates.';}
  finally{draft.saving=false;if(editor.isConnected){editor.innerHTML=additionalJobsEditor(draft);deductionUpdateInline(host.closest('.deduction-workspace'));}}
}
