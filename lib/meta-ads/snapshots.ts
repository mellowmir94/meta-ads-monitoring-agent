import { prisma } from "@/lib/prisma";
import { dateTextToUtcDate } from "@/lib/meta-ads/date";
import type { MetaEntityLevel, MetaEntityStatus, NormalizedMetaSnapshot } from "@/lib/meta/types";

function toPrismaLevel(level: MetaEntityLevel) {
  if (level === "campaign") {
    return "CAMPAIGN" as const;
  }

  if (level === "adset") {
    return "AD_SET" as const;
  }

  return "AD" as const;
}

function toPrismaStatus(status: MetaEntityStatus) {
  return status;
}

export async function ensureMetaAdsAccount(adAccountId: string) {
  return prisma.metaAdsAccount.upsert({
    where: { adAccountId },
    update: { lastSyncedAt: new Date() },
    create: { adAccountId, lastSyncedAt: new Date() }
  });
}

export async function upsertMetaEntity(accountId: string, snapshot: NormalizedMetaSnapshot) {
  return prisma.metaAdsEntity.upsert({
    where: {
      accountId_metaId_level: {
        accountId,
        metaId: snapshot.metaEntityId,
        level: toPrismaLevel(snapshot.level)
      }
    },
    update: {
      parentMetaId: snapshot.parentMetaId,
      name: snapshot.name,
      status: toPrismaStatus(snapshot.status),
      effectiveStatus: snapshot.status
    },
    create: {
      accountId,
      metaId: snapshot.metaEntityId,
      parentMetaId: snapshot.parentMetaId,
      level: toPrismaLevel(snapshot.level),
      name: snapshot.name,
      status: toPrismaStatus(snapshot.status),
      effectiveStatus: snapshot.status
    }
  });
}

export async function saveMetaSnapshots(accountId: string, snapshots: NormalizedMetaSnapshot[]) {
  const saved = [];

  for (const snapshot of snapshots) {
    const entity = await upsertMetaEntity(accountId, snapshot);
    saved.push(
      await prisma.metaAdsPerformanceSnapshot.upsert({
        where: {
          accountId_metaEntityId_level_date: {
            accountId,
            metaEntityId: snapshot.metaEntityId,
            level: toPrismaLevel(snapshot.level),
            date: dateTextToUtcDate(snapshot.date)
          }
        },
        update: {
          entityId: entity.id,
          parentMetaId: snapshot.parentMetaId,
          name: snapshot.name,
          status: toPrismaStatus(snapshot.status),
          spend: snapshot.spend,
          impressions: snapshot.impressions,
          reach: snapshot.reach,
          clicks: snapshot.clicks,
          ctr: snapshot.ctr,
          cpc: snapshot.cpc,
          cpm: snapshot.cpm,
          leads: snapshot.leads,
          cpl: snapshot.cpl,
          frequency: snapshot.frequency,
          raw: snapshot.raw
        },
        create: {
          accountId,
          entityId: entity.id,
          metaEntityId: snapshot.metaEntityId,
          parentMetaId: snapshot.parentMetaId,
          level: toPrismaLevel(snapshot.level),
          name: snapshot.name,
          date: dateTextToUtcDate(snapshot.date),
          status: toPrismaStatus(snapshot.status),
          spend: snapshot.spend,
          impressions: snapshot.impressions,
          reach: snapshot.reach,
          clicks: snapshot.clicks,
          ctr: snapshot.ctr,
          cpc: snapshot.cpc,
          cpm: snapshot.cpm,
          leads: snapshot.leads,
          cpl: snapshot.cpl,
          frequency: snapshot.frequency,
          raw: snapshot.raw
        }
      })
    );
  }

  return saved;
}
