import { resolveStripeWebhookUserScope } from "@/lib/auth-context";
import { normalizeStripeSubscriptionStatus, resolveStripeBillingConfig, verifyStripeWebhookSignature } from "@/lib/billing";
import { upsertSubscription } from "@/lib/subscription-repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StripeEvent = {
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

export async function POST(request: Request) {
  const config = resolveStripeBillingConfig();

  if (!config.webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook secret is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const verification = verifyStripeWebhookSignature(payload, request.headers.get("stripe-signature"), config.webhookSecret);

  if (!verification.valid) {
    return NextResponse.json({ error: verification.error ?? "Invalid Stripe webhook signature." }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeEvent;
  const subscriptionInput = extractSubscriptionInput(event);
  const subscriptionResult = subscriptionInput ? await upsertSubscription(subscriptionInput, resolveStripeWebhookUserScope(subscriptionInput.userEmail)) : null;

  return NextResponse.json({
    received: true,
    eventType: event.type,
    subscription: subscriptionResult?.data,
    storage: subscriptionResult?.storage,
    warning: subscriptionResult?.warning
  });
}

function extractSubscriptionInput(event: StripeEvent) {
  const object = event.data?.object;

  if (!object) {
    return null;
  }

  if (event.type === "checkout.session.completed") {
    return {
      plan: "PRO" as const,
      status: "ACTIVE" as const,
      userEmail: extractUserEmail(object),
      stripeCustomerId: asString(object.customer),
      stripeSubscriptionId: asString(object.subscription)
    };
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    return {
      plan: "PRO" as const,
      status: event.type === "customer.subscription.deleted" ? ("CANCELED" as const) : normalizeStripeSubscriptionStatus(asString(object.status)),
      userEmail: extractUserEmail(object),
      stripeCustomerId: asString(object.customer),
      stripeSubscriptionId: asString(object.id),
      currentPeriodEnd: typeof object.current_period_end === "number" ? new Date(object.current_period_end * 1000).toISOString() : undefined
    };
  }

  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function extractUserEmail(object: Record<string, unknown>): string | undefined {
  const metadata = object.metadata && typeof object.metadata === "object" ? (object.metadata as Record<string, unknown>) : {};
  const customerDetails = object.customer_details && typeof object.customer_details === "object" ? (object.customer_details as Record<string, unknown>) : {};

  return asString(metadata.userEmail) ?? asString(object.customer_email) ?? asString(customerDetails.email);
}
