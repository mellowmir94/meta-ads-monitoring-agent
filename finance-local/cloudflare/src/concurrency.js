const STATE_KEY = "concurrency-state";
const DASHBOARD_LAYOUT_KEY = "finance-dashboard-default-layout-v1";

export const DEFAULT_CONCURRENCY_CONFIG = Object.freeze({
  limit: 7,
  activeTimeoutMs: 90_000,
  queueTimeoutMs: 60_000,
  alarmIntervalMs: 15_000
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function concurrencyConfig(env = {}) {
  return {
    limit: positiveInteger(env.MAX_CONCURRENT_USERS, DEFAULT_CONCURRENCY_CONFIG.limit),
    activeTimeoutMs: positiveInteger(env.ACTIVE_SESSION_TIMEOUT_SECONDS, DEFAULT_CONCURRENCY_CONFIG.activeTimeoutMs / 1000) * 1000,
    queueTimeoutMs: positiveInteger(env.QUEUE_TIMEOUT_SECONDS, DEFAULT_CONCURRENCY_CONFIG.queueTimeoutMs / 1000) * 1000,
    alarmIntervalMs: Math.min(
      positiveInteger(env.CONCURRENCY_ALARM_SECONDS, DEFAULT_CONCURRENCY_CONFIG.alarmIntervalMs / 1000) * 1000,
      positiveInteger(env.ACTIVE_SESSION_TIMEOUT_SECONDS, DEFAULT_CONCURRENCY_CONFIG.activeTimeoutMs / 1000) * 1000,
      positiveInteger(env.QUEUE_TIMEOUT_SECONDS, DEFAULT_CONCURRENCY_CONFIG.queueTimeoutMs / 1000) * 1000
    )
  };
}

function normalizeState(value) {
  const source = value && typeof value === "object" ? value : {};
  const active = source.active && typeof source.active === "object" && !Array.isArray(source.active) ? source.active : {};
  const queue = Array.isArray(source.queue) ? source.queue : [];
  return {
    active: Object.fromEntries(Object.entries(active)
      .filter(([sessionId, entry]) => sessionId && Number.isFinite(Number(entry && entry.lastSeen)))
      .map(([sessionId, entry]) => [sessionId, { lastSeen: Number(entry.lastSeen) }])),
    queue: queue
      .filter((entry) => entry && entry.sessionId && Number.isFinite(Number(entry.lastSeen)))
      .map((entry) => ({ sessionId: String(entry.sessionId), joinedAt: Number(entry.joinedAt || entry.lastSeen), lastSeen: Number(entry.lastSeen) }))
  };
}

function cleanupExpired(state, now, config) {
  Object.keys(state.active).forEach((sessionId) => {
    if (now - Number(state.active[sessionId].lastSeen || 0) > config.activeTimeoutMs) delete state.active[sessionId];
  });
  const seen = new Set();
  state.queue = state.queue.filter((entry) => {
    if (state.active[entry.sessionId] || seen.has(entry.sessionId)) return false;
    seen.add(entry.sessionId);
    return now - Number(entry.lastSeen || 0) <= config.queueTimeoutMs;
  });
}

function promoteQueued(state, now, config) {
  while (Object.keys(state.active).length < config.limit && state.queue.length) {
    const next = state.queue.shift();
    if (!next || state.active[next.sessionId]) continue;
    state.active[next.sessionId] = { lastSeen: now };
  }
}

function sessionResult(state, sessionId, config) {
  const active = Object.keys(state.active).length;
  const queueIndex = state.queue.findIndex((entry) => entry.sessionId === sessionId);
  if (state.active[sessionId]) return { status: "admitted", active, limit: config.limit, waiting: state.queue.length };
  if (queueIndex !== -1) return { status: "queued", position: queueIndex + 1, active, limit: config.limit, waiting: state.queue.length };
  return { status: "required", active, limit: config.limit, waiting: state.queue.length };
}

export function applyConcurrencyAction(inputState, action, sessionId, now = Date.now(), config = DEFAULT_CONCURRENCY_CONFIG) {
  const state = normalizeState(inputState);
  const id = String(sessionId || "");
  cleanupExpired(state, now, config);
  promoteQueued(state, now, config);

  if (action === "enter" && id) {
    if (state.active[id]) state.active[id].lastSeen = now;
    else {
      const queued = state.queue.find((entry) => entry.sessionId === id);
      if (queued) queued.lastSeen = now;
      else state.queue.push({ sessionId: id, joinedAt: now, lastSeen: now });
    }
  } else if (action === "heartbeat" && id && state.active[id]) {
    state.active[id].lastSeen = now;
  } else if (action === "queue-heartbeat" && id) {
    const queued = state.queue.find((entry) => entry.sessionId === id);
    if (queued) queued.lastSeen = now;
    else if (state.active[id]) state.active[id].lastSeen = now;
  } else if (action === "release" && id) {
    delete state.active[id];
  } else if (action === "leave-queue" && id) {
    state.queue = state.queue.filter((entry) => entry.sessionId !== id);
  }

  cleanupExpired(state, now, config);
  promoteQueued(state, now, config);
  const result = action === "aggregate"
    ? { status: "ok", active: Object.keys(state.active).length, limit: config.limit, available: Math.max(0, config.limit - Object.keys(state.active).length), waiting: state.queue.length }
    : sessionResult(state, id, config);
  return { state, result };
}

export class ConcurrencyLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async apply(action, sessionId) {
    const config = concurrencyConfig(this.env);
    let output;
    await this.state.storage.transaction(async (transaction) => {
      const stored = await transaction.get(STATE_KEY);
      output = applyConcurrencyAction(stored, action, sessionId, Date.now(), config);
      if (Object.keys(output.state.active).length || output.state.queue.length) await transaction.put(STATE_KEY, output.state);
      else await transaction.delete(STATE_KEY);
    });
    if (Object.keys(output.state.active).length || output.state.queue.length) await this.state.storage.setAlarm(Date.now() + config.alarmIntervalMs);
    return output.result;
  }

  async dashboardLayout(action, layout) {
    if (action === "get-dashboard-layout") {
      return { layout: (await this.state.storage.get(DASHBOARD_LAYOUT_KEY)) || null };
    }
    if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
      return { error: "A valid dashboard layout is required." };
    }
    const serialized = JSON.stringify(layout);
    if (serialized.length > 80_000) return { error: "Dashboard layout is too large." };
    const saved = { ...layout, version: 1, updatedAt: new Date().toISOString() };
    await this.state.storage.put(DASHBOARD_LAYOUT_KEY, saved);
    return { layout: saved };
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid concurrency request." }, { status: 400 }); }
    const allowed = new Set(["enter", "check", "heartbeat", "queue-heartbeat", "release", "leave-queue", "aggregate", "get-dashboard-layout", "set-dashboard-layout"]);
    if (!allowed.has(body.action)) return Response.json({ error: "Unknown concurrency action." }, { status: 400 });
    if (body.action === "get-dashboard-layout" || body.action === "set-dashboard-layout") {
      const result = await this.dashboardLayout(body.action, body.layout);
      return Response.json(result, { status: result.error ? 400 : 200 });
    }
    return Response.json(await this.apply(body.action, body.sessionId));
  }

  async alarm() {
    await this.apply("aggregate", "");
  }
}
