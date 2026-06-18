import assert from "node:assert/strict";
import test from "node:test";

import { runMetaAdsSetupCheck } from "@/lib/meta-ads/setup-check";

test("setup check reports missing required Meta Ads configuration without exposing values", () => {
  const result = runMetaAdsSetupCheck("C:\\definitely-not-a-real-project-path", {});

  assert.equal(result.ok, false);
  assert.ok(result.items.some((item) => item.name === ".env file" && !item.ok));
  assert.ok(result.items.some((item) => item.name === "DATABASE_URL" && !item.ok));
  assert.ok(result.nextActions.some((action) => action.includes("DATABASE_URL")));
});

test("setup check passes when required env vars exist", () => {
  const result = runMetaAdsSetupCheck("C:\\definitely-not-a-real-project-path", {
    DATABASE_URL: "postgresql://example",
    META_ACCESS_TOKEN: "meta-token",
    META_AD_ACCOUNT_ID: "act_123",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_CHAT_ID: "123"
  });

  assert.equal(result.items.find((item) => item.name === "DATABASE_URL")?.ok, true);
  assert.equal(result.items.find((item) => item.name === "META_ACCESS_TOKEN")?.ok, true);
});
