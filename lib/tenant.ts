import type { RoleName } from "@/lib/rbac";

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: RoleName;
};

export function resolveDemoTenantContext(): TenantContext {
  return {
    tenantId: "tenant_klang_valley_trading",
    userId: "user_demo_executive",
    role: "Executive"
  };
}

export function tenantWhere<T extends object>(context: TenantContext, where?: T) {
  return {
    ...where,
    tenantId: context.tenantId
  };
}

