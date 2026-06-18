import type { Subscription as PrismaSubscription } from "@prisma/client";
import { type ApplySharpUserScope, getDemoUserScope } from "./auth-context";
import type { BillingPlan, BillingStatus } from "./billing";
import {
  type SubscriptionRecord,
  type SubscriptionSnapshotInput,
  listSubscriptionRecords,
  upsertSubscriptionRecord
} from "./subscription-store";
import { prisma } from "./prisma";

export type SubscriptionRepositoryMode = "local-json" | "prisma" | "prisma-fallback-local-json";

export type SubscriptionRepositoryResult<T> = {
  data: T;
  storage: SubscriptionRepositoryMode;
  warning?: string;
};

export function shouldUsePrismaSubscriptionStore(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.APPLYSHARP_SUBSCRIPTION_STORE === "prisma";
}

export async function listSubscriptions(userScope?: ApplySharpUserScope): Promise<SubscriptionRepositoryResult<SubscriptionRecord[]>> {
  if (!shouldUsePrismaSubscriptionStore()) {
    return { data: await listSubscriptionRecords(), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope);
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" }
    });

    return {
      data: subscriptions.map(mapPrismaSubscriptionToRecord),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await listSubscriptionRecords(),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma subscription list failed."
    };
  }
}

export async function upsertSubscription(input: SubscriptionSnapshotInput, userScope?: ApplySharpUserScope): Promise<SubscriptionRepositoryResult<SubscriptionRecord>> {
  if (!shouldUsePrismaSubscriptionStore()) {
    return { data: await upsertSubscriptionRecord(input), storage: "local-json" };
  }

  try {
    const user = await getOrCreatePrismaUser(userScope ?? (input.userEmail ? { email: input.userEmail, source: "stripe-webhook" } : undefined));
    const subscriptionId = input.stripeSubscriptionId || input.stripeCustomerId || `${user.id}-${input.plan}`;
    const subscription = await prisma.subscription.upsert({
      where: { id: subscriptionId },
      update: {
        plan: input.plan,
        status: input.status,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : undefined
      },
      create: {
        id: subscriptionId,
        userId: user.id,
        plan: input.plan,
        status: input.status,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : undefined
      }
    });

    return {
      data: mapPrismaSubscriptionToRecord(subscription),
      storage: "prisma"
    };
  } catch (error) {
    return {
      data: await upsertSubscriptionRecord(input),
      storage: "prisma-fallback-local-json",
      warning: error instanceof Error ? error.message : "Prisma subscription upsert failed."
    };
  }
}

export function mapPrismaSubscriptionToRecord(subscription: PrismaSubscription): SubscriptionRecord {
  return {
    id: subscription.id,
    plan: subscription.plan as BillingPlan,
    status: subscription.status as BillingStatus,
    stripeCustomerId: subscription.stripeCustomerId ?? undefined,
    stripeSubscriptionId: subscription.stripeSubscriptionId ?? undefined,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString()
  };
}

async function getOrCreatePrismaUser(userScope?: ApplySharpUserScope) {
  const scope = userScope ?? getDemoUserScope();

  return prisma.user.upsert({
    where: { email: scope.email },
    update: scope.name ? { name: scope.name } : {},
    create: {
      email: scope.email,
      name: scope.name
    }
  });
}
