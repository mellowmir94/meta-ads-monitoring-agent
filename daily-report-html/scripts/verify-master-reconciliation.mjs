import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { normalizePitstopPanelRows } from '../cloudflare/src/worker.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
// Read the current Master only. No production records are written by this check.
const workbook = JSON.parse(execFileSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'kv', 'key', 'get', 'current-workbook', '--binding', 'DASHBOARD_DATA', '--config', 'cloudflare/wrangler.jsonc', '--remote'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
const fields = ['No_ID', 'Branch', 'State', 'Type', 'Tier', 'branch_status', 'Zone', 'Country', 'Date_Live'];
const master = { pitstopMaster: workbook.data.pitstopMaster.map(row => Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]]))), pitstopRelocations: workbook.data.pitstopRelocations || [] };
const evidence = JSON.parse(await fs.readFile(path.join(root, 'cloudflare/test/fixtures/grafana-live-verification.json'), 'utf8'));
let js = await fs.readFile(path.join(root, 'src/dashboard.js'), 'utf8');
const init = js.indexOf("  if (document.readyState === 'loading')");
assert.ok(init > 0);
js = js.slice(0, init) + 'window.__masterAudit = { state, normalizePayload, mappedGrafanaPitstops };\n})();';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: js });
  const results = [];
  for (const label of ['day', 'week', 'mtd']) {
    const samples = evidence.cases.filter(sample => sample.label === label && sample.kind !== 'orders');
    const payload = { from: samples[0].from, to: samples[0].to, pitstops: samples.flatMap(sample => {
      const frame = sample.results.A.frames[0];
      const rows = frame.data.values[0].map((_, index) => Object.fromEntries(frame.schema.fields.map((field, column) => [field.name, frame.data.values[column][index]])));
      return normalizePitstopPanelRows(rows, { channel: sample.kind.toUpperCase() }, sample.from, sample.to);
    }) };
    const audit = await page.evaluate(({ master, payload }) => {
      const api = window.__masterAudit;
      api.state.data = api.normalizePayload(master, 'Current saved Pitstop Master');
      const mapped = api.mappedGrafanaPitstops(payload);
      const counts = api.state.pitstopReconciliation[payload.from + '::' + payload.to];
      return { ...counts, masterCount: api.state.data.pitstopMaster.length, mappedCount: mapped.rows.length,
        putrajaya: mapped.rows.filter(row => /putrajaya/i.test(row.name)).map(row => ({ name: row.name, state: row.state, sales: row.sales, target: row.target })),
        penangLabels: [...new Set(mapped.rows.filter(row => /pinang|penang/i.test(row.state)).map(row => row.state))] };
    }, { master, payload });
    assert.equal(audit.rawSales, audit.activeSales + audit.closedSales + audit.excluded.reduce((sum, row) => sum + row.sales, 0));
    const presint15 = audit.putrajaya.filter(row => /presint\s*15/i.test(row.name));
    console.log(label, JSON.stringify(audit));
    assert.equal(presint15.length, 1, 'HQ Presint 15 Putrajaya must not be duplicated');
    assert.equal(presint15[0].state, 'Putrajaya');
    assert.deepEqual(audit.penangLabels, ['Penang']);
    results.push({ label, from: payload.from, to: payload.to, ...audit });
  }
  await fs.mkdir(path.join(root, 'artifacts/workflow'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/workflow/master-reconciliation.json'), JSON.stringify({ checkedAt: new Date().toISOString(), note: 'Current production Master reconciled against separately captured Grafana evidence; not an authenticated production UI test.', results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
