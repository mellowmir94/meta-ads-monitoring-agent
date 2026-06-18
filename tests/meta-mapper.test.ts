import assert from "node:assert/strict";
import test from "node:test";

import { countLeadActions, entityToZeroSnapshot, normalizeInsightsRow } from "@/lib/meta/mapper";

test("countLeadActions sums broad lead action types", () => {
  assert.equal(
    countLeadActions([
      { action_type: "lead", value: "2" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "3" },
      { action_type: "link_click", value: "50" }
    ]),
    5
  );
});

test("normalizeInsightsRow derives CPL from spend and leads", () => {
  const snapshot = normalizeInsightsRow(
    {
      campaign_id: "123",
      campaign_name: "Seat Cleaning",
      spend: "120",
      impressions: "10000",
      reach: "8000",
      clicks: "100",
      ctr: "1",
      cpc: "1.2",
      cpm: "12",
      frequency: "1.25",
      actions: [{ action_type: "lead", value: "4" }]
    },
    "campaign",
    "2026-06-09",
    "ACTIVE"
  );

  assert.equal(snapshot.metaEntityId, "123");
  assert.equal(snapshot.cpl, 30);
  assert.equal(snapshot.leads, 4);
  assert.equal(snapshot.status, "ACTIVE");
});

test("entityToZeroSnapshot creates active zero-impression snapshot", () => {
  const snapshot = entityToZeroSnapshot({ id: "adset-1", name: "Local Shah Alam", effective_status: "ACTIVE" }, "adset", "2026-06-09");

  assert.equal(snapshot.metaEntityId, "adset-1");
  assert.equal(snapshot.impressions, 0);
  assert.equal(snapshot.status, "ACTIVE");
});
