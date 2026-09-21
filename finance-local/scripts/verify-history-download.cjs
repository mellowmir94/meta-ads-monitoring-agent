const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'../cloudflare/public');
const record=(id,type,count)=>({id,batchId:'download-test',rider:'Test Rider',reference:'TEST-'+id,type,status:'applied',amountCents:2500,installmentCount:count,pricingMode:'manual',createdAt:'2026-09-14T00:00:00Z',createdBy:'Test Finance',periodStart:'2026-09-14',periodEnd:'2026-09-20',deductionDate:'2026-09-18',audit:[],installments:Array.from({length:count},(_,index)=>({index,status:'applied',dueDate:index?'2026-09-24':'2026-09-18',settlementPeriodStart:'2026-09-14',settlementPeriodEnd:'2026-09-20',amountCents:2500}))});
(async()=>{
 const fixtures=[record('epf','epf',4),record('manual','manual',1)];
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 html=html.replace('function deductionHistoryRender() {',`window.__downloadFixture=records=>{deductionState.records=records;deductionState.loaded=true;deductionState.actor={role:'maker'};state.api.loaded['commission-main']=true;const view=deductionHistoryEnsure();view.hidden=false;document.getElementById('tab-commission').hidden=false;document.getElementById('tab-commission').classList.add('deduction-history-active');view.querySelector('[data-deduction-history-period-start]').value='2026-09-14';view.querySelector('[data-deduction-history-period-end]').value='2026-09-20';deductionHistoryRender();};\nfunction deductionHistoryRender() {`);
 const browser=await chromium.launch({headless:true});
 try{for(const {formats,retry} of [{formats:['pdf','excel']},{formats:['pdf']},{formats:['excel']},{formats:['pdf','excel'],retry:true}]){
  let failedLibrary=false;
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),downloads=[],errors=[],requests=[];
  page.on('download',d=>downloads.push(d));page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='localhost')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname.startsWith('/api/')){requests.push(url.pathname);const body=url.pathname==='/api/deductions/jobs'?{jobs:[],next:null}:url.pathname.includes('deductions')?{records:fixtures,next:null,actor:{role:'maker'},statementSentAt:'2026-09-21T00:00:00Z'}:{rows:[{order_id:'1',rider_name:'Test Rider',commission:350,quantity:1,created_at:'2026-09-15 12:00:00'}],truncated:false};return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});}
   if(retry&&!failedLibrary&&url.pathname.endsWith('/jszip.min.js')){failedLibrary=true;return route.fulfill({status:503,body:'Temporary unavailable'});}
   const file=path.join(root,url.pathname);if(file.startsWith(root)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'text/plain'});return route.fulfill({status:404,body:''});
  });
  await page.clock.install({time:new Date('2026-09-21T04:00:00Z')});
  await page.goto('http://localhost:4399/');await page.waitForFunction(()=>typeof window.__downloadFixture==='function');
  await page.locator('[data-deduction-history-open]').click();await page.evaluate(records=>window.__downloadFixture(records),fixtures);
  const row=page.locator('[data-deduction-batch-id="download-test"]');
  await row.locator('[data-deduction-history-type-payment-select][data-deduction-history-payment-type="epf"]').selectOption('epf|1');
  assert.match(await row.locator('.deduction-history-download-item').innerText(),/EPF payment 2.*Special Case payment 1/s);
  // Mixed weeks with no History date filter previously blocked this exact click.
  await page.evaluate(()=>{for(const key of ['start','end'])document.querySelector('[data-deduction-history-period-'+key+']').value='';});
  for(const format of ['pdf','excel'])await row.locator('[data-statement-file-format="'+format+'"]').setChecked(formats.includes(format));
  await row.locator('[data-deduction-history-batch-download]').click();
  await page.waitForFunction(()=>{const text=document.querySelector('[data-deduction-history-feedback]')?.textContent||'';return text&&!text.startsWith('Preparing');},{},{timeout:15000}).catch(()=>{});
  if(retry){
   assert.equal(downloads.length,0);assert.equal(requests.filter(p=>p.endsWith('/mark-sent')).length,0);
   assert.match(await row.locator('[data-statement-download-feedback]').innerText(),/could not be loaded/);
   await row.locator('[data-deduction-history-batch-download]').click();
   await page.waitForFunction(()=>{const text=document.querySelector('[data-deduction-history-feedback]')?.textContent||'';return text&&!text.startsWith('Preparing');},{},{timeout:15000}).catch(()=>{});
  }
  const feedback=await page.locator('[data-deduction-history-feedback]').textContent();
  console.log({formats,retry:!!retry,feedback,downloads:downloads.map(d=>d.suggestedFilename()),errors});
  assert.equal(downloads.length,formats.length,feedback);for(const d of downloads)assert.equal(await d.failure(),null);
  assert.equal(requests.filter(p=>p.endsWith('/mark-sent')).length,formats.includes('pdf')?1:0,'Upcoming EPF payment must not be marked sent');
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
