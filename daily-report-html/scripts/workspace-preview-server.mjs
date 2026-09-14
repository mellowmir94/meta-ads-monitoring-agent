import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'cloudflare', 'public');
const port = Number(process.env.WORKSPACE_PREVIEW_PORT || 8790);
const dates = Array.from({ length: 14 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`);
const master = [
  ['HQ PERLING', 'HQ', 'Johor', 'Southern', 'Tier 1'], ['HQ MUTIARA RINI', 'HQ', 'Johor', 'Southern', 'Tier 1'], ['HQ KAPAR', 'HQ', 'Selangor', 'Central', 'Tier 2'], ['HQ PRESINT 15 PUTRAJAYA', 'HQ', 'Putrajaya', 'Central', 'Tier 1'],
  ['BP JOHOR JAYA', 'BP', 'Johor', 'Southern', 'Tier 1'], ['BP KLANG', 'BP', 'Selangor', 'Central', 'Tier 2'], ['BP BUKIT MERTAJAM', 'BP', 'Penang', 'Northern', 'Tier 1'], ['BP TELUK INTAN', 'BP', 'Perak', 'Northern', 'Tier 3']
].map(([Branch, Type, State, Region, Tier]) => ({ Branch, Type, State, Region, Tier, branch_status: 'active', Country: 'Malaysia' }));
const sourceRows = (from, to) => dates.filter(date => date >= from && date <= to);
const source = { generatedAt: '2026-09-12T06:30:00.000Z', health: { sources: [
  { id: 'pitstop', label: 'Grafana HQ/BP performance', status: 'ok', generatedAt: '2026-09-12T06:29:20.000Z', lastSuccessAt: '2026-09-12T06:29:20.000Z', recordCount: 8, latencyMs: 129, from: '2026-09-11', to: '2026-09-11' },
  { id: 'email-sales', label: 'Grafana Order - Daily', status: 'ok', generatedAt: '2026-09-12T06:29:20.000Z', lastSuccessAt: '2026-09-12T06:29:20.000Z', recordCount: 1, latencyMs: 98, from: '2026-09-11', to: '2026-09-11' },
  { id: 'rsa', label: 'RSA manual input', status: 'ok', generatedAt: '2026-09-12T06:29:20.000Z', lastSuccessAt: '2026-09-12T06:29:20.000Z', recordCount: 1, latencyMs: 1, from: '2026-09-11', to: '2026-09-11' },
  { id: 'resq', label: 'ResQ manual input', status: 'empty', generatedAt: '2026-09-12T06:29:20.000Z', lastSuccessAt: '2026-09-12T06:29:20.000Z', recordCount: 0, latencyMs: 1, from: '2026-09-11', to: '2026-09-11' },
  { id: 'warranty', label: 'Warranty attendance', status: 'error', generatedAt: '2026-09-12T06:29:20.000Z', lastSuccessAt: '2026-09-10T06:29:20.000Z', lastErrorAt: '2026-09-12T06:29:20.000Z', error: 'Source query failed. Check Grafana connectivity and datasource access, then retry.', recordCount: null, latencyMs: 220, from: '2026-09-11', to: '2026-09-11' }
], b2wSync: { status: 'ok', lastSuccessAt: '2026-09-12T02:10:00.000Z', lastErrorAt: null } }, jobs: [{ id: 'preview-archive-01', sourceName: 'Historical Pitstop Sales', status: 'failed', createdAt: '2026-09-12T01:30:00.000Z', updatedAt: '2026-09-12T02:00:00.000Z', totalMonths: 3, completedMonths: 2, totalRows: 980, completedRows: 614, error: 'June batch could not publish. Its completed months are retained.', months: [{ month: '2026-04', rowCount: 302, status: 'completed', attempts: 1 }, { month: '2026-05', rowCount: 312, status: 'completed', attempts: 1 }, { month: '2026-06', rowCount: 366, status: 'failed', attempts: 2, error: 'A newer archived value exists.' }] }], backups: { retentionDays: 30, maxPerKind: 31, lastScheduledAt: '2026-09-12T00:05:00.000Z', items: [{ id: 'rsa-preview-01', kind: 'rsa', trigger: 'scheduled', createdAt: '2026-09-12T00:05:00.000Z', recordCount: 14, bytes: 2600 }, { id: 'b2w-preview-01', kind: 'b2w', trigger: 'manual', createdAt: '2026-09-11T07:10:00.000Z', recordCount: 14, bytes: 1800 }] } };
function json(response, value, status = 200) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); }
function staticFile(request, response) {
  let pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = path.resolve(publicDir, '.' + pathname);
  if (!target.startsWith(publicDir) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return false;
  response.writeHead(200, { 'content-type': target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(target).pipe(response); return true;
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`), rows = sourceRows(url.searchParams.get('from') || dates[0], url.searchParams.get('to') || dates.at(-1));
  if (!url.pathname.startsWith('/api/')) { if (!staticFile(request, response)) { response.writeHead(404); response.end('Not found'); } return; }
  if (url.pathname === '/api/operations') return json(response, source);
  if (url.pathname === '/api/operations/check') return json(response, { from: url.searchParams.get('from') || '2026-09-11', to: url.searchParams.get('to') || '2026-09-11', sources: source.health.sources });
  if (url.pathname === '/api/operations/backups') return json(response, { backups: source.backups.items });
  if (url.pathname.startsWith('/api/operations/jobs/')) return json(response, { job: source.jobs[0] });
  if (url.pathname === '/api/data') return json(response, { data: { sourceName: 'Local preview master', pitstopMaster: master } });
  if (url.pathname === '/api/pitstop-performance') { const pitstops = master.map((item, index) => ({ date: rows.at(-1) || dates.at(-1), channel: item.Type, pitstop: item.Branch, sales: rows.length * (index % 3 === 0 ? 14 : 9) })); return json(response, { from: rows[0], to: rows.at(-1), source: 'Local preview Grafana fixture', generatedAt: source.generatedAt, pitstops, channelTotals: { hq: pitstops.filter(row => row.channel === 'HQ').reduce((sum, row) => sum + row.sales, 0), bp: pitstops.filter(row => row.channel === 'BP').reduce((sum, row) => sum + row.sales, 0) } }); }
  if (url.pathname === '/api/email-sales') return json(response, { from: rows[0], to: rows.at(-1), source: 'Local preview Grafana fixture', rows: rows.map((date, i) => ({ date, b2c: 126 + i * 7, b2b2c: 91 + i * 4, all: 217 + i * 11, movingAverageAll: 230 })) });
  if (url.pathname === '/api/resq') return json(response, { from: rows[0], to: rows.at(-1), rows: rows.map((date, i) => ({ date, resQSelangor: 6 + i % 4, resQJb: 1 + i % 3, resQPahang: i % 3, resQPenang: i % 2 })) });
  if (url.pathname === '/api/warranty') return json(response, { from: rows[0], to: rows.at(-1), rows: rows.map((date, i) => ({ date, warranty1st: 132 + i, warranty2nd: i % 3, warranty3rd: 0 })) });
  if (url.pathname === '/api/rsa-values') return json(response, { values: Object.fromEntries(rows.map((date, i) => [date, { rsaJumpstart: 17 + i, rsaTyrePatch: 9 + i % 5, rsaFuel: i % 3 }])) });
  if (url.pathname === '/api/b2w') return json(response, { values: Object.fromEntries(rows.map((date, i) => [date, 25 + i * 3])) });
  if (url.pathname === '/api/bgarage-summary-values' || url.pathname === '/api/indonesia-summary-values') return json(response, { values: {} });
  if (url.pathname === '/api/concurrency/heartbeat') return json(response, { status: 'admitted' });
  return json(response, { ok: true, rows: [] });
});
server.listen(port, '127.0.0.1', () => console.log(`Workspace preview: http://127.0.0.1:${port}`));
