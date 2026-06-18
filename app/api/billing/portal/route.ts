import { buildStripePortalSessionParams, isStripePortalConfigured, resolveStripeBillingConfig } from "@/lib/billing";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const portalSchema = z.object({
  stripeCustomerId: z.string().min(3).max(200)
});

export async function POST(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const parsed = portalSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid billing portal payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const config = resolveStripeBillingConfig();

  if (!isStripePortalConfigured(config)) {
    return NextResponse.json(
      {
        error: "Stripe billing portal is not configured.",
        requiredEnv: ["STRIPE_SECRET_KEY"]
      },
      { status: 503 }
    );
  }

  const params = buildStripePortalSessionParams({
    customerId: parsed.data.stripeCustomerId,
    returnUrl: `${config.appUrl}/dashboard?billing=portal-return`
  });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      {
        error: payload?.error?.message ?? "Stripe billing portal session creation failed."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    portalUrl: payload.url,
    sessionId: payload.id,
    requiresRedirect: true,
    userScope: userScope.source
  });
}
