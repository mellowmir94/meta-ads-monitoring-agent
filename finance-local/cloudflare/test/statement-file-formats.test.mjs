import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../deductions.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('async function deductionHistoryDownloadBatch('), source.indexOf('async function deductionHistoryExport('));
function fixture(formats, failPdf = false) {
  const calls = [], feedback = {textContent: ''}, payload = {rows: ['same statement']};
  const button = {disabled: false, isConnected: true, closest: () => ({
    querySelectorAll: () => formats.map(format => ({dataset: {statementFileFormat: format}}))
  }), setAttribute() {}, removeAttribute() {}};
  const context = vm.createContext({
    crypto: {randomUUID: () => 'test-request'}, deductionState: {records: []},
    deductionDownloadFeedback: (_button, message) => { feedback.textContent = message; },
    deductionHistoryEnsure: () => ({querySelector: () => feedback}),
    deductionHistoryGroups: () => [{id: 'group'}], deductionHistoryFilters: () => ({}),
    deductionToday: () => '2026-09-21',
    deductionHistoryDownloadOptions: () => [{record: {id: 'record'}, index: 0, item: {}, state: 'ready'}],
    ensureFinanceExportBundle: async format => calls.push('bundle:' + format),
    deductionCombinedPaymentStatementPayload: async () => ({}),
    prepareRiderStatement: async () => {calls.push('prepare'); return payload;},
    downloadExcelTable: async input => {assert.equal(input, payload); calls.push('excel');},
    downloadPdfTable: async input => {assert.equal(input, payload); calls.push('pdf'); if(failPdf) throw new Error('PDF failed'); return true;},
    deductionRequest: async () => {calls.push('mark'); return {};},
    deductionHistoryRender: () => calls.push('render')
  });
  vm.runInContext(handler, context);
  return {run: () => context.deductionHistoryDownloadBatch('group', button), calls, feedback, button};
}
test('History row offers PDF checked by default, Excel unchecked, and Download file heading', () => {
  assert.match(source, /data-statement-file-format="pdf" checked/);
  assert.match(source, /data-statement-file-format="excel"> Excel/);
  assert.match(source, /<th>Download file<\/th>/);
  assert.match(source, /data-deduction-history-batch-download>Download file/);
});
test('no format selected produces guidance without exports or mutations', async () => {
  const f=fixture([]); await f.run(); assert.deepEqual(f.calls, []);
  assert.match(f.feedback.textContent, /Select PDF, Excel, or both/);
});
test('Excel only never marks a PDF downloaded', async () => {
  const f=fixture(['excel']); await f.run();
  assert.deepEqual(f.calls, ['bundle:excel','prepare','excel']); assert.equal(f.button.disabled,false);
});
test('PDF only retains existing acknowledgement workflow', async () => {
  const f=fixture(['pdf']); await f.run();
  assert.deepEqual(f.calls, ['bundle:pdf','prepare','pdf','mark','render']);
});
test('both files share one prepared statement and acknowledge PDF once', async () => {
  const f=fixture(['pdf','excel']); await f.run();
  assert.deepEqual(f.calls, ['bundle:pdf','bundle:excel','prepare','excel','pdf','mark','render']);
});
test('failed PDF does not mark acknowledgement and releases download button', async () => {
  const f=fixture(['pdf'],true); await assert.rejects(f.run(), /PDF failed/);
  assert.ok(!f.calls.includes('mark')); assert.equal(f.button.disabled,false);
});
