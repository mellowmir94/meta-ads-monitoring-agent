import { MANUAL_KINDS, digest, readBackupRequest, validateManualBackup } from './manual-backup.js';
import { manualValuesRequest, validManualReport } from './manual-values.js';

export const OPERATIONS_LIMITS = Object.freeze({ requestBytes: 8 * 1024 * 1024, months: 24, rowsPerMonth: 15000, totalRows: 100000, jobs: 100, checkDays: 14 });
const DAY = 86400000;
const CHUNK = 24000;
const JOB_PREFIX = 'job:';
const BACKUP_PREFIX = 'backup:';
const nowIso = () => new Date().toISOString();
const calendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const malaysiaDate = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
const bounded = (value, fallback, max) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= max ? Number(value) : fallback;
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
const fail = (message, status = 400, code = 'invalid_request') => Object.assign(new Error(message), { status, code });
const unavailable = () => fail('Operations storage is unavailable. Configure the isolated OPERATIONS_JOBS binding and retry.', 503, 'operations_unavailable');

// Chunked documents and their metadata are committed in one storage transaction.
async function writeDocument(storage, key, value) {
  const text = JSON.stringify(value), previous = await storage.get(key);
  const parts = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < parts; i++) await storage.put(`${key}:part:${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK));
  for (let i = parts; i < (previous?.parts || 0); i++) await storage.delete(`${key}:part:${i}`);
  await storage.put(key, { parts });
}

async function readDocument(storage, key) {
  const meta = await storage.get(key);
  if (!meta) return null;
  const parts = [];
  for (let i = 0; i < meta.parts; i++) {
    const part = await storage.get(`${key}:part:${i}`);
    if (typeof part !== 'string') throw fail('Stored operations data is incomplete. Retry or contact the administrator.', 503, 'storage_incomplete');
    parts.push(part);
  }
  return JSON.parse(parts.join(''));
}

async function deleteDocument(storage, key) {
  const meta = await storage.get(key);
  for (let i = 0; i < (meta?.parts || 0); i++) await storage.delete(`${key}:part:${i}`);
  await storage.delete(key);
}

function operationStub(env) {
  if (!env.OPERATIONS_JOBS) throw unavailable();
  return env.OPERATIONS_JOBS.get(env.OPERATIONS_JOBS.idFromName('operations-v1'));
}

export async function operationsRequest(request, env) {
  try { return await operationStub(env).fetch(request); }
  catch { return reply({ error: unavailable().message, code: 'operations_unavailable' }, 503); }
}

async function internalRequest(env, path, body) {
  const response = await operationStub(env).fetch(new Request(`https://operations.internal${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }));
  if (!response.ok) throw unavailable();
  return response;
}

export async function scheduledOperations(env, sync, configured) {
  if (!env.OPERATIONS_JOBS) return;
  const started = Date.now();
  let syncStatus;
  if (!configured) syncStatus = { status: 'unconfigured', recordCount: null, latencyMs: 0, error: 'SharePoint B2W synchronization is not configured.' };
  else {
    try {
      const result = await sync();
      syncStatus = { status: 'ok', recordCount: Object.keys(result.values || {}).length, latencyMs: Date.now() - started, error: null };
    } catch {
      syncStatus = { status: 'error', recordCount: null, latencyMs: Date.now() - started, error: 'SharePoint B2W synchronization failed. Check its connection and retry.' };
    }
  }
  // Snapshot work still runs when synchronization or status recording fails.
  const results = await Promise.allSettled([
    internalRequest(env, '/sync-status', syncStatus), internalRequest(env, '/scheduled', {})
  ]);
  if (results.some(result => result.status === 'rejected')) throw unavailable();
}

function checkWindow(body) {
  const yesterday = malaysiaDate(Date.now() - DAY);
  const from = body.from ?? yesterday, to = body.to ?? yesterday;
  if (!calendarDate(from) || !calendarDate(to) || from > to || Date.parse(to) - Date.parse(from) >= OPERATIONS_LIMITS.checkDays * DAY) {
    throw fail('Choose a valid from/to date range of at most 14 days (YYYY-MM-DD).');
  }
  return { from, to };
}

