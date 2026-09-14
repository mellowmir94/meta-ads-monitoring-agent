import assert from 'node:assert/strict';
import test from 'node:test';
import { parseB2wWorksheetValues, parseSourceDate } from '../src/sharepoint.js';

test('parses B2W pivot invoice dates and quantities', () => {
  const rows = parseB2wWorksheetValues([
    ['Sales'],
    ['InvoiceDate', 'Sum of Quantity', 'Sum of LineAmount'],
    ['1/8/2026', 50, 11845],
    ['2/8/2026', 15, 3500],
    ['2/8/2026', 3, 700],
    ['Grand Total', 68, 16045]
  ]);
  assert.deepEqual(rows, [
    { date: '2026-08-01', value: 50 },
    { date: '2026-08-02', value: 18 }
  ]);
});

test('accepts SharePoint Excel date formats', () => {
  assert.equal(parseSourceDate('01.08.2026'), '2026-08-01');
  assert.equal(parseSourceDate('2026-08-19T00:00:00Z'), '2026-08-19');
  assert.equal(parseSourceDate(46235), '2026-08-01');
});
