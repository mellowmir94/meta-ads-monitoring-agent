export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export const defaultApiRateLimit: RateLimitOptions = {
  limit: 120,
  windowMs: 60_000
};

const defaultJsonBytes = 1_000_000;

export function evaluateRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  now: number,
  options: RateLimitOptions = defaultApiRateLimit
): RateLimitResult {
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    store.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: options.limit - 1,
      resetAt,
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: options.limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSeconds: 0
  };
}

export function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "Cross-Origin-Opener-Policy": "same-origin"
  };
}

export function getMaxRequestBytes(pathname: string): number {
  if (pathname === "/api/telegram/webhook") {
    return 256_000;
  }

  return defaultJsonBytes;
}

export function isRequestTooLarge(contentLength: string | null, pathname: string): boolean {
  if (!contentLength) {
    return false;
  }

  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed > getMaxRequestBytes(pathname);
}

export function getClientKey(headers: Headers, fallback = "unknown"): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    fallback
  );
}

export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isAdminAuthorized(providedToken: string | null | undefined, configuredToken: string | undefined): boolean {
  if (!configuredToken) {
    return true;
  }

  return Boolean(providedToken && constantTimeEqual(providedToken, configuredToken));
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}
