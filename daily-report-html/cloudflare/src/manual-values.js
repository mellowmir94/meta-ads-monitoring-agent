import { createManualBackup, validateManualBackup, planMissingRestore, readBackupRequest } from './manual-backup.js';

const KEYS = {
  b2w: 'manual-b2w-values', rsa: 'manual-rsa-values',
  bgarage: 'manual-bgarage-summary-values', indonesia: 'manual-indonesia-summary-values'
};
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

async function readDocument(storage, key) {
  const value = await storage.get(key);
  if (!value?.documentChunks) return value;
  const chunks = await Promise.all(Array.from({ length: value.documentChunks }, (_, index) => storage.get(`parts:${key}:${index}`)));
  if (chunks.some(chunk => typeof chunk !== 'string')) throw new Error('Manual report storage is incomplete. No values were changed.');
  return JSON.parse(chunks.join(''));
}

// Durable Object KV values are size-limited; reports and audit batches grow over time.
async function writeDocument(storage, key, value) {
  const serialized = JSON.stringify(value), chunkSize = 24000;
  if (serialized.length <= chunkSize) return storage.put(key, value);
  const documentChunks = Math.ceil(serialized.length / chunkSize);
  for (let index = 0; index < documentChunks; index++) await storage.put(`parts:${key}:${index}`, serialized.slice(index * chunkSize, (index + 1) * chunkSize));
  await storage.put(key, { documentChunks });
}

function entries(kind, record) {
  const values = record?.values || {};
  if (kind !== 'rsa') return values;
  return Object.fromEntries(Object.entries(values).flatMap(([date, fields]) => Object.entries(fields || {}).map(([field, value]) => [`${date}:${field}`, value])));
}

export function changedEntries(kind, previous, next) {
  const before = entries(kind, previous), after = entries(kind, next);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ key, before: before[key] ?? null, after: after[key] ?? null }));
}

export function revisionConflict(kind, payload, current) {
  const updates = Array.isArray(payload?.updates) ? payload.updates : [payload];
  if (updates.some(update => !Number.isInteger(update?.expectedRevision) || update.expectedRevision < 0)) return 428;
  return updates.some(update => {
    const key = kind === 'rsa' ? `${update.date}:${update.field}` : update.date;
    return update.expectedRevision !== (current?.revisions?.[key] || 0);
  }) ? 409 : 0;
}

export function validManualReport(kind, value) {
  const fields = kind === 'bgarage'
    ? ['dailyTarget', 'dailyActual', 'mtdActual', 'monthlyTarget', 'referrals', 'conversions', 'pickDrop', 'intakeActual', 'intakeTarget']
    : ['totalLead', 'pendingLead', 'cancelledLead', 'baterikuJumpstart', 'baterikuCharge', 'baterikuWarranty', 'baterikuBattery', 'partnerJumpstart', 'partnerBattery'];
  const rows = kind === 'bgarage' ? value?.rows : [value?.daily];
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) return false;
  const names = new Set();
  return rows.every(row => {
    const name = row?.[kind === 'bgarage' ? 'outlet' : 'pitstop'];
    if (typeof name !== 'string' || !name.trim() || name.length > 160 || names.has(name.trim().toUpperCase())) return false;
    names.add(name.trim().toUpperCase());
    return fields.every(field => {
      const number = row[field];
      return typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1e9 &&
        (kind === 'bgarage' && fields.indexOf(field) < 4 || Number.isInteger(number));
    });
  });
}

