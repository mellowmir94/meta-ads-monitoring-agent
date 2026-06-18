import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminEmails, resolveAdminAuthorizationForScope, resolveAdminRole } from "../lib/admin-authorization";

test("parses admin email allowlist safely", () => {
  assert.deepEqual(parseAdminEmails("Owner@Example.com, invalid, admin@example.com"), ["owner@example.com", "admin@example.com"]);
});

test("allows first-user demo admin only when auth is optional", () => {
  const scope = { email: "founder@applysharp.local", source: "demo-fallback" as const };

  assert.equal(resolveAdminRole(scope, { APPLYSHARP_REQUIRE_AUTH: "false" }), "Owner");
  assert.equal(resolveAdminRole(scope, { APPLYSHARP_REQUIRE_AUTH: "true" }), null);
});

test("allows Auth.js admin sessions only for allowlisted emails", () => {
  const allowedScope = { email: "owner@example.com", source: "authjs-session" as const };
  const deniedScope = { email: "viewer@example.com", source: "authjs-session" as const };
  const env = {
    APPLYSHARP_REQUIRE_AUTH: "true",
    APPLYSHARP_ADMIN_EMAILS: "owner@example.com"
  };

  assert.equal(resolveAdminAuthorizationForScope(allowedScope, env).authorized, true);
  assert.equal(resolveAdminAuthorizationForScope(deniedScope, env).authorized, false);
});
