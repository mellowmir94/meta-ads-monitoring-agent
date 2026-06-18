import { prisma } from "@/lib/prisma";
import { baselineKey } from "@/lib/ads-analysis/rules";
import type { MetricBaseline } from "@/lib/ads-analysis/types";
import { addDays, dateTextToUtcDate } from "@/lib/meta-ads/date";

function fromPrismaLevel(level: "CAMPAIGN" | "AD_SET" | "AD") {
  if (level === "CAMPAIGN") {
    return "campaign" as const;
  }

  if (level === "AD_SET") {
    return "adset" as const;
  }

  return "ad" as const;
}

export async function getSevenDayBaselines(accountId: string, dateText: string) {
  const startDate = dateTextToUtcDate(addDays(dateText, -7));
  const endDate = dateTextToUtcDate(dateText);
  const rows = await prisma.metaAdsPerformanceSnapshot.findMany({
    where: {
      accountId,
      date: {
        gte: startDate,
        lt: endDate
      }
    }
  });

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = baselineKey(row.metaEntityId, fromPrismaLevel(row.level));
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const baselines = new Map<string, MetricBaseline>();
  for (const [key, values] of grouped.entries()) {
    const divisor = values.length || 1;
    const cplValues = values.map((value) => value.cpl).filter((value): value is number => typeof value === "number");

    baselines.set(key, {
      spend: values.reduce((total, value) => total + value.spend, 0) / divisor,
      impressions: values.reduce((total, value) => total + value.impressions, 0) / divisor,
      clicks: values.reduce((total, value) => total + value.clicks, 0) / divisor,
      ctr: values.reduce((total, value) => total + value.ctr, 0) / divisor,
      cpc: values.reduce((total, value) => total + value.cpc, 0) / divisor,
      cpm: values.reduce((total, value) => total + value.cpm, 0) / divisor,
      leads: values.reduce((total, value) => total + value.leads, 0) / divisor,
      cpl: cplValues.length ? cplValues.reduce((total, value) => total + value, 0) / cplValues.length : null,
      frequency: values.reduce((total, value) => total + value.frequency, 0) / divisor
    });
  }

  return baselines;
}
