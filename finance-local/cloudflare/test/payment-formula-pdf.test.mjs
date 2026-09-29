import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as LedgerHistoryWorkflow from '../src/deduction-workflow.js';

function fixture(){
  const events=[];
  const columns=[{key:'rider_name',label:'Rider',value:r=>r.rider_name},{key:'commission',label:'Commission',value:r=>r.commission}];
  const context=vm.createContext({window:{LedgerHistoryWorkflow},document:{addEventListener(type,handler){events.push({type,handler});}},URLSearchParams,
    formatMoney:value=>'RM '+Number(value).toFixed(2),formatNumber:String,numberValue:Number,esc:String,
    auditQuickRange:()=>({start:'2026-09-29T00:00:00Z'}),
    FINANCE_API_ENDPOINT:'/api/grafana/finance',panels:[{id:'commission-main',columns}],visibleTableColumns:panel=>panel.columns,
    financeGrafanaFilterParam:()=> '{}',requestFinancePayload:async()=>({response:{ok:true},payload:{rows:[{rider_name:'PNG BH AIDID',commission:300}]}}),canonicalizeFinancePayloadRows:async(_p,data)=>data.rows,
    additionalJobsLoad:async()=>{},additionalJobsForStatementScope:()=>[],
  });
  vm.runInContext(readFileSync(new URL('../../deductions.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../../rider-statement.js',import.meta.url),'utf8')+'\nthis.selections=deductionHistoryBatchPaymentSelections;',context);
  const record=(type,count,amountCents)=>({id:type,batchId:'case-a',rider:'PNG BH AIDID',type,status:'applied',amountCents,installmentCount:count,periodStart:'2026-09-14',periodEnd:'2026-09-20',installments:Array.from({length:count},(_,index)=>({index,status:'applied',dueDate:'2026-09-24',amountCents}))});
  return {context,events,group:{id:'case-a',rider:'PNG BH AIDID',records:[record('epf',4,2500),record('battery-tester',7,4000)]}};
}

test('actual checkbox change handler excludes on tick and restores on untick with correct PDF totals',async()=>{
  const {context,events,group}=fixture();context.selections.set(group.id,1);
  group.records[0].paymentFormulas={1:{paymentIndex:1,lines:[{type:'epf',amountCents:2500},{type:'insurance',amountCents:1800}]}};
  context.deductionHistoryGroups=()=>[group];context.deductionHistoryRender=()=>{};
  const handler=events.find(event=>event.type==='change'&&String(event.handler).includes('data-payment-pdf-type')).handler;
  const checkbox={checked:true,dataset:{paymentPdfType:'epf'},closest:selector=>selector==='[data-payment-pdf-type]'?checkbox:{dataset:{deductionBatchId:'case-a'}}};
  handler({target:checkbox});
  const exportStatement=()=>context.deductionCombinedPaymentStatementPayload(context.deductionHistoryDownloadOptions(group),{start:'2026-09-14',end:'2026-09-20'},context.deductionHistoryEffectiveFormula(group));
  let payload=await exportStatement();assert.equal(payload.summary.value,'RM 282.00');assert.doesNotMatch(JSON.stringify(payload.footerRows),/EPF/);
  checkbox.checked=false;handler({target:checkbox});
  payload=await exportStatement();assert.equal(payload.summary.value,'RM 257.00');assert.match(JSON.stringify(payload.footerRows),/EPF/);
  checkbox.checked=true;handler({target:checkbox});checkbox.dataset.paymentPdfType='insurance';handler({target:checkbox});
  payload=await exportStatement();assert.equal(payload.summary.value,'RM 300.00');assert.equal(payload.footerRows.length,3);
  assert.equal(payload.rows.length,1);assert.equal(group.records[0].paymentFormulas[1].lines.length,2);
});

