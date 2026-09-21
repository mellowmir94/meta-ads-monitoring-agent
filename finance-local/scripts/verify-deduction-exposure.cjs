const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const root = path.resolve(__dirname,'..');
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(match=>match[0]).join('');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(styles+'<main id="fixture" style="max-width:650px;margin:20px"></main>');
    await page.addScriptTag({content:`const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'); const formatNumber = value => value.toLocaleString('en-US'); const deductionMoney = value => 'RM '+(value/100).toFixed(2); const deductionTypes = {epf:'EPF',insurance:'Insurance','battery-tester':'OBD / Battery Tester',manual:'Special Case'}; const deductionHistoryProgress = record => ({items:record.installments}); const deductionInstallmentAmount = (record,item) => item.amountCents; const deductionState = {loaded:true,records:Object.keys(deductionTypes).map(type => ({type,status:'applied',installments:[{status:'applied',dueDate:'2026-09-01',amountCents:2500},{status:'applied',dueDate:'2026-09-08',amountCents:1800,statementSentAt:'2026-09-08'},{status:'applied',dueDate:'2026-09-15',amountCents:1200,completion:{state:'completed'}}]}))}; function render(){document.getElementById('fixture').innerHTML=deductionExposureChart();}`});
    await page.addScriptTag({path:path.join(root,'assets/history-workflow.js')});
    await page.addScriptTag({path:path.join(root,'deduction-exposure.js')});
    await page.evaluate(()=>render());
    for (const theme of ['dark','light']) {
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for (const width of [900,390]) {
        await page.setViewportSize({width,height:1100});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
        await page.screenshot({path:path.join(root,`preview-evidence/exposure-${theme}-${width}.png`),fullPage:true});
      }
    }
    await page.locator('[data-exposure-field="metric"]').selectOption('count');
    assert.match(await page.locator('.deduction-exposure-summary').innerText(),/8 payments/);
    await page.locator('[data-exposure-field="progress"]').selectOption('completed');
    assert.equal(await page.locator('.deduction-exposure-segment').count(),4);
    await page.locator('[data-exposure-field="month"]').fill('2027-01');
    assert.match(await page.locator('.empty-state').innerText(),/No installments/);
    await page.locator('[data-exposure-reset]').click();
    assert.equal(await page.locator('.deduction-exposure-segment').count(),12);
    console.log('Exposure chart: responsive dark/light, filters, count toggle and empty state passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
