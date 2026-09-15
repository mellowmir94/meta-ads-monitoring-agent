import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');

test('Summary displays HQ KAPAR while retaining the Grafana HQ KLANG sales alias', () => {
  const context = vm.createContext({
    canonicalPitstopKey: value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  });
  const aliasesStart = source.indexOf('  function pitstopMatchKeys(value)');
  const aliasesEnd = source.indexOf('  function normalizePitstopRelocation', aliasesStart);
  const summaryStart = source.indexOf('  function emailSummaryPitstopName(name)');
  const summaryEnd = source.indexOf('  function emailPitstopNetworks', summaryStart);
  vm.runInContext(source.slice(aliasesStart, aliasesEnd) + source.slice(summaryStart, summaryEnd), context);

  assert.deepEqual(Array.from(context.pitstopMatchKeys('HQ KLANG')), ['HQKLANG', 'HQKAPAR']);
  assert.deepEqual(Array.from(context.pitstopMatchKeys('HQ KAPAR')), ['HQKAPAR', 'HQKLANG']);
  assert.equal(context.emailSummaryPitstopName('HQ KLANG'), 'HQ KAPAR');
  assert.equal(context.emailSummaryPitstopName('HQ KAPAR'), 'HQ KAPAR');
  assert.match(source, /'HQ KAPAR', 'HQ TAMAN SETIA RAWANG'/);
});
