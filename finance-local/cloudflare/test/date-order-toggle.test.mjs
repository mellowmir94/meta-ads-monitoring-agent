import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('created_at uses the same inline arrow sort as request_at', () => {
  assert.match(html, /sort: \{ "commission-main": \{ key: "created_at", dir: "asc" \} \}/);
  assert.doesNotMatch(html, /table-date-order-toggle|data-date-order=/);
  assert.doesNotMatch(html, /<select data-date-order=/);
  assert.match(html, /<button type="button" data-sort="\$\{esc\(panel\.id\)\}" data-sort-key="\$\{esc\(column\.key\)\}">\$\{esc\(label\)\}\$\{sort\.key === column\.key \? \(sort\.dir === "asc" \? " ↑" : " ↓"\) : ""\}<\/button>/);
});

test('all table header sorts cycle ascending, descending, then off', () => {
  assert.match(html, /function nextTableSort\(current, key\) \{[\s\S]*current\?\.key !== key\) return \{ key, dir: "asc" \}[\s\S]*current\.dir === "asc"\) return \{ key, dir: "desc" \}[\s\S]*return null/);
  assert.match(html, /const next = nextTableSort\(instance\.sort, key\);[\s\S]*else delete state\.sort\[instance\.tableId\]/);
  assert.match(html, /: nextTableSort\(current, sort\.dataset\.sortKey\);[\s\S]*else delete state\.sort\[sort\.dataset\.sort\]/);
  assert.match(html, /state\.pages\[sort\.dataset\.sort\] = 1;/);
});
