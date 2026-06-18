import assert from "node:assert/strict";
import test from "node:test";
import {
  createRateLimitKey,
  evaluateApiRateLimit,
  evaluateRedisFixedWindowRateLimit,
  getRateLimitStorageMode,
  resolveRedisRateLimitConfig
} from "../lib/rate-limit";
import type { RateLimitEntry } from "../lib/security";

test("resolves Redis rate limit config only when REST URL and token are present", () => {
  const missing = resolveRedisRateLimitConfig({});
  const configured = resolveRedisRateLimitConfig({
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "token",
    APPLYSHARP_RATE_LIMIT_NAMESPACE: "ApplySharp Prod"
  });

  assert.equal(missing.enabled, false);
  assert.equal(getRateLimitStorageMode(missing), "memory");
  assert.equal(configured.enabled, true);
  assert.equal(configured.namespace, "applysharp-prod");
  assert.equal(getRateLimitStorageMode(configured), "redis");
});

test("uses memory rate limiting when Redis is not configured", async () => {
  const store = new Map<string, RateLimitEntry>();
  const options = { limit: 1, windowMs: 1_000 };
  const key = createRateLimitKey("client", "/api/test");

  const first = await evaluateApiRateLimit({ store, key, now: 0, options, env: {} });
  const second = await evaluateApiRateLimit({ store, key, now: 100, options, env: {} });

  assert.equal(first.storage, "memory");
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.retryAfterSeconds, 1);
});

test("uses Redis fixed-window bucket through REST pipeline", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body);

    return new Response(JSON.stringify([{ result: 2 }, { result: "OK" }]), { status: 200 });
  };
  const result = await evaluateRedisFixedWindowRateLimit(
    {
      enabled: true,
      restUrl: "https://redis.example/",
      token: "token",
      namespace: "applysharp",
      failClosed: false
    },
    "client:/api/jobs/search",
    1_200,
    { limit: 3, windowMs: 1_000 },
    fetcher
  );
  const commands = JSON.parse(capturedBody) as unknown[][];

  assert.equal(capturedUrl, "https://redis.example/pipeline");
  assert.equal(commands[0][0], "INCR");
  assert.equal(commands[1][0], "PEXPIRE");
  assert.match(String(commands[0][1]), /^applysharp:rate:1:client:\/api\/jobs\/search$/);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 1);
  assert.equal(result.resetAt, 2_000);
});

test("falls back to memory when Redis fails unless fail-closed is enabled", async () => {
  const store = new Map<string, RateLimitEntry>();
  const fetcher: typeof fetch = async () => new Response("bad", { status: 500 });
  const env = {
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "token"
  };
  const fallback = await evaluateApiRateLimit({
    store,
    key: "client:/api/test",
    now: 0,
    options: { limit: 1, windowMs: 1_000 },
    env,
    fetcher
  });
  const failClosed = await evaluateApiRateLimit({
    store,
    key: "client:/api/test",
    now: 100,
    options: { limit: 1, windowMs: 1_000 },
    env: { ...env, APPLYSHARP_RATE_LIMIT_FAIL_CLOSED: "true" },
    fetcher
  });

  assert.equal(fallback.storage, "redis-fallback-memory");
  assert.equal(fallback.allowed, true);
  assert.match(fallback.warning ?? "", /HTTP 500/);
  assert.equal(failClosed.storage, "redis");
  assert.equal(failClosed.allowed, false);
  assert.match(failClosed.warning ?? "", /HTTP 500/);
});
