import { getAuthRequiredMessage, isApplySharpAuthRequired, type ApplySharpUserScope } from "./auth-context";
import { resolveServerUserScope } from "./auth-session";
import { hasPermission, type RoleName } from "./rbac";

export type AdminAuthorization =
  | {
      authorized: true;
      userScope: ApplySharpUserScope;
      role: RoleName;
    }
  | {
      authorized: false;
      userScope: ApplySharpUserScope | null;
      reason: string;
    };

export async function authorizeAdminRequest(headers: Headers, env: Partial<NodeJS.ProcessEnv> = process.env): Promise<AdminAuthorization> {
  const userScope = await resolveServerUserScope(headers, env);

  return resolveAdminAuthorizationForScope(userScope, env);
}

export function resolveAdminAuthorizationForScope(userScope: ApplySharpUserScope | null, env: Partial<NodeJS.ProcessEnv> = process.env): AdminAuthorization {
  if (!userScope) {
    return {
      authorized: false,
      userScope,
      reason: getAuthRequiredMessage()
    };
  }

  const role = resolveAdminRole(userScope, env);

  if (!role || !hasPermission(role, "admin:users")) {
    return {
      authorized: false,
      userScope,
      reason: "Admin access requires an Auth.js session whose email is listed in APPLYSHARP_ADMIN_EMAILS."
    };
  }

  return {
    authorized: true,
    userScope,
    role
  };
}

export function resolveAdminRole(userScope: ApplySharpUserScope, env: Partial<NodeJS.ProcessEnv> = process.env): RoleName | null {
  const adminEmails = parseAdminEmails(env.APPLYSHARP_ADMIN_EMAILS);

  if (adminEmails.length > 0) {
    return adminEmails.includes(userScope.email.toLowerCase()) ? "Owner" : null;
  }

  if (!isApplySharpAuthRequired(env) && (userScope.source === "demo-fallback" || userScope.source === "trusted-dev-header")) {
    return "Owner";
  }

  return null;
}

export function parseAdminEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}
