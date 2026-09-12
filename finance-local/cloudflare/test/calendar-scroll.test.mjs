import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('one wheel gesture changes one month despite long momentum, next gesture works', () => {
  const handlers = {};
  const changes = [];
  let now = 1000;
  const context = vm.createContext({ document: { addEventListener: (type, fn) => { handlers[type] = fn; } }, performance: { now: () => now }, shiftCalendarMonth: (id, step) => changes.push(step) });
  const start = html.indexOf('      let calendarWheelTotal = 0;');
  vm.runInContext(html.slice(start, html.indexOf('      document.addEventListener("click", async', start)), context);
  const target = { closest: () => ({ querySelector: () => ({ dataset: { calendarMonthPanel: 'p' } }) }) };
  const wheel = deltaY => handlers.wheel({ target, deltaY, deltaX: 0, deltaMode: 0, preventDefault() {} });
  for (let i = 0; i < 30; i++) { wheel(60); now += 80; }
  assert.deepEqual(changes, [1]);
  // Momentum fades, then the user pushes again without a forced waiting period.
  for (const delta of [30, 12, 4]) { now += 20; wheel(delta); }
  now += 20;
  wheel(60);
  assert.deepEqual(changes, [1, 1]);
  changes.pop();
  // Delayed momentum and slow-render gaps must not count as a second swipe.
  for (const gap of [400, 700, 1100, 500]) { now += gap; wheel(60); }
  assert.deepEqual(changes, [1]);
  now += 1300;
  wheel(-60);
  assert.deepEqual(changes, [1, -1]);
  handlers.touchstart({ target, touches: [{ clientX: 0, clientY: 200 }] });
  handlers.touchmove({ touches: [{ clientX: 0, clientY: 100 }], preventDefault() {} });
  handlers.touchend();
  assert.deepEqual(changes, [1, -1, 1]);
  now += 600;
  wheel(90);
  assert.deepEqual(changes, [1, -1, 1]);
});
test('calendar scrolling and arrows share month navigation without changing selected dates', () => {
  const start = html.indexOf('      function shiftCalendarMonth(');
  const state = { dates: { p: { start: '2026-09-04', end: '2026-09-10' } }, dateDrafts: {}, calendarMonths: { p: '2026-12' } };
  let renders = 0;
  const context = vm.createContext({ state, calendarMonthForPanel: id => state.calendarMonths[id], render: () => renders++ });
  vm.runInContext(html.slice(start, html.indexOf('\n      }', start) + 8), context);
  context.shiftCalendarMonth('p', 1);
  assert.equal(state.calendarMonths.p, '2027-01');
  context.shiftCalendarMonth('p', -1);
  assert.equal(state.calendarMonths.p, '2026-12');
  assert.deepEqual(state.dates.p, { start: '2026-09-04', end: '2026-09-10' });
  assert.equal(renders, 2);
  assert.match(html, /aria-label="Previous month"/);
  assert.match(html, /aria-label="Next month"/);
  assert.match(html, /document.addEventListener\("wheel"/);
  assert.match(html, /document.addEventListener\("touchmove"/);
});
