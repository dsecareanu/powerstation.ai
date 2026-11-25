import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, Progress } from "../src/progress";

function make(total: number, every = 100) {
  let clock = 0;
  const lines: string[] = [];
  const p = new Progress({
    total,
    every,
    heartbeatMs: 60_000,
    clock: () => clock,
    log: (l) => lines.push(l),
    details: () => "avg response 800 ms",
  });
  return { p, lines, advance: (ms: number) => (clock += ms) };
}

test("formatDuration", () => {
  assert.equal(formatDuration(4_400), "4s");
  assert.equal(formatDuration(125_000), "2m 5s");
  assert.equal(formatDuration(3_725_000), "1h 2m 5s");
});

test("Progress writes a line every 100 items and at the end", () => {
  const { p, lines, advance } = make(250);
  for (let i = 0; i < 250; i++) {
    advance(1_000);
    p.tick(i % 10 === 0);
  }
  assert.deepEqual(lines, [
    "[100/250] pairs with data: 10, elapsed 1m 40s, avg response 800 ms",
    "[200/250] pairs with data: 20, elapsed 3m 20s, avg response 800 ms",
    "[250/250] pairs with data: 25, elapsed 4m 10s, avg response 800 ms",
  ]);
});

test("Progress counts cached items and keeps the 100 step", () => {
  const { p, lines } = make(300);
  p.skip(150, 7);
  for (let i = 0; i < 50; i++) p.tick(false);
  assert.deepEqual(lines, ["[200/300] pairs with data: 7, elapsed 0s, avg response 800 ms"]);
});

test("Progress heartbeat writes only after 60 s without a line", () => {
  const { p, lines, advance } = make(2_000);
  advance(59_000);
  p.heartbeat();
  assert.equal(lines.length, 0);
  advance(1_000);
  p.heartbeat();
  assert.deepEqual(lines, [
    "[0/2000] pairs with data: 0, elapsed 1m 0s, avg response 800 ms (still running)",
  ]);
  p.heartbeat();
  assert.equal(lines.length, 1);
});
