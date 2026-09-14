import { ConcurrencyLimiter, concurrencyConfig } from './concurrency.js';
import { fetchSharePointB2w } from './sharepoint.js';
import { VersionedManualValues, manualValuesRequest } from './manual-values.js';
import { MANUAL_KINDS } from './manual-backup.js';
import { reportVersionsRequest } from './report-versions.js';
import { OperationsStore, operationsRequest, scheduledOperations } from './operations.js';
export { ReportVersionsStore } from './report-versions.js';

export { prepareOrderDailySql, savedPitstopBranchAreaSql, queryGrafanaPitstopRowsWithContext, loadPitstopPerformance, ConcurrencyLimiter, parseFinanceBoundary, financeDateWindow, resolveGrafanaTimeExpression, prepareFinanceSql, applyGrafanaCurrentVariables, appendFinancePredicate, FINANCE_GRAFANA_TABLES, pendingPaymentDealerSql, pendingPaymentCombinedSummarySql, buildFinanceQuery, buildCommissionMetricQuery, PENDING_PAYMENT_DEALER_LIMIT, preparePitstopPanelSql, prepareWarrantyPanelSql, prepareRsaPanelSql, normalizePitstopPanelRows, selectPitstopPanelTarget, warrantyDailySql, warrantyRowsToDaily, rsaRowsToDaily, resqDailySql, resqRowsToDaily, PITSTOP_GRAFANA_PANELS, summarizePitstopChannelSales, financeSnapshotKey, financeSnapshotFreshSeconds, packFinanceRows };

const DATA_KEY = 'current-workbook';
const B2W_VALUES_KEY = 'manual-b2w-values';
const RSA_VALUES_KEY = 'manual-rsa-values';
const BGARAGE_SUMMARY_VALUES_KEY = 'manual-bgarage-summary-values';
const INDONESIA_SUMMARY_VALUES_KEY = 'manual-indonesia-summary-values';
const PITSTOP_HISTORY_MANIFEST_KEY = 'pitstop-history:manifest';
const PITSTOP_HISTORY_MONTH_PREFIX = 'pitstop-history:month:';
const PITSTOP_HISTORY_DRAFT_PREFIX = 'pitstop-history:draft:';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_REPORT_DAYS = 730;
const MAX_GRAFANA_QUERY_DAYS = 90;
// Grafana's BigQuery panel is reliable for the same short windows users
// already use in the dashboard.  Longer ranges can intermittently return an
// empty frame even though the corresponding 14-day request has data.  Keep
// Order - Daily requests in those proven windows and merge them server-side.
const MAX_EMAIL_SALES_QUERY_DAYS = 14;
const PITSTOP_CACHE_SECONDS = 600;
const PITSTOP_PANEL_CACHE_SECONDS = 10 * 60;
const FINANCE_PANEL_CACHE_SECONDS = 10 * 60;
// Bump when Finance query semantics change so cached payloads cannot retain
// calculations produced by an older Grafana query path.
// Scope signatures are part of the snapshot key.  Bump this whenever the
// Grafana variable/date semantics change so an older, differently-scoped
// payload can never be served for a new dashboard selection.
// Bump after changing Finance row-field normalization so previously stored
// Grafana snapshots cannot keep serving an obsolete field shape.
const FINANCE_SNAPSHOT_PREFIX = 'finance-snapshot:v11:';
const FINANCE_SNAPSHOT_MAX_STALE_SECONDS = 30 * 60;
const FINANCE_PREWARM_REQUESTS = [
  ['commission-main', 'primary'],
  ['commission-main', 'options'],
  ['reimbursement-details', 'all'],
  ['daily-sales-branch-overview', 'primary'],
  ['daily-sales-branch-overview', 'tables'],
  ['daily-sales-hq-dealer-overview', 'primary'],
  ['daily-sales-hq-dealer-overview', 'tables']
];
const PITSTOP_GRAFANA_PANELS = [
  {
    channel: 'HQ',
    dashboardTitle: 'Pitstop Performance - detailed copy',
    panelTitle: 'ALL PERFORMANCE (HQ) HTML',
    nameField: 'Name',
    salesField: 'Total_Sales'
  },
  {
    channel: 'BP',
    dashboardTitle: 'BP Performance - detailed copy',
    panelTitle: 'ALL PERFORMANCE (BP) HTML',
    nameField: 'Name',
    salesField: 'Total_Sales'
  }
];
const PITSTOP_ALL_BRANCH_AREAS = [
  // Exact values returned by the Grafana `branch_area` variable. These are
  // operational hub labels, not the report's Region/State labels. Using
  // CENTRAL/JOHOR/etc. here silently excluded almost the entire network.
  'HQ - SELANGOR', 'JOHOR BHARU HUB', 'KEDAH HUB', 'KELANTAN HUB',
  'MELAKA HUB', 'NEGERI SEMBILAN HUB', 'PAHANG HUB', 'PERAK HUB',
  'PERLIS HUB', 'PULAU PINANG HUB', 'RB - JOHOR', 'RB - MELAKA',
  'RB - NEGERI SEMBILAN', 'RB - PAHANG', 'RB - SELANGOR',
  'SABAH HUB', 'SARAWAK', 'TERENGGANU HUB'
];
const PITSTOP_ALL_BRANCH_AREAS_SQL = PITSTOP_ALL_BRANCH_AREAS.map(sqlString).join(', ');
let pitstopPanelCache = null;
let warrantyPanelCache = null;
let rsaPanelCache = null;
const financePanelCache = new Map();
// A dashboard definition contains every nested panel target.  Cache and
// de-duplicate it by dashboard UID so a multi-table Finance request does not
// fetch the same Grafana definition once per table.
const financeDashboardCache = new Map();
const financeDashboardRequests = new Map();
// Commission Rider's Grafana "All" option is not a wildcard: Grafana expands
// it to the live values returned by each variable query. Cache that expansion
// briefly so detail, KPI, and filter-option requests share one exact scope.
const financeCommissionVariableOptionsCache = new Map();
const financeCommissionVariableOptionsRequests = new Map();
let financePrewarmPromise = null;
const SESSION_COOKIE = '__Host-daily_report_session';
const UPLOAD_SESSION_COOKIE = '__Host-daily_report_upload_session';
const SESSION_SECONDS = 8 * 60 * 60;
const UPLOAD_SESSION_SECONDS = 30 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LEASE_FAIL_OPEN_READ_PATHS = new Set([
  '/api/data',
  '/api/pitstop-history',
  '/api/pitstop-performance',
  '/api/email-sales',
  '/api/resq',
  '/api/rsa',
  '/api/warranty',
  '/api/b2w',
  '/api/rsa-values',
  '/api/bgarage-summary-values',
  '/api/indonesia-summary-values'
]);

export function allowsLeaseFailOpen(pathname, method) {
  return String(method || '').toUpperCase() === 'GET' && LEASE_FAIL_OPEN_READ_PATHS.has(String(pathname || ''));
}

