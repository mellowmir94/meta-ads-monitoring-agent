import { executiveKpis } from "@/lib/seed-data";
import { assertPermission, type RoleName } from "@/lib/rbac";

export function getExecutiveKpisForRole(role: RoleName) {
  assertPermission(role, "kpi:read");
  return executiveKpis;
}

