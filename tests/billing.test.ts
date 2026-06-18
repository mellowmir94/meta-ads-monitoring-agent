import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  buildStripeCheckoutSessionParams,
  buildStripePortalSessionParams,
  isStripeCheckoutConfigured,
  isStripePortalConfigured,
  normalizeStripeSubscriptionStatus,
  resolveStripeBillingConfig,
  verifyStripeWebhookSignature
} from "../lib/billing";

test("resolves Stripe billing config and detects required checkout env", () => {
  const config = resolveStripeBillingConfig({
    STRIPE_SECRET_KEY: "sk_test_key",
    STRIPE_PRO_PRICE_ID: "price_pro",
    NEXTAUTH_URL: "https://applysharp.example"
  });

  assert.equal(config.secretKey, "sk_test_key");
  assert.equal(config.proPriceId, "price_pro");
  assert.equal(config.appUrl, "https://applysharp.example");
  assert.equal(isStripeCheckoutConfigured(config), true);
  assert.equal(isStripePortalConfigured(config), true);
  assert.equal(isStripeCheckoutConfigured({ appUrl: "http://localhost:3000" }), false);
  assert.equal(isStripePortalConfigured({ appUrl: "http://localhost:3000" }), false);
});

test("builds Stripe checkout session form params for subscription mode", () => {
  const params = buildStripeCheckoutSessionParams({
    customerEmail: "founder@example.com",
    priceId: "price_pro",
    successUrl: "https://app.example/success",
    cancelUrl: "https://app.example/cancel",
    clientReferenceId: "founder@example.com",
    metadata: { app: "applysharp", plan: "PRO" }
  });

  assert.equal(params.get("mode"), "subscription");
  assert.equal(params.get("line_items[0][price]"), "price_pro");
  assert.equal(params.get("customer_email"), "founder@example.com");
  assert.equal(params.get("metadata[app]"), "applysharp");
});

test("builds Stripe billing portal session form params", () => {
  const params = buildStripePortalSessionParams({
    customerId: "cus_test",
    returnUrl: "https://app.example/dashboard"
  });

  assert.equal(params.get("customer"), "cus_test");
  assert.equal(params.get("return_url"), "https://app.example/dashboard");
});

test("verifies Stripe webhook signatures with timestamp tolerance", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const secret = "whsec_test";
  const timestamp = 1_780_000_000;
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(verifyStripeWebhookSignature(payload, header, secret, 300, timestamp).valid, true);
  assert.equal(verifyStripeWebhookSignature(payload, header, "wrong", 300, timestamp).valid, false);
  assert.equal(verifyStripeWebhookSignature(payload, header, secret, 300, timestamp + 301).valid, false);
});

test("normalizes Stripe subscription statuses into internal statuses", () => {
  assert.equal(normalizeStripeSubscriptionStatus("trialing"), "TRIALING");
  assert.equal(normalizeStripeSubscriptionStatus("active"), "ACTIVE");
  assert.equal(normalizeStripeSubscriptionStatus("past_due"), "PAST_DUE");
  assert.equal(normalizeStripeSubscriptionStatus("canceled"), "CANCELED");
});
