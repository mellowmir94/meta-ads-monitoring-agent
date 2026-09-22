const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const start=html.indexOf('      function financeDeliverDownload('),end=html.indexOf('      const financeOptionalScriptLoads',start);
 assert.ok(start>=0&&end>start,'All exports need the shared Edge-safe download helper');
 const browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||undefined});
 try{
  const page=await browser.newPage({acceptDownloads:true});await page.setContent('<main>Finance download test</main>');
  await page.addScriptTag({content:html.slice(start,end)});
  const download=page.waitForEvent('download');await page.evaluate(()=>financeDeliverDownload(new Blob(['test'],{type:'text/csv'}),'Rider Name.csv'));const file=await download;
  assert.equal(file.suggestedFilename(),'Rider Name.csv');assert.equal(await file.failure(),null);
  const again=page.waitForEvent('download');await page.evaluate(()=>financeDeliverDownload(new Blob(['again'],{type:'text/csv'}),'Rider Name.csv'));assert.equal((await again).suggestedFilename(),'Rider Name.csv');
  assert.equal(await page.getByText('Files ready',{exact:true}).count(),0,'Downloads must not show the old Files ready popup');
  const store=page.locator('#financePreparedDownloads');assert.equal(await store.count(),1);assert.equal(await store.isVisible(),false);
  console.log('PASS: automatic download and repeat download work without the Files ready popup. Browser: '+(process.env.TEST_BROWSER_CHANNEL||'chromium'));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
