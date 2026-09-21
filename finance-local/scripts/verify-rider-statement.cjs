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
  assert.ok(zip.file('xl/media/logo.png'));assert.ok(zip.file('xl/drawings/drawing1.xml'));assert.equal(pdfTable.body.length,256);assert.equal(master.rows.length,1);assert.equal(pdfTable.foot,undefined);
  assert.match(xml,/JOB-249/);assert.doesNotMatch(xml,/\(applied\)|APPLIED DEDUCTIONS/);
  for(const row of master.footerRows)for(const value of row.filter(Boolean))assert.ok(xml.includes(context.exportXmlText(value)),value+' exists in Excel master');
  assert.equal(master.summary.value,'RM 3200.00');assert.equal(master.footerRows.at(-1)[2],'RM 3200.00');assert.equal(downloadName,'test-statement.xlsx');
  assert.match(xml,/colSpan|mergeCell/);
  assert.ok(xml.indexOf('TOTAL DEDUCTIONS')<xml.indexOf('ADDITIONAL JOB 1'));
  assert.ok(xml.indexOf('JOB-249')<xml.indexOf('NET COMMISSION'));
  const styles=await zip.file('xl/styles.xml').async('string');assert.match(styles,/FFFFEB3B/);assert.match(styles,/FF12754B/);
  assert.match(styles,/horizontal="center" vertical="center" wrapText="1"/);
  assert.doesNotMatch(xml,/<pane\b/,'No freeze-pane divider in the statement');
  assert.match(xml,/view="normal" zoomScale="100" zoomScaleNormal="100"/);
  assert.match(xml,/<pageSetUpPr autoPageBreaks="0"\/>/);
  assert.doesNotMatch(xml,/<(?:pageSetup|pageMargins|rowBreaks|colBreaks)\b/);
  const cellStyles=styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[\s\S]*?<\/xf>/g);
  assert.match(cellStyles[4],/horizontal="left"/,'Title and rider are left aligned');
  assert.match(cellStyles[7],/horizontal="left"/,'Period is left aligned');
  for(const index of [0,1,2,3,5,6])assert.match(cellStyles[index],/horizontal="center"/,'Table and totals remain centered');
  assert.match(xml,/<c r="A4" s="7"/);
  for(const index of [8,10,12,14]){assert.match(cellStyles[index],/horizontal="left"/);assert.match(cellStyles[index+1],/horizontal="right"/);assert.match(cellStyles[index],/borderId="1"/);}
  assert.match(xml,/<c r="A7" s="8"/);assert.match(xml,/<c r="C7" s="9"/);
  assert.match(styles,/left style="thin"/);
  assert.match(xml,/<row r="6" customHeight="1" ht="(?:3[2-9]|[4-9]\d|\d{3})"/);
  for(const [label,color] of [['ADDITIONAL JOB 1',[18,117,75]],['NET COMMISSION',[255,235,59]]]){
    const cell={styles:{}};pdfTable.didParseCell({section:'body',row:{index:1,raw:[label]},column:{index:0},cell});assert.deepEqual(Array.from(cell.styles.fillColor),color);assert.equal(cell.styles.halign,'left');
    const amount={styles:{}};pdfTable.didParseCell({section:'body',row:{index:1,raw:[label]},column:{index:2},cell:amount});assert.equal(amount.styles.halign,'right');
  }
  console.log('PASS: 250 additional jobs in both exports; identical footer values/labels; Excel embeds logo/drawing; net RM3200; source unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