function addDaysIso(value, days) {
  const date = parseIsoDate(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthKeysBetween(from, to) {
  const keys = [];
  const cursor = parseIsoDate(`${String(from).slice(0, 7)}-01`);
  const end = parseIsoDate(`${String(to).slice(0, 7)}-01`);
  if (!cursor || !end) return keys;
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

function textBytes(value) {
  return new TextEncoder().encode(String(value));
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  new Uint8Array(bytes).forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', textBytes(value)));
}

async function signSession(secret, payload) {
  const key = await crypto.subtle.importKey('raw', textBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(await crypto.subtle.sign('HMAC', key, textBytes(payload)));
}

function constantTimeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function cookieValue(request, name) {
  const source = String(request.headers.get('cookie') || '');
  const match = source.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

async function validSession(request, env) {
  return Boolean(await sessionInfo(request, env));
}

async function sessionInfo(request, env) {
  if (isLocalRequest(request, env)) return { sessionId: 'local-development', expiresAt: Number.MAX_SAFE_INTEGER };
  if (!env.SESSION_SIGNING_SECRET) return false;
  const value = cookieValue(request, SESSION_COOKIE);
  const parts = value.split('.');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const modern = parts.length === 3;
  const sessionId = modern ? parts[0] : `legacy-${(await sha256(value)).slice(0, 32)}`;
  const expiresAt = Number(modern ? parts[1] : parts[0]);
  const signature = modern ? parts[2] : parts[1];
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = await signSession(env.SESSION_SIGNING_SECRET, modern ? `session:${sessionId}:${expiresAt}` : String(expiresAt));
  return constantTimeEqual(signature, expected) ? { sessionId, expiresAt } : null;
}

async function validUploadSession(request, env) {
  if (isLocalRequest(request, env)) return true;
  if (!env.SESSION_SIGNING_SECRET) return false;
  const value = cookieValue(request, UPLOAD_SESSION_COOKIE);
  const separator = value.indexOf('.');
  if (separator < 1) return false;
  const expiresAt = Number(value.slice(0, separator));
  const signature = value.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = await signSession(env.SESSION_SIGNING_SECRET, `upload:${expiresAt}`);
  return constantTimeEqual(signature, expected);
}

async function createSessionCookie(env) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const random = crypto.getRandomValues(new Uint8Array(18));
  const sessionId = bytesToBase64Url(random);
  const signature = await signSession(env.SESSION_SIGNING_SECRET, `session:${sessionId}:${expiresAt}`);
  return `${SESSION_COOKIE}=${encodeURIComponent(`${sessionId}.${expiresAt}.${signature}`)}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

async function createUploadSessionCookie(env) {
  const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_SESSION_SECONDS;
  const signature = await signSession(env.SESSION_SIGNING_SECRET, `upload:${expiresAt}`);
  return `${UPLOAD_SESSION_COOKIE}=${encodeURIComponent(`${expiresAt}.${signature}`)}; Max-Age=${UPLOAD_SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}


function expiredUploadSessionCookie() {
  return `${UPLOAD_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function safeNext(value) {
  const next = String(value || '/');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function html(value, status = 200, extraHeaders = {}) {
  return new Response(value, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      ...extraHeaders
    }
  });
}

function loginPage(nextPath) {
  const next = JSON.stringify(safeNext(nextPath)).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Report sign in</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#10243a;background:#edf3f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#dff5ef 0,transparent 34%),#edf3f6}.shell{width:min(440px,100%);background:#fff;border:1px solid #d5e0e6;border-radius:18px;box-shadow:0 22px 60px rgba(20,45,65,.14);overflow:hidden}.brand{background:#142c40;color:#fff;padding:28px 32px}.brand-mark{display:flex;align-items:center;gap:12px;color:#9ce100;font-weight:900;letter-spacing:.02em}.brand-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:#9ce100;color:#142c40;font-size:22px}.brand p{margin:8px 0 0;color:#c6d4df;font-size:14px}.content{padding:30px 32px 32px}h1{margin:0 0 8px;font-size:26px;letter-spacing:-.025em}p{margin:0 0 22px;color:#5f7385;line-height:1.5}label{display:block;margin-bottom:8px;font-size:13px;font-weight:800;color:#334d62;text-transform:uppercase;letter-spacing:.06em}input{width:100%;height:48px;border:1px solid #bdccd6;border-radius:10px;padding:0 14px;font:inherit;font-weight:700;outline:none}input:focus{border-color:#0b927b;box-shadow:0 0 0 3px rgba(11,146,123,.14)}button{width:100%;height:48px;margin-top:14px;border:0;border-radius:10px;background:#0b927b;color:#fff;font:inherit;font-weight:850;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.error{min-height:20px;margin:12px 0 0;color:#c53e34;font-size:13px;font-weight:750}.note{margin:16px 0 0;font-size:12px;color:#718495;text-align:center}</style></head><body><main class="shell"><header class="brand"><div class="brand-mark"><span class="brand-icon">ϟ</span><span>BATERIKU.COM</span></div><p>Daily Report · Secure access</p></header><section class="content"><h1>Sign in to Daily Report</h1><p>Enter the dashboard access PIN. Your session will stay active for eight hours on this device.</p><form id="loginForm"><label for="pin">Access PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required maxlength="128" autofocus><button id="submit" type="submit">Open dashboard</button><div class="error" id="error" role="alert" aria-live="polite"></div></form><div class="note">Protected by encrypted server-side authentication.</div></section></main><script>const next=${next};document.getElementById('loginForm').addEventListener('submit',async(e)=>{e.preventDefault();const button=document.getElementById('submit');const error=document.getElementById('error');button.disabled=true;error.textContent='';try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:document.getElementById('pin').value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Sign in failed.');location.href=next}catch(reason){error.textContent=reason.message||'Sign in failed.';button.disabled=false}});</script></body></html>`;
}

function uploadLoginPage(nextPath) {
  const next = JSON.stringify(safeNext(nextPath || '/upload/')).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unlock data uploads</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#10243a;background:#edf3f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#dff5ef 0,transparent 34%),#edf3f6}.shell{width:min(440px,100%);background:#fff;border:1px solid #d5e0e6;border-radius:18px;box-shadow:0 22px 60px rgba(20,45,65,.14);overflow:hidden}.brand{background:#142c40;color:#fff;padding:28px 32px}.brand-mark{display:flex;align-items:center;gap:12px;color:#9ce100;font-weight:900;letter-spacing:.02em}.brand-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:#9ce100;color:#142c40;font-size:22px}.brand p{margin:8px 0 0;color:#c6d4df;font-size:14px}.content{padding:30px 32px 32px}h1{margin:0 0 8px;font-size:26px;letter-spacing:-.025em}p{margin:0 0 22px;color:#5f7385;line-height:1.5}label{display:block;margin-bottom:8px;font-size:13px;font-weight:800;color:#334d62;text-transform:uppercase;letter-spacing:.06em}input{width:100%;height:48px;border:1px solid #bdccd6;border-radius:10px;padding:0 14px;font:inherit;font-weight:700;outline:none}input:focus{border-color:#0b927b;box-shadow:0 0 0 3px rgba(11,146,123,.14)}button{width:100%;height:48px;margin-top:14px;border:0;border-radius:10px;background:#0b927b;color:#fff;font:inherit;font-weight:850;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.error{min-height:20px;margin:12px 0 0;color:#c53e34;font-size:13px;font-weight:750}.note{margin:16px 0 0;font-size:12px;color:#718495;text-align:center}.back{display:block;margin-top:14px;text-align:center;color:#466176;font-size:13px;font-weight:750;text-decoration:none}</style></head><body><main class="shell"><header class="brand"><div class="brand-mark"><span class="brand-icon">&#9889;</span><span>BATERIKU.COM</span></div><p>Daily Report · Restricted data management</p></header><section class="content"><h1>Unlock Data Upload Centre</h1><p>Enter the upload PIN to manage the shared workbook. Upload access expires automatically after 30 minutes.</p><form id="uploadLoginForm"><label for="pin">Upload PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required maxlength="128" autofocus><button id="submit" type="submit">Open Data Upload Centre</button><div class="error" id="error" role="alert" aria-live="polite"></div></form><a class="back" href="/">Back to dashboard</a><div class="note">The PIN is validated securely by Cloudflare and is not stored in the page.</div></section></main><script>const next=${next};document.getElementById('uploadLoginForm').addEventListener('submit',async(e)=>{e.preventDefault();const button=document.getElementById('submit');const error=document.getElementById('error');button.disabled=true;error.textContent='';try{const response=await fetch('/api/auth/upload-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:document.getElementById('pin').value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload authorization failed.');location.href=next}catch(reason){error.textContent=reason.message||'Upload authorization failed.';button.disabled=false}});</script></body></html>`;
}

function waitingRoomPage(nextPath, initial, env) {
  const next = JSON.stringify(safeNext(nextPath || '/')).replace(/</g, '\\u003c');
  const initialState = JSON.stringify(initial || {}).replace(/</g, '\\u003c');
  const config = concurrencyConfig(env);
  const pollMs = Math.max(3000, Number(env.QUEUE_STATUS_POLL_SECONDS || 5) * 1000);
  const heartbeatMs = Math.max(5000, Number(env.QUEUE_HEARTBEAT_SECONDS || 15) * 1000);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Report waiting room</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#10243a;background:#edf3f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 18% 8%,#ddf5ec 0,transparent 34%),#edf3f6}.shell{width:min(520px,100%);background:#fff;border:1px solid #d5e0e6;border-radius:18px;box-shadow:0 22px 60px rgba(20,45,65,.14);overflow:hidden}.brand{background:#142c40;color:#fff;padding:28px 34px}.brand-mark{display:flex;align-items:center;gap:12px;color:#9ce100;font-weight:900;letter-spacing:.02em}.brand-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:9px;background:#9ce100;color:#142c40;font-size:22px}.brand p{margin:8px 0 0;color:#c6d4df;font-size:14px}.content{padding:32px 34px 34px}h1{margin:0 0 10px;font-size:28px;letter-spacing:-.025em}p{margin:0;color:#60758a;line-height:1.55}.queue-card{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:26px 0 22px}.metric{padding:18px;border:1px solid #d8e3e9;border-radius:12px;background:#f7fafb}.metric span{display:block;color:#657b8e;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.metric strong{display:block;margin-top:7px;color:#10243a;font-size:30px}.status{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:10px;background:#edf8f4;color:#16745f;font-size:14px;font-weight:800}.spinner{width:15px;height:15px;border:2px solid #a9d9cc;border-top-color:#0b927b;border-radius:50%;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.note{margin-top:18px;font-size:13px}.leave{width:100%;height:44px;margin-top:22px;border:1px solid #c7d5de;border-radius:9px;background:#fff;color:#496276;font:inherit;font-weight:800;cursor:pointer}.leave:hover{background:#f3f7f9}.error{min-height:20px;margin-top:12px;color:#bd3b32;font-size:13px;font-weight:750}@media(max-width:480px){.queue-card{grid-template-columns:1fr}.content,.brand{padding-left:24px;padding-right:24px}}</style></head><body><main class="shell"><header class="brand"><div class="brand-mark"><span class="brand-icon">&#9889;</span><span>BATERIKU.COM</span></div><p>Daily Report · Managed access</p></header><section class="content"><h1>Application currently full</h1><p>All ${config.limit} application slots are in use. You are safely queued and will enter automatically when a slot becomes available.</p><div class="queue-card"><div class="metric"><span>Your position</span><strong id="position">#${Number(initial && initial.position || 1)}</strong></div><div class="metric"><span>Users active</span><strong><span id="active">${Number(initial && initial.active || config.limit)}</span> / ${config.limit}</strong></div></div><div class="status"><span class="spinner" aria-hidden="true"></span><span id="statusText">Checking for availability...</span></div><p class="note">Keep this page open. Queue positions update automatically and abandoned queue entries expire.</p><button class="leave" id="leaveButton" type="button">Leave queue and sign out</button><div class="error" id="error" role="alert" aria-live="polite"></div></section></main><script>
  const next=${next};let current=${initialState};let stopped=false;
  const position=document.getElementById('position'),active=document.getElementById('active'),statusText=document.getElementById('statusText'),error=document.getElementById('error');
  function render(value){current=value||{};if(current.status==='admitted'){stopped=true;statusText.textContent='Slot available. Opening the dashboard...';location.replace(next);return}if(current.status==='queued'){position.textContent='#'+current.position;active.textContent=current.active;statusText.textContent='Checking for availability...';error.textContent='';return}if(current.status==='required'){enter();}}
  async function call(path,method='GET'){const response=await fetch(path,{method,credentials:'same-origin',headers:method==='POST'?{'content-type':'application/json'}:undefined,body:method==='POST'?'{}':undefined});const result=await response.json().catch(()=>({}));if(response.status===401){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));return null}if(!response.ok)throw new Error(result.error||'The queue could not be checked.');return result}
  async function enter(){try{const value=await call('/api/concurrency/enter','POST');if(value)render(value)}catch(reason){error.textContent=reason.message}}
  async function poll(){if(stopped)return;try{const value=await call('/api/concurrency/queue-status');if(value)render(value)}catch(reason){error.textContent=reason.message}}
  async function keepQueue(){if(stopped)return;try{const value=await call('/api/concurrency/queue-heartbeat','POST');if(value)render(value)}catch(reason){error.textContent=reason.message}}
  document.getElementById('leaveButton').addEventListener('click',async()=>{stopped=true;try{await call('/api/concurrency/leave-queue','POST');await call('/api/auth/logout','POST')}finally{location.replace('/login')}});
  render(current);setInterval(poll,${pollMs});setInterval(keepQueue,${heartbeatMs});
  </script></body></html>`;
}

function isLocalRequest(request, env) {
  const host = new URL(request.url).hostname;
  return env.ALLOW_LOCAL_API === 'true' && (host === 'localhost' || host === '127.0.0.1');
}

async function requireAccess(request, env) {
  return await validSession(request, env) ? null : json({ error: 'Sign in to use dashboard data.' }, 401);
}

async function concurrencyAction(env, action, sessionId) {
  if (!env.CONCURRENCY_LIMITER) throw new Error('Concurrency controller is not configured.');
  const id = env.CONCURRENCY_LIMITER.idFromName('daily-report-global');
  const stub = env.CONCURRENCY_LIMITER.get(id);
  const response = await stub.fetch('https://concurrency.internal/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, sessionId })
  });
  if (!response.ok) throw new Error('Concurrency controller request failed.');
  return response.json();
}

async function concurrencyForRequest(request, env, action) {
  const session = await sessionInfo(request, env);
  if (!session) return null;
  return concurrencyAction(env, action, session.sessionId);
}

async function requireActiveLease(request, env) {
  const result = await concurrencyForRequest(request, env, 'check');
  if (result && result.status === 'admitted') return null;
  return json({
    error: 'An active application slot is required.',
    code: 'queue_required',
    status: result ? result.status : 'required',
    position: result && result.position,
    active: result && result.active,
    limit: result && result.limit,
    waitingUrl: '/waiting-room'
  }, 403);
}

function waitingRedirect(url, nextPath) {
  return Response.redirect(new URL(`/waiting-room?next=${encodeURIComponent(safeNext(nextPath))}`, url.origin), 302);
}

async function loginApi(request, env) {
  if (!env.DASHBOARD_ACCESS_PIN || !env.SESSION_SIGNING_SECRET) return json({ error: 'Dashboard login is not configured.' }, 503);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Enter the dashboard PIN.' }, 400); }
  const pin = String(body.pin || '').slice(0, 128);
  const clientKey = await sha256(String(request.headers.get('cf-connecting-ip') || 'unknown'));
  const rateKey = `login-attempts:${clientKey}`;
  const attempts = await env.DASHBOARD_DATA.get(rateKey, { type: 'json' }) || { count: 0 };
  if (Number(attempts.count || 0) >= MAX_LOGIN_ATTEMPTS) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  const valid = constantTimeEqual(await sha256(pin), await sha256(env.DASHBOARD_ACCESS_PIN));
  if (!valid) {
    await env.DASHBOARD_DATA.put(rateKey, JSON.stringify({ count: Number(attempts.count || 0) + 1 }), { expirationTtl: LOGIN_WINDOW_SECONDS });
    return json({ error: 'Incorrect access PIN.' }, 401);
  }

  await env.DASHBOARD_DATA.delete(rateKey);
  return json({ ok: true }, 200, { 'set-cookie': await createSessionCookie(env) });
}

async function uploadLoginApi(request, env) {
  const uploadPin = env.UPLOAD_ACCESS_PIN || env.DASHBOARD_ACCESS_PIN;
  if (!uploadPin || !env.SESSION_SIGNING_SECRET) return json({ error: 'Upload authorization is not configured.' }, 503);
  if (!await validSession(request, env)) return json({ error: 'Sign in to the dashboard first.' }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Enter the upload PIN.' }, 400); }
  const pin = String(body.pin || '').slice(0, 128);
  const clientKey = await sha256(String(request.headers.get('cf-connecting-ip') || 'unknown'));
  const rateKey = `upload-login-attempts:${clientKey}`;
  const attempts = await env.DASHBOARD_DATA.get(rateKey, { type: 'json' }) || { count: 0 };
  if (Number(attempts.count || 0) >= MAX_LOGIN_ATTEMPTS) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
  const valid = constantTimeEqual(await sha256(pin), await sha256(uploadPin));
  if (!valid) {
    await env.DASHBOARD_DATA.put(rateKey, JSON.stringify({ count: Number(attempts.count || 0) + 1 }), { expirationTtl: LOGIN_WINDOW_SECONDS });
    return json({ error: 'Incorrect upload PIN.' }, 401);
  }
  await env.DASHBOARD_DATA.delete(rateKey);
  return json({ ok: true }, 200, { 'set-cookie': await createUploadSessionCookie(env) });
}

async function logoutApi(request, env) {
  const session = await sessionInfo(request, env);
  if (session) {
    await concurrencyAction(env, 'release', session.sessionId);
    await concurrencyAction(env, 'leave-queue', session.sessionId);
  }
  const response = json({ ok: true });
  response.headers.append('set-cookie', expiredSessionCookie());
  response.headers.append('set-cookie', expiredUploadSessionCookie());
  return response;
}

function validWorkbookPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const arrayKeys = ['dailySales', 'serviceWarranty', 'pitstops', 'pitstopMaster', 'pitstopRelocations', 'bgarage', 'indonesia', 'settings'];
  if (!arrayKeys.some((key) => Array.isArray(value[key]))) return false;
  return arrayKeys.every((key) => value[key] === undefined || Array.isArray(value[key]));
}

function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function parseFinanceBoundary(value, endOfDay = false, utcOffsetHours = 8) {
  const text = String(value || '').trim().replace('T', ' ');
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hasTime = hourText != null;
  const hour = hasTime ? Number(hourText) : (endOfDay ? 23 : 0);
  const minute = hasTime ? Number(minuteText) : (endOfDay ? 59 : 0);
  const second = hasTime ? Number(secondText || 0) : (endOfDay ? 59 : 0);
  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const probe = new Date(wallClockMs);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day || probe.getUTCHours() !== hour || probe.getUTCMinutes() !== minute || probe.getUTCSeconds() !== second) return null;
  return {
    text: `${yearText}-${monthText}-${dayText} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
    ms: wallClockMs - Number(utcOffsetHours || 0) * 60 * 60 * 1000
  };
}

function reportWindow(url) {
  const fromText = url.searchParams.get('from');
  const toText = url.searchParams.get('to');
  const from = parseIsoDate(fromText);
  const to = parseIsoDate(toText);
  if (!from || !to || from > to) return { error: 'Use a valid from/to range in YYYY-MM-DD format.' };
  const days = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  if (days > MAX_REPORT_DAYS) return { error: `Pitstop performance is limited to ${MAX_REPORT_DAYS} days per request.` };
  return { from: fromText, to: toText, days };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function frameRows(payload, refId = 'A') {
  const result = payload && payload.results && payload.results[refId];
  const frames = result && Array.isArray(result.frames)
    ? result.frames
    : result && result.schema && result.data
      ? [{ schema: result.schema, data: result.data }]
      : [];
  const rows = [];
  frames.forEach((frame) => {
    const fields = frame && frame.schema && frame.schema.fields;
    const data = frame && frame.data;
    const values = data && data.values;
    if (!Array.isArray(fields)) return;
    // Grafana normally returns columnar `data.values`, but table responses
    // from some BigQuery/plugin versions use `data.rows` or an object keyed
    // by field name. Accept all three so a valid panel cannot silently become
    // an all-zero dashboard.
    if (Array.isArray(data && data.rows)) {
      data.rows.forEach((rawRow) => {
        const row = {};
        if (Array.isArray(rawRow)) fields.forEach((field, index) => { row[String(field && field.name || '').toLowerCase()] = rawRow[index]; });
        else if (rawRow && typeof rawRow === 'object') fields.forEach((field) => {
          const name = String(field && field.name || '');
          row[name.toLowerCase()] = rawRow[name] ?? rawRow[name.toLowerCase()];
        });
        rows.push(row);
      });
      return;
    }
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      const columns = fields.map((field) => {
        const name = String(field && field.name || '');
        return values[name] ?? values[name.toLowerCase()] ?? [];
      });
      const count = Math.max(0, ...columns.map((column) => Array.isArray(column) ? column.length : 0));
      for (let index = 0; index < count; index += 1) {
        const row = {};
        fields.forEach((field, fieldIndex) => { row[String(field && field.name || '').toLowerCase()] = Array.isArray(columns[fieldIndex]) ? columns[fieldIndex][index] : undefined; });
        rows.push(row);
      }
      return;
    }
    if (!Array.isArray(values)) return;
    const count = Math.max(0, ...values.map((column) => Array.isArray(column) ? column.length : 0));
    for (let index = 0; index < count; index += 1) {
      const row = {};
      fields.forEach((field, fieldIndex) => {
        row[String(field.name || '').toLowerCase()] = Array.isArray(values[fieldIndex]) ? values[fieldIndex][index] : undefined;
      });
      rows.push(row);
    }
  });
  return rows;
}

const FINANCE_PANEL_MAP = {
  'commission-main': { dashboardUid: '_Qmhp4wHz', panelId: 20 },
  'commission-order-source': { dashboardUid: '_Qmhp4wHz', panelId: 4 },
  'commission-total-source': { dashboardUid: '_Qmhp4wHz', panelId: 6 },
  'reimbursement-details': { dashboardUid: 'XO4KTAeHk', panelId: 2 },
  'daily-sales-branch-overview': { dashboardUid: 'zaFDBluHz', panelId: 8 },
  'daily-sales-hq-dealer-overview': { dashboardUid: 'qF-kJv9Hk', panelId: 10 },
  'job-booking': { dashboardUid: 'T232EcQHk', panelId: 2 },
  'pending-job': { dashboardUid: 'cjc6HZ24k', panelId: 4 },
  'pending-payment-dealer-source': { dashboardUid: 'eofpfRh4z2', panelId: 2 },
  'pending-payment-motec-source': { dashboardUid: 'eofpfRh4z', panelId: 11 },
  'pending-payment-combined-summary': { dashboardUid: 'eofpfRh4z', panelId: 6 },
  'quantity-pitstop-details': { dashboardUid: '4WJnZMlNk', panelId: 6 },
  'quantity-pitstop-summary': { dashboardUid: '4WJnZMlNk', panelId: 2 }
};

// Keep the Finance filter bar aligned with each dashboard's saved Grafana
// variable state. This is returned separately from the option lists so the UI
// can distinguish "All" from an explicit multi-selection.
const FINANCE_FILTER_VARIABLES = {
  'commission-main': ['branch_name', 'arrival_status', 'order_status', 'level', 'battery_size', 'sales_source', 'rider_category'],
  'reimbursement-details': ['product', 'order_status', 'order_segment'],
  'daily-sales-branch-overview': ['payment_method', 'brand', 'battery_size', 'branch_name', 'product_category'],
  'daily-sales-hq-dealer-overview': ['payment_method', 'brand', 'battery_size', 'branch_name', 'product_category']
};

const FINANCE_GRAFANA_TABLES = {
  'reimbursement-details': [
    { key: 'details', title: 'Details', panelId: 2, primary: true, columns: ['created_at', 'order_id', 'customer_name', 'phone_number', 'email', 'order_status', 'plate_number', 'brand', 'product', 'address', 'rider_category', 'rider_name', 'branch', 'branch_area', 'payment_type_1', 'payment_type_2', 'Payment_Status', 'service_price', 'direct_bank_in', 'amount_paid', 'reimbursement', 'order_segment', 'promocode', 'trade_in_price'], footer: ['service_price', 'direct_bank_in', 'amount_paid', 'reimbursement', 'trade_in_price'] }
  ],
  'daily-sales-branch-overview': [
    { key: 'branch', title: 'Branch', panelId: 3, columns: ['branch_name', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'], footer: ['gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'] },
    { key: 'warranty', title: 'Warranty', panelId: 4, variableOverrides: { product_category: ['WARRANTY'] }, columns: ['branch_name', 'net_sales_warranty'], footer: ['net_sales_warranty'] },
    { key: 'payment-type', title: 'Payment Type', panelId: 5, columns: ['branch_name', 'typeofpayment', 'net_sales'], footer: ['net_sales'] },
    { key: 'with-office', title: 'With Office', panelId: 6, columns: ['office', 'branch_name', 'quantity', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'], footer: ['quantity', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'] },
    { key: 'stock-location', title: 'Stock Location', panelId: 7, columns: ['office', 'branch_name', 'stock_location_type', 'quantity', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'], footer: ['quantity', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'] },
    { key: 'details', title: 'Details', panelId: 8, primary: true, columns: ['office', 'branch_name', 'orderID', 'payment_status', 'orderStatus', 'battery_size', 'brand', 'tier', 'vpn', 'external_id', 'payment_type', 'quantity', 'gross_revenue', 'promocodevalue', 'scrap_discount', 'net_revenue', 'tally'], footer: ['quantity', 'gross_revenue', 'promocodevalue', 'scrap_discount', 'net_revenue', 'tally'] }
  ],
  'daily-sales-hq-dealer-overview': [
    { key: 'hq-selangor', title: 'HQ-SELANGOR', panelId: 2, columns: ['branch_name', 'stock_location', 'office', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'], footer: ['gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'] },
    { key: 'dealer', title: 'DEALER', panelId: 3, columns: ['stock_location', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'], footer: ['gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'] },
    { key: 'hq-warranty', title: 'HQ-SELANGOR - WARRANTY', panelId: 4, variableOverrides: { product_category: ['WARRANTY'] }, columns: ['branch_name', 'net_sales_warranty'], footer: ['net_sales_warranty'] },
    { key: 'dealer-warranty', title: 'DEALER - WARRANTY', panelId: 5, variableOverrides: { product_category: ['WARRANTY'] }, columns: ['branch_name', 'net_sales_warranty'], footer: ['net_sales_warranty'] },
    { key: 'hq-payment-type', title: 'HQ-SELANGOR - PAYMENT TYPE', panelId: 6, columns: ['branch_name', 'typeofpayment', 'net_sales'], footer: ['net_sales'] },
    { key: 'dealer-payment-type', title: 'DEALER - PAYMENT TYPE', panelId: 7, columns: ['branch_name', 'typeofpayment', 'net_sales'], footer: ['net_sales'] },
    { key: 'with-office', title: 'WITH OFFICE', panelId: 8, columns: ['office', 'stock_location', 'stock_location_type', 'branch_name', 'quantity', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'], footer: ['quantity', 'gross_sales', 'scrap_cost', 'promo_discount', 'net_sales'] },
    { key: 'details', title: 'DETAILS', panelId: 10, primary: true, columns: ['office', 'branch_name', 'stock_location_type', 'orderID', 'payment_status', 'orderStatus', 'battery_size', 'brand', 'tier', 'vpn', 'external_id', 'payment_type', 'quantity', 'gross_revenue', 'promocodevalue', 'scrap_discount', 'net_revenue', 'tally'], footer: ['quantity', 'gross_revenue', 'promocodevalue', 'scrap_discount', 'net_revenue', 'tally'] }
  ]
};

const PENDING_PAYMENT_DEALER_LIMIT = 10000;

function pendingPaymentDealerSql() {
  return `SELECT
  payments.order_id AS orderID,
  orders.completed_at AS Order_Completed,
  orders.status AS orderStatus,
  CASE
    WHEN payments.status = 2 THEN 'Failed'
    WHEN payments.status = 0 THEN 'Pending'
    WHEN payments.status = 1 THEN 'Completed'
    ELSE CAST(payments.status AS text)
  END AS Payment_Status,
  CASE
    WHEN payments.payment_method LIKE '%TWOCTWOP%' THEN '2C2P'
    WHEN payments.payment_type = 0 THEN 'cash'
    WHEN payments.payment_type = 3 THEN 'Manual Settlement'
    WHEN payments.payment_type = 4 THEN 'Boost'
    WHEN payments.payment_type = 5 THEN 'TnG'
    WHEN payments.payment_type = 6 THEN 'Pre Auth'
    WHEN payments.payment_type = 7 THEN 'Tng Mini'
    WHEN payments.payment_type = 8 THEN 'Claim Billing'
    WHEN payments.boost_id IS NOT NULL THEN 'Boost'
    ELSE 'Not applicable/Unidentified'
  END AS paytype,
  riders.name AS rider_name,
  branches.name AS branches,
  REPLACE(UPPER(orders.vehicle_plate_number), ' ', '') AS vehicle_plate_number,
  'Dealer Rider' AS riderPosition,
  payments.total_cents::decimal / 100 AS paymentotal,
  CURRENT_DATE - orders.completed_at::date AS period
FROM payments
JOIN orders ON payments.order_id = orders.id
JOIN riders ON orders.rider_id = riders.id
LEFT JOIN branches ON orders.branch_id = branches.id
WHERE payments.total_cents > 100
  AND payments.failure_reason IS NULL
  AND orders.status = 'completed'
  AND orders.completed_at >= TIMESTAMP '2020-01-01'
  AND orders.completed_at < CURRENT_DATE
  AND payments.payment_type NOT IN (1, 2)
  AND riders.category = 2
  AND riders.name <> 'MYEG - MY ASSIST'
  AND payments.status IS NOT NULL
  AND payments.status NOT IN (1, 3)
ORDER BY payments.order_id ASC
LIMIT ${PENDING_PAYMENT_DEALER_LIMIT}`;
}

function pendingPaymentCombinedSummarySql() {
  return `SELECT
  COUNT(orders.id) AS total_no,
  COUNT(DISTINCT riders.name) AS rider_name,
  SUM(payments.total_cents / 100) AS total_amount,
  COUNTIF(riders.category = 2) AS dealer_total_no,
  COUNT(DISTINCT IF(riders.category = 2, riders.name, NULL)) AS dealer_rider_name,
  SUM(IF(riders.category = 2, payments.total_cents / 100, 0)) AS dealer_total_amount,
  COUNTIF(riders.category IN (0, 1)) AS motec_total_no,
  COUNT(DISTINCT IF(riders.category IN (0, 1), riders.name, NULL)) AS motec_rider_name,
  SUM(IF(riders.category IN (0, 1), payments.total_cents / 100, 0)) AS motec_total_amount
FROM \`bateriku-customer-72fa8.bateriku_public.payments\` AS payments
JOIN \`bateriku-customer-72fa8.bateriku_public.orders\` AS orders
  ON payments.order_id = orders.id
JOIN \`bateriku-customer-72fa8.bateriku_public.riders\` AS riders
  ON orders.rider_id = riders.id
WHERE payments.total_cents > 100
  AND payments.failure_reason IS NULL
  AND orders.status = 'completed'
  AND orders.completed_at > TIMESTAMP('2020-01-01')
  AND DATE(orders.completed_at) < CURRENT_DATE()
  AND payments.payment_type NOT IN (1, 2)
  AND riders.category IN (0, 1, 2)
  AND riders.name <> 'MYEG - MY ASSIST'
  AND payments.status IS NOT NULL
  AND payments.status NOT IN (1, 3)`;
}

function financeDateWindow(url, utcOffsetHours = 8) {
  const now = new Date();
  const malaysiaParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const malaysiaToday = `${malaysiaParts.year}-${malaysiaParts.month}-${malaysiaParts.day}`;
  const defaultEndDate = new Date(`${malaysiaToday}T00:00:00Z`);
  const defaultStartDate = new Date(defaultEndDate); defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - 6);
  const from = parseFinanceBoundary(url.searchParams.get('from') || defaultStartDate.toISOString().slice(0, 10), false, utcOffsetHours);
  const to = parseFinanceBoundary(url.searchParams.get('to') || defaultEndDate.toISOString().slice(0, 10), true, utcOffsetHours);
  if (!from || !to || from.ms > to.ms) return null;
  // Grafana's displayed end value is second precision (23:59:59), while its
  // $__to boundary includes that final second. Our SQL uses `< $__to`, so move
  // the boundary to the next second to preserve the same inclusive UI range.
  const toMs = /\b23:59:59$/.test(to.text) ? to.ms + 1000 : to.ms;
  return {
    from: from.text,
    to: to.text,
    fromMs: from.ms,
    toMs
  };
}

function nestedPanels(panels, output = []) {
  (Array.isArray(panels) ? panels : []).forEach((panel) => {
    output.push(panel);
    if (Array.isArray(panel.panels)) nestedPanels(panel.panels, output);
  });
  return output;
}

function removeTemplateCondition(sql, variable) {
  const token = `\\$\\{?${variable}(?::(?:sqlstring|singlequote))?\\}?`;
  return sql
    .replace(new RegExp(`\\r?\\n\\s*AND\\s*\\([\\s\\S]{0,1600}?${token}[\\s\\S]{0,1600}?\\r?\\n\\s*\\)`, 'gi'), '')
    .replace(new RegExp(`\\r?\\n\\s*AND\\s+\\([^\\r\\n]*${token}[^\\r\\n]*\\)`, 'gi'), '')
    .replace(new RegExp(`\\r?\\n\\s*AND\\s+[^\\r\\n]*${token}[^\\r\\n]*`, 'gi'), '');
}

function removeUnresolvedFinanceVariables(sql) {
  const variables = new Set();
  String(sql || '').replace(/\$\{?([A-Za-z][A-Za-z0-9_]*)(?::(?:sqlstring|singlequote))?\}?/g, (match, variable) => {
    if (!String(variable).startsWith('__')) variables.add(variable);
    return match;
  });
  let result = String(sql || '');
  variables.forEach((variable) => { result = removeTemplateCondition(result, variable); });
  return result;
}

function grafanaCurrentVariables(dashboard) {
  const variables = dashboard && dashboard.templating && Array.isArray(dashboard.templating.list)
    ? dashboard.templating.list
    : [];
  return variables.map((variable) => {
    const current = variable && variable.current || {};
    const raw = current.value == null ? current.text : current.value;
    const values = normalizeFinanceFilterValues(raw);
    return { name: String(variable && variable.name || ''), values };
  }).filter((variable) => variable.name);
}

// Grafana's "All" selection expands to its full variable option list.  Keep
// this comfortably above the largest Finance variable so the proxy never
// creates a smaller KPI scope than the dashboard.
const FINANCE_FILTER_VALUE_LIMIT = 10000;

function normalizeFinanceFilterValues(value) {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  // Grafana variable values are SQL values, not display labels. Preserve
  // significant leading/trailing whitespace exactly; trimming values such as
  // `Shopee ` or whitespace-bearing branch names excludes valid source rows.
  const values = [...new Set(source
    .map((item) => String(item == null ? '' : item))
    .filter((item) => item.trim().length > 0))];
  // Grafana represents the unbounded selection as either $__all or (for a
  // few older dashboards) the literal text All. Keep one canonical token so
  // SQL expansion and cache keys behave identically to Grafana.
  if (values.some((item) => item.trim() === '$__all' || item.trim().toLowerCase() === 'all')) return ['$__all'];
  return values.slice(0, FINANCE_FILTER_VALUE_LIMIT);
}

async function financeCurrentFilterState(env, panelKey, overrides = null) {
  const names = FINANCE_FILTER_VARIABLES[panelKey];
  const config = FINANCE_PANEL_MAP[panelKey];
  if (!Array.isArray(names) || !config) return null;
  const { dashboard } = await financePanelTarget(env, config);
  const current = new Map(grafanaCurrentVariables(dashboard).map((item) => [normalizedGrafanaKey(item.name), item.values]));
  return Object.fromEntries(names.map((name) => {
    const overrideKey = overrides && Object.keys(overrides).find((key) => normalizedGrafanaKey(key) === normalizedGrafanaKey(name));
    const rawValues = overrideKey == null ? (current.get(normalizedGrafanaKey(name)) || []) : overrides[overrideKey];
    const values = normalizeFinanceFilterValues(rawValues).filter((value) => value !== '$__all');
    return [name, values];
  }));
}

function applyGrafanaCurrentVariables(rawSql, dashboard, overrides = {}) {
  let sql = String(rawSql || '');
  grafanaCurrentVariables(dashboard).forEach(({ name, values: savedValues }) => {
    const overrideKey = Object.keys(overrides || {}).find((key) => normalizedGrafanaKey(key) === normalizedGrafanaKey(name));
    const hasOverride = overrideKey != null;
    const values = hasOverride ? normalizeFinanceFilterValues(overrides[overrideKey]) : savedValues;
    if (values.some((value) => value === '$__all')) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const token = `\\$\\{?${escapedName}(?::(?:sqlstring|singlequote))?\\}?`;
      const allGuard = new RegExp(`'All'\\s+IN\\s*\\(\\s*${token}\\s*\\)`, 'i');
      // Conditional variables (such as level and battery_size) use an
      // explicit Grafana All guard. Keep it true; forcing it false narrows
      // the source query and causes the finance KPIs to diverge.
      if (allGuard.test(sql)) {
        sql = sql.replace(new RegExp(token, 'g'), "'All'");
        return;
      }
      // Grafana's SQL multi-value "All" expands to every non-null option.
      // `field IS NOT NULL` is equivalent without fetching a potentially
      // enormous option list, while deleting the predicate would incorrectly
      // admit source nulls that Grafana excludes.
      sql = sql.replace(new RegExp(`([A-Za-z_][A-Za-z0-9_.]*)\\s+IN\\s*\\(\\s*${token}\\s*\\)`, 'gi'), '$1 IS NOT NULL');
      // Resolve only a residual token after its simple IN predicate was
      // rewritten. Removing entire conditions can leave nested SQL invalid.
      sql = sql
        .replace(new RegExp(token, 'g'), 'NULL');
      return;
    }
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replacement = (values.length ? values : ['']).map(sqlString).join(', ');
    sql = sql
      .replace(new RegExp(`\\$\\{${escapedName}:(?:sqlstring|singlequote)\\}`, 'g'), replacement)
      .replace(new RegExp(`\\$\\{${escapedName}\\}`, 'g'), replacement)
      .replace(new RegExp(`\\$${escapedName}\\b`, 'g'), replacement);
  });
  return removeUnresolvedFinanceVariables(sql);
}

function appendFinancePredicate(sql, predicate) {
  const text = String(sql || '').trim();
  const clause = /(\r?\n\s*(?:GROUP\s+BY|ORDER\s+BY|LIMIT)\b|;\s*$)/i.exec(text);
  const index = clause ? clause.index : text.length;
  return `${text.slice(0, index).trimEnd()}\n  AND ${predicate}\n${text.slice(index).trimStart()}`.trim();
}

function prepareFinanceSql(rawSql, panelKey, window, dashboard = null, options = {}) {
  if (panelKey === 'pending-payment-dealer-source') return pendingPaymentDealerSql();
  if (panelKey === 'pending-payment-combined-summary') return pendingPaymentCombinedSummarySql();
  let sql = String(rawSql || '')
    .replace(/\$\{__from\}/g, String(window.fromMs))
    .replace(/\$\{__to\}/g, String(window.toMs));

  const exactGrafanaTables = panelKey === 'commission-main' || Boolean(FINANCE_GRAFANA_TABLES[panelKey]);
  if (exactGrafanaTables) sql = applyGrafanaCurrentVariables(sql, dashboard, options.variableOverrides);

  if (!exactGrafanaTables) {
    sql = sql.replace(/\r?\n\s*AND\s*\(\s*\r?\n\s*typeofpayment\s+IN\s*\(\s*\$payment_method\s*\)\s*\r?\n\s*OR\s+typeofpayment\s+IS\s+NULL\s*\r?\n\s*\)/gi, '');
    ['branch_name', 'branch_area', 'arrival_status', 'order_status', 'order_category', 'job_booking', 'rider_position', 'rider_name', 'paytype', 'battery_size', 'sales_source', 'rider_category', 'payment_method', 'brand', 'product_category', 'product', 'order_segment', 'status', 'Branches']
      .forEach((variable) => { sql = removeTemplateCondition(sql, variable); });
    sql = sql.replace(/\$\{level:sqlstring\}/g, "'All'").replace(/\$level\b/g, "'All'");
    sql = removeUnresolvedFinanceVariables(sql);
  }

  if (panelKey === 'commission-main') {
    sql = sql.replace(/cr\.rider_name,/, 'cr.rider_name,\n  cr.riderPosition AS rider_category,');
  } else if (panelKey === 'daily-sales-branch-overview' || panelKey === 'daily-sales-hq-dealer-overview') {
    if (options.primary) {
      sql = sql.replace(/\bSELECT\s+(?:DISTINCT\s+)?/i, (match) => `${match}\n  created_at,\n  typeofpayment,\n  product_category,\n  stock_location,\n  `);
    }
  } else if (panelKey === 'job-booking') {
    sql = sql.replace(/\s*;?\s*$/, "\n  AND NOT REGEXP_CONTAINS(LOWER(COALESCE(CAST(paytype AS STRING), '')), r'(billplz|bplaz)')");
  } else if (panelKey === 'pending-payment-motec-source') {
    sql = sql.replace(/\s*ORDER BY\s+period/i, `\n  AND payments.payment_type != 1\nORDER BY period`);
  } else if (panelKey === 'quantity-pitstop-details') {
    sql = sql.replace(/\s*$/, "\n  AND COALESCE(payments.payment_type, -1) != 1\n");
  } else if (panelKey === 'quantity-pitstop-summary') {
    sql = sql.replace(/\r?\nGROUP BY/i, "\n  AND NOT EXISTS (SELECT 1 FROM `bateriku-customer-72fa8.bateriku_public.payments` excluded_payment WHERE excluded_payment.order_id = o.id AND excluded_payment.payment_type = 1)\nGROUP BY");
  }
  return sql;
}

async function queryPendingPaymentSummary(env, window) {
  const summaryRows = await queryFinancePanel(env, 'pending-payment-combined-summary', window);
  const summary = summaryRows[0] || {};
  const numeric = (value) => Number(value || 0) || 0;
  return {
    pendingPayment: numeric(summary.total_no),
    riders: numeric(summary.rider_name),
    totalAmount: numeric(summary.total_amount),
    groups: {
      Dealer: {
        pendingPayment: numeric(summary.dealer_total_no),
        riders: numeric(summary.dealer_rider_name),
        totalAmount: numeric(summary.dealer_total_amount)
      },
      'Motec/FL': {
        pendingPayment: numeric(summary.motec_total_no),
        riders: numeric(summary.motec_rider_name),
        totalAmount: numeric(summary.motec_total_amount)
      }
    }
  };
}

async function financePanelTarget(env, config, options = {}) {
  const baseUrl = String(env.GRAFANA_URL || '').replace(/\/$/, '');
  const cacheKey = `${baseUrl}:${config.dashboardUid}:${config.panelId}`;
  const now = Date.now();
  const forceFresh = options.forceFresh === true;
  const cached = forceFresh ? null : financePanelCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const dashboardKey = `${baseUrl}:${config.dashboardUid}`;
  let dashboardPending = financeDashboardRequests.get(dashboardKey);
  if (!dashboardPending) {
    dashboardPending = (async () => {
      const dashboardCached = forceFresh ? null : financeDashboardCache.get(dashboardKey);
      if (dashboardCached && dashboardCached.expiresAt > Date.now()) return dashboardCached.value;
      const response = await fetch(`${baseUrl}/api/dashboards/uid/${encodeURIComponent(config.dashboardUid)}`, {
        headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}` }
      });
      if (!response.ok) throw Object.assign(new Error('Grafana dashboard definition could not be loaded.'), { status: response.status });
      const payload = await response.json();
      const dashboard = payload && payload.dashboard;
      if (!forceFresh) financeDashboardCache.set(dashboardKey, { value: dashboard, expiresAt: Date.now() + FINANCE_PANEL_CACHE_SECONDS * 1000 });
      return dashboard;
    })();
    financeDashboardRequests.set(dashboardKey, dashboardPending);
  }

  try {
    const dashboard = await dashboardPending;
    const panel = nestedPanels(dashboard && dashboard.panels).find((item) => Number(item.id) === config.panelId);
    const target = panel && Array.isArray(panel.targets) ? panel.targets.find((item) => item && item.hide !== true && (item.rawSql || item.rawSQL)) : null;
    if (!target) throw new Error('The mapped Grafana finance table query was not found.');
    const value = { dashboard, panel, target };
    if (!forceFresh) financePanelCache.set(cacheKey, { value, expiresAt: Date.now() + FINANCE_PANEL_CACHE_SECONDS * 1000 });
    return value;
  } finally {
    if (financeDashboardRequests.get(dashboardKey) === dashboardPending) financeDashboardRequests.delete(dashboardKey);
  }
}

function buildFinanceQuery(target, datasource, panelKey, window, dashboard = null, options = {}) {
  const query = {
    ...target,
    refId: 'A',
    datasource,
    rawQuery: true,
    rawSql: prepareFinanceSql(target.rawSql || target.rawSQL, panelKey, window, dashboard, options),
    intervalMs: 86400000,
    maxDataPoints: Number(options.maxDataPoints || (options.primary ? 10000 : 2000))
  };
  if (query.format == null) query.format = datasource.type === 'postgres' ? 'table' : 1;
  if (!query.editorMode && datasource.type === 'grafana-bigquery-datasource') query.editorMode = 'code';
  delete query.hide;
  return query;
}

function financeBatchRefId(index) {
  return String.fromCharCode(65 + index);
}

async function executeFinancePanelBatch(env, panelKey, base, definitions, window, options = {}) {
  const resolved = await Promise.allSettled(definitions.map((definition) => financePanelTarget(env, {
    dashboardUid: base.dashboardUid,
    panelId: definition.panelId
  })));
  const outcomes = definitions.map((definition, index) => resolved[index].status === 'rejected'
    ? { ...definition, rows: [], error: resolved[index].reason && resolved[index].reason.message || 'Grafana table definition could not be loaded.' }
    : { ...definition, rows: [] });
  const entries = resolved.flatMap((result, index) => {
    if (result.status !== 'fulfilled') return [];
    const definition = definitions[index];
    const { dashboard, panel, target } = result.value;
    const datasource = target.datasource || panel.datasource || { type: 'grafana-bigquery-datasource', uid: '1oBzAPaNk' };
    const refId = financeBatchRefId(index);
    const query = buildFinanceQuery(target, datasource, panelKey, window, dashboard, {
      primary: Boolean(definition.primary),
      maxDataPoints: definition.primary ? 10000 : 2000,
      // A request-scoped selection must be applied to every companion table.
      // A table's own override (for example Warranty) remains authoritative.
      variableOverrides: { ...(options.variableOverrides || {}), ...(definition.variableOverrides || {}) }
    });
    query.refId = refId;
    return [{ index, refId, query }];
  });
  if (!entries.length) return outcomes;

  // Grafana's BigQuery datasource accepts a multi-query payload but can
  // silently return empty frames for every query after the first. Execute
  // native panel queries concurrently as one-query requests instead. The
  // edge snapshot still exposes one fast cached response to the Finance UI.
  await Promise.all(entries.map(async (entry) => {
    const title = definitions[entry.index].title || panelKey;
    const query = { ...entry.query, refId: 'A' };
    let response;
    try {
      response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: String(window.fromMs), to: String(window.toMs), queries: [query] })
      });
    } catch (reason) {
      outcomes[entry.index].error = reason && reason.message || `Grafana request failed for ${title}.`;
      return;
    }
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id') || '';
      outcomes[entry.index].error = `Grafana could not return ${title} (HTTP ${response.status}).${requestId ? ` Request ${requestId}.` : ''}`;
      return;
    }
    const payload = await response.json();
    const result = payload && payload.results && payload.results.A;
    if (!result) {
      outcomes[entry.index].error = `Grafana returned no result for ${title}.`;
      return;
    }
    if (result.error) {
      outcomes[entry.index].error = `Grafana rejected ${title}: ${String(result.error).slice(0, 240)}`;
      return;
    }
    outcomes[entry.index].rows = frameRows({ results: { A: result } })
      .map((row) => normalizeFinanceRow(panelKey, row, window));
  }));
  return outcomes;
}

function normalizeFinanceRow(panelKey, source, window) {
  const row = { ...source };
  if (typeof row.created_at === 'number' && Number.isFinite(row.created_at)) row.created_at = new Date(row.created_at).toISOString();
  if (row.orderid != null && row.order_id == null) row.order_id = row.orderid;
  if (row.branch != null && row.branch_name == null) row.branch_name = row.branch;
  if (row.branches != null && row.branch_name == null) row.branch_name = row.branches;
  if (row.created_at_utc != null && row.created_at == null) row.created_at = row.created_at_utc;
  if (row.order_completed != null && row.created_at == null) row.created_at = row.order_completed;
  if (row.payment_status == null && row.payment_status_1 != null) row.payment_status = row.payment_status_1;
  if (row.gross_revenue != null && row.gross_sales == null) row.gross_sales = row.gross_revenue;
  if (row.scrap_discount != null && row.scrap_cost == null) row.scrap_cost = row.scrap_discount;
  if (row.promocodevalue != null && row.promo_discount == null) row.promo_discount = row.promocodevalue;
  if (row.net_revenue != null && row.net_sales == null) row.net_sales = row.net_revenue;
  if (row.typeofpayment != null && row.payment_method == null) row.payment_method = row.typeofpayment;
  if (row.paytype != null && row.payment_method == null) row.payment_method = row.paytype;
  if (row.amount_rm != null && row.amount == null) row.amount = row.amount_rm;
  if (row.paymentotal != null && row.payment_amount == null) row.payment_amount = row.paymentotal;
  if (row.paymentotal_rm != null && row.payment_amount == null) row.payment_amount = row.paymentotal_rm;
  if (row.payments_total != null && row.payment_amount == null) row.payment_amount = row.payments_total;
  if (row.count_id != null && row.quantity == null) row.quantity = row.count_id;
  const orderStatus = row.orderStatus ?? row.orderstatus ?? row.OrderStatus ?? row.order_status ?? row.status;
  if (orderStatus != null) {
    if (row.order_status == null) row.order_status = orderStatus;
    if (row.orderStatus == null) row.orderStatus = orderStatus;
  }
  if (row.riderposition != null && row.rider_category == null) row.rider_category = row.riderposition;
  row.record_count = 1;
  if (panelKey.startsWith('daily-sales-hq-dealer')) {
    row.channel = String(row.stock_location_type || row.stock_location || '').toUpperCase() === 'DEALER' ? 'Dealer' : 'HQ - Selangor';
  }
  if (row.created_at == null) row.created_at = `${window.to.replace(' ', 'T')}${panelKey === 'commission-main' || FINANCE_GRAFANA_TABLES[panelKey] ? 'Z' : '+08:00'}`;
  return row;
}

async function executeFinancePanel(env, panelKey, config, window, options = {}) {
  const { dashboard, panel, target } = await financePanelTarget(env, config);
  const datasource = target.datasource || panel.datasource || { type: 'grafana-bigquery-datasource', uid: '1oBzAPaNk' };
  const query = buildFinanceQuery(target, datasource, panelKey, window, dashboard, options);
  const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: String(window.fromMs), to: String(window.toMs), queries: [query] })
  });
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') || '';
    throw Object.assign(new Error(`Grafana could not return ${options.title || panelKey} (HTTP ${response.status}).`), { status: response.status, requestId });
  }
  const payload = await response.json();
  const queryError = payload && payload.results && payload.results.A && payload.results.A.error;
  if (queryError) throw new Error(`Grafana rejected ${options.title || panelKey}: ${String(queryError).slice(0, 240)}`);
  return frameRows(payload).map((row) => normalizeFinanceRow(panelKey, row, window));
}

async function queryFinanceTableBundle(env, panelKey, window, options = {}) {
  const definitions = FINANCE_GRAFANA_TABLES[panelKey];
  const base = FINANCE_PANEL_MAP[panelKey];
  if (!Array.isArray(definitions) || !base) throw Object.assign(new Error('Unknown Grafana finance table bundle.'), { status: 404 });
  const selectedDefinitions = options.primaryOnly
    ? definitions.filter((definition) => definition.primary)
    : options.secondaryOnly
      ? definitions.filter((definition) => !definition.primary)
      : definitions;
  // Grafana accepts multiple targets in one /api/ds/query request. Batching
  // companion panels removes the six-to-eight-request fan-out while keeping
  // each table's native SQL, refId, error state, and result rows independent.
  const tables = await executeFinancePanelBatch(env, panelKey, base, selectedDefinitions, window, options);
  const primary = tables.find((table) => table.primary);
  if (!options.secondaryOnly && (!primary || primary.error)) {
    const error = new Error(primary && primary.error || 'The primary Grafana Details table could not be loaded.');
    error.status = 502;
    throw error;
  }
  const errors = tables.filter((table) => table.error).map((table) => `${table.title}: ${table.error}`);
  const sourceTables = options.primaryOnly ? null : tables.map((table) => table.primary ? { ...table, rows: [] } : table);
  return { rows: primary ? primary.rows : [], tables: sourceTables, summaryError: errors.length ? `Some Grafana tables are temporarily unavailable. ${errors.join(' ')}` : '' };
}

async function queryFinancePanel(env, panelKey, window) {
  if (panelKey === 'pending-payment-combined') {
    const [dealer, motec] = await Promise.all([
      queryFinancePanel(env, 'pending-payment-dealer-source', window),
      queryFinancePanel(env, 'pending-payment-motec-source', window)
    ]);
    return [
      ...dealer.map((row) => ({ ...row, payment_group: 'Dealer' })),
      ...motec.map((row) => ({ ...row, payment_group: 'Motec/FL' }))
    ];
  }
  const config = FINANCE_PANEL_MAP[panelKey];
  if (!config) throw Object.assign(new Error('Unknown finance panel.'), { status: 404 });
  return executeFinancePanel(env, panelKey, config, window, { primary: Boolean(FINANCE_GRAFANA_TABLES[panelKey]) });
}

function buildCommissionMetricQuery(countPanel, countTarget, totalPanel, totalTarget, window, dashboard, refId = 'B', options = {}) {
  const datasource = countTarget.datasource || countPanel.datasource || { type: 'grafana-bigquery-datasource', uid: '1oBzAPaNk' };
  const prepare = (target) => applyGrafanaCurrentVariables(String(target.rawSql || target.rawSQL || '').trim(), dashboard, options.variableOverrides)
    .replace(/\$\{__from\}/g, String(window.fromMs))
    .replace(/\$\{__to\}/g, String(window.toMs))
    .replace(/\s*;?\s*$/, '');
  const countSql = prepare(countTarget);
  const totalSql = prepare(totalTarget);
  if (!countSql || !totalSql) throw new Error('The saved Grafana KPI query definitions are incomplete.');
  // Match Grafana's two stat reducers exactly: Count only non-null order IDs
  // from panel 4 and Sum only the commission field from panel 6.  Do not
  // derive either card from the transformed/deduplicated audit-table query.
  const rawSql = `WITH count_scope AS (\n${countSql}\n), total_scope AS (\n${totalSql}\n)\nSELECT\n  (SELECT COUNT(order_id) FROM count_scope) AS order_count,\n  (SELECT COALESCE(SUM(commission), 0) FROM total_scope) AS total_commission`;
  const query = {
    ...countTarget,
    refId,
    datasource,
    rawQuery: true,
    rawSql,
    intervalMs: 86400000,
    maxDataPoints: 20000,
    format: countTarget.format == null ? 1 : countTarget.format
  };
  delete query.hide;
  return query;
}

async function queryCommissionPrimaryBundle(env, window, options = {}) {
  // Commission parity requests intentionally bypass the dashboard-definition
  // cache. A saved Grafana query/variable change must be reflected in Finance
  // on the next request, not after the former 10-minute cache expires.
  const detail = await financePanelTarget(env, FINANCE_PANEL_MAP['commission-main'], { forceFresh: true });
  // Do not approximate Grafana's "$__all" as IS NOT NULL. The dashboard
  // expands it to the actual values from its variable query, which is the
  // only scope that can make this application reconcile 1:1 with Grafana.
  const resolvedVariableOverrides = await resolveCommissionVariableOverrides(env, detail.dashboard, options.variableOverrides);
  let countMetric = null;
  let totalMetric = null;
  let metricDefinitionError = '';
  try {
    [countMetric, totalMetric] = await Promise.all([
      financePanelTarget(env, FINANCE_PANEL_MAP['commission-order-source'], { forceFresh: true }),
      financePanelTarget(env, FINANCE_PANEL_MAP['commission-total-source'], { forceFresh: true })
    ]);
  }
  catch (reason) { metricDefinitionError = reason && reason.message || 'Commission KPI query definition was not found.'; }
  const detailDatasource = detail.target.datasource || detail.panel.datasource || { type: 'grafana-bigquery-datasource', uid: '1oBzAPaNk' };
  const detailQuery = buildFinanceQuery(detail.target, detailDatasource, 'commission-main', window, detail.dashboard, { primary: true, maxDataPoints: 10000, variableOverrides: resolvedVariableOverrides });
  detailQuery.refId = 'A';
  const endpoint = `${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`;
  const headers = { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'content-type': 'application/json' };
  const runQuery = (query) => fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ from: String(window.fromMs), to: String(window.toMs), queries: [query] })
  });
  // Grafana renders these two KPI panels as two independent datasource
  // queries.  Keep that execution model here.  Combining the SQL in a CTE
  // changed BigQuery's reducer/input semantics in edge cases and produced a
  // Finance total that could not reconcile with Grafana.
  const metricQuery = (metric) => {
    if (!metric) return null;
    const datasource = metric.target.datasource || metric.panel.datasource || { type: 'grafana-bigquery-datasource', uid: '1oBzAPaNk' };
    const query = buildFinanceQuery(metric.target, datasource, 'commission-main', window, metric.dashboard, {
      maxDataPoints: 20000,
      variableOverrides: resolvedVariableOverrides
    });
    query.refId = 'A';
    return query;
  };
  const countQuery = metricQuery(countMetric);
  const totalQuery = metricQuery(totalMetric);
  const [detailResponse, countResponse, totalResponse] = await Promise.all([
    runQuery(detailQuery),
    countQuery ? runQuery(countQuery).catch(() => null) : Promise.resolve(null),
    totalQuery ? runQuery(totalQuery).catch(() => null) : Promise.resolve(null)
  ]);
  if (!detailResponse.ok) throw Object.assign(new Error(`Grafana could not return Commission Rider data (HTTP ${detailResponse.status}).`), { status: detailResponse.status });
  const payload = await detailResponse.json();
  const countPayload = countResponse && countResponse.ok ? await countResponse.json() : null;
  const totalPayload = totalResponse && totalResponse.ok ? await totalResponse.json() : null;
  const detailResult = payload && payload.results && payload.results.A;
  const countResult = countPayload && countPayload.results && countPayload.results.A;
  const totalResult = totalPayload && totalPayload.results && totalPayload.results.A;
  if (!detailResult || detailResult.error) throw new Error(`Grafana rejected Commission Rider detail: ${String(detailResult && detailResult.error || 'no result').slice(0, 240)}`);
  const rows = frameRows({ results: { A: detailResult } }).map((row) => normalizeFinanceRow('commission-main', row, window));
  const metricTransportError = !countResponse || !totalResponse
    ? 'Network request failed'
    : !countResponse.ok ? `Count HTTP ${countResponse.status}`
      : !totalResponse.ok ? `Total HTTP ${totalResponse.status}`
        : '';
  const metricResultError = countResult && countResult.error || totalResult && totalResult.error;
  const metricError = metricDefinitionError || metricTransportError || !countResult || !totalResult || metricResultError
    ? `Exact Grafana KPI source is temporarily unavailable: ${String(metricDefinitionError || metricTransportError || metricResultError || 'no result').slice(0, 180)}.`
    : '';
  const countRows = metricError ? [] : frameRows({ results: { A: countResult } });
  const totalRows = metricError ? [] : frameRows({ results: { A: totalResult } });
  const orderCount = countRows.reduce((sum, row) => row && row.order_id != null && row.order_id !== '' ? sum + 1 : sum, 0);
  const totalCommission = totalRows.reduce((sum, row) => sum + (Number(row && row.commission) || 0), 0);
  const metricRows = metricError ? null : [{ order_count: orderCount, total_commission: totalCommission }];
  return { rows, metricRows, summaryError: metricError };
}

async function queryCommissionFilterOptions(env, dashboardOverride = null) {
  const cacheKey = `${String(env.GRAFANA_URL || '').replace(/\/$/, '')}:commission-options:v4`;
  const cached = financeCommissionVariableOptionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = financeCommissionVariableOptionsRequests.get(cacheKey);
  if (pending) return pending;
  const request = (async () => {
  const dashboard = dashboardOverride || (await financePanelTarget(env, FINANCE_PANEL_MAP['commission-main'])).dashboard;
  const names = ['branch_name', 'arrival_status', 'order_status', 'level', 'battery_size', 'sales_source', 'rider_category'];
  const variables = dashboard && dashboard.templating && Array.isArray(dashboard.templating.list) ? dashboard.templating.list : [];
  const queries = [];
  const refs = [];
  names.forEach((name, index) => {
    const variable = variables.find((item) => normalizedGrafanaKey(item && item.name) === normalizedGrafanaKey(name));
    const target = variable && variable.query && typeof variable.query === 'object' ? variable.query : null;
    const rawSql = target && (target.rawSql || target.rawSQL);
    if (!rawSql) return;
    const refId = String.fromCharCode(65 + index);
    const datasource = target.datasource || variable.datasource || { type: 'grafana-bigquery-datasource', uid: '1oBzAPaNk' };
    // Grafana stores a visual-editor `sql.limit` (50) beside each variable's
    // raw SQL.  Passing that metadata through can cap the BigQuery result even
    // with rawQuery enabled, which turns a Grafana "All" selection into the
    // first 50 values only.  Strip it: the raw SQL is the canonical variable
    // query and must return its complete option set for 1:1 KPI scope.
    const { sql: _visualSql, ...rawTarget } = target;
    queries.push({ ...rawTarget, refId, datasource, rawQuery: true, rawSql, intervalMs: 86400000, maxDataPoints: FINANCE_FILTER_VALUE_LIMIT, format: target.format == null ? 1 : target.format });
    refs.push({ name, refId, sort: Number(variable.sort || 0) });
  });
  if (!queries.length) return {};
  const now = Date.now();
  // BigQuery can drop result frames after the first query in one Grafana
  // request. Run the small variable queries concurrently instead, otherwise
  // an All selection may silently fall back to a different SQL scope.
  const payloads = await Promise.all(queries.map(async (query) => {
    const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: String(now - 7 * 86400000), to: String(now), queries: [{ ...query, refId: 'A' }] })
    });
    if (!response.ok) throw Object.assign(new Error(`Grafana could not return Commission filter values (HTTP ${response.status}).`), { status: response.status });
    return response.json();
  }));
  const result = Object.fromEntries(refs.map(({ name, sort }, index) => {
    const payload = payloads[index];
    const single = { results: { A: payload && payload.results && payload.results.A } };
    let values = [...new Set(frameRows(single)
      .flatMap((row) => Object.values(row || {}))
      .map((value) => String(value == null ? '' : value))
      .filter((value) => value.trim().length > 0))];
    if (sort === 1) values.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return [name, values];
  }));
  financeCommissionVariableOptionsCache.set(cacheKey, { value: result, expiresAt: Date.now() + 30 * 1000 });
  return result;
  })();
  financeCommissionVariableOptionsRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (financeCommissionVariableOptionsRequests.get(cacheKey) === request) financeCommissionVariableOptionsRequests.delete(cacheKey);
  }
}

async function resolveCommissionVariableOverrides(env, dashboard, overrides = {}) {
  const variables = grafanaCurrentVariables(dashboard);
  // Grafana expands an All selection from the variable query's actual option
  // values. Do the same instead of approximating All as `field IS NOT NULL`.
  const available = await queryCommissionFilterOptions(env, dashboard).catch(() => ({}));
  return Object.fromEntries(variables.map(({ name, values: savedValues }) => {
    const overrideKey = Object.keys(overrides || {}).find((key) => normalizedGrafanaKey(key) === normalizedGrafanaKey(name));
    const selected = normalizeFinanceFilterValues(overrideKey == null ? savedValues : overrides[overrideKey]);
    const expanded = Array.isArray(available[name]) ? available[name] : [];
    return [name, selected.includes('$__all') && expanded.length ? expanded : selected];
  }));
}

function resolveGrafanaTimeExpression(value, nowMs = Date.now()) {
  const expression = String(value || '').trim();
  if (!expression) return NaN;
  if (expression === 'now') return nowMs;
  const match = /^now\/(M|d|h)$/.exec(expression);
  if (match) {
    const now = new Date(nowMs);
    if (match[1] === 'M') return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    if (match[1] === 'd') return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours());
  }
  return Date.parse(expression);
}

async function financeGrafanaWindow(env, panelKey) {
  const { dashboard } = await financePanelTarget(env, FINANCE_PANEL_MAP[panelKey]);
  const nowMs = Date.now();
  const fromMs = resolveGrafanaTimeExpression(dashboard && dashboard.time && dashboard.time.from, nowMs);
  const toMs = resolveGrafanaTimeExpression(dashboard && dashboard.time && dashboard.time.to, nowMs);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return null;
  const text = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  return { from: text(fromMs), to: text(toMs), fromMs, toMs };
}

function financeSnapshotFreshSeconds(url) {
  const part = String(url.searchParams.get('part') || 'all').toLowerCase();
  if (part === 'options') return 15 * 60;
  if (part === 'tables') return 5 * 60;
  return 150;
}

function financeScopeHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function financeSnapshotKey(url) {
  const params = new URLSearchParams();
  ['panel', 'part', 'scope', 'from', 'to', 'format', 'revision'].forEach((name) => {
    const value = String(url.searchParams.get(name) || (name === 'part' ? 'all' : ''));
    if (value) params.set(name, value);
  });
  const rawFilters = String(url.searchParams.get('filters') || '');
  if (rawFilters) params.set('filtersHash', financeScopeHash(rawFilters));
  return `${FINANCE_SNAPSHOT_PREFIX}${params.toString()}`;
}

function financeSnapshotResponse(snapshot, ageSeconds, state = 'HIT') {
  return new Response(String(snapshot.body || ''), {
    status: Number(snapshot.status || 200),
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-finance-snapshot': state,
      'x-finance-snapshot-age': String(Math.max(0, Math.floor(ageSeconds)))
    }
  });
}

async function storeFinanceSnapshot(env, key, response) {
  if (!env.DASHBOARD_DATA || !response || !response.ok) return;
  const body = await response.clone().text();
  await env.DASHBOARD_DATA.put(key, body, {
    metadata: { status: response.status, storedAt: Date.now() }
  });
}

// Large Finance detail tables are expensive to send as JSON objects because
// every row repeats the same 20+ field names.  The dashboard can request this
// lossless columnar representation instead: repeated text values are
// dictionary-encoded and every source value remains available for filtering,
// exporting, and parity with Grafana.
function packFinanceRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const columnKeys = [];
  const seen = new Set();
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => {
    if (seen.has(key)) return;
    seen.add(key);
    columnKeys.push(key);
  }));
  const dictionaryLimit = Math.min(4096, Math.max(32, Math.floor(rows.length * 0.4)));
  const columns = columnKeys.map((key) => {
    const dictionary = [];
    const dictionaryIndex = new Map();
    let dictionaryEligible = true;
    for (const row of rows) {
      const value = row && row[key];
      if (value == null) continue;
      if (typeof value !== 'string') { dictionaryEligible = false; break; }
      if (!dictionaryIndex.has(value)) {
        dictionaryIndex.set(value, dictionary.length);
        dictionary.push(value);
        if (dictionary.length > dictionaryLimit) { dictionaryEligible = false; break; }
      }
    }
    if (!dictionaryEligible) {
      return { key, values: rows.map((row) => row && row[key] != null ? row[key] : null) };
    }
    return {
      key,
      dictionary,
      values: rows.map((row) => {
        const value = row && row[key];
        return value == null ? -1 : dictionaryIndex.get(value);
      })
    };
  });
  return { version: 1, rowCount: rows.length, columns };
}

function parseFinanceFilterOverrides(url, panelKey) {
  const allowed = FINANCE_FILTER_VARIABLES[panelKey] || [];
  const raw = String(url.searchParams.get('filters') || '').trim();
  if (!raw || !allowed.length) return null;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (error) { throw Object.assign(new Error('Invalid Finance filter scope.'), { status: 400 }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Invalid Finance filter scope.'), { status: 400 });
  }
  const output = {};
  allowed.forEach((name) => {
    const key = Object.keys(parsed).find((candidate) => normalizedGrafanaKey(candidate) === normalizedGrafanaKey(name));
    output[name] = normalizeFinanceFilterValues(key == null ? ['$__all'] : parsed[key]);
  });
  return output;
}

function financeScopeFingerprint(panelKey, window, overrides) {
  const filters = Object.fromEntries(Object.entries(overrides || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, normalizeFinanceFilterValues(value)]));
  return JSON.stringify({
    panel: panelKey,
    from: window && window.from || '',
    to: window && window.to || '',
    filters
  });
}

async function financeLiveResponse(request, env) {
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);
  const url = new URL(request.url);
  const panelKey = String(url.searchParams.get('panel') || '');
  const requestedPart = String(url.searchParams.get('part') || 'all').toLowerCase();
  try {
    const scopeEligible = panelKey === 'commission-main' || Boolean(FINANCE_GRAFANA_TABLES[panelKey]);
    const variableOverrides = parseFinanceFilterOverrides(url, panelKey);
    const hasExplicitWindow = url.searchParams.has('from') || url.searchParams.has('to');
    const useSavedGrafanaVariables = scopeEligible
      && url.searchParams.get('scope') === 'grafana'
      && !variableOverrides;
    const usesGrafanaUtc = scopeEligible;
    // The canonical first request mirrors Grafana's saved time range and
    // variables. Once the user changes a filter/date, the browser sends the
    // complete selection explicitly so the proxy cannot fall back to stale
    // saved variables or an old cached response.
    const window = !hasExplicitWindow && useSavedGrafanaVariables
      ? await financeGrafanaWindow(env, panelKey)
      : financeDateWindow(url, usesGrafanaUtc ? 0 : 8);
    if (!window) return json({ error: 'Use a valid date range with From before or equal to To.' }, 400);
    // Keep the response's filterState as Grafana's saved dashboard selection,
    // even when this request carries a table-local/browser override. The
    // request scope is already represented by variableOverrides below; mixing
    // it into filterState makes the UI lose Grafana's canonical option set.
    const filterStatePromise = FINANCE_FILTER_VARIABLES[panelKey]
      ? financeCurrentFilterState(env, panelKey).catch(() => null)
      : Promise.resolve(null);
    let rows;
    let summary = null;
    let summaryError = '';
    let metricRows = null;
    let filterOptions = null;
    let sourceTables = null;
    if (panelKey === 'commission-main') {
      const [primaryResult, optionsResult] = await Promise.allSettled([
        requestedPart === 'options' ? Promise.resolve({ rows: [], metricRows: null, summaryError: '' }) : queryCommissionPrimaryBundle(env, window, { variableOverrides }),
        requestedPart === 'primary' ? Promise.resolve({}) : queryCommissionFilterOptions(env)
      ]);
      if (primaryResult.status === 'rejected') throw primaryResult.reason;
      rows = primaryResult.value.rows;
      metricRows = primaryResult.value.metricRows;
      summaryError = primaryResult.value.summaryError || '';
      if (optionsResult.status === 'fulfilled') filterOptions = optionsResult.value;
      else summaryError = `${summaryError ? `${summaryError} ` : ''}Live Grafana filter values are temporarily unavailable.`;
    } else if (FINANCE_GRAFANA_TABLES[panelKey]) {
      const bundle = await queryFinanceTableBundle(env, panelKey, window, {
        primaryOnly: requestedPart === 'primary',
        secondaryOnly: requestedPart === 'tables',
        variableOverrides
      });
      rows = bundle.rows;
      sourceTables = bundle.tables;
      summaryError = bundle.summaryError;
    } else if (panelKey === 'pending-payment-combined') {
      const [detailResult, summaryResult] = await Promise.allSettled([
        queryFinancePanel(env, panelKey, window),
        queryPendingPaymentSummary(env, window)
      ]);
      if (detailResult.status === 'rejected') throw detailResult.reason;
      rows = detailResult.value;
      if (summaryResult.status === 'fulfilled') summary = summaryResult.value;
      else summaryError = 'Exact Grafana summary is temporarily unavailable; loaded detail remains visible.';
    } else {
      rows = await queryFinancePanel(env, panelKey, window);
    }
    const filterState = await filterStatePromise;
    const dealerRows = panelKey === 'pending-payment-combined'
      ? rows.filter((row) => row.payment_group === 'Dealer').length
      : panelKey === 'pending-payment-dealer-source' ? rows.length : 0;
    const truncated = dealerRows >= PENDING_PAYMENT_DEALER_LIMIT;
    const packedRows = url.searchParams.get('format') === 'packed' && rows.length >= 5000
      ? packFinanceRows(rows)
      : null;
    const effectiveScopeValues = variableOverrides || Object.fromEntries(Object.entries(filterState || {})
      .map(([key, value]) => [key, normalizeFinanceFilterValues(value).length ? normalizeFinanceFilterValues(value) : ['$__all']]));
    const scopeName = variableOverrides ? 'grafana-selection' : useSavedGrafanaVariables ? 'grafana-current' : 'custom';
    const scopeSignature = financeScopeHash(financeScopeFingerprint(panelKey, window, effectiveScopeValues));
    return json({
      ok: true,
      panel: panelKey,
      part: requestedPart,
      rows: packedRows ? [] : rows,
      packedRows,
      rowCount: rows.length,
      from: window.from,
      to: window.to,
      source: 'Grafana Finance',
      scope: scopeName,
      scopeSignature,
      requestedFrom: url.searchParams.get('from') || null,
      requestedTo: url.searchParams.get('to') || null,
      truncated,
      limit: truncated ? PENDING_PAYMENT_DEALER_LIMIT : null,
      truncationScope: truncated ? 'Dealer oldest outstanding records' : null,
      summary,
      summaryError,
      metricRows,
      metricRowsScope: panelKey === 'commission-main' && Array.isArray(metricRows) && metricRows.length ? scopeSignature : '',
      filterOptions,
      filterState,
      sourceTables
    }, 200, { 'cache-control': 'private, no-store' });
  } catch (error) {
    return json({ error: error && error.message || 'Finance data could not be loaded.' }, Number(error && error.status) || 502);
  }
}

async function internalFinanceApi(request, env, ctx) {
  const supplied = String(request.headers.get('x-finance-proxy-secret') || '');
  const expected = String(env.FINANCE_PROXY_SHARED_SECRET || '');
  if (!expected || !constantTimeEqual(supplied, expected)) return json({ error: 'Finance proxy authorization failed.' }, 403);
  const url = new URL(request.url);
  // Commission KPIs are reconciliation figures. Never return a KV snapshot
  // while Grafana may already be showing a newer datasource result.
  const bypassSnapshot = url.searchParams.get('refresh') === '1'
    || url.searchParams.get('panel') === 'commission-main';
  const snapshotKey = financeSnapshotKey(url);
  let snapshot = null;
  if (env.DASHBOARD_DATA && !bypassSnapshot) {
    try {
      const stored = await env.DASHBOARD_DATA.getWithMetadata(snapshotKey, { type: 'text' });
      if (stored && stored.value) {
        snapshot = {
          body: stored.value,
          status: Number(stored.metadata && stored.metadata.status || 200),
          storedAt: Number(stored.metadata && stored.metadata.storedAt || 0)
        };
        // One-cycle compatibility with snapshots written by the previous
        // JSON-envelope build; the scheduled refresh rewrites them as raw
        // response bodies with KV metadata to avoid an 8 MB double parse.
        if (!snapshot.storedAt && String(stored.value).startsWith('{"status":')) {
          try { snapshot = JSON.parse(stored.value); } catch { snapshot = null; }
        }
      }
    } catch { snapshot = null; }
  }
  const ageSeconds = snapshot && Number(snapshot.storedAt)
    ? Math.max(0, (Date.now() - Number(snapshot.storedAt)) / 1000)
    : Number.POSITIVE_INFINITY;
  const freshSeconds = financeSnapshotFreshSeconds(url);
  if (snapshot && ageSeconds <= freshSeconds) return financeSnapshotResponse(snapshot, ageSeconds, 'HIT');
  if (snapshot && ageSeconds <= FINANCE_SNAPSHOT_MAX_STALE_SECONDS) {
    if (ctx && typeof ctx.waitUntil === 'function') {
      const refreshRequest = new Request(request.url, { headers: request.headers });
      ctx.waitUntil(financeLiveResponse(refreshRequest, env)
        .then(async (response) => { await storeFinanceSnapshot(env, snapshotKey, response); })
        .catch(() => {}));
    }
    return financeSnapshotResponse(snapshot, ageSeconds, 'STALE');
  }
  const live = await financeLiveResponse(request, env);
  if (live.ok && env.DASHBOARD_DATA) {
    const write = storeFinanceSnapshot(env, snapshotKey, live).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write);
    else await write;
  } else if (snapshot) {
    return financeSnapshotResponse(snapshot, ageSeconds, 'STALE-IF-ERROR');
  }
  return live;
}

async function prewarmFinanceSnapshots(env, ctx) {
  if (financePrewarmPromise) return financePrewarmPromise;
  financePrewarmPromise = (async () => {
    const origin = 'https://finance-prewarm.internal';
    const headers = { 'x-finance-proxy-secret': String(env.FINANCE_PROXY_SHARED_SECRET || '') };
    const refresh = async ([panel, part]) => {
      const params = new URLSearchParams({ panel, scope: 'grafana', refresh: '1' });
      params.set('format', 'packed');
      if (part !== 'all') params.set('part', part);
      const response = await internalFinanceApi(new Request(`${origin}/api/internal/finance-data?${params}`, { headers }), env, ctx);
      if (!response.ok) throw new Error(`Finance prewarm failed for ${panel}:${part} (${response.status}).`);
      return response.status;
    };
    const primary = FINANCE_PREWARM_REQUESTS.filter(([, part]) => part !== 'tables' && part !== 'options');
    const supplemental = FINANCE_PREWARM_REQUESTS.filter(([, part]) => part === 'tables' || part === 'options');
    await Promise.allSettled(primary.map(refresh));
    await Promise.allSettled(supplemental.map(refresh));
  })().finally(() => { financePrewarmPromise = null; });
  return financePrewarmPromise;
}

function normalizedGrafanaKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function grafanaRowValue(row, aliases) {
  const wanted = new Set(aliases.map(normalizedGrafanaKey));
  const keys = Object.keys(row || {});
  const key = keys.find((candidate) => wanted.has(normalizedGrafanaKey(candidate))) || keys.find((candidate) => {
    const normalized = normalizedGrafanaKey(candidate);
    return [...wanted].some((alias) => alias && (normalized.startsWith(alias) || normalized.endsWith(alias)));
  });
  return key == null ? undefined : row[key];
}

// Use exact field matching when a metadata field could otherwise be mistaken
// for a reporting field (for example `branch_created_date` ends with
// `created_date`).
function grafanaRowExactValue(row, aliases) {
  const wanted = new Set(aliases.map(normalizedGrafanaKey));
  const key = Object.keys(row || {}).find((candidate) => wanted.has(normalizedGrafanaKey(candidate)));
  return key == null ? undefined : row[key];
}

function grafanaMetricNumber(value) {
  if (value && typeof value === 'object') {
    // Some Grafana data frames wrap a cell as {value, formattedValue}.
    // Prefer the raw numeric value and only then inspect the display value.
    if (Object.prototype.hasOwnProperty.call(value, 'value')) return grafanaMetricNumber(value.value);
    if (Object.prototype.hasOwnProperty.call(value, 'formattedValue')) return grafanaMetricNumber(value.formattedValue);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!text || /^n\/?a$/i.test(text) || /^null$/i.test(text)) return null;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/,/g, '').replace(/[^0-9.+-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '+' || cleaned === '.') return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return negative ? -Math.abs(number) : number;
}

function normalizedGrafanaDate(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 100000000000 ? value : value * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1];
  const display = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (display) return `${display[3]}-${display[2].padStart(2, '0')}-${display[1].padStart(2, '0')}`;
  return fallback;
}

function grafanaVariableSqlValues(dashboard, variableName) {
  const variable = dashboard && dashboard.templating && Array.isArray(dashboard.templating.list)
    ? dashboard.templating.list.find((item) => normalizedGrafanaKey(item && item.name) === normalizedGrafanaKey(variableName))
    : null;
  const values = variable && Array.isArray(variable.options)
    ? variable.options.map((option) => option && option.value).flat().filter((value) => value != null && !/^\$__all$/i.test(String(value)) && !/^all$/i.test(String(value)))
    : [];
  const unique = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  return unique.length ? unique.map(sqlString).join(', ') : PITSTOP_ALL_BRANCH_AREAS_SQL;
}

async function liveGrafanaVariableSqlValues(env, dashboard, variableName) {
  const fallback = grafanaVariableSqlValues(dashboard, variableName);
  const variable = dashboard && dashboard.templating && Array.isArray(dashboard.templating.list)
    ? dashboard.templating.list.find((item) => normalizedGrafanaKey(item && item.name) === normalizedGrafanaKey(variableName))
    : null;
  const target = variable && variable.query && typeof variable.query === 'object' ? variable.query : null;
  const rawSql = target && (target.rawSql || target.rawSQL);
  if (!rawSql) return fallback;

  const datasource = target.datasource || variable.datasource || { type: 'grafana-bigquery-datasource', uid: env.GRAFANA_DATASOURCE_UID };
  const now = Date.now();
  try {
    const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: String(now - 7 * 86400000),
        to: String(now),
        queries: [{
          ...target,
          refId: 'A',
          datasource,
          rawQuery: true,
          rawSql,
          intervalMs: 86400000,
          maxDataPoints: 1000
        }]
      })
    });
    if (!response.ok) return fallback;
    const rows = frameRows(await response.json());
    const values = [...new Set(rows.flatMap((row) => Object.values(row || {}))
      .map((value) => String(value == null ? '' : value).trim())
      .filter(Boolean))];
    console.log(JSON.stringify({ event: 'grafana-variable', variable: variableName, values: values.length }));
    return values.length ? values.map(sqlString).join(', ') : fallback;
  } catch (_) {
    return fallback;
  }
}

function preparePitstopPanelSql(rawSql, from, to, branchAreaSql = PITSTOP_ALL_BRANCH_AREAS_SQL) {
  const fromMs = parseIsoDate(from).getTime();
  const toMs = parseIsoDate(to).getTime() + 86400000;
  const fromDateSql = sqlString(from);
  const toDateSql = sqlString(to);
  let sql = String(rawSql || '')
    // Grafana supports both millisecond macros and date-formatted macros.
    // Resolve both forms so copied panel SQL behaves the same through the
    // worker as it does in the Grafana UI.
    .replace(/\$\{__from:date(?::[^}]+)?\}/gi, fromDateSql)
    .replace(/\$\{__to:date(?::[^}]+)?\}/gi, toDateSql)
    .replace(/\$\{__from\}/gi, String(fromMs))
    .replace(/\$\{__to\}/gi, String(toMs))
    .replace(/\$__from\b/gi, String(fromMs))
    .replace(/\$__to\b/gi, String(toMs));
  // These source panels expose a region selector. The report always requests
  // the complete network, so preserve the panel SQL and resolve that selector
  // to Grafana's All value instead of deleting the surrounding SQL clause.
  sql = sql
    .replace(/'\$\{branch_area(?::(?:sqlstring|singlequote))?\}'/gi, "'All'")
    .replace(/\$\{branch_area(?::(?:sqlstring|singlequote))?\}/gi, branchAreaSql)
    .replace(/'\$branch_area(?::(?:sqlstring|singlequote))?'/gi, "'All'")
    .replace(/\$branch_area(?::(?:sqlstring|singlequote))?/gi, branchAreaSql);
  // Resolve Grafana time macros used by the saved HTML panels. Without this,
  // the standalone worker sends `$__timeFilter(...)` to BigQuery verbatim and
  // the panel returns an empty frame, which used to render every sale as 0.
  sql = sql
    .replace(/\$\{__timeFilter\(([^)]+)\)\}/gi, (_match, expression) => `DATE(${expression}) BETWEEN DATE(${fromDateSql}) AND DATE(${toDateSql})`)
    .replace(/\$__timeFilter\(([^)]+)\)/gi, (_match, expression) => `DATE(${expression}) BETWEEN DATE(${fromDateSql}) AND DATE(${toDateSql})`)
    .replace(/\$\{__timeFrom\(\)\}/gi, `TIMESTAMP(${sqlString(`${from} 00:00:00`)})`)
    .replace(/\$\{__timeTo\(\)\}/gi, `TIMESTAMP(${sqlString(`${to} 23:59:59.999`)})`)
    .replace(/\$__timeFrom\(\)/gi, `TIMESTAMP(${sqlString(`${from} 00:00:00`)})`)
    .replace(/\$__timeTo\(\)/gi, `TIMESTAMP(${sqlString(`${to} 23:59:59.999`)})`)
    .replace(/\$\{__interval_ms\}/gi, '86400000')
    .replace(/\$__interval_ms\b/gi, '86400000')
    .replace(/\$\{__interval\}/gi, "INTERVAL 1 DAY")
    .replace(/\$__interval\b/gi, "INTERVAL 1 DAY");
  if (/\$(?:\{|__|[A-Za-z_])/.test(sql.replace(/--[^\n]*/g, ''))) throw new Error('Unresolved Grafana variable in HQ/BP panel SQL.');
  return sql;
}

async function grafanaJson(env, pathname) {
  const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}${pathname}`, {
    headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}` }
  });
  if (!response.ok) throw Object.assign(new Error(`Grafana metadata request failed (HTTP ${response.status}).`), { status: response.status });
  return response.json();
}

function selectPitstopPanelTarget(panel, salesField = 'Total_Sales') {
  const targets = panel && Array.isArray(panel.targets)
    ? panel.targets.filter((item) => item && item.hide !== true && (item.rawSql || item.rawSQL))
    : [];
  // Some saved Grafana panels use the singular alias `Total_Sale` even though
  // the business field is documented as `Total_Sales`. Treat those spellings
  // as the same authoritative metric when selecting a multi-query panel.
  const fieldKeys = [salesField, 'Total_Sales', 'Total_Sale'].map(normalizedGrafanaKey);
  return targets.find((item) => {
    const sqlKey = normalizedGrafanaKey(item.rawSql || item.rawSQL);
    return fieldKeys.some((fieldKey) => sqlKey.includes(fieldKey));
  }) || targets[0] || null;
}

function savedPitstopBranchAreaSql(dashboard) {
  const variable = dashboard?.templating?.list?.find(item => item.name === 'branch_area');
  const sql = variable?.query?.rawSql || variable?.query?.rawSQL;
  if (!sql || !/^\s*SELECT\b/i.test(sql) || /\$/.test(sql)) throw new Error('Grafana branch_area All query could not be resolved safely.');
  return sql.trim().replace(/;$/, '');
}

async function resolvePitstopPanel(env, definition) {
  const pinnedUid = definition.channel === 'HQ' ? '6YM7jesvz' : '-tqZjesvk';
  const search = await grafanaJson(env, `/api/search?type=dash-db&limit=1000&query=${encodeURIComponent(definition.dashboardTitle)}`);
  const titleKey = normalizedGrafanaKey(definition.dashboardTitle);
  const matches = (Array.isArray(search) ? search : []).filter((item) => normalizedGrafanaKey(item && item.title) === titleKey);
  const dashboard = matches.find((item) => item.uid === pinnedUid);
  if (!dashboard || !dashboard.uid) throw Object.assign(new Error(`Grafana dashboard “${definition.dashboardTitle}” was not found.`), { status: 404 });
  const payload = await grafanaJson(env, `/api/dashboards/uid/${encodeURIComponent(dashboard.uid)}`);
  const panelTitleKey = normalizedGrafanaKey(definition.panelTitle);
  const panel = nestedPanels(payload && payload.dashboard && payload.dashboard.panels).find((item) => normalizedGrafanaKey(item && item.title) === panelTitleKey);
  const target = selectPitstopPanelTarget(panel, definition.salesField);
  if (!panel) throw Object.assign(new Error(`Grafana panel “${definition.panelTitle}” was not found in “${definition.dashboardTitle}”.`), { status: 404 });
  if (!target) throw new Error(`Grafana panel “${definition.panelTitle}” has no readable table query.`);
  return {
    ...definition,
    dashboardUid: dashboard.uid,
    panelId: Number(panel.id),
    branchAreaSql: savedPitstopBranchAreaSql(payload.dashboard),
    datasource: target.datasource || panel.datasource || { type: 'grafana-bigquery-datasource', uid: env.GRAFANA_DATASOURCE_UID },
    target
  };
}

async function pitstopPanelSources(env) {
  const now = Date.now();
  if (pitstopPanelCache && pitstopPanelCache.expiresAt > now) return pitstopPanelCache.sources;
  const sources = await Promise.all(PITSTOP_GRAFANA_PANELS.map((definition) => resolvePitstopPanel(env, definition)));
  pitstopPanelCache = { sources, expiresAt: now + PITSTOP_PANEL_CACHE_SECONDS * 1000 };
  return sources;
}

function pitstopPanelQuery(source, from, to) {
  const datasource = typeof source.datasource === 'string'
    ? { uid: source.datasource }
    : source.datasource;
  const query = {
    ...source.target,
    refId: 'A',
    datasource,
    rawQuery: true,
    rawSql: preparePitstopPanelSql(source.target.rawSql || source.target.rawSQL, from, to, source.branchAreaSql),
    intervalMs: 86400000,
    maxDataPoints: 10000
  };
  if (query.format == null) query.format = datasource && datasource.type === 'postgres' ? 'table' : 1;
  if (!query.editorMode && datasource && datasource.type === 'grafana-bigquery-datasource') query.editorMode = 'code';
  delete query.hide;
  return query;
}

function normalizePitstopPanelRows(rows, source, from, to) {
  const normalized = [];
  rows.forEach((row) => {
    // These two performance panels are the authoritative Pitstop Explorer
    // source. Do not guess another metric if the schema changes: Name maps to
    // Pitstop Master and Total_Sales is the only accepted sales field.
    const pitstop = String(grafanaRowValue(row, [source.nameField || 'Name', 'Name', 'pitstop', 'branch', 'location']) || '').trim();
    const sales = grafanaMetricNumber(grafanaRowValue(row, [source.salesField || 'Total_Sales', 'Total_Sales', 'Total_Sale', 'total sales']));
    if (!pitstop || /^(grand\s+)?total$/i.test(pitstop) || sales === null) return;
    normalized.push({
      // The saved HQ/BP performance panels also expose `branch_created_date`.
      // That is the pitstop's setup/opening date (often 2021–2025), not the
      // reporting date for Total_Sales. Treating it as a report date caused
      // every live August row to be filtered out. Aggregate panel rows use the
      // requested `to` date unless the panel supplies an actual report date.
      date: normalizedGrafanaDate(grafanaRowExactValue(row, ['report_date', 'date', 'day', 'created_date']), to),
      pitstop,
      channel: source.channel,
      state: String(grafanaRowValue(row, ['state', 'branch_area', 'area']) || '').trim(),
      sales
    });
  });
  return normalized.filter((row) => row.date >= from && row.date <= to);
}

async function queryGrafanaPitstopPanel(env, source, from, to) {
  const fromMs = parseIsoDate(from).getTime();
  const toMs = parseIsoDate(to).getTime() + 86400000;
  const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ from: String(fromMs), to: String(toMs), queries: [pitstopPanelQuery(source, from, to)] })
  });
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') || '';
    throw Object.assign(new Error(`Grafana could not return ${source.panelTitle} (HTTP ${response.status}).`), { status: response.status, requestId });
  }
  const payload = await response.json();
  const queryError = payload && payload.results && payload.results.A && payload.results.A.error;
  if (queryError) throw new Error(`Grafana rejected ${source.panelTitle}: ${String(queryError).slice(0, 240)}`);
  const frames = payload?.results?.A?.frames;
  const salesFrames = (Array.isArray(frames) ? frames : []).filter(frame => {
    const fields = (frame.schema?.fields || []).map(field => normalizedGrafanaKey(field.name));
    return fields.includes('name') && (fields.includes('totalsales') || fields.includes('totalsale'));
  });
  if (!salesFrames.length || salesFrames.some(frame => {
    const fields = frame.schema.fields, values = frame.data?.values;
    return !Array.isArray(values) || values.length !== fields.length || values.some(column => !Array.isArray(column) || column.length !== values[0]?.length);
  })) throw new Error('Grafana ' + source.panelTitle + ' returned a missing or changed sales schema.');
  const rawRows = frameRows(payload);
  const invalid = rawRows.some(row => {
    const name = String(grafanaRowValue(row, ['Name']) || '');
    return name && !/^(grand\s+)?total$/i.test(name) && grafanaMetricNumber(grafanaRowValue(row, ['Total_Sales', 'Total_Sale'])) === null;
  });
  if (invalid) throw new Error('Grafana ' + source.panelTitle + ' returned a non-numeric sales value.');
  const rows = normalizePitstopPanelRows(rawRows, source, from, to);
  console.log(JSON.stringify({
    event: 'grafana-pitstop-panel',
    channel: source.channel,
    from,
    to,
    rows: rows.length,
    totalSales: rows.reduce((total, row) => total + Number(row.sales || 0), 0)
  }));
  return rows;
}

async function queryGrafanaPitstopRows(env, from, to) {
  const sources = await pitstopPanelSources(env);
  const batches = await Promise.all(sources.map((source) => queryGrafanaPitstopPanel(env, source, from, to)));
  const grouped = new Map();
  batches.flat().forEach((row) => {
    const key = `${row.date}\u0000${row.channel}\u0000${row.pitstop.toUpperCase()}`;
    const current = grouped.get(key);
    if (current) current.sales += row.sales;
    else grouped.set(key, { ...row });
  });
  return [...grouped.values()];
}

async function queryGrafanaPitstopRowsWithContext(env, from, to) {
  // Aggregated panel totals cannot be trimmed after widening the SQL window.
  return queryGrafanaPitstopRows(env, from, to);
}

// The HQ/BP performance panels expose one authoritative Total_Sales value per
// pitstop for the selected Grafana window. Keep the channel totals alongside
// the detail rows so the dashboard can use the same source for its B2C/B2B2C
// sales KPIs and Summary table (the Order - Daily query is a separate source).
function summarizePitstopChannelSales(rows) {
  return (rows || []).reduce((totals, row) => {
    const channel = String(row && row.channel || '').trim().toUpperCase();
    const sales = grafanaMetricNumber(row && row.sales);
    if (sales === null) return totals;
    if (channel === 'HQ') totals.hq += sales;
    if (channel === 'BP') totals.bp += sales;
    return totals;
  }, { hq: 0, bp: 0 });
}



// General / DSA - Orders / Orders - Detail is the operational ResQ source.
// One order can appear more than once in the detail result, therefore the
// report counts distinct order IDs after normalising each ResQ team into the
// four email-report buckets requested by the business.
function resqDailySql(from, to) {
  return `
WITH resq_orders AS (
  SELECT
    DATE(created_at) AS report_date,
    CASE
      WHEN REGEXP_CONTAINS(
        REGEXP_REPLACE(UPPER(TRIM(COALESCE(name, ''))), r'\\s+', ' '),
        r'^RESQ TEAM \\(?[1-5]\\)?$'
      ) THEN 'resQSelangor'
      WHEN REGEXP_REPLACE(UPPER(TRIM(COALESCE(name, ''))), r'\\s+', ' ') = 'RESQ JOHOR' THEN 'resQJb'
      WHEN REGEXP_REPLACE(UPPER(TRIM(COALESCE(name, ''))), r'\\s+', ' ') = 'RESQ TEAM PAHANG' THEN 'resQPahang'
      WHEN REGEXP_REPLACE(UPPER(TRIM(COALESCE(name, ''))), r'\\s+', ' ') = 'RESQ TEAM PENANG' THEN 'resQPenang'
      ELSE NULL
    END AS resq_bucket,
    id
  FROM \`clone-330106.View.orderdetail\`
  WHERE DATE(created_at) BETWEEN DATE(${sqlString(from)}) AND DATE(${sqlString(to)})
    AND status IN (
      'arrived', 'completed', 'dispatched', 'in_progress', 'pending',
      'pending_scrap_receive', 'pending_stock_pickup', 'ready_to_dispatch',
      'scrap_handover', 'waiting_confirmation', 'waiting_payment'
    )
    AND Order_category = 'BATTERY'
    AND (
      REGEXP_CONTAINS(REGEXP_REPLACE(UPPER(TRIM(COALESCE(name, ''))), r'\\s+', ' '), r'^RESQ TEAM \\(?[1-5]\\)?$')
      OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(name, ''))), r'\\s+', ' ') IN (
        'RESQ JOHOR', 'RESQ TEAM PAHANG', 'RESQ TEAM PENANG'
      )
    )
    AND UPPER(COALESCE(name, '')) NOT LIKE '%TEST%'
    AND COALESCE(promo_code_name, '') != 'WARRANTY(NEWBATTERY)'
)
SELECT
  CAST(report_date AS STRING) AS report_date,
  resq_bucket,
  COUNT(DISTINCT id) AS units
FROM resq_orders
WHERE resq_bucket IS NOT NULL
GROUP BY report_date, resq_bucket
ORDER BY report_date, resq_bucket`;
}

function resqRowsToDaily(rows, from, to) {
  const daily = new Map();
  let cursor = from;
  while (cursor && cursor <= to) {
    daily.set(cursor, { date: cursor, resQSelangor: 0, resQJb: 0, resQPahang: 0, resQPenang: 0, total: 0 });
    cursor = addDaysIso(cursor, 1);
  }
  (rows || []).forEach((row) => {
    const date = normalizedGrafanaDate(grafanaRowExactValue(row, ['report_date', 'date', 'created_at']), '');
    const bucketName = String(grafanaRowExactValue(row, ['resq_bucket', 'bucket']) || '').trim();
    const aliases = {
      resqselangor: 'resQSelangor',
      resqjb: 'resQJb',
      resqpahang: 'resQPahang',
      resqpenang: 'resQPenang'
    };
    const bucket = aliases[normalizedGrafanaKey(bucketName)];
    const target = daily.get(date);
    if (!target || !bucket) return;
    target[bucket] += Math.max(0, Number(grafanaRowExactValue(row, ['units', 'count', 'value'])) || 0);
  });
  return [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)).map((row) => ({
    ...row,
    total: row.resQSelangor + row.resQJb + row.resQPahang + row.resQPenang
  }));
}

// Resolve every readable target from RSA / RSA - Partners. Some Grafana table
// panels split RSA categories into separate targets. Selecting the first target
// only caused Jumpstart to load while Tyre Patch and Fuel silently rendered 0.
async function rsaPanelSource(env) {
  const now = Date.now();
  if (rsaPanelCache && rsaPanelCache.expiresAt > now) return rsaPanelCache.source;
  const searches = await Promise.all(['RSA - Partners', 'RSA Partners'].map((query) => grafanaJson(env, '/api/search?type=dash-db&limit=1000&query=' + encodeURIComponent(query)).catch(() => [])));
  const candidates = searches.flat().filter((item, index, items) => item && item.uid && items.findIndex((candidate) => candidate && candidate.uid === item.uid) === index);
  const exactTitle = normalizedGrafanaKey('RSA - Partners');
  const dashboard = candidates.find((item) => normalizedGrafanaKey(item && item.title) === exactTitle && normalizedGrafanaKey(item && item.folderTitle) === normalizedGrafanaKey('RSA'))
    || candidates.find((item) => normalizedGrafanaKey(item && item.title) === exactTitle)
    || candidates.find((item) => /rsa/i.test(String(item && item.folderTitle || '')) && /partner/i.test(String(item && item.title || '')))
    || candidates[0];
  if (!dashboard || !dashboard.uid) throw Object.assign(new Error('Grafana RSA / RSA - Partners dashboard was not found.'), { status: 404 });
  const payload = await grafanaJson(env, '/api/dashboards/uid/' + encodeURIComponent(dashboard.uid));
  const panels = nestedPanels(payload && payload.dashboard && payload.dashboard.panels);
  const candidatesByTarget = panels.flatMap((panel) => (Array.isArray(panel && panel.targets) ? panel.targets : [])
    .filter((target) => target && target.hide !== true && (target.rawSql || target.rawSQL))
    .map((target) => ({ panel, target, sqlKey: normalizedGrafanaKey(target.rawSql || target.rawSQL) })));
  const readable = candidatesByTarget.filter((item) => item.sqlKey.includes('createdat') && (
    item.sqlKey.includes('productname') || item.sqlKey.includes('ordercategory') || item.sqlKey.includes('status')
  ));
  const selected = readable.length ? readable : candidatesByTarget.slice(0, 1);
  const unique = selected.filter((item, index, items) => {
    const sql = String(item.target.rawSql || item.target.rawSQL || '').trim().replace(/\s+/g, ' ');
    return items.findIndex((candidate) => String(candidate.target.rawSql || candidate.target.rawSQL || '').trim().replace(/\s+/g, ' ') === sql) === index;
  });
  if (!unique.length) throw Object.assign(new Error('Grafana RSA / RSA - Partners has no readable table query.'), { status: 404 });
  const match = unique[0];
  const source = {
    dashboardUid: dashboard.uid,
    dashboardTitle: dashboard.title,
    folderTitle: dashboard.folderTitle || '',
    panelId: Number(match.panel && match.panel.id),
    panelTitle: match.panel && match.panel.title || 'RSA Partners',
    datasource: match.target.datasource || match.panel.datasource || { type: 'grafana-bigquery-datasource', uid: env.GRAFANA_DATASOURCE_UID },
    targets: unique.map((item) => ({
      panelId: Number(item.panel && item.panel.id),
      panelTitle: item.panel && item.panel.title || 'RSA Partners',
      datasource: item.target.datasource || item.panel.datasource || { type: 'grafana-bigquery-datasource', uid: env.GRAFANA_DATASOURCE_UID },
      typeHint: [item.panel && item.panel.title, item.target && item.target.legendFormat, item.target && item.target.alias].filter(Boolean).join(' '),
      target: item.target
    }))
  };
  rsaPanelCache = { source, expiresAt: now + PITSTOP_PANEL_CACHE_SECONDS * 1000 };
  return source;
}

function prepareRsaPanelSql(rawSql, from, to) {
  return preparePitstopPanelSql(String(rawSql || '').replace(/;\s*$/g, ''), from, to, PITSTOP_ALL_BRANCH_AREAS_SQL);
}

function rsaRowsToDaily(rows, from, to) {
  const daily = new Map();
  let cursor = from;
  while (cursor && cursor <= to) {
    daily.set(cursor, { date: cursor, rsaJumpstart: 0, rsaTyrePatch: 0, rsaFuel: 0, total: 0 });
    cursor = addDaysIso(cursor, 1);
  }
  (rows || []).forEach((row) => {
    const date = normalizedGrafanaDate(grafanaRowExactValue(row, ['created_at', 'createdAt', 'report_date', 'date']), '');
    if (!date || date < from || date > to) return;
    // The Grafana RSA activity table intentionally contains the full workload
    // (completed and cancelled attempts). The historical email numbers count
    // that activity, so do not reduce it to completed rows only.
    const type = normalizedGrafanaKey([
      grafanaRowExactValue(row, ['product_name', 'productName', 'product']),
      grafanaRowExactValue(row, ['Order_category', 'order_category', 'category']),
      row && row.__rsaType
    ].filter((value) => value != null && String(value).trim()).join(' '));
    const bucket = daily.get(date);
    if (!bucket) return;
    if (type.includes('jumpstart') || type.includes('jumpstarter')) bucket.rsaJumpstart += 1;
    else if (type.includes('tyre') || type.includes('tire') || type.includes('patch')) bucket.rsaTyrePatch += 1;
    else if (type.includes('fuel') || type.includes('petrol')) bucket.rsaFuel += 1;
    else return;
    bucket.total += 1;
  });
  return [...daily.values()].sort((left, right) => left.date.localeCompare(right.date));
}

async function queryGrafanaRsaPanel(env, from, to) {
  const source = await rsaPanelSource(env);
  const refs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const querySources = (source.targets || []).slice(0, refs.length);
  const targets = querySources.map((item, index) => {
    const datasource = typeof item.datasource === 'string' ? { uid: item.datasource } : item.datasource;
    const target = {
      ...item.target,
      refId: refs[index],
      datasource,
      rawQuery: true,
      rawSql: prepareRsaPanelSql(item.target.rawSql || item.target.rawSQL, from, to),
      intervalMs: 86400000,
      maxDataPoints: 100000
    };
    if (target.format == null) target.format = datasource && datasource.type === 'postgres' ? 'table' : 1;
    if (!target.editorMode && datasource && datasource.type === 'grafana-bigquery-datasource') target.editorMode = 'code';
    delete target.hide;
    return target;
  });
  const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: String(parseIsoDate(from).getTime()),
      to: String(parseIsoDate(to).getTime() + 86399999),
      queries: targets
    })
  });
  const payload = await response.json().catch(() => ({}));
  const results = payload && payload.results || {};
  const successfulRefs = targets.map((target) => target.refId).filter((refId) => results[refId] && !results[refId].error);
  const queryErrors = targets.map((target) => results[target.refId] && results[target.refId].error).filter(Boolean);
  if (!response.ok || !successfulRefs.length) throw Object.assign(new Error(`Grafana RSA / RSA - Partners query failed: ${String(queryErrors[0] || payload.message || `HTTP ${response.status}`).slice(0, 300)}`), { status: response.status || 502 });
  const seen = new Set();
  const rawRows = [];
  const rowFirstRef = new Map();
  successfulRefs.forEach((refId) => {
    const sourceIndex = targets.findIndex((target) => target.refId === refId);
    const typeHint = querySources[sourceIndex] && querySources[sourceIndex].typeHint;
    frameRows(payload, refId).forEach((row) => {
      const orderId = grafanaRowExactValue(row, ['order_id', 'orderId', 'id']);
      const key = orderId != null && String(orderId).trim()
        ? `order:${String(orderId).trim()}`
        : JSON.stringify(Object.keys(row || {}).sort().map((name) => [normalizedGrafanaKey(name), row[name]]));
      // Preserve legitimate duplicate events inside one query, but prevent the
      // same event being counted twice when Grafana exposes duplicate targets.
      if (seen.has(key) && rowFirstRef.get(key) !== refId) return;
      seen.add(key);
      if (!rowFirstRef.has(key)) rowFirstRef.set(key, refId);
      rawRows.push(typeHint ? { ...row, __rsaType: typeHint } : row);
    });
  });
  const rows = rsaRowsToDaily(rawRows, from, to);
  console.log(JSON.stringify({ event: 'grafana-rsa', from, to, targets: targets.length, rawRows: rawRows.length, rsaUnits: rows.reduce((sum, row) => sum + row.total, 0), queryErrors: queryErrors.length }));
  return rows;
}

async function loadRsa(request, env, ctx) {
  const window = reportWindow(new URL(request.url));
  if (window.error) return json({ error: window.error }, 400);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/rsa?schema=2&from=${window.from}&to=${window.to}`, { method: 'GET' });
  const cached = new URL(request.url).searchParams.get('refresh') === '1' ? null : await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const rows = await queryGrafanaRsaPanel(env, window.from, window.to);
    const result = json({
      ok: true,
      source: 'Grafana RSA / RSA - Partners',
      from: window.from,
      to: window.to,
      rows,
      generatedAt: new Date().toISOString(),
      definitions: {
        grain: 'One Grafana RSA activity row equals one RSA unit.',
        filters: { status: 'All activity statuses from the RSA panel' },
        types: { rsaJumpstart: 'Jump Start / JUMPSTART', rsaTyrePatch: 'Tyre Patch', rsaFuel: 'Fuel' }
      }
    }, 200, { 'cache-control': `private, max-age=${PITSTOP_CACHE_SECONDS}` });
    ctx.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch (error) {
    return json({ error: error && error.message || 'Grafana RSA / RSA - Partners data could not be loaded.' }, Number(error && error.status) || 502);
  }
}

// Resolve the saved Grafana warranty panel instead of duplicating its table
// schema in this worker. The panel is the source of truth for the dashboard's
// WARRANTY/completed/Warranty Service/Completed filters and exposes the raw
// Plate_Number rows needed for attendance classification.
async function warrantyPanelSource(env) {
  const now = Date.now();
  if (warrantyPanelCache && warrantyPanelCache.expiresAt > now) return warrantyPanelCache.source;
  const searches = await Promise.all(['Order Details', 'Warranty'].map((query) => grafanaJson(env, '/api/search?type=dash-db&limit=1000&query=' + encodeURIComponent(query)).catch(() => [])));
  const candidates = searches.flat().filter((item, index, items) => item && item.uid && items.findIndex((candidate) => candidate && candidate.uid === item.uid) === index)
    .filter((item) => {
      const title = String(item && item.title || '');
      const folder = String(item && item.folderTitle || '');
      return /order\s*details/i.test(title) && /warranty/i.test(`${folder} ${title}`);
    });
  const dashboard = candidates.find((item) => normalizedGrafanaKey(item && item.folderTitle) === normalizedGrafanaKey('Operation Unit - Warranty')) || candidates[0];
  if (!dashboard || !dashboard.uid) throw Object.assign(new Error('Grafana Warranty / Order Details dashboard was not found.'), { status: 404 });
  const payload = await grafanaJson(env, '/api/dashboards/uid/' + encodeURIComponent(dashboard.uid));
  const panels = nestedPanels(payload && payload.dashboard && payload.dashboard.panels);
  const panel = panels.find((item) => normalizedGrafanaKey(item && item.title) === normalizedGrafanaKey('Details'))
    || panels.find((item) => /warranty|order\s*details/i.test(String(item && item.title || '')));
  const target = panel && Array.isArray(panel.targets)
    ? panel.targets.find((item) => item && item.hide !== true && (item.rawSql || item.rawSQL))
    : null;
  if (!panel || !target) throw Object.assign(new Error('Grafana Warranty / Order Details panel has no readable table query.'), { status: 404 });
  const source = {
    dashboardUid: dashboard.uid,
    panelId: Number(panel.id),
    dashboardTitle: dashboard.title,
    panelTitle: panel.title,
    datasource: target.datasource || panel.datasource || { type: 'grafana-bigquery-datasource', uid: env.GRAFANA_DATASOURCE_UID },
    target
  };
  warrantyPanelCache = { source, expiresAt: now + PITSTOP_PANEL_CACHE_SECONDS * 1000 };
  return source;
}

function prepareWarrantyPanelSql(rawSql, from, to) {
  let sql = String(rawSql || '').replace(/;\s*$/g, '');
  // Resolve the four saved-panel variables before the generic macro helper
  // removes unresolved dashboard conditions. This preserves the panel's
  // intended WARRANTY-only result instead of accidentally querying all orders.
  const values = {
    order_category: 'WARRANTY',
    category: 'WARRANTY',
    order_status: 'completed',
    status: 'completed',
    product_name: 'Warranty Service',
    product: 'Warranty Service',
    payment_status: 'Completed'
  };
  Object.entries(values).forEach(([name, value]) => {
    const literal = sqlString(value);
    sql = sql
      .replace(new RegExp("'\\$\\{?" + name + "(?::(?:sqlstring|singlequote))?\\}?'", 'gi'), literal)
      .replace(new RegExp("\\$\\{?" + name + "(?::(?:sqlstring|singlequote))?\\}?", 'gi'), literal);
  });
  // Resolve the saved panel's Grafana time macros and remaining selectors.
  sql = preparePitstopPanelSql(sql, from, to, PITSTOP_ALL_BRANCH_AREAS_SQL);
  // The live product value contains trailing whitespace (`Warranty Service `).
  // Treat the dashboard's visible filter label as the canonical trimmed value
  // so a valid warranty row cannot be excluded by invisible spaces.
  sql = sql.replace(/products\.name\s+IN\s*\(\s*'Warranty Service'\s*\)/gi, "TRIM(products.name) IN ('Warranty Service')");
  return sql;
}

function warrantyRowsToDaily(rows, from, to) {
  const normalized = (rows || []).map((row) => {
    const date = normalizedGrafanaDate(grafanaRowValue(row, ['completed_at', 'completedAt', 'report_date', 'date', 'payment_created_at']), to);
    const plate = String(grafanaRowValue(row, ['Plate_Number', 'plate_number', 'plate']) || '').trim().toUpperCase();
    return { date, plate };
  }).filter((row) => row.plate && row.date >= from && row.date <= to);
  // Attendance is classified independently for each report date. The manual
  // Excel pivot uses Date + Plate_Number as its grain, so the same plate on
  // two different dates is a first attendance on both dates rather than a
  // second attendance in the later daily row.
  const counts = new Map();
  normalized.forEach((row) => {
    const key = `${row.date}\u0000${row.plate}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const daily = new Map();
  normalized.forEach((row) => {
    const bucket = daily.get(row.date) || { warranty1st: new Set(), warranty2nd: new Set(), warranty3rd: new Set() };
    const count = counts.get(`${row.date}\u0000${row.plate}`) || 0;
    if (count === 1) bucket.warranty1st.add(row.plate);
    else if (count === 2) bucket.warranty2nd.add(row.plate);
    else bucket.warranty3rd.add(row.plate);
    daily.set(row.date, bucket);
  });
  return [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, bucket]) => ({
    date,
    warranty1st: bucket.warranty1st.size,
    warranty2nd: bucket.warranty2nd.size,
    warranty3rd: bucket.warranty3rd.size,
    // The report's first column is the number of plates attended exactly
    // once, matching the Excel pivot's "1st attend" bucket. It is not the
    // union of the 1st/2nd/3rd buckets.
    total: bucket.warranty1st.size
  }));
}

async function queryGrafanaWarrantyPanel(env, from, to) {
  const source = await warrantyPanelSource(env);
  const datasource = typeof source.datasource === 'string' ? { uid: source.datasource } : source.datasource;
  const target = {
    ...source.target,
    refId: 'A',
    datasource,
    rawQuery: true,
    rawSql: prepareWarrantyPanelSql(source.target.rawSql || source.target.rawSQL, from, to),
    intervalMs: 86400000,
    maxDataPoints: MAX_REPORT_DAYS
  };
  if (target.format == null) target.format = datasource && datasource.type === 'postgres' ? 'table' : 1;
  if (!target.editorMode && datasource && datasource.type === 'grafana-bigquery-datasource') target.editorMode = 'code';
  delete target.hide;
  const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: String(parseIsoDate(from).getTime()),
      to: String(parseIsoDate(to).getTime() + 86399999),
      queries: [target]
    })
  });
  const payload = await response.json().catch(() => ({}));
  const queryError = payload && payload.results && payload.results.A && payload.results.A.error;
  if (!response.ok || queryError) throw Object.assign(new Error(`Grafana Warranty / Order Details panel query failed: ${String(queryError || payload.message || `HTTP ${response.status}`).slice(0, 300)}`), { status: response.status || 502 });
  return warrantyRowsToDaily(frameRows(payload), from, to);
}

// Warranty attendance is derived from the filtered Grafana Warranty / Order
// Details data, rather than from the manually uploaded Service & Warranty
// sheet.  A plate is counted once in the selected window and classified by
// its number of warranty rows: 1st, 2nd, or 3rd+ attendance.
function warrantyDailySql(from, to) {
  // Grafana's table labels are not guaranteed to be physical BigQuery column
  // names. Read each source row as JSON so schema drift (for example
  // Plate_Number vs plate_number) cannot make the query fail at compile time.
  const completedAt = `COALESCE(
      JSON_VALUE(row_json, '$.completed_at'),
      JSON_VALUE(row_json, '$.completedAt'),
      JSON_VALUE(row_json, '$.payment_created_at'),
      JSON_VALUE(row_json, '$.paymentCreatedAt')
    )`;
  const plate = `COALESCE(
      JSON_VALUE(row_json, '$.Plate_Number'),
      JSON_VALUE(row_json, '$.plate_number'),
      JSON_VALUE(row_json, '$.plateNumber'),
      JSON_VALUE(row_json, '$.vehicle_plate_number'),
      JSON_VALUE(row_json, '$.vehiclePlateNumber')
    )`;
  const category = `COALESCE(
      JSON_VALUE(row_json, '$.Order_category'),
      JSON_VALUE(row_json, '$.order_category'),
      JSON_VALUE(row_json, '$.Order_Category'),
      JSON_VALUE(row_json, '$.orderCategory')
    )`;
  const orderStatus = `COALESCE(
      JSON_VALUE(row_json, '$.Order_Status'),
      JSON_VALUE(row_json, '$.order_status'),
      JSON_VALUE(row_json, '$.status'),
      JSON_VALUE(row_json, '$.orderStatus')
    )`;
  const product = `COALESCE(
      JSON_VALUE(row_json, '$.Product'),
      JSON_VALUE(row_json, '$.product'),
      JSON_VALUE(row_json, '$.product_name'),
      JSON_VALUE(row_json, '$.productName')
    )`;
  const paymentStatus = `COALESCE(
      JSON_VALUE(row_json, '$.payment_status'),
      JSON_VALUE(row_json, '$.Payment_Status'),
      JSON_VALUE(row_json, '$.paymentStatus'),
      JSON_VALUE(row_json, '$.PaymentStatus')
    )`;
  return `
WITH source_rows AS (
  SELECT TO_JSON_STRING(source_row) AS row_json
  FROM \`clone-330106.View.orderdetail\` AS source_row
), filtered_warranty AS (
  SELECT
    DATE(SAFE_CAST(${completedAt} AS TIMESTAMP), 'Asia/Kuala_Lumpur') AS report_date,
    NULLIF(UPPER(TRIM(${plate})), '') AS plate_number
  FROM source_rows
  WHERE DATE(SAFE_CAST(${completedAt} AS TIMESTAMP), 'Asia/Kuala_Lumpur') BETWEEN DATE(${sqlString(from)}) AND DATE(${sqlString(to)})
    AND UPPER(TRIM(COALESCE(${category}, ''))) = 'WARRANTY'
    AND LOWER(TRIM(COALESCE(${orderStatus}, ''))) = 'completed'
    AND LOWER(TRIM(COALESCE(${product}, ''))) = 'warranty service'
    AND LOWER(TRIM(COALESCE(${paymentStatus}, ''))) = 'completed'
), plate_attendance AS (
  SELECT report_date, plate_number, COUNT(*) AS attend_count
  FROM filtered_warranty
  WHERE plate_number IS NOT NULL
  GROUP BY report_date, plate_number
)
SELECT
  CAST(report_date AS STRING) AS report_date,
  COUNTIF(attend_count = 1) AS warranty_1st,
  COUNTIF(attend_count = 2) AS warranty_2nd,
  COUNTIF(attend_count >= 3) AS warranty_3rd,
  COUNTIF(attend_count = 1) AS total_warranty
FROM plate_attendance
GROUP BY report_date
ORDER BY report_date`;
}

async function queryGrafanaWarrantyWindow(env, from, to) {
  // Prefer the saved Grafana panel query so its real schema and dashboard
  // filters remain authoritative. Keep the legacy SQL variants below as a
  // compatibility fallback for older dashboard copies.
  try {
    const panelRows = await queryGrafanaWarrantyPanel(env, from, to);
    if (panelRows.length) return panelRows;
  } catch (error) {
    console.log(JSON.stringify({ event: 'grafana-warranty-panel-fallback', error: String(error && error.message || error).slice(0, 300) }));
  }
  // One schema-safe JSON query replaces the former sequence of guessed
  // column-name variants. This avoids repeated BigQuery calls and prevents
  // the final failed guess from masking the real panel result.
  const variants = [{}];
  let lastError = null;
  let successfulEmpty = null;
  for (const fields of variants) {
    try {
      const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from: String(parseIsoDate(from).getTime()),
          to: String(parseIsoDate(to).getTime() + 86399999),
          queries: [{
            refId: 'A',
            datasource: { type: 'grafana-bigquery-datasource', uid: env.GRAFANA_DATASOURCE_UID },
            project: 'clone-330106',
            dataset: 'View',
            table: 'orderdetail',
            location: 'asia-southeast1',
            rawQuery: true,
            editorMode: 'code',
            format: 1,
            rawSql: warrantyDailySql(from, to),
            intervalMs: 86400000,
            maxDataPoints: MAX_REPORT_DAYS
          }]
        })
      });
      const payload = await response.json().catch(() => ({}));
      const queryError = payload && payload.results && payload.results.A && payload.results.A.error;
      if (!response.ok || queryError) {
        const detail = queryError || payload && (payload.message || payload.error) || `HTTP ${response.status}`;
        throw Object.assign(new Error(`Grafana Warranty / Order Details query failed: ${String(detail).slice(0, 300)}`), { status: response.status || 502 });
      }
      const rows = frameRows(payload).map((row) => ({
        date: String(row.report_date || '').slice(0, 10),
        warranty1st: Number(row.warranty_1st || 0),
        warranty2nd: Number(row.warranty_2nd || 0),
        warranty3rd: Number(row.warranty_3rd || 0),
        total: Number(row.total_warranty || 0)
      })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
      // A legacy alias can be accepted by Grafana but return an empty frame
      // because its filter values do not match that view.  Keep trying the
      // other known aliases before treating the period as genuinely empty.
      if (rows.length) return rows;
      successfulEmpty = rows;
    } catch (error) {
      lastError = error;
    }
  }
  if (successfulEmpty) return successfulEmpty;
  throw lastError || new Error('Grafana Warranty / Order Details data could not be loaded.');
}

