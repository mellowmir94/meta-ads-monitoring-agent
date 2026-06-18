import assert from "node:assert/strict";
import test from "node:test";

import { detectFatigueSignals } from "@/lib/ads-analysis/fatigue";
import { detectOptimizationOpportunities } from "@/lib/ads-analysis/recommendations";
import { baselineKey, evaluateAlertRules } from "@/lib/ads-analysis/rules";
import type { MetricBaseline } from "@/lib/ads-analysis/types";
import type { NormalizedMetaSnapshot } from "@/lib/meta/types";

function snapshot(overrides: Partial<NormalizedMetaSnapshot>): NormalizedMetaSnapshot {
  return {
    metaEntityId: "campaign-1",
    level: "campaign",
    name: "Campaign 1",
    date: "2026-06-09",
    status: "ACTIVE",
    spend: 0,
    impressions: 1000,
    reach: 800,
    clicks: 10,
    ctr: 1,
    cpc: 1,
    cpm: 10,
    leads: 1,
    cpl: 10,
    frequency: 1.2,
    ...overrides
  };
}

function baseline(overrides: Partial<MetricBaseline>): MetricBaseline {
  return {
    spend: 50,
    impressions: 1000,
    clicks: 10,
    ctr: 1,
    cpc: 1,
    cpm: 10,
    leads: 2,
    cpl: 20,
    frequency: 1.5,
    ...overrides
  };
}

test("flags high spend with zero leads as critical", () => {
  const alerts = evaluateAlertRules([snapshot({ spend: 120, leads: 0, cpl: null })]);
  assert.ok(alerts.some((alert) => alert.type === "NO_LEADS_HIGH_SPEND" && alert.severity === "CRITICAL"));
});

test("flags CPL spike above 30 percent of baseline", () => {
  const current = snapshot({ cpl: 40, leads: 2, spend: 80 });
  const baselines = new Map([[baselineKey(current.metaEntityId, current.level), baseline({ cpl: 30 })]]);
  const alerts = evaluateAlertRules([current], baselines);
  assert.ok(alerts.some((alert) => alert.type === "CPL_SPIKE"));
});

test("flags low CTR, high frequency, zero impressions, spend up leads down, and CPM spike", () => {
  const current = snapshot({ ctr: 0.5, frequency: 4.5, impressions: 1000, spend: 120, leads: 1, cpm: 20 });
  const zeroImpression = snapshot({ metaEntityId: "campaign-zero", name: "Zero Delivery", impressions: 0 });
  const baselines = new Map([[baselineKey(current.metaEntityId, current.level), baseline({ spend: 80, leads: 3, cpm: 10 })]]);
  const alerts = evaluateAlertRules([current, zeroImpression], baselines);
  const types = new Set(alerts.map((alert) => alert.type));

  assert.ok(types.has("LOW_CTR"));
  assert.ok(types.has("HIGH_FREQUENCY"));
  assert.ok(types.has("ZERO_IMPRESSIONS"));
  assert.ok(types.has("SPEND_UP_LEADS_DOWN"));
  assert.ok(types.has("CPM_SPIKE"));
});

test("detects best campaign and scaling opportunity", () => {
  const current = snapshot({ cpl: 10, leads: 5, spend: 50 });
  const baselines = new Map([[baselineKey(current.metaEntityId, current.level), baseline({ cpl: 20 })]]);
  const alerts = [...evaluateAlertRules([current], baselines), ...detectOptimizationOpportunities([current], baselines)];
  const types = new Set(alerts.map((alert) => alert.type));

  assert.ok(types.has("BEST_CPL"));
  assert.ok(types.has("SCALING_OPPORTUNITY"));
});

test("detects creative and audience fatigue", () => {
  const ad = snapshot({ metaEntityId: "ad-1", level: "ad", frequency: 3.5, ctr: 0.5 });
  const adset = snapshot({ metaEntityId: "adset-1", level: "adset", frequency: 4.5, ctr: 0.5, cpm: 15 });
  const baselines = new Map([
    [baselineKey(ad.metaEntityId, ad.level), baseline({ ctr: 1, frequency: 2 })],
    [baselineKey(adset.metaEntityId, adset.level), baseline({ ctr: 1, cpm: 10, frequency: 2 })]
  ]);
  const alerts = detectFatigueSignals([ad, adset], baselines);
  const types = new Set(alerts.map((alert) => alert.type));

  assert.ok(types.has("CREATIVE_FATIGUE"));
  assert.ok(types.has("AUDIENCE_FATIGUE"));
});
