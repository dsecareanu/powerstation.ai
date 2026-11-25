import assert from "node:assert/strict";
import { test } from "node:test";
import { runPool } from "../src/pool";

const tick = () => new Promise((r) => setImmediate(r));

test("runPool runs every item and never more than the limit at once", async () => {
  let running = 0;
  let peak = 0;
  const seen: number[] = [];
  await runPool([...Array(25).keys()], 4, async (item) => {
    running++;
    peak = Math.max(peak, running);
    await tick();
    await tick();
    seen.push(item);
    running--;
  });
  assert.equal(peak, 4);
  assert.deepEqual(
    seen.sort((a, b) => a - b),
    [...Array(25).keys()],
  );
});

test("runPool with fewer items than the limit starts one worker per item", async () => {
  let peak = 0;
  let running = 0;
  await runPool([1, 2], 6, async () => {
    running++;
    peak = Math.max(peak, running);
    await tick();
    running--;
  });
  assert.equal(peak, 2);
});

test("runPool stops starting items after an error and throws it", async () => {
  const started: number[] = [];
  await assert.rejects(
    runPool([...Array(20).keys()], 3, async (item) => {
      started.push(item);
      await tick();
      if (item === 1) throw new Error("boom");
    }),
    /boom/,
  );
  assert.ok(started.length < 20, `started ${started.length} items`);
});

test("runPool rejects a bad concurrency", async () => {
  await assert.rejects(
    runPool([1], 0, async () => {}),
    /concurrency/,
  );
  await assert.rejects(
    runPool([1], 1.5, async () => {}),
    /concurrency/,
  );
});
