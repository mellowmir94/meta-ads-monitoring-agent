import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as LedgerHistoryWorkflow from '../src/deduction-workflow.js';

function fixture(){
  const columns=[{key:'rider_name',label:'Rider',value:r=>r.rider_name},{key:'commission',label:'Commission',value:r=>r.commission}];
  const context=vm.createContext({window:{LedgerHistoryWorkflow},document:{addEventListener(){}},URLSearchParams,
    formatMoney:value=>'RM '+Number(value).toFixed(2),formatNumber:String,numberValue:Number,esc:String,
    auditQuickRange:()=>({start:'2026-09-29T00:00:00Z'}),
    FINANCE_API_ENDPOINT:'/api/grafana/finance',panels:[{id:'commission-main',columns}],visibleTableColumns:panel=>panel.columns,
    financeGrafanaFilterParam:()=> '{}',requestFinancePayload:async()=>({response:{ok:true},payload:{rows:[{rider_name:'PNG BH AIDID',commission:300}]}}),canonicalizeFinancePayloadRows:async(_p,data)=>data.rows,
    additionalJobsLoad:async()=>{},additionalJobsForStatementScope:()=>[],
  });
  vm.runInContext(readFileSync(new URL('../../deductions.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../../rider-statement.js',import.meta.url),'utf8')+'\nthis.selections=deductionHistoryBatchPaymentSelections;',context);
  const record=(type,count,amountCents)=>({id:type,batchId:'case-a',rider:'PNG BH AIDID',type,status:'applied',amountCents,installmentCount:count,periodStart:'2026-09-14',periodEnd:'2026-09-20',installments:Array.from({length:count},(_,index)=>({index,status:'applied',dueDate:'2026-09-24',amountCents}))});
  return {context,group:{id:'case-a',rider:'PNG BH AIDID',records:[record('epf',4,2500),record('battery-tester',7,4000)]}};
}
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
