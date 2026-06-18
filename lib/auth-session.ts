import { auth } from "@/auth";
import {
  getDemoUserScope,
  isApplySharpAuthRequired,
  resolveRequestUserScope,
  type ApplySharpUserScope
} from "./auth-context";

export async function resolveServerUserScope(headers: Headers, env: Partial<NodeJS.ProcessEnv> = process.env): Promise<ApplySharpUserScope | null> {
  const sessionScope = await resolveAuthJsSessionScope();

  if (sessionScope) {
    return sessionScope;
  }

  const trustedHeaderScope = resolveRequestUserScope(headers, { ...env, APPLYSHARP_REQUIRE_AUTH: "true" });

  if (trustedHeaderScope) {
    return trustedHeaderScope;
  }

  if (isApplySharpAuthRequired(env)) {
    return null;
  }

  return getDemoUserScope(env);
}

async function resolveAuthJsSessionScope(): Promise<ApplySharpUserScope | null> {
  try {
    const session = await auth();
    const user = session?.user;
    const email = user?.email?.trim().toLowerCase();

    if (!email) {
      return null;
    }

    return {
      email,
      name: user?.name ?? undefined,
      source: "authjs-session"
    };
  } catch {
    return null;
  }
}
