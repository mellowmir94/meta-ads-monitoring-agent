import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sanitizeReportHtml, validReportDate } from '../src/report-versions.js';
import { makeArchive, date } from './helpers/report-store.mjs';

test('report versions append immutable snapshots and require a revision reason', async () => {
  const { call, payload, manual } = makeArchive(), first = await payload();
  assert.equal((await call(first)).status, 201);
  const v1 = await (await call(null, `date=${date}&version=1`)).json();
  const second = { ...first, requestId: crypto.randomUUID(), expectedLatest: 1 };
  assert.equal((await call(second)).status, 400);
  second.note = 'Reviewed correction'; second.html = first.html.replace('HQ TEST', 'Corrected name');
  assert.equal((await call(second)).status, 201);
  manual.rsa.values[date].rsaFuel = 99;
  assert.deepEqual(await (await call(null, `date=${date}&version=1`)).json(), v1);
  const listed = await (await call()).json();
  assert.deepEqual(listed.versions.map(v => v.version), [2, 1]);
  assert.equal((await call(null, 'date=2026-08-24')).status, 200);
  assert.equal((await (await call(null, 'date=2026-08-24')).json()).latest, 0);
  for (const method of ['PUT', 'DELETE', 'PATCH']) assert.equal((await call(null, `date=${date}`, method)).status, 405);
});

test('finalisation retries are idempotent and concurrent submissions cannot replace a version', async () => {
  const { call, payload } = makeArchive(), body = await payload();
  const replies = await Promise.all([call(body), call({ ...body, requestId: crypto.randomUUID() })]);
  assert.deepEqual(replies.map(r => r.status), [201, 409]);
  assert.equal((await (await call(body)).json()).repeated, true);
  assert.equal((await call({ ...body, text: 'Different report' })).status, 409);
  assert.equal((await (await call()).json()).latest, 1);
});

test('finalisation rejects changed Master and saved inputs instead of freezing stale edits', async () => {
  for (const kind of ['master', 'rsa', 'b2w', 'bgarage', 'indonesia']) {
    const archive = makeArchive(), body = await archive.payload();
    if (kind === 'master') archive.workbook.data.pitstopMaster[0].Tier = 'Tier 2';
    else archive.manual[kind].values[date] = null;
    const reply = await archive.call(body);
    assert.equal(reply.status, 409, kind);
    assert.equal((await (await archive.call()).json()).latest, 0);
  }
});

test('finalisation validates complete date coverage, zero values, dates and source availability', async () => {
  assert.equal(validReportDate('2026-02-30'), false);
  assert.equal(validReportDate('2024-02-29'), true);
  const { call, payload, env } = makeArchive();
  assert.equal((await call(null, 'date=2026-02-30')).status, 400);
  for (const mutate of [b => delete b.snapshot.manual.rsa[date], b => delete b.snapshot.manual.indonesia['2026-08-01'], b => b.snapshot.manual.b2w[date] = null, b => b.snapshot.from = '2026-08-22', b => b.snapshot.filters.network.to = 'bad', b => b.note = 'x'.repeat(501)]) {
    const body = await payload(); mutate(body); assert.equal((await call(body)).status, 400);
  }
  env.MANUAL_VALUES.get = () => ({ fetch: async () => Response.json({ error: 'Unavailable' }, { status: 503 }) });
  assert.equal((await call(await payload())).status, 503);
  env.DASHBOARD_DATA.get = async () => null;
  assert.equal((await call(await payload())).status, 503);
});

test('archived HTML strips active content while retaining table styling and colored circles', () => {
  const clean = sanitizeReportHtml('<script>alert(1)</script><svg onload="evil()">bad</svg><table style="width:800px;table-layout:fixed"><tr><td nowrap align="left" style="white-space:nowrap;background-image:url(https://tracker);color:#000 !important" onclick="evil()"><a href="javascript:evil()">SOUTHERN</a><font color="#43c98d" face="Segoe UI Emoji" style="font-size:14px">&#128994;</font><img src="https://tracker"></td></tr></table>');
  assert.doesNotMatch(clean, /script|svg|onload|onclick|href|url\(|tracker|<img|<a /i);
  assert.match(clean, /white-space:nowrap/);
  assert.match(clean, /align="left"/);
  assert.match(clean, /color="#43c98d"/);
  assert.match(clean, /\u{1F7E2}/u);
});

test('large report bodies are losslessly compressed and split into bounded storage chunks', async () => {
  const { call, payload, objects } = makeArchive(), body = await payload();
  body.html += '<p>' + randomBytes(220000).toString('hex') + '</p>';
  assert.equal((await call(body)).status, 201);
  const data = objects.get(date).data;
  assert.ok(data.get('body:1').chunks > 1);
  for (const [key, value] of data) if (/^body:1:\d+$/.test(key)) assert.ok(value.byteLength <= 64000);
  assert.equal((await (await call(null, `date=${date}&version=1`)).json()).html, sanitizeReportHtml(body.html));
});

test('version history pagination has no gaps or duplicates', async () => {
  const { call, payload } = makeArchive(), body = await payload();
  for (let i = 0; i < 32; i++) assert.equal((await call({ ...body, requestId: crypto.randomUUID(), expectedLatest: i, note: 'Revision ' + i })).status, 201);
  const page = await (await call()).json(), older = await (await call(null, `date=${date}&before=${page.before}`)).json();
  assert.deepEqual([...page.versions, ...older.versions].map(v => v.version), Array.from({ length: 32 }, (_, i) => 32 - i));
  assert.equal(older.before, null);
});
