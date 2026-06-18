import type { AnalysisAlert } from "@/lib/ads-analysis/types";
import type { NormalizedMetaSnapshot } from "@/lib/meta/types";

function money(value: number) {
  return `RM${value.toFixed(2)}`;
}

export function generateWeeklyReport(snapshots: NormalizedMetaSnapshot[], alerts: AnalysisAlert[]) {
  const campaignSnapshots = snapshots.filter((snapshot) => snapshot.level === "campaign");
  const spend = campaignSnapshots.reduce((total, snapshot) => total + snapshot.spend, 0);
  const leads = campaignSnapshots.reduce((total, snapshot) => total + snapshot.leads, 0);
  const criticalCount = alerts.filter((alert) => alert.severity === "CRITICAL").length;
  const warningCount = alerts.filter((alert) => alert.severity === "WARNING").length;
  const goodCount = alerts.filter((alert) => alert.severity === "GOOD_NEWS").length;
  const winners = alerts.filter((alert) => alert.severity === "GOOD_NEWS").slice(0, 5);
  const losers = alerts.filter((alert) => alert.severity === "CRITICAL").slice(0, 5);
  const fatigue = alerts.filter((alert) => alert.type === "CREATIVE_FATIGUE" || alert.type === "AUDIENCE_FATIGUE").slice(0, 5);
  const scaling = alerts.filter((alert) => alert.type === "SCALING_OPPORTUNITY" || alert.type === "BEST_CPL").slice(0, 5);
  const averageCpl = leads > 0 ? spend / leads : null;

  return [
    "Meta Ads Weekly Status",
    "",
    "Trend summary:",
    `- Spend: ${money(spend)}`,
    `- Leads: ${leads}`,
    `- Average CPL: ${averageCpl === null ? "n/a" : money(averageCpl)}`,
    `- Critical issues: ${criticalCount}`,
    `- Warnings: ${warningCount}`,
    `- Good signals: ${goodCount}`,
    "",
    "Winners:",
    ...(winners.length ? winners.map((alert) => `- ${alert.name}: ${alert.evidence}`) : ["- No clear winners detected."]),
    "",
    "Losers / budget waste:",
    ...(losers.length ? losers.map((alert) => `- ${alert.name}: ${alert.problem} ${alert.evidence}`) : ["- No major budget waste detected."]),
    "",
    "Fatigue signals:",
    ...(fatigue.length ? fatigue.map((alert) => `- ${alert.name}: ${alert.evidence}`) : ["- No fatigue signals detected."]),
    "",
    "Scaling opportunities:",
    ...(scaling.length ? scaling.map((alert) => `- ${alert.name}: ${alert.recommendation}`) : ["- No scaling opportunities detected."])
  ].join("\n");
}
