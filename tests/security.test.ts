import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRateLimit,
  getClientKey,
  getMaxRequestBytes,
  getSecurityHeaders,
  isAdminAuthorized,
  isProtectedUserApiRoute,
  isRequestTooLarge,
  type RateLimitEntry
} from "../lib/security";

test("allows requests within the rate limit and blocks after the limit", () => {
  const store = new Map<string, RateLimitEntry>();
  const options = { limit: 2, windowMs: 1_000 };

  assert.equal(evaluateRateLimit(store, "client:/api/test", 100, options).allowed, true);
  assert.equal(evaluateRateLimit(store, "client:/api/test", 200, options).allowed, true);
  const blocked = evaluateRateLimit(store, "client:/api/test", 300, options);

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test("resets rate limit windows after expiry", () => {
  const store = new Map<string, RateLimitEntry>();
  const options = { limit: 1, windowMs: 1_000 };

  assert.equal(evaluateRateLimit(store, "client", 0, options).allowed, true);
  assert.equal(evaluateRateLimit(store, "client", 999, options).allowed, false);
  assert.equal(evaluateRateLimit(store, "client", 1_001, options).allowed, true);
});

test("enforces different request size limits for upload and JSON APIs", () => {
  assert.equal(getMaxRequestBytes("/api/resumes/upload"), 8 * 1024 * 1024);
  assert.equal(isRequestTooLarge("2000000", "/api/jobs/analyze"), true);
  assert.equal(isRequestTooLarge("2000000", "/api/resumes/upload"), false);
  assert.equal(isRequestTooLarge(null, "/api/jobs/analyze"), false);
});

test("extracts stable client key from proxy headers", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.10, 10.0.0.1"
  });

  assert.equal(getClientKey(headers), "203.0.113.10");
});

test("admin token check is optional until configured and strict when configured", () => {
  assert.equal(isAdminAuthorized(undefined, undefined), true);
  assert.equal(isAdminAuthorized("wrong", "secret"), false);
  assert.equal(isAdminAuthorized("secret", "secret"), true);
});

test("security headers include browser hardening controls", () => {
  const headers = getSecurityHeaders();

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors/);
});

test("protected user API route classifier excludes health and Stripe webhook", () => {
  assert.equal(isProtectedUserApiRoute("/api/applications"), true);
  assert.equal(isProtectedUserApiRoute("/api/resumes/upload"), true);
  assert.equal(isProtectedUserApiRoute("/api/jobs/search"), true);
  assert.equal(isProtectedUserApiRoute("/api/billing/portal"), true);
  assert.equal(isProtectedUserApiRoute("/api/visual-requests"), true);
  assert.equal(isProtectedUserApiRoute("/api/billing/webhook"), false);
  assert.equal(isProtectedUserApiRoute("/api/health"), false);
  assert.equal(isProtectedUserApiRoute("/dashboard"), false);
});
