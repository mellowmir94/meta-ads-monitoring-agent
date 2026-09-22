const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../deductions.js'),'utf8');
const start=source.indexOf('const deductionStatementRowLoads'),end=source.indexOf('function deductionPrefetchPaymentStatement(',start);
const requests=[];
const context={URLSearchParams,panels:[{id:'commission-main'}],FINANCE_API_ENDPOINT:'/api/finance',deductionHistoryProgress:r=>({items:r.installments}),deductionInstallmentSettlement:()=>({start:'2026-10-01',end:'2026-10-07'}),deductionWeekBounds:()=>null,financeGrafanaFilterParam:()=>JSON.stringify({rider:['Wrong Rider']}),requestFinancePayload:async url=>{requests.push(new URL(url,'https://test'));return {response:{ok:true},payload:{rows:[],truncated:false}};},canonicalizeFinancePayloadRows:async(_p,p)=>p.rows,deductionRiderKey:s=>s.toLowerCase(),visibleTableColumns:()=>[{key:'order_id'},{key:'quantity'},{key:'commission'}],numberValue:Number,deductionStatementAmountForRecord:()=>2500,formatNumber:String,deductionMoney:v=>'RM '+(v/100).toFixed(2),deductionTypes:{epf:'EPF'},deductionDateLabel:String,deductionPeriodLabel:p=>p.start+' - '+p.end};
vm.createContext(context);vm.runInContext(source.split('\n').find(line=>line.startsWith('const deductionRiderKey =')),context);vm.runInContext(source.slice(start,end),context);
(async()=>{const result=await context.deductionFreshPaymentStatementPayload({id:'a',rider:'Test Rider',type:'epf',installmentCount:4,installments:[{status:'applied',dueDate:'2026-10-01'}]},0);
assert.equal(result.rows.length,0);assert.equal(result.summary.value,'RM -25.00');assert.equal(result.footerRows[1][0],'EPF');assert.equal(requests[0].searchParams.get('filters'),'{}');
const days=[];
context.requestFinancePayload=async url=>{const p=new URL(url,'https://test').searchParams,from=p.get('from').slice(0,10),to=p.get('to').slice(0,10);if(from!==to)return {response:{ok:true},payload:{truncated:true,rows:[{commission:99999}]}};days.push(from);return {response:{ok:true},payload:{truncated:false,rows:[{order_id:from,commission:10}]}};};
const loaded=await context.deductionLoadStatementRows(context.panels[0],'2026-10-01','2026-10-04');
assert.equal(loaded.length,4);assert.equal(loaded.reduce((n,r)=>n+r.commission,0),40);assert.deepEqual(days,['2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
context.requestFinancePayload=async url=>{const p=new URL(url,'https://test').searchParams;assert.equal(p.get('from'),'2026-09-14 00:00:00');assert.equal(p.get('to'),'2026-09-20 23:59:59');return {response:{ok:true},payload:{rows:[{rider_name:'  phg  bh uddin muzzani ',commission:100},{rider_name:'HQ BH NAZRULLAH RADZUAN',commission:200}],rowCount:2}};};
for(const [rider,expected] of [['PHG BH UDDIN MUZZANI','RM 75.00'],['HQ BH NAZRULLAH RADZUAN','RM 175.00'],['Other Rider','RM -25.00']]){
 const statement=await context.deductionFreshPaymentStatementPayload({id:rider,rider,riderKey:'stale-key',type:'epf',installmentCount:4,installments:[{status:'applied',dueDate:'2026-10-01'}]},0,{start:'2026-09-14',end:'2026-09-20'});
 assert.equal(statement.summary.value,expected);assert.equal(statement.statementScope.start,'2026-09-14');assert.equal(statement.rows.length,rider==='Other Rider'?0:1);
}
context.requestFinancePayload=async()=>({response:{ok:false},payload:{error:'Upstream unavailable'}});
await assert.rejects(()=>context.deductionLoadStatementRows(context.panels[0],'2026-11-01','2026-11-04'),/Upstream unavailable/);
console.log('PASS: empty period export; unrelated filters excluded; complete non-overlapping range loading; upstream failure is never converted into zero commission');})().catch(e=>{console.error(e);process.exitCode=1;});
