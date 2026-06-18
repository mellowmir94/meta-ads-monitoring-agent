import { buildStripeCheckoutSessionParams, isStripeCheckoutConfigured, resolveStripeBillingConfig } from "@/lib/billing";
import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  customerEmail: z.string().email().optional(),
  plan: z.enum(["PRO"]).default("PRO")
});

export async function POST(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid checkout payload",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const config = resolveStripeBillingConfig();

  if (!isStripeCheckoutConfigured(config)) {
    return NextResponse.json(
      {
        error: "Stripe checkout is not configured.",
        requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_PRO_PRICE_ID"]
      },
      { status: 503 }
    );
  }

  const params = buildStripeCheckoutSessionParams({
    customerEmail: parsed.data.customerEmail ?? userScope.email,
    priceId: config.proPriceId!,
    successUrl: `${config.appUrl}/dashboard?checkout=success`,
    cancelUrl: `${config.appUrl}/dashboard?checkout=cancelled`,
    clientReferenceId: userScope.email,
    metadata: {
      app: "applysharp",
      plan: parsed.data.plan,
      userEmail: userScope.email
    }
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
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
        error: payload?.error?.message ?? "Stripe checkout session creation failed."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    checkoutUrl: payload.url,
    sessionId: payload.id,
    requiresRedirect: true,
    userScope: userScope.source
  });
}
