export type ApplySharpUserScopeSource = "authjs-session" | "demo-fallback" | "trusted-dev-header" | "stripe-webhook";

export type ApplySharpUserScope = {
  email: string;
  name?: string;
  source: ApplySharpUserScopeSource;
};

export function isApplySharpAuthRequired(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.APPLYSHARP_REQUIRE_AUTH === "true";
}

export function isTrustedDevUserHeaderEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.APPLYSHARP_TRUST_DEV_USER_HEADER === "true";
}

export function getDemoUserScope(env: Partial<NodeJS.ProcessEnv> = process.env): ApplySharpUserScope {
  return {
    email: normalizeEmail(env.APPLYSHARP_DEMO_USER_EMAIL) ?? "founder@applysharp.local",
    name: "ApplySharp Founder",
    source: "demo-fallback"
  };
}

export function resolveRequestUserScope(headers: Headers, env: Partial<NodeJS.ProcessEnv> = process.env): ApplySharpUserScope | null {
  const devEmail = normalizeEmail(headers.get("x-applysharp-user-email") ?? undefined);

  if (devEmail && isTrustedDevUserHeaderEnabled(env)) {
    return {
      email: devEmail,
      name: cleanHeaderValue(headers.get("x-applysharp-user-name") ?? undefined),
      source: "trusted-dev-header"
    };
  }

  if (isApplySharpAuthRequired(env)) {
    return null;
  }

  return getDemoUserScope(env);
}

export function resolveStripeWebhookUserScope(email: string | undefined, env: Partial<NodeJS.ProcessEnv> = process.env): ApplySharpUserScope {
  return {
    ...getDemoUserScope(env),
    ...(normalizeEmail(email) ? { email: normalizeEmail(email), source: "stripe-webhook" as const } : {})
  };
}

export function getAuthRequiredMessage(): string {
  return "Authentication is required. Wire Auth.js session resolution or disable APPLYSHARP_REQUIRE_AUTH for first-user local mode.";
}

function normalizeEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function cleanHeaderValue(value: string | undefined): string | undefined {
  const text = value?.trim();

  return text ? text.slice(0, 120) : undefined;
}
