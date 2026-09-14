import test from 'node:test';
import assert from 'node:assert/strict';
import { resqDailySql, resqRowsToDaily } from '../src/worker.js';

test('ResQ query uses Orders - Detail rules and counts distinct orders', () => {
  const sql = resqDailySql('2026-08-01', '2026-08-03');
  assert.match(sql, /`clone-330106\.View\.orderdetail`/);
  assert.match(sql, /COUNT\(DISTINCT id\)/);
  assert.match(sql, /Order_category = 'BATTERY'/);
  assert.ok(sql.includes("r'^RESQ TEAM \\(?[1-5]\\)?$'"));
  assert.match(sql, /RESQ JOHOR/);
  assert.match(sql, /RESQ TEAM PAHANG/);
  assert.match(sql, /RESQ TEAM PENANG/);
});

test('ResQ rows combine teams 1-5 into Selangor and preserve the state buckets', () => {
  const rows = resqRowsToDaily([
    { report_date: '2026-08-01', resq_bucket: 'resQSelangor', units: 5 },
    { report_date: '2026-08-01', resq_bucket: 'resQJb', units: 2 },
    { report_date: '2026-08-01', resq_bucket: 'resQPahang', units: 1 },
    { report_date: '2026-08-01', resq_bucket: 'resQPenang', units: 3 },
    { report_date: '2026-08-02', resq_bucket: 'resQSelangor', units: 4 }
  ], '2026-08-01', '2026-08-03');

  assert.deepEqual(rows, [
    { date: '2026-08-01', resQSelangor: 5, resQJb: 2, resQPahang: 1, resQPenang: 3, total: 11 },
    { date: '2026-08-02', resQSelangor: 4, resQJb: 0, resQPahang: 0, resQPenang: 0, total: 4 },
    { date: '2026-08-03', resQSelangor: 0, resQJb: 0, resQPahang: 0, resQPenang: 0, total: 0 }
  ]);
});
