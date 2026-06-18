import type { BillingPlan, BillingStatus } from "./billing";
import type { SubscriptionRecord } from "./subscription-store";

export type SubscriptionEntitlements = {
  plan: BillingPlan;
  status: BillingStatus;
  active: boolean;
  maxSavedJobs: number;
  maxTailoredResumesPerMonth: number;
  maxAiAnalysesPerMonth: number;
  pdfDownloads: boolean;
  directApplyLinks: boolean;
  teamSeats: number;
};

const planRank: Record<BillingPlan, number> = {
  FREE: 0,
  PRO: 1,
  TEAM: 2,
  ENTERPRISE: 3
};

const entitlementByPlan: Record<BillingPlan, Omit<SubscriptionEntitlements, "plan" | "status" | "active">> = {
  FREE: {
    maxSavedJobs: 10,
    maxTailoredResumesPerMonth: 3,
    maxAiAnalysesPerMonth: 10,
    pdfDownloads: true,
    directApplyLinks: true,
    teamSeats: 1
  },
  PRO: {
    maxSavedJobs: 200,
    maxTailoredResumesPerMonth: 80,
    maxAiAnalysesPerMonth: 250,
    pdfDownloads: true,
    directApplyLinks: true,
    teamSeats: 1
  },
  TEAM: {
    maxSavedJobs: 1000,
    maxTailoredResumesPerMonth: 300,
    maxAiAnalysesPerMonth: 1000,
    pdfDownloads: true,
    directApplyLinks: true,
    teamSeats: 5
  },
  ENTERPRISE: {
    maxSavedJobs: 5000,
    maxTailoredResumesPerMonth: 2000,
    maxAiAnalysesPerMonth: 5000,
    pdfDownloads: true,
    directApplyLinks: true,
    teamSeats: 50
  }
};

export function resolveSubscriptionEntitlements(subscriptions: SubscriptionRecord[]): SubscriptionEntitlements {
  const activeSubscription = subscriptions
    .filter((subscription) => subscription.status === "ACTIVE" || subscription.status === "TRIALING")
    .sort((left, right) => planRank[right.plan] - planRank[left.plan] || right.updatedAt.localeCompare(left.updatedAt))[0];
  const plan = activeSubscription?.plan ?? "FREE";
  const status = activeSubscription?.status ?? "CANCELED";

  return {
    plan,
    status,
    active: Boolean(activeSubscription),
    ...entitlementByPlan[plan]
  };
}

export function isWithinMonthlyEntitlement(used: number, limit: number): boolean {
  return used < limit;
}
