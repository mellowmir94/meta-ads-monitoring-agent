import { getAuthRequiredMessage } from "@/lib/auth-context";
import { resolveServerUserScope } from "@/lib/auth-session";
import { resolveSubscriptionEntitlements } from "@/lib/entitlements";
import { listSubscriptions } from "@/lib/subscription-repository";
import { summarizeSubscriptions } from "@/lib/subscription-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userScope = await resolveServerUserScope(request.headers);

  if (!userScope) {
    return NextResponse.json({ error: getAuthRequiredMessage() }, { status: 401 });
  }

  const result = await listSubscriptions(userScope);

  return NextResponse.json({
    subscriptions: result.data,
    summary: summarizeSubscriptions(result.data),
    entitlements: resolveSubscriptionEntitlements(result.data),
    storage: result.storage,
    warning: result.warning,
    userScope: userScope.source,
    note: "Subscriptions are updated by Stripe checkout/webhook events. Local JSON is the first-user fallback."
  });
}
