import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualBackup, validateManualBackup, planMissingRestore, readBackupRequest } from '../src/manual-backup.js';
import { validManualReport } from '../src/manual-values.js';

test('backup exports only manual records and a verifiable checksum', async () => {
  const backup = await createManualBackup('rsa', { values: { '2026-08-23': { rsaFuel: 0 } }, secret: 'must-not-export', revision: 4 });
  assert.equal('secret' in backup.record, false);
  assert.equal('revision' in backup.record, false);
  assert.deepEqual((await validateManualBackup(JSON.parse(JSON.stringify(backup)), 'rsa', validManualReport)).values, { '2026-08-23': { rsaFuel: 0 } });
  backup.record.values['2026-08-23'].rsaFuel = 100;
  await assert.rejects(() => validateManualBackup(backup, 'rsa', validManualReport), /checksum/);
});

test('backup rejects wrong collection, impossible dates and invalid checksummed values', async () => {
  const valid = await createManualBackup('rsa', { values: {} });
  await assert.rejects(() => validateManualBackup(valid, 'b2w', validManualReport), /selected collection/);
  for (const values of [{ '2026-02-30': { rsaFuel: 1 } }, { '2026-08-23': { rsaFuel: -1 } }, { '2026-08-23': { extraField: 2 } }]) {
    const backup = await createManualBackup('rsa', { values });
    await assert.rejects(() => validateManualBackup(backup, 'rsa', validManualReport), /invalid/);
  }
});

test('missing-only restore preserves zeroes and newer values and is repeatable', () => {
  const current = { values: { '2026-08-23': { rsaFuel: 0, rsaTyrePatch: 9 } } };
  const incoming = { values: { '2026-08-23': { rsaFuel: 0, rsaTyrePatch: 2, rsaJumpstart: 8 } } };
  const plan = planMissingRestore('rsa', current, incoming);
  assert.deepEqual(plan.counts, { missing: 1, identical: 1, existingDifferent: 1 });
  assert.equal(plan.pending.values['2026-08-23'].rsaTyrePatch, 9);
  assert.equal('rsaJumpstart' in current.values['2026-08-23'], false);
  assert.equal(planMissingRestore('rsa', plan.pending, incoming).counts.missing, 0);
});

test('B2W restore keeps SharePoint provenance and never replaces an existing day', async () => {
  const backup = await createManualBackup('b2w', { values: { '2026-08-21': 20, '2026-08-22': 9, '2026-08-23': 5 }, sharePointValues: { '2026-08-21': 20, '2026-08-22': 10, '2026-08-23': 5 }, manualOverrides: { '2026-08-22': 9 } });
  const incoming = await validateManualBackup(backup, 'b2w', validManualReport);
  const current = { values: { '2026-08-23': 12 }, sharePointValues: { '2026-08-23': 12 }, manualOverrides: {} };
  const plan = planMissingRestore('b2w', current, incoming);
  assert.equal(plan.pending.values['2026-08-23'], 12);
  assert.deepEqual(plan.pending.manualOverrides, { '2026-08-22': 9 });
  assert.equal(plan.pending.sharePointValues['2026-08-21'], 20);
});

test('B2W backups reject source/value inconsistency', async () => {
  const backup = await createManualBackup('b2w', { values: { '2026-08-23': 9 }, sharePointValues: { '2026-08-23': 1 }, manualOverrides: {} });
  await assert.rejects(() => validateManualBackup(backup, 'b2w', validManualReport), /source records/);
});

for (const kind of ['bgarage', 'indonesia']) {
  test(`${kind} backup restores missing reports without replacing saved dates`, async () => {
    const report = kind === 'bgarage'
      ? { rows: [{ outlet: 'BGarage Kajang', dailyTarget: 100, dailyActual: 70.5, mtdActual: 700.5, monthlyTarget: 3000, referrals: 2, conversions: 1, pickDrop: 0, intakeActual: 2, intakeTarget: 5 }] }
      : { daily: { pitstop: 'Cengkareng', totalLead: 28, pendingLead: 2, cancelledLead: 1, baterikuJumpstart: 3, baterikuCharge: 1, baterikuWarranty: 2, baterikuBattery: 4, partnerJumpstart: 1, partnerBattery: 2 } };
    const backup = await createManualBackup(kind, { values: { '2026-08-22': report, '2026-08-23': report } });
    const incoming = await validateManualBackup(backup, kind, validManualReport);
    const newer = structuredClone(report);
    if (kind === 'bgarage') newer.rows[0].dailyActual = 99;
    else newer.daily.totalLead = 40;
    const plan = planMissingRestore(kind, { values: { '2026-08-23': newer } }, incoming);
    assert.deepEqual(plan.counts, { missing: 1, identical: 0, existingDifferent: 1 });
    assert.deepEqual(plan.pending.values['2026-08-22'], report);
    assert.deepEqual(plan.pending.values['2026-08-23'], newer);
    assert.equal(planMissingRestore(kind, plan.pending, incoming).counts.missing, 0);
    const invalid = await createManualBackup(kind, { values: { '2026-08-23': {} } });
    await assert.rejects(() => validateManualBackup(invalid, kind, validManualReport), /invalid report/);
  });
}

test('backup request rejects oversized and malformed bodies before restore', async () => {
  for (const body of ['not-json', ' '.repeat(8 * 1024 * 1024 + 1)]) {
    await assert.rejects(() => readBackupRequest(new Request('https://test/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body })), /invalid JSON|8 MB/);
  }
});
