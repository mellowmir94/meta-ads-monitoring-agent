import test from "node:test";
import assert from "node:assert/strict";
import { applyConcurrencyAction, DEFAULT_CONCURRENCY_CONFIG } from "../src/concurrency.js";

const config = { ...DEFAULT_CONCURRENCY_CONFIG, limit: 7 };

function simulator(initialState = {}) {
  let state = initialState;
  return {
    run(action, sessionId, now = 1_000) {
      const output = applyConcurrencyAction(state, action, sessionId, now, config);
      state = output.state;
      assert.ok(Object.keys(state.active).length <= 7, "active sessions must never exceed 7");
      return output.result;
    },
    state: () => state
  };
}

function fill(sim, count = 7, now = 1_000) {
  for (let index = 1; index <= count; index += 1) sim.run("enter", `active-${index}`, now);
}

test("first through seventh visitors are admitted", () => {
  const sim = simulator(); fill(sim);
  assert.equal(Object.keys(sim.state().active).length, 7);
  assert.equal(sim.run("check", "active-7").status, "admitted");
});

test("eighth visitor is queue position one", () => {
  const sim = simulator(); fill(sim);
  assert.deepEqual(sim.run("enter", "H"), { status: "queued", position: 1, active: 7, limit: 7, waiting: 1 });
});

test("queue remains FIFO", () => {
  const sim = simulator(); fill(sim);
  ["H", "I", "J"].forEach((id) => sim.run("enter", id));
  assert.deepEqual(sim.state().queue.map((entry) => entry.sessionId), ["H", "I", "J"]);
});

test("two releases promote exactly the first two queued sessions", () => {
  const sim = simulator(); fill(sim);
  ["H", "I", "J"].forEach((id) => sim.run("enter", id));
  sim.run("release", "active-1", 2_000); sim.run("release", "active-2", 2_001);
  assert.equal(sim.run("check", "H", 2_002).status, "admitted");
  assert.equal(sim.run("check", "I", 2_002).status, "admitted");
  assert.equal(sim.run("check", "J", 2_002).position, 1);
});

test("abandoned queue entries expire", () => {
  const sim = simulator(); fill(sim);
  sim.run("enter", "H", 1_000); sim.run("enter", "I", 1_000); sim.run("queue-heartbeat", "I", 50_000);
  assert.equal(sim.run("check", "I", 62_000).position, 1);
});

test("expired active lease promotes queue head", () => {
  const sim = simulator(); fill(sim, 7, 1_000); sim.run("enter", "H", 1_000);
  sim.run("queue-heartbeat", "H", 50_000);
  sim.run("queue-heartbeat", "H", 90_000);
  for (let index = 2; index <= 7; index += 1) sim.run("heartbeat", `active-${index}`, 90_000);
  assert.equal(sim.run("check", "H", 92_000).status, "admitted");
});

test("queued refresh keeps one ticket and position", () => {
  const sim = simulator(); fill(sim); ["H", "I", "J"].forEach((id) => sim.run("enter", id));
  assert.equal(sim.run("enter", "J", 2_000).position, 3);
  assert.equal(sim.state().queue.filter((entry) => entry.sessionId === "J").length, 1);
});

test("active refresh keeps one slot", () => {
  const sim = simulator(); sim.run("enter", "A"); sim.run("enter", "A", 2_000);
  assert.equal(Object.keys(sim.state().active).length, 1);
});

test("multiple available slots promote only available capacity", () => {
  const active = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`active-${index + 1}`, { lastSeen: 1_000 }]));
  const queue = ["H", "I", "J", "K", "L"].map((sessionId, index) => ({ sessionId, joinedAt: 1_000 + index, lastSeen: 1_000 }));
  const sim = simulator({ active, queue });
  const result = sim.run("aggregate", "", 2_000);
  assert.equal(result.active, 7); assert.equal(result.waiting, 3);
  assert.deepEqual(sim.state().queue.map((entry) => entry.sessionId), ["J", "K", "L"]);
});

test("aggregate reports visible capacity without private identifiers", () => {
  const sim = simulator(); fill(sim, 5);
  assert.deepEqual(sim.run("aggregate", ""), { status: "ok", active: 5, limit: 7, available: 2, waiting: 0 });
});
