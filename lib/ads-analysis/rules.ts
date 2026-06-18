import type { AnalysisAlert, MetricBaseline, SnapshotWithBaseline } from "@/lib/ads-analysis/types";
import type { MetaEntityLevel, NormalizedMetaSnapshot } from "@/lib/meta/types";

function pct(value: number) {
  return `${value.toFixed(2)}%`;
}

function rm(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }

  return `RM${value.toFixed(2)}`;
}

function alert(
  snapshot: NormalizedMetaSnapshot,
  options: Omit<AnalysisAlert, "metaEntityId" | "level" | "name">
): AnalysisAlert {
  return {
    metaEntityId: snapshot.metaEntityId,
    level: snapshot.level,
    name: snapshot.name,
    ...options
  };
}

function hasBaselineValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function baselineKey(metaEntityId: string, level: MetaEntityLevel) {
  return `${level}:${metaEntityId}`;
}

export function evaluateSnapshot({ snapshot, baseline }: SnapshotWithBaseline): AnalysisAlert[] {
  const alerts: AnalysisAlert[] = [];

  if (snapshot.spend > 100 && snapshot.leads === 0) {
    alerts.push(
      alert(snapshot, {
        severity: "CRITICAL",
        type: "NO_LEADS_HIGH_SPEND",
        problem: "Spend is above RM100 with zero leads.",
        evidence: `Spend ${rm(snapshot.spend)}, leads ${snapshot.leads}.`,
        impact: "Budget is being consumed without measurable lead output.",
        recommendation: "Review targeting, offer, landing flow, and creative before adding budget.",
        metric: "spend",
        currentValue: snapshot.spend
      })
    );
  }

  if (baseline?.cpl && snapshot.cpl && snapshot.cpl > baseline.cpl * 1.3) {
    alerts.push(
      alert(snapshot, {
        severity: "CRITICAL",
        type: "CPL_SPIKE",
        problem: "CPL is more than 30% higher than the previous 7-day average.",
        evidence: `Current CPL ${rm(snapshot.cpl)}, 7-day average ${rm(baseline.cpl)}.`,
        impact: "Lead acquisition is becoming less efficient.",
        recommendation: "Check recent creative, audience, placement, and offer changes.",
        metric: "cpl",
        currentValue: snapshot.cpl,
        baselineValue: baseline.cpl
      })
    );
  }

  if (snapshot.ctr < 0.8 && snapshot.impressions > 0) {
    alerts.push(
      alert(snapshot, {
        severity: "WARNING",
        type: "LOW_CTR",
        problem: "CTR is below 0.8%.",
        evidence: `CTR ${pct(snapshot.ctr)} from ${snapshot.impressions} impressions.`,
        impact: "The audience may not be responding to the creative or offer.",
        recommendation: "Test a stronger hook, clearer before/after proof, or a more specific local offer.",
        metric: "ctr",
        currentValue: snapshot.ctr
      })
    );
  }

  if (snapshot.frequency > 4) {
    alerts.push(
      alert(snapshot, {
        severity: "WARNING",
        type: "HIGH_FREQUENCY",
        problem: "Frequency is above 4.",
        evidence: `Frequency ${snapshot.frequency.toFixed(2)}.`,
        impact: "Audience fatigue risk is rising.",
        recommendation: "Refresh creative or broaden the audience before scaling.",
        metric: "frequency",
        currentValue: snapshot.frequency
      })
    );
  }

  if ((snapshot.level === "campaign" || snapshot.level === "adset") && snapshot.status === "ACTIVE" && snapshot.impressions === 0) {
    alerts.push(
      alert(snapshot, {
        severity: "CRITICAL",
        type: "ZERO_IMPRESSIONS",
        problem: "Active campaign or ad set has zero impressions.",
        evidence: `${snapshot.name} is active with 0 impressions.`,
        impact: "Delivery may be blocked by budget, audience, review, billing, or schedule issues.",
        recommendation: "Check delivery status in Meta Ads Manager and confirm billing, schedule, audience size, and approvals.",
        metric: "impressions",
        currentValue: 0
      })
    );
  }

  if (baseline && snapshot.spend > baseline.spend && snapshot.leads < baseline.leads) {
    alerts.push(
      alert(snapshot, {
        severity: "CRITICAL",
        type: "SPEND_UP_LEADS_DOWN",
        problem: "Spend increased while leads dropped versus the 7-day average.",
        evidence: `Spend ${rm(snapshot.spend)} vs ${rm(baseline.spend)}, leads ${snapshot.leads} vs ${baseline.leads.toFixed(1)}.`,
        impact: "The campaign is spending more for weaker output.",
        recommendation: "Reduce scaling pressure and inspect recent auction, creative, or audience changes.",
        metric: "leads",
        currentValue: snapshot.leads,
        baselineValue: baseline.leads
      })
    );
  }

  if (hasBaselineValue(baseline?.cpm) && snapshot.cpm > baseline.cpm * 1.3) {
    alerts.push(
      alert(snapshot, {
        severity: "WARNING",
        type: "CPM_SPIKE",
        problem: "CPM increased by more than 30%.",
        evidence: `Current CPM ${rm(snapshot.cpm)}, 7-day average ${rm(baseline.cpm)}.`,
        impact: "Auction cost is rising and can reduce lead efficiency.",
        recommendation: "Watch audience overlap, budget changes, and creative relevance.",
        metric: "cpm",
        currentValue: snapshot.cpm,
        baselineValue: baseline.cpm
      })
    );
  }

  return alerts;
}

export function evaluateBestCampaign(snapshots: NormalizedMetaSnapshot[], baselines: Map<string, MetricBaseline>): AnalysisAlert[] {
  const campaigns = snapshots.filter((snapshot) => snapshot.level === "campaign" && snapshot.cpl !== null && snapshot.leads > 0);
  const best = campaigns.sort((a, b) => (a.cpl ?? Number.MAX_VALUE) - (b.cpl ?? Number.MAX_VALUE))[0];

  if (!best) {
    return [];
  }

  const baseline = baselines.get(baselineKey(best.metaEntityId, best.level));
  if (!baseline?.cpl || !best.cpl || best.cpl >= baseline.cpl) {
    return [];
  }

  return [
    alert(best, {
      severity: "GOOD_NEWS",
      type: "BEST_CPL",
      problem: "Best campaign has CPL below the previous 7-day average.",
      evidence: `Current CPL ${rm(best.cpl)}, 7-day average ${rm(baseline.cpl)}.`,
      impact: "This campaign is currently acquiring leads more efficiently.",
      recommendation: "Consider carefully scaling budget after checking lead quality and delivery stability.",
      metric: "cpl",
      currentValue: best.cpl,
      baselineValue: baseline.cpl
    })
  ];
}

export function evaluateAlertRules(snapshots: NormalizedMetaSnapshot[], baselines = new Map<string, MetricBaseline>()): AnalysisAlert[] {
  const perSnapshot = snapshots.flatMap((snapshot) =>
    evaluateSnapshot({ snapshot, baseline: baselines.get(baselineKey(snapshot.metaEntityId, snapshot.level)) })
  );

  return [...perSnapshot, ...evaluateBestCampaign(snapshots, baselines)];
}
