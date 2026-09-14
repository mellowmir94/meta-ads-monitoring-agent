import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConcurrencyAction, DEFAULT_CONCURRENCY_CONFIG } from '../src/concurrency.js';

const config = { ...DEFAULT_CONCURRENCY_CONFIG };

function simulator(initialState = {}) {
  let state = initialState;
  return {
    run(action, sessionId, now = 1_000) {
      const output = applyConcurrencyAction(state, action, sessionId, now, config);
      state = output.state;
      assert.ok(Object.keys(state.active).length <= config.limit, 'active sessions must never exceed the configured limit');
      return output.result;
    },
    state() { return state; }
  };
}

function fillActive(sim, count, now = 1_000) {
  for (let index = 1; index <= count; index += 1) sim.run('enter', `active-${index}`, now);
}

test('1: first visitor is admitted', () => {
  const sim = simulator();
  assert.deepEqual(sim.run('enter', 'A'), { status: 'admitted', active: 1, limit: 10, waiting: 0 });
});

test('2: tenth visitor fills the final slot', () => {
  const sim = simulator();
  fillActive(sim, 9);
  const result = sim.run('enter', 'J');
  assert.equal(result.status, 'admitted');
  assert.equal(result.active, 10);
});

test('3: eleventh visitor joins queue position one', () => {
  const sim = simulator();
  fillActive(sim, 10);
  assert.deepEqual(sim.run('enter', 'K'), { status: 'queued', position: 1, active: 10, limit: 10, waiting: 1 });
});

test('4: waiting visitors preserve FIFO order', () => {
  const sim = simulator();
  fillActive(sim, 10);
  assert.equal(sim.run('enter', 'K').position, 1);
  assert.equal(sim.run('enter', 'L').position, 2);
  assert.equal(sim.run('enter', 'M').position, 3);
  assert.deepEqual(sim.state().queue.map((entry) => entry.sessionId), ['K', 'L', 'M']);
});

test('5: two releases promote exactly the first two queued visitors', () => {
  const sim = simulator();
  fillActive(sim, 10);
  ['K', 'L', 'M'].forEach((id) => sim.run('enter', id));
  sim.run('release', 'active-1', 2_000);
  sim.run('release', 'active-2', 2_001);
  assert.equal(sim.run('check', 'K', 2_002).status, 'admitted');
  assert.equal(sim.run('check', 'L', 2_002).status, 'admitted');
  assert.equal(sim.run('check', 'M', 2_002).position, 1);
  assert.equal(Object.keys(sim.state().active).length, 10);
});

test('6: abandoned queue entry expires and later entries move forward', () => {
  const sim = simulator();
  fillActive(sim, 10);
  sim.run('enter', 'K', 1_000);
  sim.run('enter', 'L', 1_000);
  sim.run('queue-heartbeat', 'L', 50_000);
  const result = sim.run('check', 'L', 62_000);
  assert.equal(result.status, 'queued');
  assert.equal(result.position, 1);
});

test('7: expired active session promotes the next queued visitor', () => {
  const sim = simulator();
  fillActive(sim, 10, 1_000);
  sim.run('enter', 'K', 1_000);
  sim.run('queue-heartbeat', 'K', 50_000);
  for (let index = 2; index <= 10; index += 1) sim.run('heartbeat', `active-${index}`, 90_000);
  sim.run('queue-heartbeat', 'K', 90_000);
  const result = sim.run('check', 'K', 92_000);
  assert.equal(result.status, 'admitted');
  assert.equal(result.active, 10);
});

test('8: queued visitor refresh keeps one entry and the same position', () => {
  const sim = simulator();
  fillActive(sim, 10);
  ['K', 'L', 'M', 'N'].forEach((id) => sim.run('enter', id));
  assert.equal(sim.run('enter', 'N', 2_000).position, 4);
  assert.equal(sim.state().queue.filter((entry) => entry.sessionId === 'N').length, 1);
});

test('9: active visitor refresh remains one active session', () => {
  const sim = simulator();
  sim.run('enter', 'A', 1_000);
  sim.run('enter', 'A', 2_000);
  assert.equal(Object.keys(sim.state().active).length, 1);
  assert.equal(sim.run('check', 'A', 2_001).status, 'admitted');
});

test('10: cleanup promotes only available capacity', () => {
  const active = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`active-${index + 1}`, { lastSeen: 1_000 }]));
  const queue = ['K', 'L', 'M', 'N', 'O'].map((sessionId, index) => ({ sessionId, joinedAt: 1_000 + index, lastSeen: 1_000 }));
  const sim = simulator({ active, queue });
  const result = sim.run('aggregate', '', 2_000);
  assert.equal(result.active, 10);
  assert.equal(result.waiting, 3);
  assert.ok(sim.state().active.K);
  assert.ok(sim.state().active.L);
  assert.deepEqual(sim.state().queue.map((entry) => entry.sessionId), ['M', 'N', 'O']);
});
