import assert from "node:assert/strict";
import test from "node:test";
import { isWithinMonthlyEntitlement, resolveSubscriptionEntitlements } from "../lib/entitlements";
import type { SubscriptionRecord } from "../lib/subscription-store";

const timestamp = "2026-06-08T00:00:00.000Z";

test("falls back to free entitlements without an active subscription", () => {
  const entitlements = resolveSubscriptionEntitlements([]);

  assert.equal(entitlements.plan, "FREE");
  assert.equal(entitlements.active, false);
  assert.equal(entitlements.maxSavedJobs, 10);
  assert.equal(entitlements.maxTailoredResumesPerMonth, 3);
});

test("selects the highest active subscription plan for entitlements", () => {
  const subscriptions: SubscriptionRecord[] = [
    {
      id: "sub_canceled",
      plan: "ENTERPRISE",
      status: "CANCELED",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: "sub_pro",
      plan: "PRO",
      status: "ACTIVE",
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];
  const entitlements = resolveSubscriptionEntitlements(subscriptions);

  assert.equal(entitlements.plan, "PRO");
  assert.equal(entitlements.active, true);
  assert.equal(entitlements.maxAiAnalysesPerMonth, 250);
  assert.equal(isWithinMonthlyEntitlement(249, entitlements.maxAiAnalysesPerMonth), true);
  assert.equal(isWithinMonthlyEntitlement(250, entitlements.maxAiAnalysesPerMonth), false);
});
