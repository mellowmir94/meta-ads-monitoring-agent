import { buildRecommendedActions } from "@/lib/ads-analysis/recommendations";
import type { AnalysisAlert } from "@/lib/ads-analysis/types";
import type { NormalizedMetaSnapshot } from "@/lib/meta/types";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }

  return `RM${value.toFixed(2)}`;
}

function groupAlerts(alerts: AnalysisAlert[], severity: AnalysisAlert["severity"]) {
  return alerts.filter((alert) => alert.severity === severity);
}

function formatAlert(alert: AnalysisAlert) {
  return [
    `- ${alert.name}`,
    `  Problem: ${alert.problem}`,
    `  Evidence: ${alert.evidence}`,
    `  Impact: ${alert.impact}`,
    `  Recommendation: ${alert.recommendation}`
  ].join("\n");
}

function formatSection(title: string, alerts: AnalysisAlert[], emptyText: string) {
  if (!alerts.length) {
    return `${title}:\n- ${emptyText}`;
  }

  return `${title}:\n${alerts.map(formatAlert).join("\n\n")}`;
}

export function buildDailySummary(snapshots: NormalizedMetaSnapshot[]) {
  const campaigns = snapshots.filter((snapshot) => snapshot.level === "campaign");
  const spend = campaigns.reduce((total, snapshot) => total + snapshot.spend, 0);
  const leads = campaigns.reduce((total, snapshot) => total + snapshot.leads, 0);
  const averageCpl = leads > 0 ? spend / leads : null;
  const campaignsWithCpl = campaigns.filter((snapshot) => snapshot.cpl !== null && snapshot.leads > 0);
  const bestCampaign = [...campaignsWithCpl].sort((a, b) => (a.cpl ?? Number.MAX_VALUE) - (b.cpl ?? Number.MAX_VALUE))[0];
  const worstCampaign = [...campaignsWithCpl].sort((a, b) => (b.cpl ?? 0) - (a.cpl ?? 0))[0];

  return {
    spend,
    leads,
    averageCpl,
    bestCampaign: bestCampaign?.name ?? "n/a",
    worstCampaign: worstCampaign?.name ?? "n/a"
  };
}

export function generateDailyReport(snapshots: NormalizedMetaSnapshot[], alerts: AnalysisAlert[]) {
  const summary = buildDailySummary(snapshots);
  const critical = groupAlerts(alerts, "CRITICAL");
  const warnings = groupAlerts(alerts, "WARNING");
  const goodNews = groupAlerts(alerts, "GOOD_NEWS");
  const actions = buildRecommendedActions(alerts);

  return [
    "Meta Ads Daily Status",
    "",
    "Summary:",
    `- Spend yesterday: ${money(summary.spend)}`,
    `- Leads: ${summary.leads}`,
    `- Average CPL: ${money(summary.averageCpl)}`,
    `- Best campaign: ${summary.bestCampaign}`,
    `- Worst campaign: ${summary.worstCampaign}`,
    "",
    formatSection("Critical", critical, "No critical issues detected."),
    "",
    formatSection("Warnings", warnings, "No warnings detected."),
    "",
    formatSection("Good news", goodNews, "No major improvements detected."),
    "",
    "Recommended actions:",
    ...(actions.length ? actions.map((action, index) => `${index + 1}. ${action}`) : ["1. Monitor performance and wait for more data."])
  ].join("\n");
}
