import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("Commission Rider keeps the current Grafana level seeds consistent without inventing MOTOR WALK-IN", () => {
  const levelDefinition = html.match(/\{ key: "level", label: "level"[^\n]+/u)?.[0] || "";
  const defaults = levelDefinition.match(/defaults: \[(.*?)\], active:/u)?.[1] || "";
  const active = levelDefinition.match(/active: \[(.*?)\], grafanaActive:/u)?.[1] || "";
  const grafanaActive = levelDefinition.match(/grafanaActive: \[(.*?)\], preserveSeedOrder:/u)?.[1] || "";

  assert.match(defaults, /"NO COMMISSION"/u);
  assert.match(defaults, /"MOTOR"/u);
  assert.doesNotMatch(defaults, /"MOTOR WALK-IN"/u);
  assert.equal(active, defaults);
  assert.equal(grafanaActive, defaults);
  assert.doesNotMatch(active, /"MOTOR WALK-IN"/u);
  assert.doesNotMatch(grafanaActive, /"MOTOR WALK-IN"/u);
});

test("Commission Rider level matching never aliases MOTOR to MOTOR WALK-IN", () => {
  const matcher = html.match(/function filterMatchesValue\([\s\S]*?\n      \}/u)?.[0] || "";

  assert.match(matcher, /return sameFilterValue\(candidate, value\);/u);
  assert.doesNotMatch(matcher, /sameFilterValue\(candidate, "MOTOR"\)/u);
});
