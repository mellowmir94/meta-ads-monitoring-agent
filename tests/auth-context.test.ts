import assert from "node:assert/strict";
import test from "node:test";
import {
  getDemoUserScope,
  isApplySharpAuthRequired,
  resolveRequestUserScope,
  resolveStripeWebhookUserScope
} from "../lib/auth-context";

test("uses first-user demo scope when auth is not required", () => {
  const scope = resolveRequestUserScope(new Headers(), {
    APPLYSHARP_DEMO_USER_EMAIL: "Founder@ApplySharp.Local",
    APPLYSHARP_REQUIRE_AUTH: "false"
  });

  assert.equal(scope?.email, "founder@applysharp.local");
  assert.equal(scope?.source, "demo-fallback");
  assert.equal(getDemoUserScope({ APPLYSHARP_DEMO_USER_EMAIL: "owner@example.com" }).email, "owner@example.com");
});

test("returns null when auth is required and no trusted resolver is available", () => {
  const scope = resolveRequestUserScope(new Headers(), {
    APPLYSHARP_REQUIRE_AUTH: "true",
    APPLYSHARP_TRUST_DEV_USER_HEADER: "false"
  });

  assert.equal(isApplySharpAuthRequired({ APPLYSHARP_REQUIRE_AUTH: "true" }), true);
  assert.equal(scope, null);
});

test("trusts dev user headers only when explicitly enabled", () => {
  const headers = new Headers({
    "x-applysharp-user-email": "Amir@example.com",
    "x-applysharp-user-name": "Amir Khalil"
  });
  const disabled = resolveRequestUserScope(headers, {
    APPLYSHARP_REQUIRE_AUTH: "false",
    APPLYSHARP_TRUST_DEV_USER_HEADER: "false"
  });
  const enabled = resolveRequestUserScope(headers, {
    APPLYSHARP_REQUIRE_AUTH: "true",
    APPLYSHARP_TRUST_DEV_USER_HEADER: "true"
  });

  assert.equal(disabled?.source, "demo-fallback");
  assert.equal(enabled?.email, "amir@example.com");
  assert.equal(enabled?.name, "Amir Khalil");
  assert.equal(enabled?.source, "trusted-dev-header");
});

test("resolves Stripe webhook user scope from metadata email when present", () => {
  const scope = resolveStripeWebhookUserScope("Billing@Example.com", {
    APPLYSHARP_DEMO_USER_EMAIL: "fallback@example.com"
  });
  const fallback = resolveStripeWebhookUserScope(undefined, {
    APPLYSHARP_DEMO_USER_EMAIL: "fallback@example.com"
  });

  assert.equal(scope.email, "billing@example.com");
  assert.equal(scope.source, "stripe-webhook");
  assert.equal(fallback.email, "fallback@example.com");
  assert.equal(fallback.source, "demo-fallback");
});
