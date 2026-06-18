import { baselineKey } from "@/lib/ads-analysis/rules";
import type { AnalysisAlert, MetricBaseline } from "@/lib/ads-analysis/types";
import type { NormalizedMetaSnapshot } from "@/lib/meta/types";

export function detectFatigueSignals(snapshots: NormalizedMetaSnapshot[], baselines: Map<string, MetricBaseline>): AnalysisAlert[] {
  const alerts: AnalysisAlert[] = [];

  for (const snapshot of snapshots) {
    const baseline = baselines.get(baselineKey(snapshot.metaEntityId, snapshot.level));
    const ctrDropped = baseline?.ctr ? snapshot.ctr < baseline.ctr * 0.8 : snapshot.ctr < 0.8;
    const cpmRose = baseline?.cpm ? snapshot.cpm > baseline.cpm * 1.2 : false;

    if (snapshot.level === "ad" && snapshot.frequency > 3 && ctrDropped) {
      alerts.push({
        metaEntityId: snapshot.metaEntityId,
        level: snapshot.level,
        name: snapshot.name,
        severity: "WARNING",
        type: "CREATIVE_FATIGUE",
        problem: "Creative fatigue signal detected.",
        evidence: `Ad frequency ${snapshot.frequency.toFixed(2)} with CTR ${snapshot.ctr.toFixed(2)}%.`,
        impact: "Repeated exposure may be reducing response to the ad.",
        recommendation: "Prepare a new creative angle, visual, or offer before performance declines further.",
        metric: "frequency",
        currentValue: snapshot.frequency,
        baselineValue: baseline?.frequency
      });
    }

    if ((snapshot.level === "campaign" || snapshot.level === "adset") && snapshot.frequency > 4 && (ctrDropped || cpmRose)) {
      alerts.push({
        metaEntityId: snapshot.metaEntityId,
        level: snapshot.level,
        name: snapshot.name,
        severity: "WARNING",
        type: "AUDIENCE_FATIGUE",
        problem: "Audience fatigue signal detected.",
        evidence: `Frequency ${snapshot.frequency.toFixed(2)}, CTR ${snapshot.ctr.toFixed(2)}%, CPM RM${snapshot.cpm.toFixed(2)}.`,
        impact: "The audience may be saturated, making delivery more expensive.",
        recommendation: "Refresh audience exclusions, expand targeting, or rotate creative.",
        metric: "frequency",
        currentValue: snapshot.frequency,
        baselineValue: baseline?.frequency
      });
    }
  }

  return alerts;
}