async function loadWarranty(request, env, ctx) {
  const window = reportWindow(new URL(request.url));
  if (window.error) return json({ error: window.error }, 400);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);
  const cache = caches.default;
  // Bump the cache schema with the Grafana field/query mapping so an older
  // successful-but-empty response cannot mask the corrected live result.
  const cacheKey = new Request(`${new URL(request.url).origin}/api/warranty?schema=6&from=${window.from}&to=${window.to}`, { method: 'GET' });
  const cached = new URL(request.url).searchParams.get('refresh') === '1' ? null : await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const rows = await queryGrafanaWarrantyWindow(env, window.from, window.to);
    const result = json({
      ok: true,
      source: 'Grafana Operation Unit / Warranty / Order Details',
      from: window.from,
      to: window.to,
      rows,
      generatedAt: new Date().toISOString(),
      definitions: {
        filters: { orderCategory: 'WARRANTY', orderStatus: 'completed', productName: 'Warranty Service', paymentStatus: 'Completed' },
        attendance: 'For each date, group by Plate_Number and count plates occurring once, twice, or three-or-more times. Each date is classified independently.'
      }
    }, 200, { 'cache-control': `private, max-age=${PITSTOP_CACHE_SECONDS}` });
    ctx.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch (error) {
    return json({ error: error && error.message || 'Grafana Warranty / Order Details data could not be loaded.' }, Number(error && error.status) || 502);
  }
}

