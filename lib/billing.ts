import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingPlan = "FREE" | "PRO" | "TEAM" | "ENTERPRISE";
export type BillingStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export type StripeBillingConfig = {
  secretKey?: string;
  webhookSecret?: string;
  proPriceId?: string;
  appUrl: string;
};

export type StripeCheckoutInput = {
  customerEmail?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId?: string;
  metadata?: Record<string, string>;
};

export type StripePortalInput = {
  customerId: string;
  returnUrl: string;
};

export type StripeWebhookVerification = {
  valid: boolean;
  timestamp?: number;
  error?: string;
};

export function resolveStripeBillingConfig(env: Partial<NodeJS.ProcessEnv> = process.env): StripeBillingConfig {
  return {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    proPriceId: env.STRIPE_PRO_PRICE_ID,
    appUrl: env.NEXTAUTH_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  };
}

export function isStripeCheckoutConfigured(config: StripeBillingConfig): boolean {
  return Boolean(config.secretKey && config.proPriceId);
}

export function isStripePortalConfigured(config: StripeBillingConfig): boolean {
  return Boolean(config.secretKey);
}

export function buildStripeCheckoutSessionParams(input: StripeCheckoutInput): URLSearchParams {
  const params = new URLSearchParams();

  params.set("mode", "subscription");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("line_items[0][price]", input.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("allow_promotion_codes", "true");
  params.set("billing_address_collection", "auto");

  if (input.customerEmail) {
    params.set("customer_email", input.customerEmail);
  }
  if (input.clientReferenceId) {
    params.set("client_reference_id", input.clientReferenceId);
  }
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    params.set(`metadata[${key}]`, value);
  }

  return params;
}

export function buildStripePortalSessionParams(input: StripePortalInput): URLSearchParams {
  const params = new URLSearchParams();

  params.set("customer", input.customerId);
  params.set("return_url", input.returnUrl);

  return params;
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null, secret: string, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): StripeWebhookVerification {
  if (!signatureHeader) {
    return { valid: false, error: "Missing Stripe signature header." };
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key, value.join("=")];
    })
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;

  if (!Number.isFinite(timestamp) || !signature) {
    return { valid: false, error: "Invalid Stripe signature header." };
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, timestamp, error: "Stripe signature timestamp is outside tolerance." };
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const valid = safeEqualHex(expected, signature);

  return {
    valid,
    timestamp,
    error: valid ? undefined : "Stripe signature mismatch."
  };
}

export function normalizeStripeSubscriptionStatus(status: string | undefined): BillingStatus {
  if (status === "trialing") return "TRIALING";
  if (status === "active") return "ACTIVE";
  if (status === "past_due" || status === "unpaid" || status === "incomplete" || status === "incomplete_expired") return "PAST_DUE";

  return "CANCELED";
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