function sourceState(id, label) {
  return { id, label, status: 'unknown', generatedAt: null, lastSuccessAt: null, lastErrorAt: null, error: null, latencyMs: null, recordCount: null, from: null, to: null };
}

function nextState(previous, result) {
  const generatedAt = nowIso();
  return { ...previous, ...result, generatedAt,
    lastSuccessAt: ['ok', 'empty'].includes(result.status) ? generatedAt : previous?.lastSuccessAt || null,
    lastErrorAt: ['error', 'unconfigured'].includes(result.status) ? generatedAt : previous?.lastErrorAt || null };
}

export class OperationsStore {
  constructor(ctx, env, dependencies) {
    this.ctx = ctx;
    this.env = env;
    this.dependencies = dependencies;
    this.tail = Promise.resolve();
    this.checking = false;
  }

  serial(run) {
    const result = this.tail.then(run);
    this.tail = result.catch(() => {});
    return result;
  }

  async body(request, optional = false) {
    if (optional && !request.body) return {};
    let body;
    try { body = await readBackupRequest(request); }
    catch (error) { throw fail(error.message, /exceeds/.test(error.message) ? 413 : /must be JSON/.test(error.message) ? 415 : 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Supply a JSON object.');
    return body;
  }

  async fetch(request) {
    try {
      if (new URL(request.url).pathname === '/api/operations/check' && request.method === 'POST') return await this.check(await this.body(request, true));
      return await this.serial(() => this.route(request));
    } catch (error) {
      return reply({ error: error.code ? error.message : 'Operations storage could not complete the request. Retry; durable progress has been retained.', code: error.code || 'storage_unavailable' }, error.code ? error.status : 503);
    }
  }

  async route(request) {
    const path = new URL(request.url).pathname, method = request.method;
    if (path === '/api/pitstop-history' || path === '/api/pitstop-history/grafana') return this.legacyArchive(request);
    if (path === '/sync-status' && method === 'POST') {
      const previous = await this.ctx.storage.get('b2w-sync');
      await this.ctx.storage.put('b2w-sync', nextState(previous || sourceState('b2w-sync', 'SharePoint B2W sync'), await this.body(request)));
      return reply({ ok: true });
    }
    if (path === '/scheduled' && method === 'POST') return this.dailySnapshots();
    const idMatch = path.match(/^\/api\/operations\/(jobs|backups)\/([a-zA-Z0-9-]{1,80})(\/resume)?$/);
    if (path === '/api/operations') {
      if (method !== 'GET') return this.method('GET');
      return reply({ generatedAt: nowIso(), health: await this.health(), jobs: await this.jobs(), backups: await this.backups(), limits: OPERATIONS_LIMITS });
    }
    if (path === '/api/operations/check') return this.method('POST');
    if (path === '/api/operations/backups') {
      if (method === 'GET') return reply(await this.backups());
      if (method !== 'POST') return this.method('GET, POST');
      const body = await this.body(request, true);
      if (body.kind !== undefined && !MANUAL_KINDS.includes(body.kind)) throw fail('Select rsa, b2w, bgarage, or indonesia.');
      return this.createBackups(body.kind ? [body.kind] : MANUAL_KINDS, 'manual');
    }
    if (path === '/api/operations/jobs') {
      if (method === 'GET') return reply({ jobs: await this.jobs() });
      if (method !== 'POST') return this.method('GET, POST');
      return this.createJob(await this.body(request), request.headers.get('idempotency-key'));
    }
    if (idMatch?.[1] === 'backups' && !idMatch[3]) {
      if (method !== 'GET') return this.method('GET');
      const metadata = await this.ctx.storage.get(`${BACKUP_PREFIX}${idMatch[2]}`);
      if (!metadata) throw fail('Backup not found or removed by retention. Create a new backup.', 404, 'backup_not_found');
      const backup = await readDocument(this.ctx.storage, `file:${metadata.id}`);
      try { await validateManualBackup(backup, metadata.kind, validManualReport); }
      catch { throw fail('Backup integrity verification failed. Select another backup.', 409, 'backup_corrupt'); }
      return reply(backup, 200, { 'content-disposition': `attachment; filename="daily-report-${metadata.kind}-${metadata.id}.json"` });
    }
    if (idMatch?.[1] === 'jobs') {
      const resume = Boolean(idMatch[3]);
      if (method !== (resume ? 'POST' : 'GET')) return this.method(resume ? 'POST' : 'GET');
      const job = await this.getJob(idMatch[2]);
      if (resume && job.status !== 'completed') {
        if (job.status === 'failed') {
          job.status = 'queued'; job.error = null; job.updatedAt = nowIso();
          for (const month of job.months) if (month.status === 'failed') { month.status = 'pending'; month.error = null; }
        }
        await this.ctx.storage.transaction(async txn => { await txn.put(`${JOB_PREFIX}${job.id}`, job); await txn.setAlarm(Date.now() + 1000); });
      }
      return reply({ job }, resume && job.status !== 'completed' ? 202 : 200);
    }
    throw fail('Operations route not found.', 404, 'not_found');
  }

  method(allow) { return reply({ error: 'Method not allowed.', code: 'method_not_allowed' }, 405, { allow }); }

  async jobs() { return [...(await this.ctx.storage.list({ prefix: JOB_PREFIX })).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async getJob(id) {
    const job = await this.ctx.storage.get(`${JOB_PREFIX}${id}`);
    if (!job) throw fail('Archive job not found. Refresh the jobs list.', 404, 'job_not_found');
    return job;
  }

  async health() {
    const health = await this.ctx.storage.get('health') || { generatedAt: null, sources: this.dependencies.sources.map(({ id, label }) => sourceState(id, label)) };
    return { ...health, b2wSync: await this.ctx.storage.get('b2w-sync') || sourceState('b2w-sync', 'SharePoint B2W sync') };
  }

  async check(body) {
    const window = checkWindow(body);
    if (this.checking) throw fail('A source check is already running. Wait for it to finish.', 409, 'check_running');
    this.checking = true;
    try {
      const previous = await this.health();
      const sources = await Promise.all(this.dependencies.sources.map(async ({ id, label, query }) => {
        const started = Date.now();
        let result;
        if (!this.env.GRAFANA_SERVICE_ACCOUNT_TOKEN) result = { status: 'unconfigured', error: 'Grafana connection is not configured.', recordCount: null };
        else {
          try {
            const rows = await query(this.env, window.from, window.to);
            if (!Array.isArray(rows)) throw new Error('Invalid query result');
            result = { status: rows.length ? 'ok' : 'empty', recordCount: rows.length, error: null };
          } catch {
            result = { status: 'error', recordCount: null, error: 'Source query failed. Check Grafana connectivity and datasource access, then retry.' };
          }
        }
        return nextState(previous.sources.find(source => source.id === id) || sourceState(id, label), { ...result, ...window, latencyMs: Date.now() - started });
      }));
      const health = { generatedAt: nowIso(), ...window, sources };
      await this.serial(() => this.ctx.storage.put('health', health));
      return reply(health);
    } finally { this.checking = false; }
  }

  async createJob(body, idempotencyKey) {
    const months = body.months;
    if (!Array.isArray(months) || !months.length || months.length > OPERATIONS_LIMITS.months) throw fail('Supply 1 to 24 archive months.');
    let totalRows = 0;
    const seen = new Set();
    for (const item of months) {
      if (!item || !calendarDate(`${item.month}-01`) || seen.has(item.month)) throw fail('Archive months must be valid and unique (YYYY-MM).');
      seen.add(item.month);
      if (!Array.isArray(item.rows) || !item.rows.length || item.rows.length > OPERATIONS_LIMITS.rowsPerMonth) throw fail(`Month ${item.month} must contain 1 to 15,000 rows.`);
      if (item.rows.some(row => !this.dependencies.validHistoricalRow(row, item.month) || !calendarDate(row.date) || typeof row.pitstop !== 'string' || row.pitstop.length > 160 || String(row.state || '').length > 160)) throw fail(`Historical rows for ${item.month} are invalid or belong to another month.`);
      totalRows += item.rows.length;
    }
    if (totalRows > OPERATIONS_LIMITS.totalRows) throw fail('An archive job may contain at most 100,000 rows.', 413);
    if (idempotencyKey !== null && !/^[a-zA-Z0-9._:-]{1,128}$/.test(idempotencyKey)) throw fail('Idempotency-Key must be 1 to 128 letters, digits, dots, colons, underscores, or hyphens.');
    const sourceName = String(body.sourceName || 'Historical Pitstop Sales').slice(0, 160);
    const signature = await digest({ sourceName, months });
    const dedupe = idempotencyKey ? `idempotency:${await digest(idempotencyKey)}` : null;
    if (dedupe) {
      const existing = await this.ctx.storage.get(dedupe);
      if (existing) {
        if (existing.signature !== signature) throw fail('This Idempotency-Key was used for different rows. Use a new key.', 409, 'idempotency_conflict');
        return reply({ job: await this.getJob(existing.id) }, 200);
      }
    }
    const existingJobs = await this.jobs();
    const expired = existingJobs.length >= OPERATIONS_LIMITS.jobs ? existingJobs.findLast(item => item.status === 'completed') : null;
    if (existingJobs.length >= OPERATIONS_LIMITS.jobs && !expired) throw fail('There are already 100 unfinished jobs. Resume existing jobs before creating another.', 409, 'job_limit');
    const job = { id: crypto.randomUUID(), sourceName, status: 'queued', createdAt: nowIso(), updatedAt: nowIso(), completedAt: null, error: null,
      totalMonths: months.length, completedMonths: 0, totalRows, completedRows: 0,
      months: months.map(item => ({ month: item.month, rowCount: item.rows.length, status: 'pending', attempts: 0, error: null, completedAt: null })) };
    await this.ctx.storage.transaction(async txn => {
      if (expired) {
        await txn.delete(`${JOB_PREFIX}${expired.id}`);
        for (const [key, value] of await txn.list({ prefix: 'idempotency:' })) if (value.id === expired.id) await txn.delete(key);
      }
      for (const item of months) await writeDocument(txn, `rows:${job.id}:${item.month}`, item.rows);
      await txn.put(`${JOB_PREFIX}${job.id}`, job);
      if (dedupe) await txn.put(dedupe, { id: job.id, signature });
      await txn.setAlarm(Date.now() + 1000);
    });
    return reply({ job }, 202);
  }

  // Archive APIs keep their existing validation and publisher. Only storage is
  // adapted: strongly consistent reads and a durable outbox precede KV projection.
  archiveAdapter(writes) {
    return {
      get: async (key, options) => {
        if (!key.startsWith('pitstop-history:')) return this.env.DASHBOARD_DATA.get(key, options);
        const pending = writes.findLast(item => item.key === key);
        const saved = pending || await readDocument(this.ctx.storage, `archive:${key}`);
        if (saved) return saved.deleted || saved.expiresAt && saved.expiresAt <= Date.now() ? null : options?.type === 'json' ? JSON.parse(saved.value) : saved.value;
        return this.env.DASHBOARD_DATA.get(key, options);
      },
      put: async (key, value, options) => {
        if (!key.startsWith('pitstop-history:')) throw fail('Unexpected archive storage key.', 500, 'invalid_storage_key');
        writes.push({ key, value, ...(options?.expirationTtl ? { expiresAt: Date.now() + options.expirationTtl * 1000 } : {}) });
      },
      delete: async key => {
        if (!key.startsWith('pitstop-history:')) throw fail('Unexpected archive storage key.', 500, 'invalid_storage_key');
        writes.push({ key, deleted: true });
      }
    };
  }

  async commitOutbox(writes, jobId = null, month = null) {
    if (!writes.length) return;
    await this.ctx.storage.transaction(async txn => {
      for (const item of writes) await writeDocument(txn, `archive:${item.key}`, item);
      await writeDocument(txn, 'outbox', { writes, jobId, month });
      await txn.setAlarm(Date.now() + 1000);
    });
  }

  async flushOutbox() {
    const outbox = await readDocument(this.ctx.storage, 'outbox');
    if (!outbox) return;
    for (const item of outbox.writes) {
      if (item.deleted || item.expiresAt && item.expiresAt <= Date.now()) await this.env.DASHBOARD_DATA.delete(item.key);
      else await this.env.DASHBOARD_DATA.put(item.key, item.value, item.expiresAt ? { expirationTtl: Math.max(60, Math.ceil((item.expiresAt - Date.now()) / 1000)) } : undefined);
    }
    await this.ctx.storage.transaction(async txn => {
      if (outbox.jobId) {
        const job = await txn.get(`${JOB_PREFIX}${outbox.jobId}`);
        const month = job.months.find(item => item.month === outbox.month);
        month.status = 'completed'; month.completedAt = nowIso(); month.error = null;
        job.completedMonths = job.months.filter(item => item.status === 'completed').length;
        job.completedRows = job.months.filter(item => item.status === 'completed').reduce((sum, item) => sum + item.rowCount, 0);
        job.status = job.completedMonths === job.totalMonths ? 'completed' : 'queued';
        job.updatedAt = nowIso(); job.error = null;
        if (job.status === 'completed') job.completedAt = job.updatedAt;
        await txn.put(`${JOB_PREFIX}${job.id}`, job);
        await deleteDocument(txn, `rows:${job.id}:${month.month}`);
      }
      await deleteDocument(txn, 'outbox');
    });
  }

  async legacyArchive(request) {
    await this.flushOutbox();
    const writes = [];
    const response = await this.dependencies.archiveRequest(request, { ...this.env, DASHBOARD_DATA: this.archiveAdapter(writes) });
    if (response.ok) { await this.commitOutbox(writes); await this.flushOutbox(); }
    return response;
  }

  async alarm() {
    return this.serial(async () => {
      let job;
      try {
        const outbox = await readDocument(this.ctx.storage, 'outbox');
        if (outbox?.jobId) job = await this.getJob(outbox.jobId);
        await this.flushOutbox();
        job = (await this.jobs()).reverse().find(item => ['queued', 'running'].includes(item.status));
        if (!job) return;
        const month = job.months.find(item => item.status !== 'completed');
        job.status = 'running'; job.updatedAt = nowIso(); month.status = 'running'; month.attempts++;
        await this.ctx.storage.transaction(async txn => {
          await txn.put(`${JOB_PREFIX}${job.id}`, job);
          // A restart during publishing has a persisted alarm and claim to recover.
          await txn.setAlarm(Date.now() + 60000);
        });
        const rows = await readDocument(this.ctx.storage, `rows:${job.id}:${month.month}`);
        if (!rows) throw new Error('Missing job rows');
        const writes = [];
        await this.dependencies.publishArchive({ ...this.env, DASHBOARD_DATA: this.archiveAdapter(writes) }, month.month, rows, job.sourceName);
        await this.commitOutbox(writes, job.id, month.month);
        await this.flushOutbox();
      } catch {
        if (job) {
          job = await this.getJob(job.id);
          if (job.status !== 'completed') {
            const month = job.months.find(item => item.status !== 'completed');
            job.status = 'failed'; job.updatedAt = nowIso();
            job.error = 'Archive publishing was interrupted. Resume this job to finish; completed months will be skipped.';
            if (month) { month.status = 'failed'; month.error = job.error; }
            await this.ctx.storage.put(`${JOB_PREFIX}${job.id}`, job);
          }
        } else throw unavailable();
      } finally {
        const outbox = await readDocument(this.ctx.storage, 'outbox');
        const runnable = (await this.jobs()).some(item => ['queued', 'running'].includes(item.status));
        if (runnable || outbox && !outbox.jobId) await this.ctx.storage.setAlarm(Date.now() + 1000);
        else await this.ctx.storage.deleteAlarm();
      }
    });
  }

  retention() { return { retentionDays: bounded(this.env.OPERATIONS_BACKUP_RETENTION_DAYS, 30, 365), maxPerKind: bounded(this.env.OPERATIONS_BACKUP_MAX_PER_KIND, 31, 100) }; }

  async backups() {
    const items = [...(await this.ctx.storage.list({ prefix: BACKUP_PREFIX })).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const status = await this.ctx.storage.get('backup-status') || {};
    return { items, ...this.retention(), scheduledEnabled: this.env.OPERATIONS_SCHEDULED_BACKUPS === 'true', lastScheduledAt: status.lastScheduledAt || null, lastError: status.lastError || null };
  }

  async retainBackups(txn) {
    const { retentionDays, maxPerKind } = this.retention();
    const items = [...(await txn.list({ prefix: BACKUP_PREFIX })).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const counts = {};
    for (const item of items) {
      counts[item.kind] = (counts[item.kind] || 0) + 1;
      // Always preserve the newest known-good copy of every collection.
      if (counts[item.kind] > 1 && (counts[item.kind] > maxPerKind || Date.parse(item.createdAt) < Date.now() - retentionDays * DAY)) {
        await deleteDocument(txn, `file:${item.id}`);
        await txn.delete(`${BACKUP_PREFIX}${item.id}`);
      }
    }
  }

  async createBackups(kinds, trigger, day = null) {
    const backups = [], errors = [];
    for (const kind of kinds) {
      try {
        const response = await manualValuesRequest(new Request('https://manual.internal/backup'), this.env, kind, '/backup');
        if (!response.ok) throw new Error('Manual export unavailable');
        const backup = await response.json();
        await validateManualBackup(backup, kind, validManualReport);
        const bytes = new TextEncoder().encode(JSON.stringify(backup)).byteLength;
        // Leave room for the existing restore request's action/revision envelope.
        if (bytes > OPERATIONS_LIMITS.requestBytes - 4096) throw new Error('Manual backup too large for restore');
        const id = crypto.randomUUID();
        const latest = Math.max(0, ...(await this.backups()).items.filter(item => item.kind === kind).map(item => Date.parse(item.createdAt)));
        const metadata = { id, kind, createdAt: new Date(Math.max(Date.now(), latest + 1)).toISOString(), trigger, recordCount: Object.keys(backup.record.values).length, bytes, checksum: backup.checksum, downloadUrl: `/api/operations/backups/${id}` };
        await this.ctx.storage.transaction(async txn => {
          await writeDocument(txn, `file:${id}`, backup);
          await txn.put(`${BACKUP_PREFIX}${id}`, metadata);
          if (day) await txn.put(`daily:${kind}`, day);
          await this.retainBackups(txn);
        });
        backups.push(metadata);
      } catch { errors.push({ kind, error: 'Backup could not be exported, verified, or stored. Existing backups and official values were preserved.' }); }
    }
    const status = await this.ctx.storage.get('backup-status') || {};
    await this.ctx.storage.put('backup-status', { ...status, lastError: errors.length ? { generatedAt: nowIso(), errors } : null });
    return reply({ backups, ...(errors.length ? { error: 'Some backups could not be created. Retry the failed collections.', errors } : {}) }, errors.length ? 503 : 201);
  }

  async dailySnapshots() {
    if (this.env.OPERATIONS_SCHEDULED_BACKUPS !== 'true') return reply({ skipped: true, reason: 'Scheduled snapshots are disabled.' });
    const day = malaysiaDate(Date.now()), kinds = [];
    for (const kind of MANUAL_KINDS) if (await this.ctx.storage.get(`daily:${kind}`) !== day) kinds.push(kind);
    const response = kinds.length ? await this.createBackups(kinds, 'scheduled', day) : reply({ backups: [], skipped: true });
    if (response.ok) {
      const status = await this.ctx.storage.get('backup-status') || {};
      await this.ctx.storage.transaction(async txn => {
        await this.retainBackups(txn);
        await txn.put('backup-status', { ...status, lastScheduledAt: kinds.length ? nowIso() : status.lastScheduledAt, lastError: null });
      });
    }
    return response;
  }
}
