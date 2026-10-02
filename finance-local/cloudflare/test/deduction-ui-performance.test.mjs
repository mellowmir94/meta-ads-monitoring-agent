import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../../deductions.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('formula totals skip timestamp formatting when the audit date scope is already known', () => {
  let formatted = 0;
  const rows = Array.from({ length: 10000 }, (_, index) => ({ commission: index % 2 ? 25 : 35, created_at: '2026-09-15 12:00:00' }));
  const context = vm.createContext({
    numberValue: Number, formatGrafanaTimestamp: value => { formatted++; return value; },
    deductionSingleRider: () => ({ valid: false }), deductionState: { loaded: true, records: [], error: '' }
  });
  vm.runInContext(section('function deductionSummaryForRows(', 'function deductionDraftFor('), context);
  const result = context.deductionSummaryForRows(rows, { start: '2026-09-14', end: '2026-09-20' });
  assert.equal(result.grossCents, 30000000);
  assert.equal(formatted, 0, '10,000 audit rows must not be reformatted and sorted for each formula render');
});

test('single-pass fallback boundaries preserve deduction amounts for missing audit dates', () => {
  const context = vm.createContext({
    numberValue: Number, formatGrafanaTimestamp: value => value || '', deductionRiderKey: value => value.toLowerCase(),
    deductionSingleRider: () => ({ valid: true, key: 'rider a' }), deductionStatus: record => record.status,
    deductionInstallments: record => record.installments, deductionInstallmentAmount: (_record, item) => item.amountCents,
    deductionInstallmentSettlement: () => null, deductionStatementAmountForRecord: (_record, items) => items.reduce((sum, item) => sum + item.amountCents, 0),
    deductionState: { loaded: true, error: '', records: [{ rider: 'Rider A', status: 'applied', type: 'epf', installments: [
      { status: 'applied', dueDate: '2026-09-14', amountCents: 2500 },
      { status: 'applied', dueDate: '2026-09-20', amountCents: 2500 },
      { status: 'applied', dueDate: '2026-09-21', amountCents: 2500 }
    ] }] }
  });
  vm.runInContext(section('function deductionSummaryForRows(', 'function deductionDraftFor('), context);
  const rows = ['2026-09-20 12:00:00', '', '2026-09-14 12:00:00'].map(created_at => ({ created_at, commission: 100 }));
  const result = context.deductionSummaryForRows(rows, {});
  assert.equal(result.appliedCents, 5000);
  assert.equal(result.netCents, 25000);
  assert.equal(context.deductionSummaryForRows(rows, { start: '2026-09-18' }).appliedCents, 2500);
  assert.equal(context.deductionSummaryForRows([], {}).grossCents, 0);
  assert.deepEqual(rows.map(row => row.created_at), ['2026-09-20 12:00:00', '', '2026-09-14 12:00:00']);
});

test('Proceed refreshes the full register only once before opening History', async () => {
  let reads = 0, saves = 0, historyRenders = 0;
  const feedback = { textContent: '' };
  const view = { hidden: true, querySelector: () => feedback, scrollIntoView() {} };
  const commission = { classList: { contains: () => true } };
  const context = vm.createContext({
    crypto, deductionTypes: { insurance: 'Insurance' }, deductionState: { loaded: true, actor: { name: 'Finance' } }, deductionDrafts: new Map(),
    deductionRows: () => [{ rider_name: 'Rider A', commission: 350 }],
    deductionSingleRider: () => ({ valid: true, rider: 'Rider A', key: 'rider a' }),
    auditCapture: () => ({ scope: { dates: { start: '2026-09-14', end: '2026-09-20' } } }),
    numberValue: Number, deductionNextMonday: () => '2026-09-21', deductionToday: () => '2026-09-21',
    deductionEpfSchedule: () => [{ dueDate: '2026-09-24' }],
    deductionRequest: async (path, input) => {
      saves++; assert.equal(path, '/create-batch'); assert.equal(input.lines[0].amount, '12.50');
      return { records: [{ id: 'saved', type: 'insurance', amountCents: 1250 }] };
    },
    deductionLoad: async () => { reads++; context.deductionState.loaded = true; },
    deductionHistoryEnsure: () => view, deductionHistoryUseCommissionRange() {}, deductionHistorySyncNavigation() {},
    deductionHistoryRender: () => { historyRenders++; }, render() {},
    document: { querySelector: selector => selector.includes('.nav-button') ? commission : null, getElementById: () => ({ classList: { add() {} } }) }
  });
  vm.runInContext(section('async function deductionProceedBatch(', '// Embedded in'), context);
  vm.runInContext(section('async function deductionHistoryOpen(', 'function deductionHistoryClose('), context);
  await context.deductionProceedBatch('commission-main-ledger', ['insurance'], { insurance: { amount: '12.50' } });
  assert.equal(saves, 1);
  assert.equal(reads, 1, 'opening History after Proceed must not fetch the entire register a second time');
  assert.equal(historyRenders, 1);
  assert.equal(view.hidden, false);
});

test('a post-save refresh cannot reuse a register read that started before the save', async () => {
  let release, reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const context = vm.createContext({
    deductionState: { loaded: true, records: [], loading: null },
    deductionRequest: async () => {
      reads++;
      const snapshot = [{ id: reads === 1 ? 'before-save' : 'after-save' }];
      if (reads === 1) await gate;
      return { records: snapshot };
    }
  });
  vm.runInContext(section('async function deductionLoad(', 'function deductionAddDays('), context);
  const old = context.deductionLoad();
  const fresh = context.deductionLoad({ fresh: true });
  release(); await Promise.all([old, fresh]);
  assert.equal(reads, 2);
  assert.equal(context.deductionState.records[0].id, 'after-save');
});
