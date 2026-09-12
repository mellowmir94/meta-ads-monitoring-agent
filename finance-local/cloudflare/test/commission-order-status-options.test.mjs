import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("Commission order_status uses Grafana's saved ten-value selection in the top filter", () => {
  const definition = html.match(/\{ key: "order_status", label: "order_status"[^\n]+grafanaSelectionOnly: true \}/u)?.[0] || "";
  const saved = definition.match(/grafanaActive: \[(.*?)\], primary:/u)?.[1] || "";
  const values = [...saved.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);

  assert.equal(values.length, 10);
  assert.deepEqual(values, [
    "in_progress",
    "scrap_handover",
    "refunded",
    "completed",
    "cancelled",
    "dispatched",
    "pending_scrap_receive",
    "pending_stock_pickup",
    "ready_to_dispatch",
    "waiting_confirmation"
  ]);
  assert.match(html, /const grafanaSelection = filter\.grafanaSelectionOnly \? grafanaSavedFilterValues\(panel\.id, filter\.key\) : \[\];/u);
});

test("Line Item Audit order_status filter uses the same Grafana API selection", () => {
  assert.match(html, /context\.panel\.id === "commission-main" && context\.columnKey === "order_status"/u);
  assert.match(html, /const grafanaValues = grafanaSavedFilterValues\(context\.panel\.id, context\.columnKey\);/u);
  assert.match(html, /if \(grafanaValues\.length\) return grafanaValues;/u);
});
