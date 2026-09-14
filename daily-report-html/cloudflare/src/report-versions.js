import sanitizeHtml from 'sanitize-html';
import { canonical, digest, readBackupRequest, MANUAL_KINDS } from './manual-backup.js';
import { manualValuesRequest, validManualReport } from './manual-values.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export const validReportDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export const masterFingerprint = data => digest({ pitstopMaster: data?.pitstopMaster || [], pitstopRelocations: data?.pitstopRelocations || [] });
function reportDates(from, to) {
  const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (count < 1 || count > 3660) return [];
  return Array.from({ length: count }, (_, day) => new Date(Date.parse(from) + day * 86400000).toISOString().slice(0, 10));
}
function completeManualSnapshot(snapshot) {
  const dates = reportDates(snapshot.from, snapshot.to), month = reportDates(snapshot.to.slice(0, 8) + '01', snapshot.to);
  if (!dates.length) return false;
  const count = value => Number.isInteger(value) && value >= 0 && value <= 1000000;
  if (!dates.every(date => count(snapshot.manual.b2w?.[date]) && ['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel'].every(field => count(snapshot.manual.rsa?.[date]?.[field])))) return false;
  if (!validManualReport('bgarage', snapshot.manual.bgarage?.[snapshot.to]) || !validManualReport('indonesia', snapshot.manual.indonesia?.[snapshot.to])) return false;
  return month.every(date => Object.hasOwn(snapshot.manual.indonesia, date) && (snapshot.manual.indonesia[date] === null || validManualReport('indonesia', snapshot.manual.indonesia[date])));
}
const styleNames = 'background background-color border border-collapse border-color border-radius border-spacing border-style border-width box-sizing caption-side color display font-family font-size font-style font-variant-numeric font-weight height letter-spacing line-height margin margin-bottom margin-left margin-right margin-top max-height max-width min-height min-width overflow-wrap padding padding-bottom padding-left padding-right padding-top table-layout text-align text-decoration text-indent text-transform vertical-align white-space word-break word-spacing width mso-line-height-rule mso-table-lspace mso-table-rspace'.split(' ');
const safeStyle = /^(?!.*(?:url\s*\(|expression\s*\(|javascript|@|\\|[<>]))[a-zA-Z0-9\s.,#%()'"+!\/-]+$/;

export function sanitizeReportHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: ['div', 'section', 'p', 'span', 'strong', 'b', 'i', 'em', 'u', 'small', 'br', 'font', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'],
    allowedAttributes: { '*': ['style', 'width', 'height', 'align', 'valign', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'span', 'nowrap', 'color', 'face', 'size', 'title', 'role', 'aria-label'] },
    allowedStyles: { '*': Object.fromEntries(styleNames.map(name => [name, [safeStyle]])) },
    nonTextTags: ['script', 'style', 'textarea', 'option', 'iframe', 'object', 'svg', 'math'],
    nestingLimit: 80
  });
}

async function writeReport(storage, version, record) {
  const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(record)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const chunks = Math.ceil(bytes.length / 64000);
  for (let i = 0; i < chunks; i++) await storage.put(`body:${version}:${i}`, bytes.slice(i * 64000, (i + 1) * 64000));
  await storage.put(`body:${version}`, { chunks });
}

async function readReport(storage, version) {
  const info = await storage.get(`body:${version}`);
  if (!info) return null;
  const parts = [];
  for (let i = 0; i < info.chunks; i++) {
    const part = await storage.get(`body:${version}:${i}`);
    if (!part) throw new Error('Stored report is incomplete.');
    parts.push(part);
  }
  return new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'))).json();
}

// One serialized archive per reporting date. Versions are append-only;
// idempotency keys make retrying a lost HTTP response safe.
export class ReportVersionsStore {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const url = new URL(request.url), date = url.searchParams.get('date');
      if (!validReportDate(date)) return json({ error: 'Choose a valid reporting date.' }, 400);
      const latest = await this.ctx.storage.get('latest') || 0;
      if (request.method === 'GET') {
        if (url.searchParams.has('version')) {
          const version = Number(url.searchParams.get('version'));
          if (!Number.isInteger(version) || version < 1 || version > latest) return json({ error: 'Report version not found.' }, 404);
          return json(await readReport(this.ctx.storage, version));
        }
        const before = Number(url.searchParams.get('before') || latest + 1);
        if (!Number.isInteger(before) || before < 1) return json({ error: 'Invalid report cursor.' }, 400);
        const last = Math.min(latest, before - 1), versions = [];
        for (let i = last; i > Math.max(0, last - 30); i--) versions.push(await this.ctx.storage.get(`meta:${i}`));
        return json({ date, latest, versions, before: last > 30 ? last - 29 : null });
      }
      if (request.method !== 'POST') return json({ error: 'Finalised versions are read-only.' }, 405);
      let body;
      try { body = await readBackupRequest(request, 16); } catch (error) { return json({ error: error.message }, 400); }
      const snapshot = body?.snapshot;
      if (!/^[a-f0-9-]{36}$/i.test(body?.requestId || '') || !Number.isInteger(body.expectedLatest) || body.expectedLatest < 0 ||
          !snapshot || snapshot.to !== date || !validReportDate(snapshot.from) || snapshot.from > date ||
          !snapshot.master || !/^[a-f0-9]{64}$/.test(snapshot.master.fingerprint || '') || !snapshot.manual ||
          typeof body.html !== 'string' || !body.html.includes('<table') || typeof body.text !== 'string' || body.text.length > 1000000 ||
          typeof body.note !== 'string' || body.note.length > 500 || !completeManualSnapshot(snapshot) ||
          !validReportDate(snapshot.filters?.network?.from) || !validReportDate(snapshot.filters?.network?.to) || snapshot.filters.network.from > snapshot.filters.network.to) return json({ error: 'The report snapshot is invalid or incomplete. Refresh and try again.' }, 400);
      const fingerprint = await digest({ html: body.html, text: body.text, snapshot, note: body.note });
      const previous = await this.ctx.storage.get(`request:${body.requestId}`);
      if (previous) return previous.fingerprint === fingerprint ? json({ report: await this.ctx.storage.get(`meta:${previous.version}`), repeated: true }) : json({ error: 'This finalisation request was already used for different content.' }, 409);
      if (latest !== body.expectedLatest) return json({ error: 'Another version was finalised. Review the latest version before continuing.' }, 409);
      if (latest && !body.note.trim()) return json({ error: 'Enter a reason for the new version.' }, 400);
      const workbook = await this.env.DASHBOARD_DATA.get('current-workbook', { type: 'json' });
      if (!workbook) return json({ error: 'Pitstop Master is unavailable. Nothing was finalised.' }, 503);
      if (await masterFingerprint(workbook?.data || workbook) !== snapshot.master.fingerprint) return json({ error: 'Pitstop Master changed. Refresh and review the report before finalising.' }, 409);
      for (const kind of MANUAL_KINDS) {
        const expected = snapshot.manual[kind];
        if (!expected || typeof expected !== 'object' || Array.isArray(expected) || !Object.keys(expected).length || Object.keys(expected).some(key => !validReportDate(key))) return json({ error: 'The saved input snapshot is incomplete.' }, 400);
        const response = await manualValuesRequest(new Request('https://report.internal'), this.env, kind);
        if (!response.ok) return json({ error: 'Saved inputs could not be verified. Nothing was finalised.' }, 503);
        const current = await response.json();
        if (Object.entries(expected).some(([key, value]) => canonical(current.values?.[key] ?? null) !== canonical(value))) return json({ error: kind.toUpperCase() + ' changed. Refresh and review the report before finalising.' }, 409);
      }
      const html = sanitizeReportHtml(body.html);
      const version = latest + 1, finalisedAt = new Date().toISOString();
      const report = { date, version, from: snapshot.from, finalisedAt, note: body.note.trim(), actor: 'authenticated-dashboard-user', checksum: await digest({ html, text: body.text, snapshot }) };
      await this.ctx.storage.transaction(async storage => {
        await writeReport(storage, version, { ...report, html, text: body.text, snapshot });
        await storage.put(`meta:${version}`, report);
        await storage.put(`request:${body.requestId}`, { version, fingerprint });
        await storage.put('latest', version);
      });
      return json({ report }, 201);
    });
  }
}

export function reportVersionsRequest(request, env) {
  const date = new URL(request.url).searchParams.get('date');
  if (!validReportDate(date)) return json({ error: 'Choose a valid reporting date.' }, 400);
  if (!env.REPORT_VERSIONS) return json({ error: 'The report archive is unavailable.' }, 503);
  return env.REPORT_VERSIONS.get(env.REPORT_VERSIONS.idFromName(date)).fetch(request);
}
