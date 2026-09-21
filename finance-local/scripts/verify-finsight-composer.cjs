const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const root = path.resolve(__dirname,'..');
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m=>m[0]).join('');
  const start = '<!-- BEGIN LEDGER FINSIGHT: PANEL -->', end = '<!-- END LEDGER FINSIGHT -->';
  const panel = html.slice(html.indexOf(start)+start.length,html.indexOf(end,html.indexOf(start)));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(styles+panel);
    await page.locator('#tab-finsight').evaluate(el=>el.hidden=false);
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1100});
      for (const theme of ['dark','light']) {
        await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
        await page.locator('#finsightQuestion').focus();
        const box = await page.locator('#finsightQuestion').evaluate(el=>{
          const style=getComputedStyle(el), rect=el.getBoundingClientRect(), chat=el.closest('.finsight-ledger-chat').getBoundingClientRect();
          const outward=Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));
          return {left:rect.left-outward,clipLeft:chat.left,right:rect.right+outward,clipRight:chat.right,shadow:style.boxShadow};
        });
        assert.ok(box.left>=box.clipLeft,`Focus ring clipped on left: ${JSON.stringify(box)}`);
        assert.ok(box.right<=box.clipRight,'Focus ring clipped on right');
        assert.equal(box.shadow,'none','No competing global focus shadow');
        await page.locator('#finsightForm').screenshot({path:path.join(root,`preview-evidence/composer-${theme}-${width}.png`)});
      }
    }
    console.log('Composer focus border fits chat container at desktop/mobile in both themes.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
