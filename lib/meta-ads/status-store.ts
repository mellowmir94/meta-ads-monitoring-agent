import { prisma } from "@/lib/prisma";
import type { AnalysisAlert } from "@/lib/ads-analysis/types";

function toPrismaLevel(level: AnalysisAlert["level"]) {
  return level === "campaign" ? "CAMPAIGN" : level === "adset" ? "AD_SET" : "AD";
}

export async function startMetaAdsRun(runType: "daily" | "weekly", accountId?: string) {
  return prisma.metaAdsAgentRun.create({
    data: {
      accountId,
      runType,
      status: "STARTED"
    }
  });
}

export async function finishMetaAdsRun(
  runId: string,
  status: "SUCCESS" | "FAILED",
  data: {
    errorMessage?: string;
    campaignsChecked?: number;
    adSetsChecked?: number;
    adsChecked?: number;
    alertsGenerated?: number;
    reportSent?: boolean;
  }
) {
  return prisma.metaAdsAgentRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: new Date(),
      errorMessage: data.errorMessage,
      campaignsChecked: data.campaignsChecked,
      adSetsChecked: data.adSetsChecked,
      adsChecked: data.adsChecked,
      alertsGenerated: data.alertsGenerated,
      reportSent: data.reportSent
    }
  });
}

export async function saveMetaAdsAlerts(accountId: string, runId: string, alerts: AnalysisAlert[]) {
  if (!alerts.length) {
    return { count: 0 };
  }

  return prisma.metaAdsAlert.createMany({
    data: alerts.map((alert) => ({
      accountId,
      runId,
      metaEntityId: alert.metaEntityId,
      level: toPrismaLevel(alert.level),
      severity: alert.severity,
      type: alert.type,
      title: alert.name,
      problem: alert.problem,
      evidence: alert.evidence,
      impact: alert.impact,
      recommendation: alert.recommendation,
      metric: alert.metric,
      currentValue: alert.currentValue,
      baselineValue: alert.baselineValue
    }))
  });
}

export async function saveMetaAdsReport(data: {
  accountId: string;
  runId: string;
  type: "DAILY" | "WEEKLY";
  periodStart: Date;
  periodEnd: Date;
  body: string;
  sentToTelegram: boolean;
}) {
  return prisma.metaAdsReport.create({
    data: {
      ...data,
      sentAt: data.sentToTelegram ? new Date() : undefined
    }
  });
}

export async function getLatestMetaAdsRun() {
  return prisma.metaAdsAgentRun.findFirst({
    orderBy: { startedAt: "desc" }
  });
}
