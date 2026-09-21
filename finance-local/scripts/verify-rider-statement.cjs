const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const JSZip=require(process.env.JSZIP_PATH || 'jszip');
function section(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));}
(async()=>{
  let blob,downloadName,pdfTable;
  const logo='data:image/png;base64,'+fs.readFileSync(path.join(root,'cloudflare/public/assets/bateriku-brand-icon.png')).toString('base64');
  class PDF {constructor(){this.internal={pageSize:{getWidth:()=>800,getHeight:()=>600},getNumberOfPages:()=>1};}addImage(){}setFont(){}setFontSize(){}setTextColor(){}text(){}autoTable(options){pdfTable=options;}save(){} }
  const context=vm.createContext({window:{JSZip,jspdf:{jsPDF:PDF},confirm:()=>true},document:{createElement:()=>({click(){downloadName=this.download;},remove(){}}),body:{append(){}}},URL:{createObjectURL:value=>(blob=value,'test'),revokeObjectURL(){}},financePdfLogo:async()=>logo,additionalJobsLoad:async()=>{},additionalJobsForScope:()=>Array.from({length:250},(_,i)=>({reference:'JOB-'+i,description:'Extra delivery '+i,amountCents:1250})),deductionMoney:c=>'RM '+(c/100).toFixed(2),formatNumber:n=>String(n),formatGrafanaTimestamp:s=>s,console});
  vm.runInContext(section('      function excelColumnReference','      async function downloadExcelTable'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'rider-statement.js'),'utf8'),context);
  vm.runInContext(section('      function financePdfCellValue','      async function exportFinanceTable'),context);
  const payload={statementScope:{rider:'Test Rider',start:'2026-09-14',end:'2026-09-20'},title:'Test Rider',panelTitle:'Commission Rider',period:'14th September 2026 - 20th September 2026',filename:'test-statement',rows:[{id:'ORDER-1',rider_name:'Test Rider',commission:100}],columns:[{key:'id',label:'Order',value:r=>r.id},{key:'rider_name',label:'Rider',value:r=>r.rider_name},{key:'commission',label:'Commission',value:r=>r.commission}],summary:{label:'Net Commission',value:'RM 75.00'},footerRows:[['Filtered total','','RM 100.00'],['EPF (applied)','','- RM 25.00'],['APPLIED DEDUCTIONS','','- RM 25.00'],['NET COMMISSION','','RM 75.00']]};
  const master=await context.prepareRiderStatement(payload);await context.downloadMasterRiderExcel(master);await context.downloadPdfTable(master);
  const zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.ok(zip.file('xl/media/logo.png'));assert.ok(zip.file('xl/drawings/drawing1.xml'));assert.equal(pdfTable.body.length,251);assert.equal(master.rows.length,251);
  assert.match(xml,/JOB-249/);assert.doesNotMatch(xml,/\(applied\)|APPLIED DEDUCTIONS/);
  for(const row of pdfTable.foot)for(const value of row.filter(Boolean))assert.ok(xml.includes(context.exportXmlText(value)),value+' exists in Excel master');
  assert.equal(master.summary.value,'RM 3200.00');assert.equal(pdfTable.foot.at(-1)[2],'RM 3200.00');assert.equal(downloadName,'test-statement.xlsx');
  assert.match(xml,/colSpan|mergeCell/);
  console.log('PASS: 250 additional jobs in both exports; identical footer values/labels; Excel embeds logo/drawing; net RM3200; source unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
