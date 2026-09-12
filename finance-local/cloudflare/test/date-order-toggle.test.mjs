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

test('inline header sort keeps switching between newest and oldest', () => {
  assert.match(html, /dir: sort\.dataset\.sortDir \|\| \(current\.key === sort\.dataset\.sortKey && current\.dir === "desc" \? "asc" : "desc"\)/);
  assert.match(html, /state\.pages\[sort\.dataset\.sort\] = 1;/);
});
