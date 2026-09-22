import { ConcurrencyLimiter, concurrencyConfig } from "./concurrency.js";
import { DeductionRegister, deductionsApi } from "./deductions.js";
import { bookingsApi } from "./bookings.js";
import { dataSourceApi } from "./data-source.js";

export { ConcurrencyLimiter };
export { DeductionRegister };

const SESSION_COOKIE = "ledger_finance_session";
const SESSION_SECONDS = 8 * 60 * 60;
// Bump when the edge response contract or source-scope rules change so stale
// cached payloads cannot survive a parity correction.
const FINANCE_CACHE_SCHEMA = "grafana-finance-tables-v16";
const financeRequests = new Map();
const financeRevalidations = new Map();

function financeCachePolicy(url) {
  const part = String(url.searchParams.get("part") || "all").toLowerCase();
  // Finance controls must follow current Grafana variable values closely.
  if (part === "options") return { ttl: 60, stale: 120 };
  if (part === "tables") return { ttl: 90, stale: 180 };
  if (part === "primary") return { ttl: 45, stale: 180 };
  return { ttl: 60, stale: 300 };
}

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...headers
    }
  });
}

function safeNext(value) {
  const next = String(value || "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function loginPage(showError = false, env = {}) {
  const config = concurrencyConfig(env);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Ledger Finance | Secure Access</title>
  <style>
    :root{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#f5f7fb;background:#090b0f}*{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#090b0f}
    .shell{width:min(470px,100%);border:1px solid #2b313b;background:#111419;box-shadow:0 24px 80px rgba(0,0,0,.45)}
    .brand{padding:30px 34px 24px;border-bottom:1px solid #2b313b;background:#0c0f13}
    .brand-row{display:flex;align-items:center;justify-content:center}.brand-logo{display:block;width:min(360px,100%);height:86px;object-fit:cover;object-position:center}
    main{padding:30px 34px 34px}h1{margin:0 0 8px;font-size:28px;letter-spacing:-.035em}p{margin:0 0 22px;color:#aab3c0;line-height:1.55}
    label,.capacity-label{display:block;margin-bottom:9px;color:#dbe2ea;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
    input{width:100%;height:54px;border:1px solid #3a4350;background:#0b0e13;color:#fff;padding:0 16px;font:700 18px/1 inherit;letter-spacing:.12em;outline:none}
    input:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.25)}
    .capacity-field{margin:0 0 22px;padding:14px 16px;border:1px solid #343c47;background:#0b0e13}.capacity-field strong{display:block;font-size:17px;color:#e8edf5}.capacity-field small{display:block;margin-top:5px;color:#8e99a8;line-height:1.45}
    button{width:100%;height:52px;margin-top:16px;border:0;background:#2563eb;color:#fff;font:800 16px/1 inherit;cursor:pointer}button:hover{background:#1d4ed8}
    .error{margin:14px 0 0;padding:11px 12px;border:1px solid #7f1d1d;background:#2b1013;color:#fecaca;font-size:13px;font-weight:700}
    .note{margin:18px 0 0;color:#7f8a99;font-size:12px;text-align:center}
    /* BEGIN BATERIKU REFERENCE LOGIN THEME — presentation only */
    :root{--login-canvas:#0b0e09;--login-surface:#181e15;--login-field:#10150d;--login-edge:#363e2e;--login-text:#f2f4ec;--login-muted:#adb5a2;--login-lime:#b3f442;color:var(--login-text);background:var(--login-canvas)}
    body{background:radial-gradient(ellipse at top left,#1b2512,transparent 56%),var(--login-canvas);padding:32px 20px}
    .shell{width:min(634px,100%);border-color:var(--login-edge);border-radius:20px;background:var(--login-surface);box-shadow:0 20px 55px #0003;overflow:hidden}
    .brand{padding:44px 42px 30px;border:0;background:transparent}
    .brand-row{justify-content:center}
    main{padding:18px 42px 42px}h1{font-size:34px;line-height:1.2;letter-spacing:-.035em;margin-bottom:16px}p{color:var(--login-muted);font-size:16px;line-height:1.6;margin-bottom:28px}
    label,.capacity-label{color:var(--login-muted);font-size:13px;letter-spacing:.02em;text-transform:none;font-weight:600}
    input{height:62px;border-color:var(--login-edge);border-radius:13px;background:var(--login-field);color:var(--login-text);font-family:inherit;font-size:18px;font-weight:700}
    input:focus{border-color:var(--login-lime);box-shadow:0 0 0 3px #b3f42226}
    .capacity-field{padding:16px 18px;margin-bottom:26px;border-color:var(--login-edge);border-radius:12px;background:var(--login-field)}.capacity-field strong{color:var(--login-text)}.capacity-field small{color:var(--login-muted);line-height:1.6}
    button{height:62px;margin-top:22px;border-radius:13px;background:var(--login-lime);color:#152008;font-family:inherit;font-size:17px;font-weight:800}button:hover{background:#c2ff59}button:focus-visible{outline:2px solid var(--login-text);outline-offset:4px}
    .error{border-radius:10px;color:#ffc7bf}.note{margin-top:30px;padding-top:22px;border-top:1px solid var(--login-edge);color:var(--login-muted);text-align:left;line-height:1.6}
    @media(max-width:520px){body{padding:20px 14px}.brand{padding:28px 24px 18px}main{padding:18px 24px 28px}h1{font-size:28px}}
    /* END BATERIKU REFERENCE LOGIN THEME */
  </style>
</head>
<body>
  <section class="shell" aria-labelledby="title">
    <header class="brand"><div class="brand-row"><img class="brand-logo" src="/assets/bateriku-finance-logo.png" alt="Bateriku"></div></header>
    <main>
      <h1 id="title">Secure finance access</h1>
      <p>Enter the Finance access PIN. Your authenticated session remains active for eight hours on this device.</p>
      <span class="capacity-label">Concurrent user capacity</span>
      <div class="capacity-field" role="status" aria-label="Concurrent access limit"><strong>${config.limit} active users maximum</strong><small>If all slots are occupied, you will join the FIFO waiting queue and enter automatically when a slot becomes available.</small></div>
      <form method="post" action="/api/auth/login">
        <label for="pin">Finance access PIN</label>
        <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" minlength="12" maxlength="64" required autofocus>
        <button type="submit">Open finance dashboard</button>
      </form>
      ${showError ? '<div class="error" role="alert">Incorrect PIN. Please try again.</div>' : ""}
      <div class="note">Protected by encrypted server-side authentication.</div>
    </main>
  </section>
</body>
</html>`;
}

function waitingRoomPage(nextPath, initial, env) {
  const next = JSON.stringify(safeNext(nextPath)).replace(/</g, "\\u003c");
  const initialState = JSON.stringify(initial || {}).replace(/</g, "\\u003c");
  const config = concurrencyConfig(env);
  const pollMs = Math.max(3000, Number(env.QUEUE_STATUS_POLL_SECONDS || 5) * 1000);
  const heartbeatMs = Math.max(5000, Number(env.QUEUE_HEARTBEAT_SECONDS || 15) * 1000);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Ledger Finance | Waiting Room</title><style>
  :root{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#f5f7fb;background:#090b0f}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#090b0f}.shell{width:min(560px,100%);border:1px solid #2b313b;background:#111419;box-shadow:0 24px 80px rgba(0,0,0,.45)}.brand{padding:28px 34px;border-bottom:1px solid #2b313b;background:#0c0f13}.brand-row{display:flex;align-items:center;justify-content:center}.brand-logo{display:block;width:min(330px,100%);height:78px;object-fit:cover;object-position:center}.content{padding:32px 34px 34px}h1{margin:0 0 10px;font-size:28px}p{margin:0;color:#aab3c0;line-height:1.55}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:26px 0 22px}.metric{padding:17px;border:1px solid #343c47;background:#0b0e13}.metric span{display:block;color:#8e99a8;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.metric strong{display:block;margin-top:7px;color:#f5f7fb;font-size:28px}.status{display:flex;align-items:center;gap:10px;padding:14px 16px;border:1px solid #284b42;background:#10241f;color:#6ee7b7;font-size:14px;font-weight:800}.spinner{width:15px;height:15px;border:2px solid #305e51;border-top-color:#6ee7b7;border-radius:50%;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.note{margin-top:18px;font-size:13px}.leave{width:100%;height:46px;margin-top:22px;border:1px solid #3a4350;background:#171b22;color:#dbe2ea;font:inherit;font-weight:800;cursor:pointer}.error{min-height:20px;margin-top:12px;color:#fca5a5;font-size:13px;font-weight:750}@media(max-width:520px){.metrics{grid-template-columns:1fr}.content,.brand{padding-left:24px;padding-right:24px}}</style></head><body><main class="shell"><header class="brand"><div class="brand-row"><img class="brand-logo" src="/assets/bateriku-finance-logo.png" alt="Bateriku"></div></header><section class="content"><h1>Application currently full</h1><p>All ${config.limit} Finance dashboard slots are in use. You remain in line and will enter automatically when capacity becomes available.</p><div class="metrics"><div class="metric"><span>Your position</span><strong id="position">#${Number(initial && initial.position || 1)}</strong></div><div class="metric"><span>Users active</span><strong><span id="active">${Number(initial && initial.active || config.limit)}</span> / ${config.limit}</strong></div><div class="metric"><span>Waiting</span><strong id="waiting">${Number(initial && initial.waiting || 1)}</strong></div></div><div class="status"><span class="spinner" aria-hidden="true"></span><span id="statusText">Checking for availability...</span></div><p class="note">Keep this page open. Your queue position updates automatically; inactive queue tickets expire after one minute.</p><button class="leave" id="leaveButton" type="button">Leave queue and sign out</button><div class="error" id="error" role="alert" aria-live="polite"></div></section></main><script>
  const next=${next};let current=${initialState};let stopped=false;
  const position=document.getElementById('position'),active=document.getElementById('active'),waiting=document.getElementById('waiting'),statusText=document.getElementById('statusText'),error=document.getElementById('error');
  function render(value){current=value||{};if(current.status==='admitted'){stopped=true;statusText.textContent='Slot available. Opening Finance dashboard...';location.replace(next);return}if(current.status==='queued'){position.textContent='#'+current.position;active.textContent=current.active;waiting.textContent=current.waiting;statusText.textContent='Checking for availability...';error.textContent='';return}if(current.status==='required')enter()}
  async function call(path,method='GET'){const response=await fetch(path,{method,credentials:'same-origin',headers:method==='POST'?{'content-type':'application/json'}:undefined,body:method==='POST'?'{}':undefined});const result=await response.json().catch(()=>({}));if(response.status===401){location.replace('/login');return null}if(!response.ok)throw new Error(result.error||'The queue could not be checked.');return result}
  async function enter(){try{const value=await call('/api/concurrency/enter','POST');if(value)render(value)}catch(reason){error.textContent=reason.message}}
  async function poll(){if(stopped)return;try{const value=await call('/api/concurrency/queue-status');if(value)render(value)}catch(reason){error.textContent=reason.message}}
  async function keepQueue(){if(stopped)return;try{const value=await call('/api/concurrency/queue-heartbeat','POST');if(value)render(value)}catch(reason){error.textContent=reason.message}}
  document.getElementById('leaveButton').addEventListener('click',async()=>{stopped=true;try{await call('/api/concurrency/leave-queue','POST');await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})}finally{location.replace('/login')}});
  render(current);setInterval(poll,${pollMs});setInterval(keepQueue,${heartbeatMs});
  </script></body></html>`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  const a = String(left); const b = String(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

async function sha256(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)))));
}

function cookieValue(request) {
  const cookies = request.headers.get("cookie") || "";
  for (const item of cookies.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(parts.join("="));
  }
  return "";
}

async function sessionInfo(request, env) {
  if (!env.SESSION_SIGNING_SECRET) return null;
  const value = cookieValue(request);
  const parts = value.split(".");
  if (![2, 3, 5].includes(parts.length)) return null;
  const identified = parts.length === 5;
  const modern = parts.length >= 3;
  const sessionId = modern ? parts[0] : `legacy-${(await sha256(value)).slice(0, 32)}`;
  const expiresText = modern ? parts[1] : parts[0];
  const role = identified && ['maker', 'checker', 'admin'].includes(parts[2]) ? parts[2] : 'maker';
  let name = 'Finance User';
  if (identified) {
    try { const encoded = parts[3].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[3].length / 4) * 4, '='); name = new TextDecoder().decode(Uint8Array.from(atob(encoded), character => character.charCodeAt(0))).trim(); } catch { return null; }
  }
  const signature = identified ? parts[4] : modern ? parts[2] : parts[1];
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000) || !signature) return null;
  const payload = identified ? `${sessionId}.${expiresText}.${role}.${parts[3]}` : modern ? `${sessionId}.${expiresText}` : expiresText;
  const expected = await sign(payload, env.SESSION_SIGNING_SECRET);
  return constantTimeEqual(signature, expected) ? { sessionId, expires, name: name || 'Finance User', role } : null;
}

async function hasValidSession(request, env) {
  return Boolean(await sessionInfo(request, env));
}

async function createSessionCookie(env, name, role) {
  const sessionId = bytesToHex(crypto.getRandomValues(new Uint8Array(18)));
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const encodedName = btoa(String.fromCharCode(...new TextEncoder().encode(name))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const payload = `${sessionId}.${expires}.${role}.${encodedName}`;
  const signature = await sign(payload, env.SESSION_SIGNING_SECRET);
  return `${SESSION_COOKIE}=${encodeURIComponent(`${payload}.${signature}`)}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function redirect(location, cookie) {
  const headers = { location, "cache-control": "no-store" };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(null, { status: 303, headers });
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

async function concurrencyAction(env, action, sessionId, layout) {
  if (!env.CONCURRENCY_LIMITER) throw new Error("Concurrency controller is not configured.");
  const id = env.CONCURRENCY_LIMITER.idFromName("ledger-finance-global");
  const stub = env.CONCURRENCY_LIMITER.get(id);
  const response = await stub.fetch("https://concurrency.internal/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, sessionId, layout })
  });
  if (!response.ok) throw new Error("Concurrency controller request failed.");
  return response.json();
}

async function dashboardLayoutApi(request, env, sessionId) {
  if (request.method === "GET") return json(await concurrencyAction(env, "get-dashboard-layout", sessionId));
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid dashboard layout payload." }, 400); }
  const result = await concurrencyAction(env, "set-dashboard-layout", sessionId, body.layout);
  return result.error ? json(result, 400) : json(result);
}

async function requireActiveLease(request, env) {
  const session = await sessionInfo(request, env);
  if (!session) return json({ error: "Authentication required." }, 401);
  const result = await concurrencyAction(env, "check", session.sessionId);
  if (result.status === "admitted") return null;
  return json({ error: "An active Finance dashboard slot is required.", code: "queue_required", ...result, waitingUrl: "/waiting-room" }, 403);
}

function financeClientResponse(source, cacheStatus) {
  const headers = new Headers(source.headers);
  // Authenticated Finance data may be reused briefly by this browser only.
  // This removes a repeat multi-megabyte transfer on refresh/back navigation;
  // Cloudflare still revalidates the shared Grafana snapshot independently.
  headers.set("cache-control", source.ok && cacheStatus !== "BYPASS"
    ? "private, max-age=30, stale-while-revalidate=120"
    : "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-finance-cache", cacheStatus);
  return new Response(source.body, { status: source.status, statusText: source.statusText, headers });
}

async function fetchFinanceUpstream(upstreamUrl, env, requestKey) {
  let pending = financeRequests.get(requestKey);
  if (!pending) {
    pending = env.GRAFANA_PROXY.fetch(new Request(upstreamUrl, {
        method: "GET",
        headers: { "x-finance-proxy-secret": env.FINANCE_PROXY_SHARED_SECRET }
      }));
    financeRequests.set(requestKey, pending);
  }
  try { return (await pending).clone(); }
  finally { if (financeRequests.get(requestKey) === pending) financeRequests.delete(requestKey); }
}

async function prewarmCommissionPrimary(env) {
  if (!env.GRAFANA_PROXY || !env.FINANCE_PROXY_SHARED_SECRET) return;
  const url = new URL("https://daily-report.internal/api/internal/finance-data");
  url.searchParams.set("panel", "commission-main");
  url.searchParams.set("scope", "grafana");
  url.searchParams.set("part", "primary");
  url.searchParams.set("format", "packed");
  const response = await env.GRAFANA_PROXY.fetch(new Request(url, {
    headers: { "x-finance-proxy-secret": env.FINANCE_PROXY_SHARED_SECRET }
  }));
  if (!response.ok) return;
  if (response.body) await response.body.pipeTo(new WritableStream());
}

async function writeFinanceEdgeCache(edgeCache, cacheKey, response, policy) {
  if (!edgeCache || !response || !response.ok) return;
  const cacheHeaders = new Headers(response.headers);
  cacheHeaders.set("cache-control", `public, max-age=${policy.ttl + policy.stale}, s-maxage=${policy.ttl + policy.stale}, stale-while-revalidate=${policy.stale}`);
  cacheHeaders.set("x-finance-cached-at", new Date().toISOString());
  cacheHeaders.set("x-finance-fresh-seconds", String(policy.ttl));
  await edgeCache.put(cacheKey, new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: cacheHeaders
  }));
}

function revalidateFinanceCache(edgeCache, cacheKey, upstreamUrl, env, policy) {
  const key = cacheKey.url;
  let pending = financeRevalidations.get(key);
  if (!pending) {
    pending = fetchFinanceUpstream(upstreamUrl, env, upstreamUrl.toString())
      .then((response) => writeFinanceEdgeCache(edgeCache, cacheKey, response, policy))
      .finally(() => { if (financeRevalidations.get(key) === pending) financeRevalidations.delete(key); });
    // Share revalidation through the whole streamed cache write, not just until
    // upstream headers arrive. Concurrent viewers no longer repeat this work.
    financeRevalidations.set(key, pending);
  }
  return pending;
}

async function financeDataApi(request, env, context) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  if (!env.GRAFANA_PROXY || !env.FINANCE_PROXY_SHARED_SECRET) return json({ error: "Grafana finance proxy is not configured." }, 503);
  const incoming = new URL(request.url);
  const bypassCache = incoming.searchParams.get("refresh") === "1";
  const cachePolicy = financeCachePolicy(incoming);
  const upstreamUrl = new URL("https://daily-report.internal/api/internal/finance-data");
  // The upstream keeps the public object-row response compatible by default.
  // This private dashboard opts into the lossless compact representation so a
  // 30k+ row Finance ledger does not spend seconds transferring repeated JSON
  // field names through the service binding and browser.
  upstreamUrl.searchParams.set("format", "packed");
  // Keep the staged frontend requests intact. `part=primary` is what prevents
  // the first paint from waiting on every companion Grafana table; dropping it
  // here silently turned every request back into the slow all-panels bundle.
  // Forward the complete Grafana scope signature. Dropping filters or the
  // revision here makes the edge cache return a different scope than the
  // dashboard variables the user just confirmed.
  ["panel", "from", "to", "scope", "part", "filters", "revision", "refresh"].forEach((key) => { const value = incoming.searchParams.get(key); if (value) upstreamUrl.searchParams.set(key, value); });
  const cacheUrl = new URL("https://ledger-finance-cache.internal/data");
  cacheUrl.searchParams.set("schema", FINANCE_CACHE_SCHEMA);
  upstreamUrl.searchParams.forEach((value, key) => cacheUrl.searchParams.set(key, value));
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const edgeCache = globalThis.caches && globalThis.caches.default;
  try {
    if (!bypassCache && edgeCache) {
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const cachedAt = Date.parse(cached.headers.get("x-finance-cached-at") || "");
        const ageSeconds = Number.isFinite(cachedAt) ? Math.max(0, (Date.now() - cachedAt) / 1000) : 0;
        if (ageSeconds <= cachePolicy.ttl) return financeClientResponse(cached, "HIT");
        if (ageSeconds <= cachePolicy.ttl + cachePolicy.stale) {
          const revalidate = revalidateFinanceCache(edgeCache, cacheKey, upstreamUrl, env, cachePolicy).catch(() => {});
          if (context && typeof context.waitUntil === "function") context.waitUntil(revalidate);
          else void revalidate;
          return financeClientResponse(cached, "STALE");
        }
      }
    }

    const requestKey = `${upstreamUrl}${bypassCache ? ":refresh" : ""}`;
    const upstreamResponse = await fetchFinanceUpstream(upstreamUrl, env, requestKey);
    if (upstreamResponse.ok && edgeCache) {
      const cacheWrite = writeFinanceEdgeCache(edgeCache, cacheKey, upstreamResponse.clone(), cachePolicy).catch(() => {});
      if (context && typeof context.waitUntil === "function") context.waitUntil(cacheWrite);
      else await cacheWrite;
    }
    return financeClientResponse(upstreamResponse, bypassCache ? "BYPASS" : "MISS");
  } catch {
    return json({ error: "The Grafana finance service is temporarily unavailable." }, 503);
  }
}

const malaysiaFixedNationalHolidayDates = year => [
  `${year}-09-16`
];

async function malaysiaPublicHolidaysApi(url) {
  const year = Number(url.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return json({ error: "Choose a valid holiday year." }, 400);
  const fixedDates = malaysiaFixedNationalHolidayDates(year);
  try {
    const response = await fetch("https://www.malaysia.gov.my/calendar", { headers: { accept: "text/html" }, cf: { cacheEverything: true, cacheTtl: 21600 } });
    if (!response.ok) throw new Error("Official calendar unavailable");
    const page = await response.text(), dates = [...page.matchAll(/startDate\\?":\\?"(\d{4}-\d{2}-\d{2})T/g)].map(match => match[1]).filter(value => value.startsWith(`${year}-`));
    return json({ dates: [...new Set([...fixedDates, ...dates])].sort(), source: "Government of Malaysia", sourceUrl: "https://www.malaysia.gov.my/calendar" });
  } catch {
    return json({ dates: fixedDates, source: "Government of Malaysia", sourceUrl: "https://www.malaysia.gov.my/calendar", warning: "The live holiday calendar could not be checked. Malaysia Day remains included; review other holiday dates before saving." });
  }
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    if (url.pathname === "/assets/bateriku-finance-logo.png" && request.method === "GET") {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "public, max-age=86400");
      headers.set("x-content-type-options", "nosniff");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    if (url.pathname === "/login" && request.method === "GET") {
      // Do not pull Grafana before the signed-in user's data mode is known.
      if (await hasValidSession(request, env)) return redirect("/");
      return html(loginPage(url.searchParams.get("error") === "1", env));
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const form = await request.formData();
      const supplied = String(form.get("pin") || "");
      const checker = Boolean(env.FINANCE_APPROVER_PIN && constantTimeEqual(supplied, env.FINANCE_APPROVER_PIN));
      const maker = Boolean(env.FINANCE_ACCESS_PIN && constantTimeEqual(supplied, env.FINANCE_ACCESS_PIN));
      if (!maker && !checker) return redirect("/login?error=1");
      const role = checker ? "checker" : "maker";
      return redirect("/", await createSessionCookie(env, role === "checker" ? "Finance Checker" : "Finance User", role));
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const session = await sessionInfo(request, env);
      if (session) {
        try { await concurrencyAction(env, "release", session.sessionId); await concurrencyAction(env, "leave-queue", session.sessionId); } catch { /* Session expiry remains the fallback. */ }
      }
      return redirect("/login", expiredSessionCookie());
    }

    const session = await sessionInfo(request, env);
    if (!session) {
      if (url.pathname.startsWith("/api/")) return json({ error: "Authentication required." }, 401);
      return redirect("/login");
    }

    if (url.pathname.startsWith("/api/concurrency/")) {
      const routes = {
        "/api/concurrency/enter": ["POST", "enter"],
        "/api/concurrency/heartbeat": ["POST", "heartbeat"],
        "/api/concurrency/release": ["POST", "release"],
        "/api/concurrency/status": ["GET", "aggregate"],
        "/api/concurrency/queue-status": ["GET", "check"],
        "/api/concurrency/queue-heartbeat": ["POST", "queue-heartbeat"],
        "/api/concurrency/leave-queue": ["POST", "leave-queue"]
      };
      const route = routes[url.pathname];
      if (!route) return json({ error: "Concurrency route not found." }, 404);
      if (request.method !== route[0]) return json({ error: "Method not allowed." }, 405);
      try { return json(await concurrencyAction(env, route[1], session.sessionId)); }
      catch { return json({ error: "The access queue is temporarily unavailable." }, 503); }
    }

    if (url.pathname === "/waiting-room") {
      const next = safeNext(url.searchParams.get("next"));
      try {
        const result = await concurrencyAction(env, "enter", session.sessionId);
        if (result.status === "admitted") return redirect(next);
        return html(waitingRoomPage(next, result, env));
      } catch {
        return html("<!doctype html><meta charset='utf-8'><title>Service unavailable</title><p>The Finance access queue is temporarily unavailable. Please try again shortly.</p>", 503);
      }
    }

    let leaseDenied;
    try { leaseDenied = await requireActiveLease(request, env); }
    catch { leaseDenied = json({ error: "The Finance access queue is temporarily unavailable." }, 503); }

    if (url.pathname.startsWith("/api/")) {
      if (leaseDenied) return leaseDenied;
      if (url.pathname === "/api/session" && request.method === "GET") return json({ name: session.name, role: session.role });
      if (url.pathname.startsWith('/api/data-source/')) return dataSourceApi(request, env, session);
      if (url.pathname === "/api/finsight-chat") {
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "Use an application/json request." }, 415);
        if (!env.FINANCE_AGENT || !env.FINANCE_AGENT_SHARED_SECRET) return json({ error: "FinSight is temporarily unavailable." }, 503);
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 1_500_000) return json({ error: "Finance context is too large." }, 413);
        let payload;
        try { payload = await request.json(); } catch { return json({ error: "Invalid FinSight request." }, 400); }
        try {
          const response = await env.FINANCE_AGENT.fetch("https://finance-agent.internal/api/internal/ledger-chat", {
            method: "POST",
            headers: { "content-type": "application/json", "x-finance-agent-secret": env.FINANCE_AGENT_SHARED_SECRET },
            body: JSON.stringify(payload)
          });
          const headers = new Headers(response.headers);
          headers.set("cache-control", "no-store");
          headers.set("x-content-type-options", "nosniff");
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        } catch { return json({ error: "FinSight is temporarily unavailable." }, 503); }
      }
      if (url.pathname === "/api/public-holidays" && request.method === "GET") return malaysiaPublicHolidaysApi(url);
      if (url.pathname === "/api/deductions" || url.pathname.startsWith("/api/deductions/")) return deductionsApi(request, env, session, context);
      if (url.pathname === "/api/bookings" || url.pathname.startsWith("/api/bookings/")) return bookingsApi(request, env, session);
      if (url.pathname === "/api/dashboard-layout") return dashboardLayoutApi(request, env, session.sessionId);
      if (url.pathname === "/api/grafana/finance" || url.pathname === "/api/finance/data") return financeDataApi(request, env, context);
      return json({ error: "API route not found." }, 404);
    }

    if (leaseDenied) return redirect(`/waiting-room?next=${encodeURIComponent(safeNext(`${url.pathname}${url.search}`))}`);

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    // Vendor URLs are versioned by the HTML shell, so they are safe to cache as
    // immutable while HTML remains revalidated after every deployment.
    headers.set("cache-control", url.pathname.startsWith("/vendor/")
      ? "public, max-age=31536000, immutable"
      : "private, no-cache, must-revalidate");
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "no-referrer");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
