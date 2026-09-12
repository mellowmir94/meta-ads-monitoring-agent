import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const start = html.indexOf('      function applyRiderPdfName(');
const context = vm.createContext({});
vm.runInContext(html.slice(start, html.indexOf('\n      }', start) + 8), context);
test('single-rider PDFs use the actual exported rider, even if rider column is hidden', () => {
  const name = 'TRG BHO WAN AHMAD SYAWAL';
  const payload = { panelTitle: 'Commission Rider', rows: [{ rider_name: name }, { rider_name: name }], title: 'Line Item Audit' };
  context.applyRiderPdfName(payload);
  assert.equal(payload.pdfFilename, `${name}.pdf`);
  assert.equal(payload.title, name);
});
test('multiple riders or missing names retain the general PDF name', () => {
  for (const rows of [[{ rider_name: 'A' }, { rider_name: 'B' }], [{ rider_name: 'A' }, {}], []]) {
    const payload = { panelTitle: 'Commission Rider', rows, title: 'Line Item Audit' };
    context.applyRiderPdfName(payload);
    assert.equal(payload.pdfFilename, undefined);
    assert.equal(payload.title, 'Line Item Audit');
  }
});