async function queryGrafanaResqWindow(env, from, to) {
  const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: String(parseIsoDate(from).getTime()),
      to: String(parseIsoDate(to).getTime() + 86399999),
      queries: [{
        refId: 'A',
        datasource: { type: 'grafana-bigquery-datasource', uid: env.GRAFANA_DATASOURCE_UID },
        project: 'clone-330106',
        dataset: 'View',
        table: 'orderdetail',
        location: 'asia-southeast1',
        rawQuery: true,
        editorMode: 'code',
        format: 1,
        rawSql: resqDailySql(from, to),
        intervalMs: 86400000,
        maxDataPoints: MAX_REPORT_DAYS
      }]
    })
  });
  if (!response.ok) throw Object.assign(new Error('Grafana could not return DSA Orders - Detail ResQ data.'), { status: response.status });
  const payload = await response.json();
  const queryError = payload && payload.results && payload.results.A && payload.results.A.error;
  if (queryError) throw new Error(`Grafana ResQ query failed: ${queryError}`);
  return resqRowsToDaily(frameRows(payload), from, to);
}

async function loadResq(request, env, ctx) {
  const window = reportWindow(new URL(request.url));
  if (window.error) return json({ error: window.error }, 400);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/resq?schema=1&from=${window.from}&to=${window.to}`, { method: 'GET' });
  const cached = new URL(request.url).searchParams.get('refresh') === '1' ? null : await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const rows = await queryGrafanaResqWindow(env, window.from, window.to);
    const result = json({
      ok: true,
      source: 'Grafana General / DSA - Orders / Orders - Detail',
      from: window.from,
      to: window.to,
      rows,
      generatedAt: new Date().toISOString(),
      definitions: {
        counting: 'Distinct order IDs per date.',
        filters: { orderCategory: 'BATTERY', status: 'Operational statuses from the saved Orders - Detail panel' },
        buckets: {
          resQSelangor: ['RESQ TEAM (1)', 'RESQ TEAM (2)', 'RESQ TEAM (3)', 'RESQ TEAM (4)', 'RESQ TEAM (5)'],
          resQJb: ['RESQ JOHOR'],
          resQPahang: ['RESQ TEAM PAHANG'],
          resQPenang: ['RESQ TEAM PENANG']
        }
      }
    }, 200, { 'cache-control': `private, max-age=${PITSTOP_CACHE_SECONDS}` });
    ctx.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch (error) {
    return json({ error: error && error.message || 'Grafana ResQ data could not be loaded.' }, Number(error && error.status) || 502);
  }
}

function prepareOrderDailySql(rawSql, dashboard, from, to, branchTypes) {
  let sql = rawSql.replace(/--[^\n]*/g, '').replace(/\$__timeFilter\(CAST\(created_at AS STRING\)\)/g,
    `TIMESTAMP(created_at) >= TIMESTAMP('${from} 00:00:00') AND TIMESTAMP(created_at) < TIMESTAMP('${addDaysIso(to, 1)} 00:00:00')`);
  for (const variable of dashboard.templating?.list || []) {
    const values = variable.name === 'branch_type' && branchTypes ? branchTypes : variable.current?.value;
    const list = Array.isArray(values) ? values : [values];
    let resolved;
    if (list.includes('$__all')) {
      const query = (variable.query?.rawSql || '').replace(/--[^\n]*/g, '').trim().replace(/;$/, '');
      if (!/^SELECT\b/i.test(query) || /\$(?:\{|__|[A-Za-z_])/.test(query)) throw new Error('Cannot resolve Grafana All filter: ' + variable.name);
      resolved = query;
    } else {
      if (!list.length || list.some(value => value == null)) throw new Error('Missing Grafana filter: ' + variable.name);
      resolved = list.map(sqlString).join(', ');
    }
    sql = sql.replace(new RegExp('\\$' + variable.name + '\\b', 'g'), () => resolved);
  }
  if (/\$(?:\{|__|[A-Za-z_])/.test(sql)) throw new Error('Unresolved Order - Daily Grafana filter.');
  return sql;
}

async function queryGrafanaEmailSalesWindow(env, from, to) {
  const { dashboard } = await grafanaJson(env, '/api/dashboards/uid/oLOEK6sDz');
  const panel = nestedPanels(dashboard.panels).find(item => item.id === 54 && item.title === 'Orders - Daily');
  const target = panel?.targets?.find(item => item.refId === 'A' && !item.hide);
  if (!target?.rawSql) throw new Error('Grafana Orders - Daily count query was not found.');
  const channels = [null, ['Pitstop', 'Warehouse/Branch', 'Workshop', 'unlabeled'], ['BP']];
  const response = await fetch(`${String(env.GRAFANA_URL || '').replace(/\/$/, '')}/api/ds/query`, {
    method: 'POST', headers: { authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: String(parseIsoDate(from).getTime()), to: String(parseIsoDate(to).getTime() + 86400000),
      queries: channels.map((types, index) => ({ ...target, refId: ['A', 'B', 'C'][index], rawSql: prepareOrderDailySql(target.rawSql, dashboard, from, to, types), intervalMs: 86400000, maxDataPoints: MAX_REPORT_DAYS }))
    })
  });
  if (!response.ok) throw new Error('Grafana could not return Orders - Daily.');
  const payload = await response.json(), byDate = new Map();
  ['A', 'B', 'C'].forEach((refId, index) => {
    const result = payload.results?.[refId];
    if (result?.error || !result?.frames?.length) throw new Error('Grafana Orders - Daily returned an error or missing frame for ' + refId);
    frameRows(payload, refId).forEach(row => {
      const date = normalizedGrafanaDate(row.date_col, '');
      if (!date || date < from || date > to) return;
      const value = grafanaMetricNumber(row.total_count);
      if (value === null) throw new Error('Grafana Orders - Daily count schema changed.');
      const entry = byDate.get(date) || { date, all: 0, b2c: 0, b2b2c: 0 };
      entry[['all', 'b2c', 'b2b2c'][index]] = value;
      byDate.set(date, entry);
    });
  });
  return [...byDate.values()];
}

function normalizeEmailSalesRows(rows) {
  const byDate = new Map();
  (rows || []).forEach((row) => {
    if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ''))) return;
    const date = String(row.date).slice(0, 10);
    const current = byDate.get(date) || { date, b2c: 0, b2b2c: 0, all: 0 };
    current.b2c = Number(row.b2c || 0);
    current.b2b2c = Number(row.b2b2c || 0);
    current.all = Number(row.all || current.b2c + current.b2b2c);
    byDate.set(date, current);
  });
  let runningTotal = 0;
  let count = 0;
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).map((row) => {
    runningTotal += row.all;
    count += 1;
    return { ...row, movingAverageAll: Math.round(runningTotal / count) };
  });
}

async function queryGrafanaEmailSales(env, from, to) {
  return normalizeEmailSalesRows(await queryGrafanaEmailSalesWindow(env, from, to));
}

export async function loadEmailSales(request, env, ctx) {
  const window = reportWindow(new URL(request.url));
  if (window.error) return json({ error: window.error }, 400);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);
  const cache = caches.default;
  // Bump the schema when the range/cache behaviour changes so an older empty
  // response cannot survive a corrected Whole month request at the edge.
  const cacheKey = new Request(`${new URL(request.url).origin}/api/email-sales?schema=6&from=${window.from}&to=${window.to}`, { method: 'GET' });
  const cached = new URL(request.url).searchParams.get('refresh') === '1' ? null : await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const rows = await queryGrafanaEmailSales(env, window.from, window.to);
    const result = json({
      source: 'Grafana zPlayground Test / DSA - Orders Copy / Order - Daily',
      from: window.from,
      to: window.to,
      rows,
      generatedAt: new Date().toISOString(),
      definitions: {
        b2c: ['Pitstop', 'Warehouse/Branch', 'Workshop', 'unlabeled'],
        b2b2c: ['BP'],
        movingAverage: ['All branch types']
      }
    }, 200, { 'cache-control': `private, max-age=${PITSTOP_CACHE_SECONDS}` });
    // Do not persist an empty Grafana result. A temporary datasource response
    // must be retried rather than making a valid month look permanently empty.
    if (rows.length) ctx.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch (error) {
    return json({ error: error && error.message || 'Grafana Order - Daily data could not be loaded.' }, Number(error && error.status) || 502);
  }
}

async function pitstopHistoryManifest(env) {
  return await env.DASHBOARD_DATA.get(PITSTOP_HISTORY_MANIFEST_KEY, { type: 'json' });
}

async function readHistoricalPitstopRows(env, from, to, manifest) {
  if (!manifest || !manifest.from || !manifest.to || to < manifest.from || from > manifest.to) return [];
  const boundedFrom = from < manifest.from ? manifest.from : from;
  const boundedTo = to > manifest.to ? manifest.to : to;
  const chunks = await Promise.all(monthKeysBetween(boundedFrom, boundedTo).map((month) => env.DASHBOARD_DATA.get(`${PITSTOP_HISTORY_MONTH_PREFIX}${month}`, { type: 'json' })));
  return chunks.flatMap((chunk) => chunk && Array.isArray(chunk.rows) ? chunk.rows : []).filter((row) => row.date >= boundedFrom && row.date <= boundedTo);
}

function validHistoricalRow(row, month) {
  if (!row || typeof row !== 'object') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) || String(row.date).slice(0, 7) !== month) return false;
  if (!String(row.pitstop || '').trim()) return false;
  if (!['HQ', 'BP'].includes(String(row.channel || '').trim().toUpperCase())) return false;
  const sales = Number(row.sales);
  return Number.isFinite(sales) && sales >= 0;
}

function archiveFieldKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function archiveRowValue(row, aliases) {
  const wanted = aliases.map(archiveFieldKey);
  const key = Object.keys(row || {}).find((candidate) => wanted.includes(archiveFieldKey(candidate)));
  return key ? row[key] : '';
}

function archivePitstopMatchKeys(value) {
  const raw = String(value || '').trim().toUpperCase();
  const canonical = (item) => String(item || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const variants = [raw, raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim(), raw.split(',')[0].trim()];
  if (canonical(raw) === 'BPJALANJOHORPONTIAN') variants.push('BP PONTIAN');
  if (['BPMTAPAHHUTANMELINTANG', 'BPMTAPAHHUTANGMELINTANG'].includes(canonical(raw))) variants.push('BP TAPAH');
  return [...new Set(variants.map(canonical).filter(Boolean))];
}

function malaysiaCurrentMonth() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year');
  const month = parts.find((part) => part.type === 'month');
  return year && month ? `${year.value}-${month.value}` : new Date().toISOString().slice(0, 7);
}

function closedMonthWindow(month) {
  if (!/^\d{4}-\d{2}$/.test(month) || month >= malaysiaCurrentMonth()) return null;
  const from = parseIsoDate(`${month}-01`);
  if (!from || from.toISOString().slice(0, 7) !== month) return null;
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const to = new Date(next.getTime() - 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), calendarDays: to.getUTCDate() };
}

async function savePitstopHistoryMonth(env, month, rows, sourceName) {
  const normalized = rows.map((row) => ({ date: String(row.date), channel: String(row.channel).trim().toUpperCase(), pitstop: String(row.pitstop).trim(), state: String(row.state || '').trim(), sales: Number(row.sales) }));
  normalized.sort((left, right) => left.date.localeCompare(right.date) || left.channel.localeCompare(right.channel) || left.pitstop.localeCompare(right.pitstop));
  const chunk = { month, rows: normalized, rowCount: normalized.length, from: normalized[0].date, to: normalized[normalized.length - 1].date, totalSales: normalized.reduce((sum, row) => sum + row.sales, 0), sourceName: String(sourceName || 'Historical Pitstop Sales').slice(0, 160), uploadedAt: new Date().toISOString() };
  await env.DASHBOARD_DATA.put(`${PITSTOP_HISTORY_MONTH_PREFIX}${month}`, JSON.stringify(chunk));

  const current = await pitstopHistoryManifest(env) || { months: [] };
  const items = (Array.isArray(current.months) ? current.months : []).filter((item) => item.month !== month);
  items.push({ month, rows: chunk.rowCount, from: chunk.from, to: chunk.to, totalSales: chunk.totalSales });
  items.sort((left, right) => left.month.localeCompare(right.month));
  const manifest = { sourceName: chunk.sourceName, uploadedAt: chunk.uploadedAt, from: items[0].from, to: items[items.length - 1].to, totalRows: items.reduce((sum, item) => sum + Number(item.rows || 0), 0), totalSales: items.reduce((sum, item) => sum + Number(item.totalSales || 0), 0), months: items };
  await env.DASHBOARD_DATA.put(PITSTOP_HISTORY_MANIFEST_KEY, JSON.stringify(manifest));
  return { chunk, manifest };
}

async function pitstopGrafanaArchiveApi(request, env) {
  if (!await validUploadSession(request, env)) return json({ error: 'Unlock the Data Upload Centre before archiving Grafana data.' }, 403);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return json({ error: 'Archive request must be JSON.' }, 415);
  const payload = await request.json().catch(() => null);
  const action = String(payload && payload.action || 'preview').toLowerCase();
  const month = String(payload && payload.month || '');
  const window = closedMonthWindow(month);
  if (!window) return json({ error: 'Choose a completed calendar month before the current month.' }, 400);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);

  const draftKey = `${PITSTOP_HISTORY_DRAFT_PREFIX}${month}`;
  if (action === 'confirm') {
    const draft = await env.DASHBOARD_DATA.get(draftKey, { type: 'json' });
    if (!draft || !Array.isArray(draft.rows) || draft.month !== month) return json({ error: 'This preview expired. Fetch the month from Grafana again.' }, 409);
    const saved = await savePitstopHistoryMonth(env, month, draft.rows, `Grafana HQ + BP performance panels ${month}`);
    await env.DASHBOARD_DATA.delete(draftKey);
    return json({ ok: true, month: { month, rows: saved.chunk.rowCount, from: saved.chunk.from, to: saved.chunk.to, totalSales: saved.chunk.totalSales }, manifest: saved.manifest });
  }
  if (action !== 'preview') return json({ error: 'Use preview or confirm.' }, 400);

  const stored = await env.DASHBOARD_DATA.get(DATA_KEY, { type: 'json' });
  const workbook = stored && stored.data ? stored.data : stored;
  const masterRows = workbook && Array.isArray(workbook.pitstopMaster) ? workbook.pitstopMaster : [];
  if (!masterRows.length) return json({ error: 'Upload Pitstop Master before archiving Grafana data.' }, 409);
  const masterKeys = new Set();
  masterRows.forEach((row) => {
    const name = String(archiveRowValue(row, ['branch', 'pitstop', 'name']) || '').trim();
    const status = String(archiveRowValue(row, ['branch_status', 'branch status', 'status']) || '').trim().toLowerCase();
    const country = String(archiveRowValue(row, ['country']) || '').trim().toUpperCase();
    if (!name || status !== 'active' || !['MY', 'MALAYSIA'].includes(country)) return;
    archivePitstopMatchKeys(name).forEach((key) => masterKeys.add(key));
  });
  if (!masterKeys.size) return json({ error: 'Pitstop Master has no active Malaysia branches to validate.' }, 409);

  let rows;
  try {
    rows = await queryGrafanaPitstopRows(env, window.from, window.to);
  } catch (error) {
    return json({ error: error.message, status: error.status || 502, requestId: error.requestId || '' }, 502);
  }
  if (!rows.length) return json({ error: `Grafana returned no HQ or BP performance rows for ${month}.` }, 404);
  rows.sort((left, right) => left.date.localeCompare(right.date) || left.channel.localeCompare(right.channel) || left.pitstop.localeCompare(right.pitstop));
  const unmatched = new Map();
  rows.forEach((row) => {
    if (!archivePitstopMatchKeys(row.pitstop).some((key) => masterKeys.has(key))) unmatched.set(String(row.pitstop).toUpperCase(), row.pitstop);
  });
  const dates = new Set(rows.map((row) => row.date));
  const pitstops = new Set(rows.map((row) => `${row.channel}::${String(row.pitstop).toUpperCase()}`));
  const manifest = await pitstopHistoryManifest(env);
  const existing = manifest && Array.isArray(manifest.months) ? manifest.months.find((item) => item.month === month) : null;
  const summary = {
    month,
    from: window.from,
    to: window.to,
    calendarDays: window.calendarDays,
    reportingDays: dates.size,
    rows: rows.length,
    pitstops: pitstops.size,
    totalSales: rows.reduce((sum, row) => sum + Number(row.sales || 0), 0),
    unmatchedNames: [...unmatched.values()].sort(),
    replacing: existing ? { rows: Number(existing.rows || 0), totalSales: Number(existing.totalSales || 0), uploadedAt: manifest.uploadedAt || '' } : null
  };
  await env.DASHBOARD_DATA.put(draftKey, JSON.stringify({ month, rows, summary, createdAt: new Date().toISOString() }), { expirationTtl: 1800 });
  return json({ ok: true, preview: summary });
}

async function pitstopHistoryApi(request, env) {
  if (request.method === 'GET') {
    const manifest = await pitstopHistoryManifest(env);
    return manifest ? json(manifest) : json({ error: 'No historical Pitstop Sales archive has been uploaded yet.' }, 404);
  }
  if (!await validUploadSession(request, env)) return json({ error: 'Unlock the Data Upload Centre before changing historical data.' }, 403);
  if (request.method === 'DELETE') {
    const current = await pitstopHistoryManifest(env);
    const months = current && Array.isArray(current.months) ? current.months.map((item) => item.month).filter(Boolean) : [];
    await Promise.all(months.map((month) => env.DASHBOARD_DATA.delete(`${PITSTOP_HISTORY_MONTH_PREFIX}${month}`)));
    await env.DASHBOARD_DATA.delete(PITSTOP_HISTORY_MANIFEST_KEY);
    return json({ ok: true, deletedMonths: months.length });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, PUT, DELETE' });
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return json({ error: 'Historical upload must be JSON.' }, 415);
  const payload = await request.json().catch(() => null);
  const month = String(payload && payload.month || '');
  const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
  if (!/^\d{4}-\d{2}$/.test(month) || !rows.length || rows.length > 15000) return json({ error: 'Historical upload must contain one valid month with 1 to 15,000 rows.' }, 400);
  if (rows.some((row) => !validHistoricalRow(row, month))) return json({ error: `Historical rows for ${month} are invalid or belong to another month.` }, 400);
  const saved = await savePitstopHistoryMonth(env, month, rows, payload.sourceName);
  return json({ ok: true, month: { month: saved.chunk.month, rows: saved.chunk.rowCount, from: saved.chunk.from, to: saved.chunk.to, totalSales: saved.chunk.totalSales }, manifest: saved.manifest });
}

async function loadPitstopPerformance(request, env, ctx) {
  const window = reportWindow(new URL(request.url));
  if (window.error) return json({ error: window.error }, 400);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/pitstop-performance?schema=11&from=${window.from}&to=${window.to}`);
  const cached = new URL(request.url).searchParams.get('refresh') === '1' ? null : await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const pitstops = await queryGrafanaPitstopRows(env, window.from, window.to);
    const sources = await pitstopPanelSources(env);
    const result = json({
      source: 'Grafana HQ/BP performance panels',
      panels: sources.map(source => ({ channel: source.channel, dashboardTitle: source.dashboardTitle, dashboardUid: source.dashboardUid, panelTitle: source.panelTitle, panelId: source.panelId })),
      from: window.from, to: window.to, pitstops,
      channelTotals: summarizePitstopChannelSales(pitstops),
      scope: { branchArea: 'All', dashboardTimezone: 'UTC', sqlTimeAdjustment: 'Saved panel SQL (+8 hours)', endExclusive: addDaysIso(window.to, 1) },
      generatedAt: new Date().toISOString()
    }, 200, { 'cache-control': `private, max-age=${PITSTOP_CACHE_SECONDS}` });
    ctx.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch (error) { return json({ error: error.message, from: window.from, to: window.to }, 502); }
}

