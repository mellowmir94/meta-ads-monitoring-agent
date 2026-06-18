import assert from "node:assert/strict";
import test from "node:test";

import { generateDailyReport } from "@/lib/reports/daily-report";
import type { AnalysisAlert } from "@/lib/ads-analysis/types";
import type { NormalizedMetaSnapshot } from "@/lib/meta/types";

test("generateDailyReport includes required Telegram sections", () => {
  const snapshots: NormalizedMetaSnapshot[] = [
    {
      metaEntityId: "campaign-1",
      level: "campaign",
      name: "Car Seat Cleaning",
      date: "2026-06-09",
      status: "ACTIVE",
      spend: 100,
      impressions: 10000,
      reach: 8000,
      clicks: 100,
      ctr: 1,
      cpc: 1,
      cpm: 10,
      leads: 5,
      cpl: 20,
      frequency: 1.25
    }
  ];
  const alerts: AnalysisAlert[] = [
    {
      metaEntityId: "campaign-1",
      level: "campaign",
      name: "Car Seat Cleaning",
      severity: "GOOD_NEWS",
      type: "BEST_CPL",
      problem: "Best campaign has lower CPL.",
      evidence: "CPL RM20.00.",
      impact: "Lead cost is efficient.",
      recommendation: "Consider controlled scaling.",
      metric: "cpl",
      currentValue: 20,
      baselineValue: 30
    }
  ];

  const report = generateDailyReport(snapshots, alerts);

  assert.match(report, /Meta Ads Daily Status/);
  assert.match(report, /Summary:/);
  assert.match(report, /Critical:/);
  assert.match(report, /Warnings:/);
  assert.match(report, /Good news:/);
  assert.match(report, /Recommended actions:/);
  assert.match(report, /Problem:/);
  assert.match(report, /Evidence:/);
  assert.match(report, /Impact:/);
  assert.match(report, /Recommendation:/);
});
