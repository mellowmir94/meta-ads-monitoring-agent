import test from 'node:test';
import assert from 'node:assert/strict';
import { financeDateWindow, parseFinanceBoundary, prepareFinanceSql, pendingPaymentCombinedSummarySql, buildFinanceQuery, PENDING_PAYMENT_DEALER_LIMIT } from '../src/worker.js';

test('finance boundary interprets Grafana-style timestamps in Kuala Lumpur time', () => {
  const boundary = parseFinanceBoundary('2026-08-01 09:15:30');
  assert.deepEqual(boundary, {
    text: '2026-08-01 09:15:30',
    ms: Date.parse('2026-08-01T09:15:30+08:00')
  });
});

test('date-only finance requests remain backward-compatible full-day ranges', () => {
  const window = financeDateWindow(new URL('https://example.test/?from=2026-08-01&to=2026-08-02'));
  assert.equal(window.from, '2026-08-01 00:00:00');
  assert.equal(window.to, '2026-08-02 23:59:59');
  assert.equal(window.fromMs, Date.parse('2026-08-01T00:00:00+08:00'));
  assert.equal(window.toMs, Date.parse('2026-08-03T00:00:00+08:00'));
});

test('exact Finance timestamps pass through to Grafana milliseconds', () => {
  const window = financeDateWindow(new URL('https://example.test/?from=2026-08-01%2009%3A15%3A30&to=2026-08-02%2017%3A45%3A00'));
  assert.equal(window.fromMs, Date.parse('2026-08-01T09:15:30+08:00'));
  assert.equal(window.toMs, Date.parse('2026-08-02T17:45:00+08:00'));
});

test('Commission Rider can use the Grafana dashboard UTC clock exactly', () => {
  const window = financeDateWindow(new URL('https://example.test/?from=2025-08-01%2000%3A00%3A00&to=2025-08-12%2023%3A59%3A59'), 0);
  assert.equal(window.fromMs, Date.parse('2025-08-01T00:00:00Z'));
  assert.equal(window.toMs, Date.parse('2025-08-13T00:00:00Z'));
});

test('invalid and reversed Finance ranges are rejected', () => {
  assert.equal(parseFinanceBoundary('2026-02-30 00:00:00'), null);
  assert.equal(financeDateWindow(new URL('https://example.test/?from=2026-08-03%2000%3A00%3A00&to=2026-08-02%2023%3A59%3A59')), null);
});

test('Finance supports January 2025 through the present without an artificial range cap', () => {
  const window = financeDateWindow(new URL('https://example.test/?from=2025-01-01%2000%3A00%3A00&to=2026-08-13%2023%3A59%3A59'));
  assert.equal(window.from, '2025-01-01 00:00:00');
  assert.equal(window.to, '2026-08-13 23:59:59');
  assert.equal(window.fromMs, Date.parse('2025-01-01T00:00:00+08:00'));
  assert.equal(window.toMs, Date.parse('2026-08-14T00:00:00+08:00'));
});

test('Dealer pending-payment SQL is bounded, oldest-first, and excludes Billplz and refunds', () => {
  const sql = prepareFinanceSql('SELECT broken legacy query', 'pending-payment-dealer-source', { fromMs: 0, toMs: 1 });
  assert.match(sql, /payments\.payment_type NOT IN \(1, 2\)/);
  assert.match(sql, /riders\.category = 2/);
  assert.match(sql, /ORDER BY payments\.order_id ASC/);
  assert.match(sql, new RegExp(`LIMIT ${PENDING_PAYMENT_DEALER_LIMIT}$`));
  assert.doesNotMatch(sql, /\$Branches/);
});

test('Pending-payment aggregate stays exact while separating Dealer and Motec/FL', () => {
  const sql = pendingPaymentCombinedSummarySql();
  assert.match(sql, /COUNT\(orders\.id\) AS total_no/);
  assert.match(sql, /COUNTIF\(riders\.category = 2\) AS dealer_total_no/);
  assert.match(sql, /COUNTIF\(riders\.category IN \(0, 1\)\) AS motec_total_no/);
  assert.match(sql, /payments\.payment_type NOT IN \(1, 2\)/);
  assert.match(sql, /riders\.category IN \(0, 1, 2\)/);
  assert.doesNotMatch(sql, /LIMIT\s+\d+/i);
});

test('Finance query builder preserves native datasource formats', () => {
  const window = { fromMs: 1, toMs: 2 };
  const postgres = buildFinanceQuery({ rawSql: 'SELECT 1', format: 'table' }, { type: 'postgres', uid: 'pg' }, 'pending-payment-dealer-source', window);
  const bigQuery = buildFinanceQuery({ rawSql: 'SELECT 1', format: 1 }, { type: 'grafana-bigquery-datasource', uid: 'bq' }, 'pending-payment-motec-source', window);
  assert.equal(postgres.format, 'table');
  assert.equal(postgres.editorMode, undefined);
  assert.equal(bigQuery.format, 1);
  assert.equal(bigQuery.editorMode, 'code');
});