test('History exports the Audit commission week, not the future payment due week',async()=>{
  const {context,group}=fixture();context.selections.set(group.id,1);
  context.auditCapture=id=>id==='commission-main:table'?{scope:{dates:{start:'2026-09-14T00:00:00Z',end:'2026-09-20T23:59:59Z'}}}:null;
  context.state={dates:{'commission-main':{start:'2026-09-14',end:'2026-09-20'}}};
  group.records.forEach(record=>record.installments[1].dueDate='2026-10-08');
  group.records[0].paymentFormulas={1:{paymentIndex:1,lines:[]}};
  context.requestFinancePayload=async url=>({response:{ok:true},payload:{rows:url.includes('2026-09-14')?[{rider_name:'PNG BH AIDID',commission:300}]:[]}});
  const range=context.deductionHistoryCommissionRange();
  const payload=await context.deductionCombinedPaymentStatementPayload(context.deductionHistoryDownloadOptions(group),range,context.deductionHistoryEffectiveFormula(group));
  assert.equal(payload.rows.length,1);assert.equal(payload.summary.value,'RM 300.00');assert.equal(payload.statementScope.start,'2026-09-14');
});

test('PDF exclusion controls are unchecked by default and checked means remove',()=>{
  const {context,group}=fixture();context.selections.set(group.id,1);
  group.records[0].paymentFormulas={1:{paymentIndex:1,lines:[{type:'epf',amountCents:2500}]}};
  let html=context.deductionHistoryPdfControls(group);
  assert.match(html,/Exclude from PDF/);assert.doesNotMatch(html,/ checked/);
  vm.runInContext("deductionPaymentPdfExclusions.add('case-a|1|epf')",context);
  html=context.deductionHistoryPdfControls(group);assert.match(html,/data-payment-pdf-type="epf" checked/);
  assert.equal(context.deductionHistoryEffectiveFormula(group).lines.length,0);
});

test('an empty commission response cannot silently export RM0.00',async()=>{
  const {context,group}=fixture();context.requestFinancePayload=async()=>({response:{ok:true},payload:{rows:[]}});
  await assert.rejects(context.deductionCombinedPaymentStatementPayload(context.deductionHistoryDownloadOptions(group),{start:'2026-09-14',end:'2026-09-20'},{paymentIndex:0,lines:[]}),/No commission rows/);
});

test('History exclusions remove rows and amounts without changing the saved formula',async()=>{
  const {context,group}=fixture();context.selections.set(group.id,1);
  group.records[0].paymentFormulas={1:{paymentIndex:1,periodStart:'2026-09-21',periodEnd:'2026-09-27',lines:[{type:'epf',amountCents:2500},{type:'insurance',amountCents:1800}]}};
  vm.runInContext("deductionPaymentPdfExclusions.add('case-a|1|epf')",context);
  let formula=context.deductionHistoryEffectiveFormula(group);
  let payload=await context.deductionCombinedPaymentStatementPayload(context.deductionHistoryDownloadOptions(group),{start:'2026-09-14',end:'2026-09-20'},formula);
  assert.equal(payload.summary.value,'RM 282.00');assert.doesNotMatch(JSON.stringify(payload.footerRows),/EPF/);
  assert.equal(payload.statementScope.start,'2026-09-21');assert.equal(payload.statementScope.end,'2026-09-27');
  vm.runInContext("deductionPaymentPdfExclusions.add('case-a|1|insurance')",context);
  formula=context.deductionHistoryEffectiveFormula(group);
  payload=await context.deductionCombinedPaymentStatementPayload(context.deductionHistoryDownloadOptions(group),null,formula);
  assert.equal(payload.summary.value,'RM 300.00');assert.equal(payload.footerRows.length,3);
  assert.equal(group.records[0].paymentFormulas[1].lines.length,2);
  context.selections.set(group.id,2);assert.equal(context.deductionHistoryEffectiveFormula(group),null);
});

