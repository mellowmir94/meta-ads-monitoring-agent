import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('column selection preserves the open menu, scroll and checkbox focus across redraws', () => {
  const start = html.indexOf('      function renderWithColumnMenuOpen(');
  const source = html.slice(start, html.indexOf('\n      }', start) + 8);
  for (const panelId of ['commission-main', 'reimbursement-details', 'commission-main:copy:1']) {
    const popover = { scrollTop: 125 };
    const menu = { open: true, querySelector: () => popover };
    let focused = false;
    let renders = 0;
    const input = { dataset: { columnTogglePanel: panelId, columnToggleKey: 'quantity' }, closest: () => menu, focus: options => { focused = options.preventScroll; } };
    const context = vm.createContext({ document: { querySelectorAll: () => [input] }, render: () => { renders++; menu.open = false; popover.scrollTop = 0; } });
    vm.runInContext(source, context);
    context.renderWithColumnMenuOpen(input);
    context.renderWithColumnMenuOpen(input);
    assert.equal(renders, 2);
    assert.equal(menu.open, true);
    assert.equal(popover.scrollTop, 125);
    assert.equal(focused, true);
  }
  assert.match(html, /state\.hiddenColumns\[panelId\] = \[\.\.\.hidden\];\s+renderWithColumnMenuOpen\(columnToggle\);/);
});
