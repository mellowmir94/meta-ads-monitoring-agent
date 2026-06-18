import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listSubscriptionRecords, summarizeSubscriptions, upsertSubscriptionRecord } from "../lib/subscription-store";

test("upserts subscription records by Stripe subscription id", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "applysharp-subscriptions-"));
  const storePath = path.join(directory, "subscriptions.json");

  try {
    const created = await upsertSubscriptionRecord(
      {
        plan: "PRO",
        status: "TRIALING",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1"
      },
      storePath
    );
    const updated = await upsertSubscriptionRecord(
      {
        plan: "PRO",
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        currentPeriodEnd: "2026-07-01T00:00:00.000Z"
      },
      storePath
    );
    const subscriptions = await listSubscriptionRecords(storePath);
    const summary = summarizeSubscriptions(subscriptions);

    assert.equal(created.id, updated.id);
    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].status, "ACTIVE");
    assert.equal(summary.total, 1);
    assert.equal(summary.active, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
