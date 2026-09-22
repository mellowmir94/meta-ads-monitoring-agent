const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../cloudflare/public');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||undefined});
 try {
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[],requests=[];
  let live=true,hasWeek=false,fail=false;
  const meta={start:'2026-09-14',end:'2026-09-20',updatedAt:'2026-09-22T10:00:00Z',rowCount:1};
  const payload={from:meta.start+' 00:00:00',to:meta.end+' 23:59:59',rows:[{order_id:'1',rider_name:'Test Rider',commission:20,quantity:1,created_at:'2026-09-15 12:00:00'}],rowCount:1,metricRows:[{order_count:2,total_commission:35}],metricRowsScope:'saved',syncedAt:meta.updatedAt,source:'Synced data'};
  let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  // Expose read-only state for assertions; use real UI handlers for every change.
  html=html.replace('const financeSource = {','window.__sourceState=()=>({live:financeSource.live,rows:state.data["commission-main"],metrics:state.metricRows["commission-main"]});\nconst financeSource = {');
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='localhost')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname.startsWith('/api/')){
    requests.push(url.pathname);
    let body={records:[],jobs:[],next:null},status=200;
    if(url.pathname.startsWith('/api/concurrency/'))body={status:'admitted',admitted:true};
    if(url.pathname==='/api/data-source/settings'){if(route.request().method()==='POST')live=route.request().postDataJSON().live;body={live,weeks:hasWeek?[meta]:[]};}
    if(url.pathname==='/api/data-source/sync'){if(fail){status=400;body={error:'Sync incomplete. Previous week kept.'};}else{hasWeek=true;body=meta;}}
    if(url.pathname==='/api/data-source/data'){if(hasWeek&&url.searchParams.get('from')===meta.start){body=payload;}else{status=404;body={error:'No synced data for this week. Select Sync now.'};}}
    if(url.pathname==='/api/grafana/finance'||url.pathname==='/api/finance/data')body={...payload,syncedAt:undefined,source:'Grafana'};
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   }
   const file=path.join(root,url.pathname);if(file.startsWith(root)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});return route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost/');
  await page.locator('[data-source-settings]').evaluate(el=>el.click());
  await page.locator('[data-source-week]').fill('2026-09-14');await page.locator('[data-source-week]').dispatchEvent('change');
  await page.locator('[data-source-sync]').click();await page.getByText('Week synced successfully.',{exact:true}).waitFor();
  await page.locator('[data-source-live]').uncheck();
  await page.getByText('Live data OFF. Downloads use the saved week.',{exact:true}).waitFor();
  const state=await page.evaluate(()=>window.__sourceState());assert.equal(state.live,false);assert.equal(state.rows.length,1);assert.equal(state.metrics[0].total_commission,35);
  const count=requests.filter(p=>p.includes('grafana')||p==='/api/finance/data').length;
  await page.locator('[data-source-use]').click();await page.waitForTimeout(300);
  assert.equal(requests.filter(p=>p.includes('grafana')||p==='/api/finance/data').length,count);
  fail=true;await page.locator('[data-source-sync]').click();await page.getByText('Sync incomplete. Previous week kept.',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.__sourceState())).rows[0].commission,20);
  await page.locator('[data-source-live]').check();await page.getByText('Live data ON.',{exact:true}).waitFor();
  assert.ok(requests.filter(p=>p.includes('grafana')||p==='/api/finance/data').length>count);
  live=false;
  html=html.replace('const LOCAL_PREVIEW = ["127.0.0.1", "localhost"].includes(location.hostname);','const LOCAL_PREVIEW = false;');
  const beforeReload=requests.filter(p=>p.includes('grafana')||p==='/api/finance/data').length;
  await page.reload();
  await page.waitForFunction(()=>typeof window.__sourceState==='function'&&window.__sourceState().live===false);
  await page.waitForTimeout(500);
  assert.equal(requests.filter(p=>p.includes('grafana')||p==='/api/finance/data').length,beforeReload,'Restored OFF preference must prevent startup Grafana requests');
  assert.deepEqual(errors,[]);
  console.log('PASS: Settings sync, mode switching, independent KPI totals, failed-sync retention and zero Grafana requests in synced mode');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
