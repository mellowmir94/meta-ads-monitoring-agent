const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'../cloudflare/public');
const record=(id,type,count)=>({id,batchId:'download-test',rider:'Test Rider',reference:'TEST-'+id,type,status:'applied',amountCents:2500,installmentCount:count,pricingMode:'manual',createdAt:'2026-09-14T00:00:00Z',createdBy:'Test Finance',periodStart:'2026-09-14',periodEnd:'2026-09-20',deductionDate:'2026-09-18',audit:[],installments:Array.from({length:count},(_,index)=>({index,status:'applied',dueDate:index?'2026-09-24':'2026-09-18',settlementPeriodStart:'2026-09-14',settlementPeriodEnd:'2026-09-20',amountCents:2500}))});
(async()=>{
 const fixtures=[record('epf','epf',4),record('manual','manual',1)];
 const standaloneJob={rider:'Job-only Rider',riderKey:'job-only rider',periodStart:'2026-09-14',periodEnd:'2026-09-20',reference:'JOB-ONLY',description:'Additional Job',amountCents:100,createdBy:'Finance'};
 const jobs=[...Array.from({length:process.env.STATEMENT_QA?250:3},(_,i)=>({riderKey:'test rider',periodStart:'2026-09-14',periodEnd:'2026-09-20',reference:'JOB-'+(i+1),description:'Additional Job',amountCents:1250})),standaloneJob];
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 html=html.replace('function additionalJobsHistoryRender(view) {',`window.__setHistoryJobs=jobs=>{additionalJobsState.jobs=jobs;additionalJobsState.loaded=true;deductionHistoryRender();};\nfunction additionalJobsHistoryRender(view) {`);
 html=html.replace('async function additionalJobsStatementPayload(rider, start, end) {',`window.__jobStatement=async(...args)=>prepareRiderStatement(await additionalJobsStatementPayload(...args));\nasync function additionalJobsStatementPayload(rider, start, end) {`);
 html=html.replace('function deductionHistoryRender() {',`window.__downloadFixture=records=>{deductionState.records=records;deductionState.loaded=true;deductionState.actor={role:'maker'};state.api.loaded['commission-main']=true;const view=deductionHistoryEnsure();view.hidden=false;document.getElementById('tab-commission').hidden=false;document.getElementById('tab-commission').classList.add('deduction-history-active');view.querySelector('[data-deduction-history-period-start]').value='2026-09-14';view.querySelector('[data-deduction-history-period-end]').value='2026-09-20';deductionHistoryRender();};\nfunction deductionHistoryRender() {`);
 const browser=await chromium.launch({headless:true});
 try{for(const {formats,retry} of [{formats:['pdf','excel']},{formats:['pdf']},{formats:['excel']},{formats:['pdf','excel'],retry:true}]){
  let failedLibrary=false;
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),downloads=[],errors=[],requests=[];
  page.on('download',d=>downloads.push(d));page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='localhost')return route.abort();
   if(url.pathname==='/api/deductions/delete-jobs'){jobs.splice(jobs.indexOf(standaloneJob),1);return route.fulfill({contentType:'application/json',body:JSON.stringify({deleted:1})});}
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname.startsWith('/api/')){requests.push(url.pathname);const body=url.pathname==='/api/deductions/jobs'?{jobs,next:null}:url.pathname.includes('deductions')?{records:fixtures,next:null,actor:{role:'maker'},statementSentAt:'2026-09-21T00:00:00Z'}:{rows:[{order_id:'1',rider_name:'Test Rider',commission:350,quantity:1,created_at:'2026-09-15 12:00:00'}],truncated:false};return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});}
   if(retry&&!failedLibrary&&url.pathname.endsWith('/jszip.min.js')){failedLibrary=true;return route.fulfill({status:503,body:'Temporary unavailable'});}
   const file=path.join(root,url.pathname);if(file.startsWith(root)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'text/plain'});return route.fulfill({status:404,body:''});
  });
  await page.clock.install({time:new Date('2026-09-21T04:00:00Z')});
  await page.goto('http://localhost:4399/');await page.waitForFunction(()=>typeof window.__downloadFixture==='function');
  await page.locator('[data-deduction-history-open]').click();await page.evaluate(records=>window.__downloadFixture(records),fixtures);
  const row=page.locator('[data-deduction-batch-id="download-test"]');
  await page.evaluate(jobs=>window.__setHistoryJobs(jobs),jobs);
  const headers=await page.locator('#deductionHistoryView thead th').allTextContents();
  assert.equal(headers[7],'Additional Job');
  assert.match(await row.locator('[data-additional-history-cell]').innerText(),/additional jobs/);
  const jobOnly=page.locator('[data-additional-only-row]');assert.equal(await jobOnly.count(),1);assert.equal(await jobOnly.locator('td').count(),14);assert.match(await jobOnly.innerText(),/RM 1.00/);
  assert.equal(await jobOnly.locator('[data-additional-download]').count(),1,'Additional Job-only rows need a working Download button');
  assert.equal(await jobOnly.locator('[data-deduction-history-select]').count(),1,'Job-only rows must be selectable for the checked PDF export');
  const numbers=()=>page.locator('[data-deduction-history-body] > tr > td:first-child').allTextContents();
  assert.deepEqual(await numbers(),['1','2']);
  await page.locator('[data-deduction-number-sort]').click();
  assert.deepEqual(await numbers(),['2','1']);
  assert.equal(await page.locator('#deductionHistoryView thead th').first().getAttribute('aria-sort'),'descending');
  await page.locator('[data-deduction-number-sort]').press('Enter');
  assert.deepEqual(await numbers(),['1','2']);
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
  assert.equal(downloads.length,formats.length,feedback);for(const d of downloads){assert.equal(await d.failure(),null);assert.match(d.suggestedFilename(),/^Test Rider\.(pdf|xlsx)$/);}
  if(process.env.STATEMENT_QA&&!retry&&formats.length===2)for(const d of downloads)await d.saveAs(path.resolve(root,'../../preview-evidence/additional-job-layout'+path.extname(d.suggestedFilename())));
  assert.equal(requests.filter(p=>p.endsWith('/mark-sent')).length,formats.includes('pdf')?1:0,'Upcoming EPF payment must not be marked sent');
  assert.equal(await jobOnly.locator('.deduction-history-status').innerText(),'Applied');
  assert.equal(await jobOnly.locator('[data-statement-file-format="pdf"]').isChecked(),true);
  for(const format of ['pdf','excel'])await jobOnly.locator('[data-statement-file-format="'+format+'"]').setChecked(formats.includes(format));
  const before=downloads.length,marks=requests.filter(p=>p.endsWith('/mark-sent')).length;
  await jobOnly.locator('[data-additional-download]').click();
  await page.waitForFunction(()=>document.querySelector('[data-additional-download]')?.textContent==='Download');
  for(let attempt=0;attempt<30&&downloads.length<before+formats.length;attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(downloads.length,before+formats.length,await jobOnly.innerText());
  for(const d of downloads.slice(before)){assert.equal(await d.failure(),null);assert.match(d.suggestedFilename(),/^Job-only Rider\.(pdf|xlsx)$/);}
  assert.equal(requests.filter(p=>p.endsWith('/mark-sent')).length,marks,'Job-only exports must not modify deductions');
  const statement=await page.evaluate(()=>window.__jobStatement('Job-only Rider','2026-09-14','2026-09-20'));
  assert.equal(statement.rows.length,0,'Another rider commission must never enter this statement');
  assert.equal(statement.summary.value,'RM 1.00');
  assert.match(JSON.stringify(statement.footerRows),/JOB-ONLY/);
  const top=page.locator('[data-deduction-history-export="pdf"]');
  await jobOnly.locator('[data-deduction-history-select]').check();assert.equal(await top.isEnabled(),true);
  const jobPdf=page.waitForEvent('download');await top.click();assert.equal((await jobPdf).suggestedFilename(),'Job-only Rider.pdf');
  await page.waitForFunction(()=>document.querySelector('[data-deduction-history-export="pdf"]')?.textContent==='Export checked Rider PDF');
  await row.locator('[data-deduction-history-select]').check();
  assert.equal(await jobOnly.locator('[data-deduction-history-select]').isChecked(),false);
  const riderPdf=page.waitForEvent('download');await top.click();assert.equal((await riderPdf).suggestedFilename(),'Test Rider.pdf');
  await page.waitForFunction(()=>document.querySelector('[data-deduction-history-export="pdf"]')?.textContent==='Export checked Rider PDF');
  await jobOnly.locator('[data-additional-delete]').click();
  const deletion=page.locator('#deductionDialog');assert.match(await deletion.innerText(),/Job-only Rider/);
  if(retry){
    await deletion.locator('input[name="pin"]').fill('1234');await deletion.locator('[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-job-delete-done]'));
    assert.equal(await jobOnly.count(),0);assert.equal(await row.count(),1);
  }else await page.evaluate(()=>document.querySelector('#deductionDialog').close());
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
