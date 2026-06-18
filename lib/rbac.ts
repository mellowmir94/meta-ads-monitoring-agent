export const roles = [
  "Owner",
  "Admin",
  "Executive",
  "Finance Manager",
  "Sales Manager",
  "Operations Manager",
  "HR Manager",
  "Procurement Manager",
  "Support Manager",
  "Viewer"
] as const;

export type RoleName = (typeof roles)[number];

export const permissions = [
  "dashboard:read",
  "dataset:upload",
  "dataset:map",
  "kpi:read",
  "ai:chat",
  "admin:users",
  "audit:read",
  "finance:read",
  "sales:read",
  "operations:read",
  "hr:read",
  "procurement:read",
  "support:read"
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<RoleName, Permission[]> = {
  Owner: [...permissions],
  Admin: [...permissions],
  Executive: [
    "dashboard:read",
    "kpi:read",
    "ai:chat",
    "finance:read",
    "sales:read",
    "operations:read",
    "hr:read",
    "procurement:read",
    "support:read"
  ],
  "Finance Manager": ["dashboard:read", "dataset:upload", "dataset:map", "kpi:read", "ai:chat", "finance:read"],
  "Sales Manager": ["dashboard:read", "dataset:upload", "dataset:map", "kpi:read", "ai:chat", "sales:read"],
  "Operations Manager": ["dashboard:read", "dataset:upload", "dataset:map", "kpi:read", "ai:chat", "operations:read"],
  "HR Manager": ["dashboard:read", "dataset:upload", "dataset:map", "kpi:read", "ai:chat", "hr:read"],
  "Procurement Manager": ["dashboard:read", "dataset:upload", "dataset:map", "kpi:read", "ai:chat", "procurement:read"],
  "Support Manager": ["dashboard:read", "dataset:upload", "dataset:map", "kpi:read", "ai:chat", "support:read"],
  Viewer: ["dashboard:read", "kpi:read"]
};

export function hasPermission(role: RoleName, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function assertPermission(role: RoleName, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new Error(`Role ${role} cannot perform ${permission}`);
  }
}