function csvCell(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function loadPitstopArchive(request, env) {
  const url = new URL(request.url);
  const fromText = url.searchParams.get('from');
  const toText = url.searchParams.get('to');
  const from = parseIsoDate(fromText);
  const to = parseIsoDate(toText);
  if (!from || !to || from > to) return json({ error: 'Use a valid from/to range in YYYY-MM-DD format.' }, 400);
  const totalDays = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  if (totalDays > 730) return json({ error: 'Historical exports are limited to 730 days.' }, 400);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) return json({ error: 'Grafana connection is not configured.' }, 503);

  const rows = [];
  let cursor = new Date(from.getTime());
  while (cursor <= to) {
    const chunkFrom = cursor.toISOString().slice(0, 10);
    const chunkEnd = new Date(Math.min(to.getTime(), cursor.getTime() + (MAX_REPORT_DAYS - 1) * 86400000));
    const chunkTo = chunkEnd.toISOString().slice(0, 10);
    try {
      rows.push(...await queryGrafanaPitstopRows(env, chunkFrom, chunkTo));
    } catch (error) {
      return json({ error: error.message, status: error.status || 502, requestId: error.requestId || '', chunkFrom, chunkTo }, 502);
    }
    cursor = new Date(chunkEnd.getTime() + 86400000);
  }

  rows.sort((left, right) => left.date.localeCompare(right.date) || left.channel.localeCompare(right.channel) || left.pitstop.localeCompare(right.pitstop));
  const lines = [['Date', 'Channel', 'Pitstop', 'State', 'Sales'].join(',')];
  rows.forEach((row) => lines.push([row.date, row.channel, row.pitstop, row.state, row.sales].map(csvCell).join(',')));
  return new Response(`\uFEFF${lines.join('\r\n')}`, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'cache-control': 'no-store',
      'content-disposition': `inline; filename="Pitstop_Sales_Archive_${fromText}_to_${toText}.csv"`,
      'x-content-type-options': 'nosniff'
    }
  });
}

