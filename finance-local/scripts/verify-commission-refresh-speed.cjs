const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../cloudflare/public');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || undefined });
  try {
    const page = await browser.newPage();
    const requests = [], errors = [];
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    html = html.replace('const LOCAL_PREVIEW = ["127.0.0.1", "localhost"].includes(location.hostname);', 'const LOCAL_PREVIEW = false;');
    html = html.replace('async function loadActiveTabData(force = false) {', 'window.__refreshCommission = () => loadGrafanaData("commission-main", true);\nwindow.__commission = () => ({loaded:state.api.loaded["commission-main"],loading:state.api.loading["commission-main"],metrics:state.metricRows["commission-main"]});\nasync function loadActiveTabData(force = false) {');
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname.startsWith('/api/')) {
        let body = { records: [], jobs: [] };
        if (url.pathname.includes('concurrency')) body = { status: 'admitted', admitted: true };
        if (url.pathname === '/api/data-source/settings') body = { live: true, weeks: [] };
        if (url.pathname === '/api/grafana/finance' || url.pathname === '/api/finance/data') {
          requests.push(url.searchParams.get('part'));
          // Deliberately never finish dropdown discovery or the old all-in-one path.
          if (url.searchParams.get('part') !== 'primary') return;
          body = { from: '2026-09-14 00:00:00', to: '2026-09-20 23:59:59', rows: [{order_id:'1',commission:20,rider_name:'Test Rider'}], metricRows:[{order_count:2,total_commission:35}],filterState:{},filterOptions:{} };
        }
        return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      }
      const file = path.join(root, url.pathname);
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({path:file});
      return route.fulfill({status:404,body:''});
    });
    await page.goto('http://localhost/');
    await page.waitForFunction(() => window.__commission?.().loaded, {timeout:10000});
    for (let n = 0; n < 2; n++) {
      const start = Date.now();
      await Promise.race([page.evaluate(() => window.__refreshCommission()), new Promise((_,reject) => setTimeout(() => reject(new Error('Refresh waited for dropdowns')),5000))]);
      const state = await page.evaluate(() => window.__commission());
      assert.equal(state.loading,false);
      assert.equal(state.metrics[0].total_commission,35);
      console.log(`Refresh ${n+1}: ${Date.now()-start}ms with dropdown request stalled`);
    }
    assert.ok(requests.filter(part => part === 'primary').length >= 3);
    assert.ok(!requests.includes(null), 'No all-in-one Commission request');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
