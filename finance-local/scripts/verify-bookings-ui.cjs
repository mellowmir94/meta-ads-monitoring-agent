const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
class Store {
  data=new Map();async get(k){return structuredClone(this.data.get(k));}async put(k,v){this.data.set(k,structuredClone(v));}
  async list({prefix='',startAfter='',limit=Infinity}={}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)&&k>startAfter).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,limit).map(([k,v])=>[k,structuredClone(v)]));}
  async transaction(fn){return fn(this);}
}
(async()=>{
  const root=path.resolve(__dirname,'..'),{handleBookings}=await import(pathToFileURL(path.join(root,'cloudflare/src/bookings.js'))),storage=new Store(),browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('ledger-local-finance-active-tab','bookingjobs'));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname.startsWith('/api/bookings')){const res=await handleBookings(storage,new Request('http://test/booking'+url.pathname.slice('/api/bookings'.length)+url.search,{method:request.method(),...(request.postData()?{body:request.postData()}:{})}),{name:'Test Finance',sessionId:'test'});return route.fulfill({status:res.status,contentType:'application/json',body:await res.text()});}
      if(url.hostname!=='127.0.0.1')return route.abort();
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[],jobs:[],next:null})});
      const file=url.pathname==='/'?path.join(root,'index.html'):path.join(root,'cloudflare/public',decodeURIComponent(url.pathname));
      if(!file.startsWith(root)||!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
      return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html'});
    });
    await page.goto('http://127.0.0.1:8456/');
    await page.locator('#bookingJobsView h2').waitFor();
    await page.locator('[data-booking-upload]').setInputFiles('C:/Users/AmirKhalil/Desktop/All Data Bateriku/Week 38 Sales.xlsx');
    await page.locator('[data-booking-confirm]:enabled').waitFor({timeout:30000}).catch(async error=>{console.error(await page.locator('dialog').allTextContents(),await page.locator('.booking-message').allTextContents(),errors);throw error;});
    assert.match(await page.locator('[data-booking-preview]').innerText(),/10026 new/);assert.equal(await page.locator('[data-booking-import-week]').inputValue(),'2026-09-14');assert.equal(storage.data.size,0);
    await page.locator('[data-booking-confirm]').click();
    await page.waitForFunction(()=>document.querySelector('[data-booking-import-message]')?.textContent.includes('Import saved'),{},{timeout:60000});
    assert.equal((await storage.list({prefix:'booking:'})).size,10026);
    await page.waitForFunction(()=>!document.querySelector('[data-booking-refresh]')?.disabled);
    await page.keyboard.press('Escape');
    await page.locator('[data-booking-filter="week"]').fill('2026-09-21');await page.locator('[data-booking-filter="week"]').dispatchEvent('change');
    await page.locator('[data-booking-filter="view"]').selectOption('carried');
    assert.ok(await page.locator('[data-booking-detail]').count()>0);
    assert.ok(!(await page.locator('.booking-table tbody').innerText()).includes('cancelled'));
    await page.locator('[data-booking-filter="view"]').selectOption('all');
    await page.locator('[data-booking-search]').fill('3310981');
    await page.locator('[data-booking-detail="3310981"]').click();
    await page.locator('[data-booking-edit]').waitFor();await page.locator('[data-booking-edit] [name=date]').fill('2026-09-29');await page.locator('[data-booking-edit] [name=note]').fill('Customer requested next week');await page.getByRole('button',{name:'Save assignment',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-booking-edit]')?.textContent.includes('Assignment saved'));
    assert.equal((await storage.get('booking:3310981')).assignedWeek,'2026-09-28');await page.keyboard.press('Escape');
    await page.locator('[data-booking-reset]').click();await page.locator('[data-booking-filter="view"]').selectOption('all');await page.locator('[data-booking-filter="status"]').selectOption('');
    const downloadEvent=page.waitForEvent('download');await page.locator('[data-booking-export]').click();const download=await downloadEvent;await download.saveAs(path.join(root,'preview-evidence/booking-jobs-test.xlsx'));
    await page.locator('[data-booking-filter="view"]').selectOption('week');await page.locator('[data-booking-filter="status"]').selectOption('active');
    for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(root,'preview-evidence/booking-jobs-'+width+'.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Page should not overflow horizontally');}
    await page.setViewportSize({width:1440,height:1000});await page.locator('#financeSidebar [data-tab="commission"]').click();assert.equal(await page.locator('#tab-bookingjobs').isVisible(),false);await page.locator('#financeSidebar [data-tab="bookingjobs"]').click();assert.equal(await page.locator('#financeSidebar .nav-button.active').count(),1);
    assert.deepEqual(errors,[]);console.log('PASS: full dashboard, real 10,026-row workbook preview/import, carried-forward view, assignment history, Excel export, desktop/mobile layout. Production data untouched.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
