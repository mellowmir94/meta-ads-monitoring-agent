const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'../cloudflare/public');let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 html=html.replace('function deductionSummaryMarkup(dataRows, tableId) {',`window.__jobOnlyFixture=()=>{
 const rows=[{rider_name:'Test Rider',commission:100}],dates={start:'2026-09-14',end:'2026-09-20'};
 deductionRows=()=>rows;auditCapture=()=>({scope:{dates}});auditIdentity=()=>true;
 deductionState.loaded=true;deductionState.records=[];additionalJobsState.loaded=true;
 const host=document.createElement('div');host.id='job-test';host.style.cssText='position:fixed;inset:0;z-index:999999;overflow:auto;background:#fff';document.body.append(host);
 render=()=>{host.innerHTML=deductionSummaryMarkup(rows,'commission-main');};
 deductionHistoryOpen=async()=>{window.__historyOpened=true;};render();
 };\nfunction deductionSummaryMarkup(dataRows, tableId) {`);
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),writes=[],jobs=[];
  await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
   if(url.hostname!=='localhost')return route.abort();
   if(url.pathname==='/')return route.fulfill({body:html,contentType:'text/html'});
   if(url.pathname.startsWith('/api/')){
    if(req.method()==='POST'){writes.push(url.pathname);if(url.pathname.endsWith('/save-jobs')){const data=req.postDataJSON();jobs.splice(0,jobs.length,...data.rows.map((row,i)=>({...data,...row,id:data.requestId+'-'+i,riderKey:'test rider',reference:'JOB-'+i,amountCents:Math.round(Number(row.amount)*100)})));}}
    return route.fulfill({contentType:'application/json',body:JSON.stringify({records:[],jobs,next:null})});
   }
   const file=path.join(root,url.pathname);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({body:fs.readFileSync(file)}):route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost:4399/');await page.evaluate(()=>window.__jobOnlyFixture());
  const host=page.locator('#job-test'),proceed=host.locator('[data-deduction-inline-create]');
  await host.locator('[data-additional-toggle]').check();
  assert.equal(await proceed.isEnabled(),false);
  await host.locator('[data-job-amount]').fill('1');assert.equal(await proceed.isEnabled(),true);
  assert.equal(await host.locator('[data-deduction-inline-type]:checked').count(),0);
  await proceed.click();await page.waitForFunction(()=>window.__historyOpened===true);
  assert.deepEqual(writes,['/api/deductions/save-jobs']);assert.equal(jobs.length,1);assert.equal(jobs[0].description,'Additional Job');assert.equal(jobs[0].amountCents,100);
  assert.equal(await proceed.isEnabled(),true,'Saved Additional Job alone must still allow Proceed');
  await page.evaluate(()=>window.__historyOpened=false);
  await proceed.click();await page.waitForFunction(()=>window.__historyOpened===true);
  assert.equal(writes.length,1,'Proceed with unchanged saved jobs must not save them again');
  assert.equal(await host.locator('.additional-job-money > span').innerText(),'RM');
  await host.locator('[data-job-amount]').fill('50');await proceed.click();
  await page.waitForFunction(()=>document.querySelector('#job-test [data-job-amount]')?.value==='50.00');
  assert.equal(jobs.length,1);assert.equal(jobs[0].amountCents,5000);assert.equal(writes.length,2);
  await host.locator('[data-additional-toggle]').uncheck();assert.equal(await proceed.isEnabled(),false);
  await host.locator('[data-additional-toggle]').check();assert.equal(await proceed.isEnabled(),true);
  await host.locator('[data-job-amount]').fill('60');await host.locator('[data-job-save]').click();
  await page.waitForFunction(()=>document.querySelector('#job-test [data-job-amount]')?.value==='60.00');
  assert.equal(await proceed.isEnabled(),true,'Saving with Save Additional Jobs must not disable Proceed');
  await page.evaluate(()=>window.__historyOpened=false);
  await proceed.click();await page.waitForFunction(()=>window.__historyOpened===true);
  assert.equal(writes.length,3);assert.equal(jobs.length,1);
  await host.locator('[data-job-add]').click();assert.equal(await proceed.isEnabled(),false,'An incomplete extra row must be corrected');
  console.log('PASS: Additional Job only, RM1, Proceed saves exactly one job, no deduction, opens History.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
