import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssPath = new URL('../../src/dashboard.css', import.meta.url);
const dashboardPath = new URL('../../src/dashboard.js', import.meta.url);

test('overview reserves a compact right column for Action Queue and flexible space for Momentum', async () => {
  const css = await readFile(cssPath, 'utf8');
  const start = css.indexOf('.overview-top-grid {');
  const end = css.indexOf('.overview-side-stack', start);
  const overviewGrid = css.slice(start, end);

  assert.match(overviewGrid, /grid-template-columns: minmax\(0, 1fr\) minmax\(240px, 300px\);/);
});

test('overview opens and data reloads default to the whole-month range', async () => {
  const dashboard = await readFile(dashboardPath, 'utf8');

  assert.match(dashboard, /view: 'overview',\s*range: 'month'/);
  assert.match(dashboard, /function init\(\)[\s\S]*?normalizePayload\(raw, state\.sourceName\); applyRangePreset\('month'\);/);
  assert.doesNotMatch(dashboard, /applyRangePreset\('previous'\)/);
  assert.match(dashboard, /state\.b2cStateSummaryPreset = 'previous'/);
});