async function dataApi(request, env) {
  if (request.method === 'GET') {
    const stored = await env.DASHBOARD_DATA.get(DATA_KEY, { type: 'json' });
    return stored ? json(stored) : json({ error: 'No master workbook has been uploaded yet.' }, 404);
  }
  if (request.method !== 'PUT' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, PUT, POST' });
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return json({ error: 'Upload must be JSON.' }, 415);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) return json({ error: 'Workbook payload is too large.' }, 413);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_UPLOAD_BYTES) return json({ error: 'Workbook payload is too large.' }, 413);
  let payload;
  try { payload = JSON.parse(text); } catch { return json({ error: 'Upload JSON is invalid.' }, 400); }
  if (!validWorkbookPayload(payload)) return json({ error: 'Workbook payload does not match the expected report sheets.' }, 400);

  const current = await env.DASHBOARD_DATA.get(DATA_KEY, { type: 'json' });
  const previous = current && current.data && typeof current.data === 'object' ? current.data : {};
  const mergedPayload = { ...payload };
  // Daily Sales and dated Pitstops are API-owned. Manual workbook uploads must
  // never replace those sources with stale spreadsheet rows.
  delete mergedPayload.dailySales;
  delete mergedPayload.pitstops;
  ['serviceWarranty', 'bgarage', 'indonesia', 'pitstopMaster', 'pitstopRelocations', 'settings'].forEach((key) => {
    if ((!Array.isArray(mergedPayload[key]) || !mergedPayload[key].length) && Array.isArray(previous[key]) && previous[key].length) mergedPayload[key] = previous[key];
  });
  const stored = {
    data: mergedPayload,
    meta: {
      uploadedAt: new Date().toISOString(),
      uploadedBy: isLocalRequest(request, env) ? 'local-development' : 'authenticated-dashboard-user',
      sourceName: String(payload.sourceName || 'Daily Report Email 2026.xlsx').slice(0, 160)
    }
  };
  await env.DASHBOARD_DATA.put(DATA_KEY, JSON.stringify(stored));
  return json({ ok: true, meta: stored.meta });
}