test('Proceed saves main form exact payment and dates, not a new plan',async()=>{
  const {context,group}=fixture();let input;
  context.crypto={randomUUID:()=> 'request-test'};
  context.auditCapture=()=>({scope:{dates:{start:'2026-09-21T00:00:00Z',end:'2026-09-27T23:59:59Z'}}});
  context.deductionRows=()=>[{rider_name:'PNG BH AIDID'}];
  context.deductionHistoryGroups=()=>[group];context.deductionHistoryOpen=async()=>{};
  context.deductionRequest=async(path,body)=>{assert.equal(path,'/save-payment-formula');input=body;return {ownerId:'epf',formula:{paymentIndex:body.paymentIndex,lines:[]}};};
  vm.runInContext("deductionState.loaded=true;deductionDrafts.set('main',{targetBatch:'case-a',paymentIndex:6,selected:['insurance'],amounts:{epf:'25',insurance:'17.25'}})",context);
  const feedback={textContent:''},button={disabled:false};
  await context.deductionSaveMainPayment('main',{querySelector:()=>feedback},button);
  assert.ok(input,feedback.textContent);assert.equal(input.paymentIndex,6);assert.equal(input.periodStart,'2026-09-21');
  assert.equal(JSON.stringify(input.lines),JSON.stringify([{type:'insurance',amount:'17.25'}]));assert.equal(button.disabled,false);
  vm.runInContext("deductionDrafts.get('main').selected=[]",context);
  await context.deductionSaveMainPayment('main',{querySelector:()=>feedback},button);assert.equal(input.lines.length,0);
});
test('Payment 2 excludes EPF even when Payment 1 included it; PDF retains saved payment number',async()=>{
  const {context,group}=fixture();
  group.records[0].paymentFormulas={0:{paymentIndex:0,lines:[{type:'epf',amountCents:2500}]},1:{paymentIndex:1,lines:[{type:'insurance',amountCents:1875}]}};
  context.selections.set(group.id,1);
  const formula=context.deductionHistorySavedFormula(group),options=context.deductionHistoryDownloadOptions(group);
  const payload=await context.deductionCombinedPaymentStatementPayload(options,{start:'2026-09-14',end:'2026-09-20'},formula);
  const prepared=await context.prepareRiderStatement(payload);
  assert.equal(prepared.summary.value,'RM 281.25');
  assert.deepEqual(Array.from(prepared.footerRows,row=>row[0]),['Filtered total','INSURANCE','TOTAL DEDUCTIONS','NET COMMISSION']);
  assert.match(prepared.period,/Payment 2 of 7/);
  assert.equal(prepared.footerRows[1][1],'- RM 18.75');
});
test('Payment 7 may explicitly include EPF at a manual amount after the EPF plan ends',async()=>{
  const {context,group}=fixture();context.selections.set(group.id,6);
  group.records[0].paymentFormulas={6:{paymentIndex:6,lines:[{type:'epf',amountCents:1250},{type:'manual',amountCents:999}]}};
  const payload=await context.deductionCombinedPaymentStatementPayload(context.deductionHistoryDownloadOptions(group),{start:'2026-09-14',end:'2026-09-20'},context.deductionHistorySavedFormula(group));
  assert.equal(payload.summary.value,'RM 277.51');assert.equal(payload.footerRows[1][1],'- RM 12.50');
  assert.match((await context.prepareRiderStatement(payload)).period,/Payment 7 of 7/);
});
test('all unticked is zero deductions, independent of the scheduled amounts',async()=>{
  const {context,group}=fixture();context.selections.set(group.id,3);
  group.records[0].paymentFormulas={3:{paymentIndex:3,lines:[]}};
  const payload=await context.deductionCombinedPaymentStatementPayload(context.deductionHistoryDownloadOptions(group),{start:'2026-09-14',end:'2026-09-20'},context.deductionHistorySavedFormula(group));
  assert.equal(payload.summary.value,'RM 300.00');assert.equal(payload.footerRows.length,3);assert.match(payload.period,/Payment 4 of 7/);
});
test('later payments require their own formula instead of silently inheriting Payment 1',()=>{
  const {context,group}=fixture();context.selections.set(group.id,1);
  group.records[0].paymentFormulas={0:{paymentIndex:0,lines:[{type:'epf',amountCents:2500}]}};
  assert.equal(context.deductionHistorySavedFormula(group),null);
  const html=context.deductionHistoryDownloadCell(group);
  assert.match(html,/Payment 2 needs its own formula/);assert.doesNotMatch(html,/data-deduction-history-batch-download/);
  assert.equal(context.deductionHistorySavedFormula({id:'other',records:[]},1),null);
});
