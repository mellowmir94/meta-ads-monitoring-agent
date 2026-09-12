import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('all system table headers, values, totals and sortable labels are centered', () => {
  assert.match(html, /table th,\s*table td,\s*table th\.numeric,\s*table td\.numeric \{ text-align: center !important; \}/);
  assert.match(html, /table \.table-head-control,[\s\S]*?justify-content: center !important;[\s\S]*?text-align: center !important;/);
  assert.match(html, /\.ledger-card td\.numeric \.bar-track \{ justify-content: center !important; \}/);
  const finalAlignmentContract = html.slice(html.indexOf('/* Finance table alignment contract:'), html.indexOf('/* Keep KPI cards proportional'));
  assert.doesNotMatch(finalAlignmentContract, /text-align: left !important|justify-content: flex-start !important/);
  const semanticContract = html.slice(html.indexOf('/* Finance table alignment remains centered'), html.indexOf('/* Grafana-style table grid:'));
  assert.doesNotMatch(semanticContract, /text-align: left|justify-content: flex-start/);
});
