const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||undefined});
 try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="fixture"></main>');
  await page.addScriptTag({content:`
   const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
   const formatMoney=v=>'RM '+Number(v).toFixed(2),formatNumber=String;
   const dates={start:'2026-09-14',end:'2026-09-20'};
   const auditCapture=()=>({scope:{dates}}),numberValue=v=>Number(v||0);
   function render(){document.getElementById('fixture').innerHTML=deductionSummaryMarkup([{rider_name:'Test Rider',commission:770}],'main');deductionUpdateInline(document.querySelector('.deduction-workspace'));}
  `});
  await page.addScriptTag({path:path.join(root,'deductions.js')});
  await page.addScriptTag({path:path.join(root,'additional-jobs.js')});
  await page.evaluate(()=>{
   deductionState.loaded=true;additionalJobsState.loaded=true;
   deductionState.records=[{id:'saved-epf',type:'epf',amountCents:2500}];
   // Existing persisted totals must not leak into this new selection preview.
   deductionSummaryForRows=()=>({loaded:true,grossCents:77000,additionalCents:0,amounts:{epf:2500,insurance:0,'battery-tester':0,manual:0},statementAmounts:{epf:2500,insurance:0,'battery-tester':0,manual:0},approvedCents:2500,netCents:74500});
   render();
  });
  const total=page.locator('.deduction-settlement-strip > div').nth(2).locator('strong');
  assert.ok(await page.evaluate(()=>Boolean(document.querySelector('.additional-jobs').compareDocumentPosition(document.querySelector('.deduction-settlement-strip')) & Node.DOCUMENT_POSITION_FOLLOWING)),'Totals must follow Additional Jobs');
  const net=page.locator('.commission-net-total strong');
  const check=async(amount)=>{
   assert.equal(await total.innerText(),'RM '+amount.toFixed(2));
   assert.equal(await net.innerText(),'RM '+(770-amount).toFixed(2));
   assert.equal(await page.locator('.deduction-inline-total').innerText(),'Total Deducted: RM '+amount.toFixed(2));
   assert.equal(await page.locator('.additional-jobs > strong').innerText(),'Selection preview: RM 770.00 + RM 0.00 − RM '+amount.toFixed(2)+' = RM '+(770-amount).toFixed(2));
  };
  await check(0);
  const epf=page.locator('[data-deduction-inline-type][value="epf"]'),insurance=page.locator('[data-deduction-inline-type][value="insurance"]'),battery=page.locator('[data-deduction-inline-type][value="battery-tester"]'),manual=page.locator('[data-deduction-inline-type][value="manual"]');
  await epf.check();await check(25);
  await page.locator('[data-deduction-inline-amount="insurance"]').fill('19.44');await insurance.check();await check(44.44);
  await epf.uncheck();await check(19.44);
  await battery.check();await check(69.44);
  await page.locator('[data-deduction-inline-battery-plan]').selectOption('fixed-7');await check(59.44);
  await page.locator('[data-deduction-inline-amount="manual"]').fill('60');await page.locator('[data-deduction-inline-manual-count]').fill('2');await manual.check();await check(89.44);
  await insurance.uncheck();await battery.uncheck();await manual.uncheck();await check(0);
  await epf.check();await page.evaluate(()=>render());await check(25);
  await epf.uncheck();await check(0);
  assert.deepEqual(await page.evaluate(()=>deductionState.records),[{id:'saved-epf',type:'epf',amountCents:2500}]);
  assert.deepEqual(errors,[]);
  console.log('PASS: unchecked zero, EPF25, mixed types, amount/plan edits, rerender, untick reset, history unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