async function b2wApi(request, env) {
  if (request.method === 'GET') {
    const stored = await env.DASHBOARD_DATA.get(B2W_VALUES_KEY, { type: 'json' });
    return json(effectiveB2wStore(stored));
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, PUT' });
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return json({ error: 'B2W update must be JSON.' }, 415);

  let payload;
  try { payload = await request.json(); } catch { return json({ error: 'B2W update JSON is invalid.' }, 400); }
  const updates = Array.isArray(payload && payload.updates) ? payload.updates : [payload];
  if (!updates.length || updates.length > 500) return json({ error: 'B2W update must contain 1 to 500 rows.' }, 400);
  const validated = [];
  for (const update of updates) {
    const date = String(update && update.date || '').trim();
    if (!parseIsoDate(date)) return json({ error: 'B2W date must use YYYY-MM-DD.' }, 400);
    const deleting = update.value === null || update.value === '';
    const value = deleting ? null : Number(update.value);
    if (!deleting && (!Number.isInteger(value) || value < 0 || value > 1000000)) return json({ error: 'B2W must be a whole number from 0 to 1,000,000.' }, 400);
    validated.push({ date, value });
  }

  const current = await env.DASHBOARD_DATA.get(B2W_VALUES_KEY, { type: 'json' });
  const currentValues = effectiveB2wStore(current).values;
  const manualOverrides = current && current.manualOverrides && typeof current.manualOverrides === 'object' && !Array.isArray(current.manualOverrides)
    ? { ...current.manualOverrides }
    : current && current.sharePointValues ? {} : { ...currentValues };
  for (const update of validated) {
    if (update.value === null) delete manualOverrides[update.date];
    else manualOverrides[update.date] = update.value;
  }
  const values = { ...(current && current.sharePointValues ? current.sharePointValues : {}), ...manualOverrides };
  const stored = { values, manualOverrides, sharePointValues: current && current.sharePointValues ? current.sharePointValues : {}, source: current && current.source || 'Manual dashboard input', updatedAt: new Date().toISOString(), sharePointSyncedAt: current && current.sharePointSyncedAt || '' };
  await env.DASHBOARD_DATA.put(B2W_VALUES_KEY, JSON.stringify(stored));
  return json(stored);
}

function effectiveB2wStore(stored) {
  if (!stored || typeof stored !== 'object') return { values: {}, manualOverrides: {}, sharePointValues: {}, source: '', updatedAt: '', sharePointSyncedAt: '' };
  const sharePointValues = stored.sharePointValues && typeof stored.sharePointValues === 'object' && !Array.isArray(stored.sharePointValues) ? stored.sharePointValues : {};
  const manualOverrides = stored.manualOverrides && typeof stored.manualOverrides === 'object' && !Array.isArray(stored.manualOverrides) ? stored.manualOverrides : {};
  const values = Object.keys(sharePointValues).length ? { ...sharePointValues, ...manualOverrides } : (stored.values && typeof stored.values === 'object' && !Array.isArray(stored.values) ? stored.values : {});
  return { ...stored, values, manualOverrides, sharePointValues };
}

async function sharePointB2wApi(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  try {
    return json(await syncSharePointB2w(env));
  } catch (error) {
    return json({ error: error && error.message || 'SharePoint B2W sync failed.' }, 502);
  }
}

async function syncSharePointB2w(env) {
  const targetDate = new Intl.DateTimeFormat('en-CA', { timeZone: env.REPORT_TIMEZONE || 'Asia/Kuala_Lumpur' }).format(new Date());
  const result = await fetchSharePointB2w(env, targetDate);
  const response = await manualValuesRequest(new Request('https://manual.internal/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) }), env, 'b2w', '/sync');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'SharePoint values could not be saved.');
  return payload;
}

async function rsaValuesApi(request, env) {
  if (request.method === 'GET') {
    const stored = await env.DASHBOARD_DATA.get(RSA_VALUES_KEY, { type: 'json' });
    return json(stored && typeof stored === 'object' ? stored : { values: {}, updatedAt: '' });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, PUT' });
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return json({ error: 'RSA update must be JSON.' }, 415);

  let payload;
  try { payload = await request.json(); } catch { return json({ error: 'RSA update JSON is invalid.' }, 400); }
  const allowedFields = new Set(['rsaJumpstart', 'rsaTyrePatch', 'rsaFuel']);
  const updates = Array.isArray(payload && payload.updates) ? payload.updates : [payload];
  if (!updates.length || updates.length > 1500) return json({ error: 'RSA update must contain 1 to 1,500 rows.' }, 400);
  const validated = [];
  for (const update of updates) {
    const date = String(update && update.date || '').trim();
    const field = String(update && update.field || '').trim();
    if (!parseIsoDate(date)) return json({ error: 'RSA date must use YYYY-MM-DD.' }, 400);
    if (!allowedFields.has(field)) return json({ error: 'RSA field is invalid.' }, 400);
    const deleting = update.value === null || update.value === '';
    const value = deleting ? null : Number(update.value);
    if (!deleting && (!Number.isInteger(value) || value < 0 || value > 1000000)) return json({ error: 'RSA must be a whole number from 0 to 1,000,000.' }, 400);
    validated.push({ date, field, value });
  }

  const current = await env.DASHBOARD_DATA.get(RSA_VALUES_KEY, { type: 'json' });
  const values = current && current.values && typeof current.values === 'object' && !Array.isArray(current.values) ? { ...current.values } : {};
  for (const update of validated) {
    const entry = values[update.date] && typeof values[update.date] === 'object' && !Array.isArray(values[update.date]) ? { ...values[update.date] } : {};
    if (update.value === null) delete entry[update.field];
    else entry[update.field] = update.value;
    if (Object.keys(entry).length) values[update.date] = entry;
    else delete values[update.date];
  }
  const stored = { values, updatedAt: new Date().toISOString() };
  await env.DASHBOARD_DATA.put(RSA_VALUES_KEY, JSON.stringify(stored));
  return json(stored);
}

async function manualReportValuesApi(request, env, storageKey) {
  if (request.method === 'GET') {
    const stored = await env.DASHBOARD_DATA.get(storageKey, { type: 'json' });
    return json(stored && typeof stored === 'object' ? stored : { values: {}, updatedAt: '' });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, PUT' });
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return json({ error: 'Report update must be JSON.' }, 415);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Report update JSON is invalid.' }, 400); }
  const date = String(body && body.date || '').trim();
  const value = body && body.value;
  if (!parseIsoDate(date)) return json({ error: 'Report date must use YYYY-MM-DD.' }, 400);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'A report value object is required.' }, 400);
  if (JSON.stringify(value).length > 50000) return json({ error: 'Report value is too large.' }, 413);

  const current = await env.DASHBOARD_DATA.get(storageKey, { type: 'json' });
  const values = current && current.values && typeof current.values === 'object' && !Array.isArray(current.values) ? { ...current.values } : {};
  values[date] = value;
  const stored = { values, updatedAt: new Date().toISOString() };
  await env.DASHBOARD_DATA.put(storageKey, JSON.stringify(stored));
  return json(stored);
}

function securityHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('x-frame-options', 'DENY');
  if (pathname === '/version.json' || String(headers.get('content-type') || '').includes('text/html')) {
    headers.set('cache-control', 'no-store, max-age=0, must-revalidate');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export class ManualValuesStore extends VersionedManualValues {
  async handle(request, env, kind) {
    if (new URL(request.url).pathname === '/sync' && kind === 'b2w' && request.method === 'POST') {
      const result = await request.json(), current = effectiveB2wStore(await env.DASHBOARD_DATA.get(B2W_VALUES_KEY, { type: 'json' }));
      // Keep earlier months; synchronizing this month's sheet must not erase history.
      const sharePointValues = { ...current.sharePointValues, ...Object.fromEntries(result.rows.map(row => [row.date, row.value])) };
      const manualOverrides = current.manualOverrides || {};
      const syncedAt = new Date().toISOString();
      const stored = { ...current, values: { ...sharePointValues, ...manualOverrides }, sharePointValues, manualOverrides, source: 'SharePoint read-only: ' + result.workbook + ' / ' + result.worksheet, updatedAt: syncedAt, sharePointSyncedAt: syncedAt };
      await env.DASHBOARD_DATA.put(B2W_VALUES_KEY, JSON.stringify(stored));
      return json(stored);
    }
    if (kind === 'b2w') return b2wApi(request, env);
    if (kind === 'rsa') return rsaValuesApi(request, env);
    return manualReportValuesApi(request, env, kind === 'bgarage' ? BGARAGE_SUMMARY_VALUES_KEY : INDONESIA_SUMMARY_VALUES_KEY);
  }
}

export class OperationsJobsStore extends OperationsStore {
  constructor(ctx, env) {
    super(ctx, env, {
      validHistoricalRow,
      publishArchive: savePitstopHistoryMonth,
      archiveRequest: (request, archiveEnv) => new URL(request.url).pathname.endsWith('/grafana')
        ? pitstopGrafanaArchiveApi(request, archiveEnv) : pitstopHistoryApi(request, archiveEnv),
      sources: [
        { id: 'pitstop', label: 'Pitstop HQ + BP', query: queryGrafanaPitstopRows },
        { id: 'email-sales', label: 'Order - Daily', query: queryGrafanaEmailSales },
        { id: 'rsa', label: 'RSA', query: queryGrafanaRsaPanel },
        { id: 'resq', label: 'ResQ', query: queryGrafanaResqWindow },
        { id: 'warranty', label: 'Warranty', query: queryGrafanaWarrantyWindow }
      ]
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/internal/finance-data' && request.method === 'GET') return internalFinanceApi(request, env, ctx);
    if (url.pathname === '/api/health') {
      let concurrencyHealthy = false;
      try {
        await concurrencyAction(env, 'aggregate', '');
        concurrencyHealthy = true;
      } catch {
        concurrencyHealthy = false;
      }
      return json({
        ok: true,
        storage: Boolean(env.DASHBOARD_DATA),
        grafanaConfigured: Boolean(env.GRAFANA_SERVICE_ACCOUNT_TOKEN),
        loginConfigured: Boolean(env.DASHBOARD_ACCESS_PIN && env.SESSION_SIGNING_SECRET),
        concurrencyHealthy,
        authMode: 'built-in-login'
      });
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') return loginApi(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logoutApi(request, env);
    if (url.pathname === '/api/auth/status' && request.method === 'GET') return json({ authenticated: await validSession(request, env) });

    if (url.pathname === '/login') {
      if (await validSession(request, env)) return Response.redirect(new URL(safeNext(url.searchParams.get('next')), url.origin), 302);
      return html(loginPage(url.searchParams.get('next')));
    }

    const session = await sessionInfo(request, env);
    if (!session) {
      if (url.pathname.startsWith('/api/')) return json({ error: 'Sign in to use dashboard data.' }, 401);
      const next = `${url.pathname}${url.search}`;
      return Response.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin), 302);
    }

    if (url.pathname.startsWith('/api/concurrency/')) {
      const actions = {
        '/api/concurrency/enter': ['POST', 'enter'],
        '/api/concurrency/heartbeat': ['POST', 'heartbeat'],
        '/api/concurrency/release': ['POST', 'release'],
        '/api/concurrency/status': ['GET', 'aggregate'],
        '/api/concurrency/queue-status': ['GET', 'check'],
        '/api/concurrency/queue-heartbeat': ['POST', 'queue-heartbeat'],
        '/api/concurrency/leave-queue': ['POST', 'leave-queue']
      };
      const route = actions[url.pathname];
      if (!route) return json({ error: 'Concurrency route not found.' }, 404);
      if (request.method !== route[0]) return json({ error: 'Method not allowed.' }, 405);
      try {
        return json(await concurrencyAction(env, route[1], session.sessionId));
      } catch {
        return json({ error: 'The concurrency controller is temporarily unavailable.' }, 503);
      }
    }

    if (url.pathname === '/waiting-room') {
      const next = safeNext(url.searchParams.get('next') || '/');
      try {
        const result = await concurrencyAction(env, 'enter', session.sessionId);
        if (result.status === 'admitted') return Response.redirect(new URL(next, url.origin), 302);
        return html(waitingRoomPage(next, result, env));
      } catch {
        return html('<!doctype html><meta charset="utf-8"><title>Service unavailable</title><p>The access controller is temporarily unavailable. Please try again shortly.</p>', 503);
      }
    }

    let leaseDenied;
    try {
      leaseDenied = await requireActiveLease(request, env);
    } catch {
      // Concurrency is a capacity guard, not an authorization boundary. A
      // signed-in user may continue reading report data during a transient
      // Durable Object outage, but pages, uploads and all mutations still
      // fail closed until the controller recovers.
      leaseDenied = allowsLeaseFailOpen(url.pathname, request.method)
        ? null
        : json({ error: 'The concurrency controller is temporarily unavailable.' }, 503);
    }

    if (url.pathname === '/api/auth/upload-login' && request.method === 'POST') {
      if (leaseDenied) return leaseDenied;
      return uploadLoginApi(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      if (leaseDenied) return leaseDenied;
      if (url.pathname === '/api/operations' || url.pathname.startsWith('/api/operations/')) {
        if (!await validUploadSession(request, env)) return json({ error: 'Unlock the Data Upload Centre to access operations.' }, 403);
        return operationsRequest(request, env);
      }
      if (env.OPERATIONS_JOBS && (url.pathname === '/api/pitstop-history' && ['PUT', 'DELETE'].includes(request.method) || url.pathname === '/api/pitstop-history/grafana' && request.method === 'POST')) {
        if (!await validUploadSession(request, env)) return json({ error: 'Unlock the Data Upload Centre before changing historical data.' }, 403);
        return operationsRequest(request, env);
      }
      if (url.pathname === '/api/report-versions') return reportVersionsRequest(request, env);
      if (url.pathname === '/api/manual-values-backup' || url.pathname === '/api/manual-values-restore') {
        if (!await validUploadSession(request, env)) return json({ error: 'Unlock the Data Upload Centre to access report backups.' }, 403);
        const kind = url.searchParams.get('kind'), exporting = url.pathname.endsWith('-backup');
        if (!MANUAL_KINDS.includes(kind)) return json({ error: 'Select a valid manual report collection.' }, 400);
        if (request.method !== (exporting ? 'GET' : 'POST')) return json({ error: 'Method not allowed.' }, 405);
        const result = await manualValuesRequest(request, env, kind, exporting ? '/backup' : '/restore');
        if (!exporting || !result.ok) return result;
        const headers = new Headers(result.headers);
        headers.set('content-disposition', `attachment; filename="daily-report-${kind}-${new Date().toISOString().slice(0, 10)}.json"`);
        headers.set('x-content-type-options', 'nosniff');
        return new Response(result.body, { status: result.status, headers });
      }
      if (url.pathname === '/api/data') {
        if (request.method === 'PUT' && !await validUploadSession(request, env)) return json({ error: 'Unlock the Data Upload Centre before changing workbook data.' }, 403);
        return dataApi(request, env);
      }
      if (url.pathname === '/api/pitstop-history') return pitstopHistoryApi(request, env);
      if (url.pathname === '/api/pitstop-history/grafana') return pitstopGrafanaArchiveApi(request, env);
      if (url.pathname === '/api/pitstop-performance' && request.method === 'GET') return loadPitstopPerformance(request, env, ctx);
      if (url.pathname === '/api/email-sales' && request.method === 'GET') return loadEmailSales(request, env, ctx);
      if (url.pathname === '/api/resq' && request.method === 'GET') return loadResq(request, env, ctx);
      if (url.pathname === '/api/rsa' && request.method === 'GET') return loadRsa(request, env, ctx);
      if (url.pathname === '/api/warranty' && request.method === 'GET') return loadWarranty(request, env, ctx);
      if (url.pathname === '/api/b2w') return manualValuesRequest(request, env, 'b2w');
      if (url.pathname === '/api/b2w/sharepoint') return sharePointB2wApi(request, env);
      if (url.pathname === '/api/rsa-values') return manualValuesRequest(request, env, 'rsa');
      if (url.pathname === '/api/bgarage-summary-values') return manualValuesRequest(request, env, 'bgarage');
      if (url.pathname === '/api/indonesia-summary-values') return manualValuesRequest(request, env, 'indonesia');
      if (url.pathname === '/api/manual-values-history' && request.method === 'GET') return manualValuesRequest(request, env, url.searchParams.get('kind'), '/history');
      return json({ error: 'API route not found.' }, 404);
    }

    if (leaseDenied) {
      const next = `${url.pathname}${url.search}`;
      return waitingRedirect(url, next);
    }

    if (url.pathname === '/upload-login') {
      if (await validUploadSession(request, env)) return Response.redirect(new URL(safeNext(url.searchParams.get('next') || '/upload/'), url.origin), 302);
      return html(uploadLoginPage(url.searchParams.get('next')));
    }
    if (url.pathname.startsWith('/upload') && !await validUploadSession(request, env)) {
      const next = `${url.pathname}${url.search}`;
      return Response.redirect(new URL(`/upload-login?next=${encodeURIComponent(next)}`, url.origin), 302);
    }
    if (url.pathname === '/exports/pitstop-sales.csv' && request.method === 'GET') return securityHeaders(await loadPitstopArchive(request, env));
    return securityHeaders(await env.ASSETS.fetch(request), url.pathname);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(prewarmFinanceSnapshots(env, ctx));
    const b2wConfigured = Boolean(env.MS_GRAPH_TENANT_ID && env.MS_GRAPH_CLIENT_ID && env.MS_GRAPH_CLIENT_SECRET && env.SHAREPOINT_B2W_SHARE_URL);
    if (env.OPERATIONS_JOBS) {
      ctx.waitUntil(scheduledOperations(env, () => syncSharePointB2w(env), b2wConfigured));
    } else if (b2wConfigured) {
      ctx.waitUntil(syncSharePointB2w(env).catch(() => {}));
    }
  }
};
