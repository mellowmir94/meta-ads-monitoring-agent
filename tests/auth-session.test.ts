import assert from "node:assert/strict";
import test from "node:test";
import { resolveServerUserScope } from "../lib/auth-session";

test("server resolver falls back to demo scope when auth is optional", async () => {
  const scope = await resolveServerUserScope(new Headers(), {
    APPLYSHARP_DEMO_USER_EMAIL: "Founder@ApplySharp.Local",
    APPLYSHARP_REQUIRE_AUTH: "false"
  });

  assert.equal(scope?.email, "founder@applysharp.local");
  assert.equal(scope?.source, "demo-fallback");
});

test("server resolver returns null when auth is required and no session or trusted header exists", async () => {
  const scope = await resolveServerUserScope(new Headers(), {
    APPLYSHARP_REQUIRE_AUTH: "true",
    APPLYSHARP_TRUST_DEV_USER_HEADER: "false"
  });

  assert.equal(scope, null);
});

test("server resolver accepts trusted dev header while auth is required", async () => {
  const headers = new Headers({
    "x-applysharp-user-email": "Amir@example.com",
    "x-applysharp-user-name": "Amir Khalil"
  });
  const scope = await resolveServerUserScope(headers, {
    APPLYSHARP_REQUIRE_AUTH: "true",
    APPLYSHARP_TRUST_DEV_USER_HEADER: "true"
  });

  assert.equal(scope?.email, "amir@example.com");
  assert.equal(scope?.name, "Amir Khalil");
  assert.equal(scope?.source, "trusted-dev-header");
});
