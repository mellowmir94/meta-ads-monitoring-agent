import { detectFatigueSignals } from "@/lib/ads-analysis/fatigue";
import { detectOptimizationOpportunities } from "@/lib/ads-analysis/recommendations";
import { evaluateAlertRules } from "@/lib/ads-analysis/rules";
import { MetaMarketingClient } from "@/lib/meta/client";
import { entityToZeroSnapshot, getMetaEntityIdentity, normalizeInsightsRow, normalizeMetaStatus } from "@/lib/meta/mapper";
import type { MetaApiEntity, MetaEntityLevel, NormalizedMetaSnapshot } from "@/lib/meta/types";
import { getSevenDayBaselines } from "@/lib/meta-ads/baselines";
import { addDays, dateTextToUtcDate, getYesterdayInTimeZone } from "@/lib/meta-ads/date";
import { getMetaAdsEnv } from "@/lib/meta-ads/env";
import { metaAdsLogger } from "@/lib/meta-ads/logger";
import { ensureMetaAdsAccount, saveMetaSnapshots } from "@/lib/meta-ads/snapshots";
import { finishMetaAdsRun, saveMetaAdsAlerts, saveMetaAdsReport, startMetaAdsRun } from "@/lib/meta-ads/status-store";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { generateWeeklyReport } from "@/lib/reports/weekly-report";
import { TelegramClient } from "@/lib/telegram/client";
import { buildRunCompletedMessage, buildRunFailedMessage, buildRunStartedMessage } from "@/lib/telegram/status";

type RunType = "daily" | "weekly";

const levels: MetaEntityLevel[] = ["campaign", "adset", "ad"];

function levelCount(snapshots: NormalizedMetaSnapshot[], level: MetaEntityLevel) {
  return new Set(snapshots.filter((snapshot) => snapshot.level === level).map((snapshot) => snapshot.metaEntityId)).size;
}

function entityStatusMap(entities: MetaApiEntity[]) {
  return new Map(entities.map((entity) => [entity.id, normalizeMetaStatus(entity.effective_status ?? entity.status)]));
}

function mergeZeroImpressionEntities(
  snapshots: NormalizedMetaSnapshot[],
  entities: MetaApiEntity[],
  level: MetaEntityLevel,
  dateText: string
) {
  const existingIds = new Set(snapshots.filter((snapshot) => snapshot.level === level).map((snapshot) => snapshot.metaEntityId));
  const zeroSnapshots = entities
    .filter((entity) => normalizeMetaStatus(entity.effective_status ?? entity.status) === "ACTIVE")
    .filter((entity) => !existingIds.has(entity.id))
    .map((entity) => entityToZeroSnapshot(entity, level, dateText));

  return [...snapshots, ...zeroSnapshots];
}

async function fetchSnapshots(client: MetaMarketingClient, dateText: string) {
  const snapshots: NormalizedMetaSnapshot[] = [];

  for (const level of levels) {
    const [entities, insights] = await Promise.all([client.listEntities(level), client.getInsights(level)]);
    const statuses = entityStatusMap(entities);
    const normalized = insights.map((row) => {
      const identity = getMetaEntityIdentity(row, level);
      return normalizeInsightsRow(row, level, dateText, normalizeMetaStatus(statuses.get(identity.id ?? "")));
    });

    snapshots.push(...mergeZeroImpressionEntities(normalized, entities, level, dateText));
  }

  return snapshots;
}

export async function runMetaAdsAgent(runType: RunType = "daily") {
  const env = getMetaAdsEnv();
  const telegram = new TelegramClient({ botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
  const account = await ensureMetaAdsAccount(env.META_AD_ACCOUNT_ID);
  const run = await startMetaAdsRun(runType, account.id);
  const dateText = getYesterdayInTimeZone(env.META_ADS_TIMEZONE);

  try {
    metaAdsLogger.info("Meta Ads run started", { runType, runId: run.id });
    await telegram.sendMessage(buildRunStartedMessage());

    const client = new MetaMarketingClient({
      accessToken: env.META_ACCESS_TOKEN,
      adAccountId: env.META_AD_ACCOUNT_ID,
      apiVersion: env.META_GRAPH_API_VERSION
    });
    const snapshots = await fetchSnapshots(client, dateText);
    await saveMetaSnapshots(account.id, snapshots);

    const baselines = await getSevenDayBaselines(account.id, dateText);
    const alerts = [
      ...evaluateAlertRules(snapshots, baselines),
      ...detectFatigueSignals(snapshots, baselines),
      ...detectOptimizationOpportunities(snapshots, baselines)
    ];
    await saveMetaAdsAlerts(account.id, run.id, alerts);

    const reportBody = runType === "daily" ? generateDailyReport(snapshots, alerts) : generateWeeklyReport(snapshots, alerts);
    let reportSent = false;
    await telegram.sendMessage(reportBody);
    reportSent = true;

    await saveMetaAdsReport({
      accountId: account.id,
      runId: run.id,
      type: runType === "daily" ? "DAILY" : "WEEKLY",
      periodStart: dateTextToUtcDate(runType === "daily" ? dateText : addDays(dateText, -6)),
      periodEnd: dateTextToUtcDate(dateText),
      body: reportBody,
      sentToTelegram: reportSent
    });

    const runSummary = {
      campaignsChecked: levelCount(snapshots, "campaign"),
      adSetsChecked: levelCount(snapshots, "adset"),
      adsChecked: levelCount(snapshots, "ad"),
      alertsGenerated: alerts.length,
      reportSent
    };

    await finishMetaAdsRun(run.id, "SUCCESS", runSummary);
    await telegram.sendMessage(buildRunCompletedMessage(runSummary));
    metaAdsLogger.info("Meta Ads run completed", { runType, runId: run.id, alertsGenerated: alerts.length });

    return { runId: run.id, ...runSummary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Meta Ads run error";
    metaAdsLogger.error("Meta Ads run failed", { runType, runId: run.id });
    await finishMetaAdsRun(run.id, "FAILED", { errorMessage: message, reportSent: false });

    try {
      await telegram.sendMessage(buildRunFailedMessage(message));
    } catch {
      metaAdsLogger.error("Failed to send Telegram failure status", { runId: run.id });
    }

    throw error;
  }
}
