import { baselineKey } from "@/lib/ads-analysis/rules";
import type { AnalysisAlert, MetricBaseline } from "@/lib/ads-analysis/types";
import type { NormalizedMetaSnapshot } from "@/lib/meta/types";

export function detectOptimizationOpportunities(
  snapshots: NormalizedMetaSnapshot[],
  baselines: Map<string, MetricBaseline>
): AnalysisAlert[] {
  const alerts: AnalysisAlert[] = [];

  for (const snapshot of snapshots) {
    const baseline = baselines.get(baselineKey(snapshot.metaEntityId, snapshot.level));

    if (baseline?.cpl && snapshot.cpl && snapshot.leads > 0 && snapshot.cpl < baseline.cpl * 0.8 && snapshot.spend >= 20) {
      alerts.push({
        metaEntityId: snapshot.metaEntityId,
        level: snapshot.level,
        name: snapshot.name,
        severity: "GOOD_NEWS",
        type: "SCALING_OPPORTUNITY",
        problem: "Scaling opportunity detected.",
        evidence: `CPL RM${snapshot.cpl.toFixed(2)} is at least 20% below 7-day average RM${baseline.cpl.toFixed(2)}.`,
        impact: "This entity is producing cheaper leads than usual.",
        recommendation: "Consider a controlled budget increase after confirming lead quality.",
        metric: "cpl",
        currentValue: snapshot.cpl,
        baselineValue: baseline.cpl
      });
    }

    if (snapshot.spend > 100 && snapshot.leads === 0) {
      alerts.push({
        metaEntityId: snapshot.metaEntityId,
        level: snapshot.level,
        name: snapshot.name,
        severity: "WARNING",
        type: "UNDERPERFORMING_PAUSE_RECOMMENDED",
        problem: "Underperforming ad spend may justify a manual pause review.",
        evidence: `Spend RM${snapshot.spend.toFixed(2)} with zero leads.`,
        impact: "Continuing unchanged may waste more budget.",
        recommendation: "Review for manual pause approval. Do not pause automatically.",
        metric: "spend",
        currentValue: snapshot.spend
      });
    }
  }

  return alerts;
}

export function buildRecommendedActions(alerts: AnalysisAlert[], maxActions = 3): string[] {
  const priority = { CRITICAL: 0, WARNING: 1, GOOD_NEWS: 2 };

  return [...alerts]
    .sort((a, b) => priority[a.severity] - priority[b.severity])
    .slice(0, maxActions)
    .map((alert) => `${alert.name}: ${alert.recommendation}`);
}
