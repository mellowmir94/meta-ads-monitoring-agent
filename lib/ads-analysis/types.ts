import type { MetaEntityLevel, NormalizedMetaSnapshot } from "@/lib/meta/types";

export type AlertSeverity = "CRITICAL" | "WARNING" | "GOOD_NEWS";

export type AlertType =
  | "NO_LEADS_HIGH_SPEND"
  | "CPL_SPIKE"
  | "LOW_CTR"
  | "HIGH_FREQUENCY"
  | "ZERO_IMPRESSIONS"
  | "SPEND_UP_LEADS_DOWN"
  | "CPM_SPIKE"
  | "BEST_CPL"
  | "CREATIVE_FATIGUE"
  | "AUDIENCE_FATIGUE"
  | "SCALING_OPPORTUNITY"
  | "UNDERPERFORMING_PAUSE_RECOMMENDED";

export type MetricBaseline = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  cpl: number | null;
  frequency: number;
};

export type AnalysisAlert = {
  metaEntityId: string;
  level: MetaEntityLevel;
  name: string;
  severity: AlertSeverity;
  type: AlertType;
  problem: string;
  evidence: string;
  impact: string;
  recommendation: string;
  metric: string;
  currentValue?: number;
  baselineValue?: number;
};

export type SnapshotWithBaseline = {
  snapshot: NormalizedMetaSnapshot;
  baseline?: MetricBaseline;
};
