import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as LedgerHistoryWorkflow from '../src/deduction-workflow.js';

function setup(rows) {
  const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  const source=name=>{const start=html.indexOf(`      function ${name}(`);assert.ok(start>=0);return html.slice(start,html.indexOf('\n      }',start)+8);};
  const columns=['order_id','quantity','commission'].map(key=>({key,label:key,numeric:key!=='order_id',value:row=>row[key]}));
  const panel={id:'commission-main',columns};
  const c=vm.createContext({window:{LedgerHistoryWorkflow},document:{addEventListener(){}},URLSearchParams,
    formatMoney:n=>'RM '+Number(n).toFixed(2),esc:String,panels:[panel],visibleTableColumns:p=>p.columns,
    auditQuickRange:()=>({start:'2026-09-29T00:00:00Z'}),FINANCE_API_ENDPOINT:'/api/grafana/finance',financeGrafanaFilterParam:()=> '{}',
    requestFinancePayload:async()=>({response:{ok:true},payload:{rows}}),canonicalizeFinancePayloadRows:async(_p,data)=>data.rows,
  });
  vm.runInContext(['parseFinanceNumber','numberValue','formatNumber','tableTotalValue'].map(source).join('\n'),c);
  for(const file of ['deductions.js','additional-jobs.js','rider-statement.js'])vm.runInContext(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),c);
  vm.runInContext('additionalJobsLoad=async()=>{};additionalJobsForStatementScope=()=>[];',c);
  const record={id:'epf',batchId:'case',rider:'Rider A',type:'epf',status:'applied',amountCents:2500,installmentCount:2,periodStart:'2026-09-14',periodEnd:'2026-09-20',installments:[{index:0,status:'applied',dueDate:'2026-09-24',amountCents:2500}]};
  return {c,columns,panel,record,range:{start:'2026-09-14',end:'2026-09-20'}};
}

for(const path of ['single','combined','additional-only'])test(`${path} statement quantity equals Audit total across all rider rows`,async()=>{
  const rows=Array.from({length:125},(_,i)=>({order_id:String(i),rider_name:'Rider A',quantity:i===0?'1,000':i===1?null:i===2?'(2)':2,commission:10}));
  rows.push({order_id:'other',rider_name:'Other',quantity:9999,commission:999});
  const {c,columns,panel,record,range}=setup(rows);
  const expected=c.tableTotalValue(panel,columns[1],rows.filter(r=>r.rider_name==='Rider A'));
  const payload=path==='single'?await c.deductionFreshPaymentStatementPayload(record,0,range):path==='combined'?await c.deductionCombinedPaymentStatementPayload([{record,index:0,item:record.installments[0],count:2}],range,{paymentIndex:0,lines:[]}):await c.additionalJobsFetchStatementPayload('Rider A',range.start,range.end);
  const prepared=await c.prepareRiderStatement(payload);
  assert.equal(prepared.rows.length,125);
  assert.equal(prepared.footerRows[0][1],expected);
  assert.equal(expected,'1,242');
});
