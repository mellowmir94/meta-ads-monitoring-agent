const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||undefined});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://ledger.test/**',route=>route.fulfill({body:'<html></html>',contentType:'text/html'}));
    await page.goto('https://ledger.test/');
    await page.setContent([...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m=>m[0]).join('')+'<main id="fixture" style="padding:20px;max-width:1000px"></main>');
    await page.addScriptTag({content:`const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');const deductionRiderKey=s=>String(s||'').toLowerCase();const deductionMoney=c=>'RM '+(c/100).toFixed(2);const deductionRows=()=>[{rider_name:'Test Rider'}];const deductionSingleRider=()=>({valid:true,rider:'Test Rider',key:'test rider'});const deductionUpdateInline=()=>{};const dates={start:'2026-09-14',end:'2026-09-20'};const auditCapture=()=>({scope:{dates}});const deductionStatementPayloadCache=new Map();const saved=[];async function deductionRequest(path,input){if(path==='/save-jobs'){saved.splice(0,saved.length,...input.rows.map((row,index)=>({id:'job-'+index,rider:input.rider,riderKey:'test rider',periodStart:input.periodStart,periodEnd:input.periodEnd,reference:'JOB-'+(index+1),description:row.description,amountCents:Math.round(Number(row.amount)*100)})));return {jobs:saved};}return {jobs:saved,next:null};}function render(){document.getElementById('fixture').innerHTML=additionalJobsMarkup('test',deductionSingleRider(),dates,{loaded:true,grossCents:10000,statementAmounts:{epf:2500}});}`});
    await page.addScriptTag({path:path.join(root,'additional-jobs.js')});
    await page.evaluate(async()=>{await additionalJobsLoad();render();});
    await page.getByRole('checkbox',{name:'Additional Job',exact:true}).check();
    await page.locator('[data-job-description]').fill('Extra delivery');await page.locator('[data-job-amount]').fill('12.35');
    await page.getByRole('button',{name:'+ Add row',exact:true}).click();
    await page.locator('[data-job-description]').nth(1).fill('Extra support');await page.locator('[data-job-amount]').nth(1).fill('7.65');
    await page.getByRole('button',{name:'Save Additional Jobs',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-additional-feedback]').textContent.includes('Additional Jobs saved in History'),null,{timeout:5000}).catch(async error=>{console.error({feedback:await page.locator('[data-additional-feedback]').textContent(),errors});throw error;});
    assert.match(await page.locator('.additional-jobs').innerText(),/RM 95.00/);
    await page.getByRole('button',{name:'Save Additional Jobs',exact:true}).click();
    assert.equal(await page.evaluate(()=>saved.length),2);
    await page.getByRole('button',{name:'Clear Additional Jobs',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-additional-feedback]').textContent.includes('reset to RM 0.00'));
    assert.equal(await page.evaluate(()=>saved.length),0);
    assert.equal(await page.locator('[data-job-amount]').inputValue(),'0.00');
    assert.match(await page.locator('.additional-jobs').innerText(),/RM 100.00 \+ RM 0.00 − RM 25.00 = RM 75.00/);
    await page.locator('[data-job-amount]').fill('20.00');
    await page.getByRole('button',{name:'Save Additional Jobs',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-additional-feedback]').textContent.includes('Additional Jobs saved in History'));
    assert.equal(await page.evaluate(()=>saved.length),1);
    for(const width of [1100,390]){await page.setViewportSize({width,height:850});await page.evaluate(()=>document.documentElement.dataset.theme='dark');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,`preview-evidence/additional-jobs-${width}.png`),fullPage:true});}
    assert.deepEqual(errors,[]);
    for(const file of ['jszip.min.js','jspdf.umd.min.js','jspdf.plugin.autotable.min.js'])await page.addScriptTag({path:path.join(root,'cloudflare/public/vendor',file)});
    const extract=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
    await page.addScriptTag({content:extract('      function financeDeliverDownload','      const financeOptionalScriptLoads')});
    await page.addScriptTag({content:'const formatNumber=n=>String(n); const formatGrafanaTimestamp=s=>s;'+extract('      function excelColumnReference','      async function downloadExcelTable')});
    await page.route('https://ledger.test/assets/bateriku-finance-logo.png',route=>route.fulfill({body:fs.readFileSync(path.join(root,'cloudflare/public/assets/bateriku-finance-logo.png')),contentType:'image/png'}));
    await page.addScriptTag({content:'let financePdfLogoDataUrl=null,financePdfLogoLoading=null; const FINANCE_PDF_LOGO_ASSET="assets/bateriku-finance-logo.png"; const versionedFinanceAsset=s=>s;'+extract('      async function financePdfLogo()','      function financeExportPanelTitle')});
    await page.addScriptTag({path:path.join(root,'rider-statement.js')});
    await page.addScriptTag({content:extract('      function financePdfCellValue','      async function exportFinanceTable')});
    await page.evaluate(async()=>{
      for(let i=0;i<80;i++)saved.push({riderKey:'test rider',periodStart:'2026-09-14',periodEnd:'2026-09-20',reference:'JOB-TEST-'+i,description:'Additional roadside assistance job '+i,amountCents:1000});
      window.master=await prepareRiderStatement({statementScope:{rider:'Test Rider',start:'2026-09-14',end:'2026-09-20'},panelTitle:'Commission Rider',title:'Test Rider',period:'14th September 2026 - 20th September 2026',filename:'test-statement',columns:[{key:'id',label:'Order',value:r=>r.id},{key:'rider_name',label:'Rider',value:r=>r.rider_name},{key:'commission',label:'Commission',value:r=>r.commission}],rows:[{id:'ORDER-TEST',rider_name:'Test Rider',commission:100}],summary:{label:'Net Commission',value:'RM 75.00'},footerRows:[['Filtered total','','RM 100.00'],['EPF (applied)','','- RM 25.00'],['APPLIED DEDUCTIONS','','- RM 25.00']]});
    });
    const excelDownload=page.waitForEvent('download');await page.evaluate(()=>downloadMasterRiderExcel(window.master));await (await excelDownload).saveAs(path.join(root,'preview-evidence/rider-statement-test.xlsx'));
    const pdfDownload=page.waitForEvent('download');await page.evaluate(()=>downloadPdfTable(window.master));await (await pdfDownload).saveAs(path.join(root,'preview-evidence/rider-statement-test.pdf'));
    console.log('PASS: manual jobs save/retry/reset, totals, responsive layout; real Excel/PDF generated with multiple manual jobs.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
