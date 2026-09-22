// Weekly datasets are immutable R2 objects; only the successful-week pointer changes.
import { createDeductionSnapshot } from './deduction-backup.js';
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export function syncWeek(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) throw Error('Select a Monday–Sunday week.');
  const date = new Date(start + 'T00:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10) !== start || date.getUTCDay() !== 1 || Date.parse(end + 'T00:00:00Z') - date !== 6 * 86400000) throw Error('Select a complete Monday–Sunday week.');
  return start;
}
export function validateSyncPayload(payload) {
  if (!payload || payload.ok === false || payload.error || payload.truncated || payload.summaryError) throw Error('Sync incomplete. The previous saved week was kept.');
  if (!Array.isArray(payload.rows) || payload.rowCount !== payload.rows.length || payload.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw Error('Incomplete Commission Rider table. The previous saved week was kept.');
  if (!Array.isArray(payload.metricRows) || payload.metricRows.length !== 1 || !['order_count','total_commission'].every(key => typeof payload.metricRows[0][key] === 'number' && Number.isFinite(payload.metricRows[0][key]))) throw Error('Both KPI sources must load successfully before syncing.');
}
export async function handleDataSource(register, request, actor) {
  const { storage, env } = register, url = new URL(request.url), path = url.pathname;
  // PIN logins share display names, so isolate preferences by authenticated session.
  const prefKey = 'sync-pref:' + encodeURIComponent(actor.sessionId);
  try {
    if (path === '/source/settings' && request.method === 'GET') {
      const weeks = [...(await storage.list({ prefix: 'sync-week:' })).values()].sort((a,b) => b.start.localeCompare(a.start));
      return reply({ live: (await storage.get(prefKey))?.live !== false, weeks });
    }
    if (path === '/source/settings' && request.method === 'POST') {
      const input = await request.json();
      if (typeof input.live !== 'boolean') throw Error('Choose Live data ON or OFF.');
      await storage.put(prefKey, { live: input.live });
      return reply({ live: input.live });
    }
    if (path === '/source/data' && request.method === 'GET') {
      const start = (url.searchParams.get('from') || '').slice(0,10), end = (url.searchParams.get('to') || '').slice(0,10);
      syncWeek(start,end);
      const meta = await storage.get('sync-week:' + start);
      if (!meta) return reply({ error: 'No synced data for this week. Select Sync now.' },404);
      const object = await env.DEDUCTION_BACKUPS.get(meta.key);
      if (!object) throw Error('Saved data is unavailable. Sync this week again.');
      const saved = await object.json(); validateSyncPayload(saved.payload);
      return reply({ ...saved.payload, source: 'Synced data', syncedAt: meta.updatedAt, metricRowsScope: 'synced-week:' + start, filterState: null });
    }
    if (path !== '/source/sync' || request.method !== 'POST') return reply({ error: 'Not found' },404);
    const { start, end } = await request.json(); syncWeek(start,end);
    if (!env.GRAFANA_PROXY || !env.FINANCE_PROXY_SHARED_SECRET || !env.DEDUCTION_BACKUPS) throw Error('Central sync storage or Grafana is not configured.');
    register.sourceSyncs ||= new Map();
    if (!register.sourceSyncs.has(start)) {
      const pending = (async () => {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000);
        try {
          const upstream = new URL('https://daily-report.internal/api/internal/finance-data');
          upstream.search = new URLSearchParams({ panel: 'commission-main', scope: 'selection', part: 'primary', filters: '{}', from: start + ' 00:00:00', to: end + ' 23:59:59', refresh: '1' });
          const response = await env.GRAFANA_PROXY.fetch(new Request(upstream, { headers: { 'x-finance-proxy-secret': env.FINANCE_PROXY_SHARED_SECRET }, signal: controller.signal }));
          if (!response.ok) throw Error('Grafana sync failed. The previous saved week was kept.');
          const payload = await response.json(); validateSyncPayload(payload);
          if (String(payload.from).slice(0,10) !== start || String(payload.to).slice(0,10) !== end) throw Error('Grafana returned a different period. The previous saved week was kept.');
          const updatedAt = new Date().toISOString(), key = 'commission-sync/v1/' + start + '/' + crypto.randomUUID() + '.json';
          await env.DEDUCTION_BACKUPS.put(key, JSON.stringify({ schema: 'commission-sync', version: 1, payload }), { httpMetadata: { contentType: 'application/json' } });
          const meta = { start, end, updatedAt, rowCount: payload.rows.length, status: 'Synced', key };
          await storage.transaction(async tx => {
            await tx.put('sync-week:' + start, meta);
            await tx.put('counter:revision', Number(await tx.get('counter:revision') || 0) + 1);
          });
          // Reuse the existing backup format; archived dataset versions are never overwritten.
          try {
            const snapshot = await storage.transaction(tx => createDeductionSnapshot(tx, updatedAt));
            await env.DEDUCTION_BACKUPS.put('commission-rider/snapshots/v2/' + String(snapshot.revision).padStart(12,'0') + '-' + snapshot.checksumSha256.slice(0,16) + '.json', JSON.stringify(snapshot));
          } catch { return { ...meta, backupWarning: 'Week synced. The register backup needs retry.' }; }
          return meta;
        } finally { clearTimeout(timer); }
      })().finally(() => register.sourceSyncs.delete(start));
      register.sourceSyncs.set(start,pending);
    }
    return reply(await register.sourceSyncs.get(start));
  } catch (error) { return reply({ error: error.name === 'AbortError' ? 'Sync timed out. The previous saved week was kept. Please retry.' : error.message },400); }
}
export async function dataSourceApi(request, env, actor) {
  if (!actor?.sessionId || !actor.name) return reply({ error: 'Sign in first.' },401);
  const url = new URL(request.url);
  if (!['GET','POST'].includes(request.method)) return reply({ error: 'Method not allowed' },405);
  if (request.method === 'POST' && (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json'))) return reply({ error: 'Same-origin JSON request required.' },403);
  if (!env.DEDUCTIONS) return reply({ error: 'Central storage is unavailable.' },503);
  const headers = { 'content-type': 'application/json', 'x-deduction-session': actor.sessionId, 'x-deduction-user': actor.name, 'x-deduction-role': actor.role || 'maker' };
  return env.DEDUCTIONS.get(env.DEDUCTIONS.idFromName('finance-deductions-v1')).fetch(new Request('https://deductions.internal/source' + url.pathname.slice('/api/data-source'.length) + url.search, { method: request.method, headers, ...(request.method === 'POST' ? { body: await request.text() } : {}) }));
}