// One strongly consistent object per collection. Legacy KV is imported once;
// the report and every writer subsequently use this same serialized store.
export class VersionedManualValues {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const url = new URL(request.url), kind = url.searchParams.get('kind'), key = KEYS[kind];
      if (!key) return reply({ error: 'Unknown manual collection.' }, 400);
      let current = await readDocument(this.ctx.storage, 'record');
      if (!current) {
        current = await this.env.DASHBOARD_DATA.get(key, { type: 'json' }) || { values: {}, updatedAt: '' };
        current = { ...current, revision: current.revision || 0, revisions: current.revisions || {} };
        await this.ctx.storage.transaction(txn => writeDocument(txn, 'record', current));
      }
      if (url.pathname === '/history' && request.method === 'GET') {
        const history = await this.ctx.storage.list({ prefix: 'audit:', reverse: true, limit: 100 });
        return reply({ history: await Promise.all([...history.keys()].map(key => readDocument(this.ctx.storage, key))) });
      }
      if (url.pathname === '/backup' && request.method === 'GET') return reply(await createManualBackup(kind, current));
      let restored = null;
      if (url.pathname === '/restore' && request.method === 'POST') {
        let body, incoming;
        try {
          body = await readBackupRequest(request);
          incoming = await validateManualBackup(body.backup, kind, validManualReport);
        } catch (error) { return reply({ error: error.message }, 400); }
        if (!['preview', 'confirm'].includes(body.action)) return reply({ error: 'Preview the backup before restoring.' }, 400);
        const plan = planMissingRestore(kind, current, incoming);
        const preview = { kind, ...plan.counts, revision: current.revision, checksum: body.backup.checksum };
        if (body.action === 'preview') return reply({ preview });
        if (!Number.isInteger(body.expectedRevision)) return reply({ error: 'Preview the backup before restoring.' }, 428);
        if (body.expectedRevision !== current.revision) return reply({ error: 'Saved records changed after the preview. Review the backup again; nothing was restored.' }, 409);
        if (!plan.counts.missing) return reply({ restored: 0, preview });
        restored = plan;
      }
      if (request.method === 'PUT') {
        let payload;
        try { payload = await request.clone().json(); } catch { return reply({ error: 'Invalid JSON.' }, 400); }
        if ((kind === 'bgarage' || kind === 'indonesia') && !validManualReport(kind, payload.value)) return reply({ error: 'Complete every report field with a valid non-negative number and unique outlet name.' }, 400);
        const conflict = revisionConflict(kind, payload, current);
        if (conflict) return reply({ error: conflict === 428 ? 'Refresh this page before saving; the save revision is missing.' : 'Another session changed these values. Review the newer record before saving again.', current }, conflict);
      }
      let pending = restored ? { ...restored.pending, updatedAt: new Date().toISOString() } : null;
      const storage = {
        get: async requestedKey => requestedKey === key ? structuredClone(current) : this.env.DASHBOARD_DATA.get(requestedKey, { type: 'json' }),
        put: async (requestedKey, value) => {
          if (requestedKey !== key) throw new Error('Unexpected manual storage key.');
          pending = JSON.parse(value);
        }
      };
      const response = restored ? reply({}) : await this.handle(request, { ...this.env, DASHBOARD_DATA: storage }, kind);
      if (!response.ok) return response;
      if (!pending) return reply({ ...await response.json(), revision: current.revision, revisions: current.revisions });
      const changes = changedEntries(kind, current, pending);
      const revision = current.revision + (changes.length ? 1 : 0), revisions = { ...current.revisions };
      for (const change of changes) revisions[change.key] = revision;
      pending = { ...pending, revision, revisions };
      await this.ctx.storage.transaction(async txn => {
        await writeDocument(txn, 'record', pending);
        if (changes.length) await writeDocument(txn, `audit:${String(revision).padStart(12, '0')}`, {
          revision, at: pending.updatedAt, actor: restored ? 'backup-restore' : url.pathname === '/sync' ? 'sharepoint-sync' : 'authenticated-dashboard-user', changes
        });
      });
      return reply(restored ? { restored: changes.length, revision, counts: restored.counts } : pending);
    });
  }
}

export function manualValuesRequest(request, env, kind, path = '/') {
  if (!env.MANUAL_VALUES) return reply({ error: 'Manual data store is unavailable. No values were changed.' }, 503);
  const id = env.MANUAL_VALUES.idFromName(kind);
  return env.MANUAL_VALUES.get(id).fetch(new Request(`https://manual.internal${path}?kind=${kind}`, request));
}
