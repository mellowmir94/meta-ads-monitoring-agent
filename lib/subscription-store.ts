import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BillingPlan, BillingStatus } from "./billing";

export type SubscriptionSnapshotInput = {
  plan: BillingPlan;
  status: BillingStatus;
  userEmail?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
};

export type SubscriptionRecord = SubscriptionSnapshotInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionStore = {
  subscriptions: SubscriptionRecord[];
};

export type SubscriptionSummary = {
  total: number;
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
};

export const subscriptionStoreVersion = 1;

export function getSubscriptionStorePath(): string {
  return path.join(process.cwd(), ".applysharp-data", "subscriptions.json");
}

export function createSubscriptionRecord(input: SubscriptionSnapshotInput, now = new Date()): SubscriptionRecord {
  const timestamp = now.toISOString();

  return {
    ...input,
    id: `${input.stripeSubscriptionId || input.stripeCustomerId || input.plan.toLowerCase()}-${now.getTime()}`,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function listSubscriptionRecords(storePath = getSubscriptionStorePath()): Promise<SubscriptionRecord[]> {
  const store = await readSubscriptionStore(storePath);

  return store.subscriptions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function upsertSubscriptionRecord(input: SubscriptionSnapshotInput, storePath = getSubscriptionStorePath()): Promise<SubscriptionRecord> {
  const store = await readSubscriptionStore(storePath);
  const existing = store.subscriptions.find((subscription) =>
    Boolean(
      (input.stripeSubscriptionId && subscription.stripeSubscriptionId === input.stripeSubscriptionId) ||
        (input.stripeCustomerId && subscription.stripeCustomerId === input.stripeCustomerId)
    )
  );

  if (existing) {
    Object.assign(existing, input, { updatedAt: new Date().toISOString() });
    await writeSubscriptionStore(store, storePath);

    return existing;
  }

  const record = createSubscriptionRecord(input);
  store.subscriptions = [record, ...store.subscriptions];
  await writeSubscriptionStore(store, storePath);

  return record;
}

export function summarizeSubscriptions(subscriptions: SubscriptionRecord[]): SubscriptionSummary {
  return {
    total: subscriptions.length,
    active: subscriptions.filter((subscription) => subscription.status === "ACTIVE").length,
    trialing: subscriptions.filter((subscription) => subscription.status === "TRIALING").length,
    pastDue: subscriptions.filter((subscription) => subscription.status === "PAST_DUE").length,
    canceled: subscriptions.filter((subscription) => subscription.status === "CANCELED").length
  };
}

async function readSubscriptionStore(storePath: string): Promise<SubscriptionStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<SubscriptionStore>;

    return {
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : []
    };
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return { subscriptions: [] };
    }
    throw error;
  }
}

async function writeSubscriptionStore(store: SubscriptionStore, storePath: string): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    JSON.stringify(
      {
        version: subscriptionStoreVersion,
        subscriptions: store.subscriptions
      },
      null,
      2
    ),
    "utf8"
  );
}
