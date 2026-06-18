import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPermission } from "@/lib/rbac";
import { tenantWhere } from "@/lib/tenant";

test("Owner has admin user permission", () => {
  assert.equal(hasPermission("Owner", "admin:users"), true);
});

test("Viewer cannot upload datasets", () => {
  assert.equal(hasPermission("Viewer", "dataset:upload"), false);
});

test("tenantWhere always applies the server tenant id", () => {
  const scoped = tenantWhere(
    { tenantId: "tenant_a", userId: "user_1", role: "Executive" },
    { branch: "Johor" }
  );

  assert.deepEqual(scoped, { branch: "Johor", tenantId: "tenant_a" });
});

