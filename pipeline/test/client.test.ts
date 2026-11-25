import assert from "node:assert/strict";
import { test } from "node:test";
import { EntsoeClient, formatPeriod, redact, type FetchFn } from "../src/entsoe/client";
import { ackXml, docXml, hourlyPeriod } from "./helpers";

const TOKEN = "secret-token-123";
const ok = (body: string) => ({ status: 200, text: async () => body });
const status = (code: number, body = "") => ({ status: code, text: async () => body });

function makeClient(
  responses: ReturnType<typeof status>[],
  extra: Partial<{ maxPerSecond: number }> = {},
) {
  const sleeps: number[] = [];
  let clock = 0;
  const urls: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    urls.push(url);
    const r = responses.shift();
    if (!r) throw new Error(`network down ${url}`);
    return r;
  };
  const client = new EntsoeClient({
    token: TOKEN,
    fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    clock: () => clock,
    ...extra,
  });
  return { client, sleeps, urls, now: () => clock };
}

const xml = docXml([{ periods: [hourlyPeriod(0, 3_600_000, () => 1)] }]);

test("formatPeriod gives yyyyMMddHHmm in UTC", () => {
  assert.equal(formatPeriod(Date.UTC(2026, 10, 25, 7, 5)), "202611250705");
});

test("429: waits 11 minutes and retries, at most 2 times", async () => {
  const a = makeClient([status(429), status(429), ok(xml)]);
  await a.client.get({ documentType: "A11" });
  assert.deepEqual(a.sleeps, [660_000, 660_000]);
  const b = makeClient([status(429), status(429), status(429), ok(xml)]);
  await assert.rejects(b.client.get({}), /429/);
});

test("5xx: retries 3 times with backoff 2 s, 8 s, 30 s", async () => {
  const a = makeClient([status(503), status(500), status(502), ok(xml)]);
  await a.client.get({});
  assert.deepEqual(a.sleeps, [2_000, 8_000, 30_000]);
  const b = makeClient([status(503), status(503), status(503), status(503)]);
  await assert.rejects(b.client.get({}), /HTTP 503/);
});

test("network error is retried", async () => {
  const a = makeClient([]);
  await assert.rejects(a.client.get({}), /Network error/);
  assert.deepEqual(a.sleeps, [2_000, 8_000, 30_000]);
});

test("401 fails fast", async () => {
  const a = makeClient([status(401)]);
  await assert.rejects(a.client.get({}), /token/);
  assert.deepEqual(a.sleeps, []);
});

test("400 fails with the reason text", async () => {
  const a = makeClient([status(400, ackXml("999", "Invalid domain"))]);
  await assert.rejects(a.client.get({}), /Invalid domain/);
});

test("the token is sent but never appears in an error message", async () => {
  const a = makeClient([status(400, `bad request for securityToken=${TOKEN}`)]);
  await assert.rejects(a.client.get({}), (err: Error) => {
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
  const b = makeClient([ok(xml)]);
  await b.client.get({});
  assert.ok(b.urls[0]!.includes(`securityToken=${TOKEN}`));
  assert.ok(!redact(b.urls[0]!).includes(TOKEN));
});

test("throttle: no more than 6 requests in one second", async () => {
  const responses = Array.from({ length: 13 }, () => ok(xml));
  const a = makeClient(responses);
  for (let i = 0; i < 13; i++) await a.client.get({});
  assert.ok(a.now() >= 2_000, `elapsed ${a.now()} ms`);
});

test("throttle holds when many requests run at the same time", async () => {
  // Virtual time: parallel sleeps wait side by side, like real timers.
  let clock = 0;
  const timers: { at: number; wake: () => void }[] = [];
  const sentAt: number[] = [];
  const client = new EntsoeClient({
    token: TOKEN,
    fetchFn: async () => {
      sentAt.push(clock);
      return ok(xml);
    },
    sleep: (ms) => new Promise<void>((wake) => timers.push({ at: clock + ms, wake })),
    clock: () => clock,
    maxPerMinute: 1_000,
  });
  let finished = false;
  const all = Promise.all(Array.from({ length: 30 }, (_, i) => client.get({ i: String(i) }))).then(
    () => (finished = true),
  );
  while (!finished) {
    await new Promise((r) => setImmediate(r));
    if (timers.length === 0) continue;
    clock = Math.min(...timers.map((x) => x.at));
    for (const x of timers.filter((x) => x.at <= clock)) {
      timers.splice(timers.indexOf(x), 1);
      x.wake();
    }
  }
  await all;
  assert.equal(sentAt.length, 30);
  for (const t of sentAt) {
    const inWindow = sentAt.filter((s) => s > t - 1_000 && s <= t).length;
    assert.ok(inWindow <= 6, `${inWindow} requests in one second at ${t} ms`);
  }
  // 30 requests at 6 per second need at least 4 seconds.
  assert.ok(
    Math.max(...sentAt) >= 4_000 && Math.max(...sentAt) < 6_000,
    `last at ${Math.max(...sentAt)}`,
  );
});

test("averageResponseMs counts finished responses", async () => {
  const { client } = makeClient([ok(xml), ok(xml)]);
  assert.equal(client.averageResponseMs(), null);
  await client.get({});
  await client.get({});
  assert.equal(client.responses, 2);
  assert.equal(client.averageResponseMs(), 0);
});

test("fetchDocument: an empty acknowledgement (999) is an empty result", async () => {
  const a = makeClient([ok(ackXml("999"))]);
  const doc = await a.client.fetchDocument({});
  assert.equal(doc.empty, true);
});
