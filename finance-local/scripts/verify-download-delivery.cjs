const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const start=html.indexOf('      function financeDeliverDownload('),end=html.indexOf('      const financeOptionalScriptLoads',start);
 assert.ok(start>=0&&end>start,'All exports need reusable direct Save links when automatic downloads are blocked');
 const browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||undefined});
 try{
  const page=await browser.newPage({acceptDownloads:true});await page.setContent('<main>Finance download test</main>');
  await page.addScriptTag({content:html.slice(start,end)});
  await page.evaluate(()=>{HTMLAnchorElement.prototype.click=function(){};financeDeliverDownload(new Blob(['test'],{type:'text/csv'}),'Rider Name.csv');});
  const link=page.locator('[data-finance-file-link]');assert.equal(await link.count(),1);
  const download=page.waitForEvent('download');await link.click();const file=await download;
  assert.equal(file.suggestedFilename(),'Rider Name.csv');assert.equal(await file.failure(),null);
  // The very same prepared file can be saved repeatedly without any regeneration.
  const again=page.waitForEvent('download');await link.click();assert.equal((await again).suggestedFilename(),'Rider Name.csv');
  await page.locator('[data-finance-download-clear]').click();assert.equal(await link.count(),0);
  console.log('PASS: blocked automatic download recovered by direct Save link; repeat save; clear files. Browser: '+(process.env.TEST_BROWSER_CHANNEL||'chromium'));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
