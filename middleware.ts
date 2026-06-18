import { createRateLimitKey, evaluateApiRateLimit } from "@/lib/rate-limit";
import {
  defaultApiRateLimit,
  getClientKey,
  getSecurityHeaders,
  isAdminRoute,
  isAdminAuthorized,
  isRequestTooLarge,
  type RateLimitEntry
} from "@/lib/security";
import { NextRequest, NextResponse } from "next/server";

const rateLimitStore = new Map<string, RateLimitEntry>();

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && isRequestTooLarge(request.headers.get("content-length"), pathname)) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          error: "Request payload too large"
        },
        { status: 413 }
      )
    );
  }

  if (pathname.startsWith("/api/")) {
    const key = createRateLimitKey(getClientKey(request.headers), pathname);
    const result = await evaluateApiRateLimit({
      store: rateLimitStore,
      key,
      now: Date.now(),
      options: defaultApiRateLimit
    });

    if (!result.allowed) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            error: "Rate limit exceeded",
            retryAfterSeconds: result.retryAfterSeconds,
            storage: result.storage,
            warning: result.warning
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(result.retryAfterSeconds)
            }
          }
        )
      );
    }
  }

  if (isAdminRoute(pathname)) {
    const providedToken =
      request.headers.get("x-meta-ads-admin-token") ??
      request.cookies.get("meta_ads_admin_token")?.value;

    if (!isAdminAuthorized(providedToken, process.env.META_ADS_ADMIN_TOKEN)) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            error: "Admin access requires a valid Meta Ads admin token."
          },
          { status: 401 }
        )
      );
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/admin"]
};

function withSecurityHeaders(response: NextResponse) {
  for (const [header, value] of Object.entries(getSecurityHeaders())) {
    response.headers.set(header, value);
  }

  return response;
}
