// Loopback-only product preview. All riders, source rows and deductions are synthetic.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeductionRegister, deductionsApi } from '../cloudflare/src/deductions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.COMMISSION_PREVIEW_PORT || 4320);
const rows = Array.from({ length: 28 }, (_, i) => ({
  order_id: String(9300100 + i), parent_id: '',
  created_at: '2026-09-07 09:15:00',
  request_at: '2026-09-07 09:30:00',
  rider_name: i < 20 ? 'DEMO · AHMAD DANIAL' : 'DEMO · NUR HAKIM',
  rider_category: 'MOTEC/A-TEAM', arrival_status: i % 6 === 0 ? 'pending' : 'arrived',
  order_status: i % 6 === 0 ? 'cancelled' : 'completed',
  branch_name: 'HQ MELAKA', vpn: `DEMO${100 + i}`, products: ['NS60L MF ASTRA', 'DIN55L MF VARTA', 'NS70L MF AMARON'][i % 3],
  battery_size: ['NS60L', 'DIN55L', 'NS70L'][i % 3], vehicle_name: ['Myvi 2017–2024', 'Saga 2019–2025', 'City 2020–2025'][i % 3],
  promocode: '', level: i % 6 === 0 ? 'CANCEL ARRIVED' : 'LOW', payment_type: 'cash',
  payment_status: 'Completed', sales_source: 'Walk in', quantity: 1, commission: i < 20 ? 30 : 20
})).map((row, i) => {
  const day = new Date(Date.UTC(2026, 8, 7 + i % 7)).toISOString().slice(0, 10);
  return { ...row, created_at: day + ' 09:15:00', request_at: day + ' 09:30:00' };
});

class MemoryStorage {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); }
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async delete(key) { this.data.delete(key); }
  async list({ prefix = '', startAfter, limit } = {}) {
    return new Map([...this.data].sort(([a], [b]) => a.localeCompare(b)).filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).slice(0, limit));
  }
  transaction(fn) {
    const result = this.queue.then(async () => { const before = structuredClone(this.data); try { return await fn(this); } catch (error) { this.data = before; throw error; } });
    this.queue = result.catch(() => {}); return result;
  }
}
const storage = new MemoryStorage();
const register = new DeductionRegister({ storage });
const env = {
  DEDUCTIONS: { idFromName: value => value, get: () => register },
  DEDUCTION_DELETE_PIN: '4321',
  FINANCE_PROXY_SHARED_SECRET: 'local-preview-only',
  GRAFANA_PROXY: { fetch: async request => {
    const url = new URL(request.url), from = (url.searchParams.get('from') || '').slice(0, 10), to = (url.searchParams.get('to') || '').slice(0, 10);
    const selected = rows.filter(row => row.created_at.slice(0, 10) >= from && row.created_at.slice(0, 10) <= to);
    return Response.json({ ok: true, source: 'Grafana Finance', panel: 'commission-main', part: 'primary', rows: selected, rowCount: selected.length, truncated: false, summaryError: '', from: from + ' 00:00:00', to: to + ' 23:59:59' });
  } }
};

function previewHtml(html, url) {
  const role = url.searchParams.get('role') === 'checker' ? 'checker' : 'maker';
  const setup = `
      // Local-preview injection only: never written into production index.html.
      const previewRows = ${JSON.stringify(rows)};
      auditRestore();
      state.data['commission-main'] = previewRows;
      state.dates['commission-main'] = {start:'2026-09-07 00:00:00',end:'2026-09-13 23:59:59'};
      state.dateDrafts['commission-main'] = structuredClone(state.dates['commission-main']);
      state.filters['commission-main'] = Object.fromEntries(filtersForPanel(panels.find(p=>p.id==='commission-main')).map(f=>[f.key,[]]));
      const previewFetch = window.fetch.bind(window);
      window.fetch = (input, options={}) => String(input).startsWith('/api/deductions') ? previewFetch(input, {...options, headers:{...options.headers,'x-preview-role':'${role}'}}) : previewFetch(input, options);
      window.__commissionPreview = { rows: previewRows, setRider: (name) => {state.search['commission-main']=name;state.search['commission-main:table']=name;render();}, showAll: () => {state.search['commission-main']='';state.search['commission-main:table']='';render();}, render };
      document.title = 'LOCAL PREVIEW — Commission Rider';
      const previewBanner = document.createElement('div');
      previewBanner.className = 'commission-preview-banner';
      previewBanner.innerHTML = '<strong>LOCAL PREVIEW</strong> Synthetic riders · no live deductions <span>${role === 'checker' ? 'Checker view' : 'Finance maker view'}</span><a href="/?role=${role === 'checker' ? 'maker' : 'checker'}">Switch to ${role === 'checker' ? 'maker' : 'checker'}</a>';
      document.body.prepend(previewBanner);
      ${url.searchParams.get('rider') === 'ahmad' ? "window.__commissionPreview.setRider('DEMO · AHMAD DANIAL');" : ''}
  `;
  const marker = '      setStatus(LOCAL_PREVIEW ? "Local layout preview"';
  html = html.replace(marker, setup + '\n' + marker);
  return html.replace('</head>', `<style>.commission-preview-banner{display:flex;gap:12px;align-items:center;padding:8px 16px;background:#fff3cf;color:#62430b;font:12px/1.4 'Segoe UI',sans-serif;position:relative;z-index:1}.commission-preview-banner span{margin-left:auto}.commission-preview-banner a{color:inherit;font-weight:700}.finance-table-fullscreen-layer::before{content:'LOCAL PREVIEW · synthetic data';position:absolute;bottom:5px;right:16px;z-index:10;font-size:10px;color:var(--text-soft);pointer-events:none}@media(max-width:650px){.commission-preview-banner{flex-wrap:wrap}}</style></head>`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/__preview/reset' && req.method === 'POST') {
      // Test harness reset: this process holds no production data or credentials.
      await storage.queue; storage.data.clear(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"reset":"synthetic-preview-only"}'); return;
    }
    if (url.pathname === '/api/public-holidays' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ dates: ['2026-09-16'], source: 'Government of Malaysia · preview fixture' })); return;
    }
    if (url.pathname.startsWith('/api/deductions')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const role = req.headers['x-preview-role'] === 'checker' ? 'checker' : 'maker';
      const request = new Request(url, { method: req.method, headers: { ...req.headers, origin: url.origin }, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
      const response = await deductionsApi(request, env, { sessionId: `preview-${role}`, name: `Demo Finance ${role}`, role });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    let path, contentType;
    if (url.pathname === '/' || url.pathname === '/index.html') { path = resolve(root, 'index.html'); contentType = 'text/html; charset=utf-8'; }
    else if (/^\/vendor\/[a-z0-9.-]+\.js$/i.test(url.pathname)) { path = resolve(root, 'vendor', basename(url.pathname)); contentType = 'text/javascript; charset=utf-8'; }
    else if (/^\/assets\/[a-z0-9.-]+\.png$/i.test(url.pathname)) { path = resolve(root, 'cloudflare', 'public', 'assets', basename(url.pathname)); contentType = 'image/png'; }
    else { res.writeHead(404); res.end('Not found'); return; }
    const content = await readFile(path);
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(contentType.startsWith('text/html') ? previewHtml(content.toString(), url) : content);
  } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local Commission Rider preview: http://127.0.0.1:${port} — synthetic data, no deployment`));
