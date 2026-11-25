import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EntsoeClient,
  formatPeriod,
  RateLimitStop,
  redact,
  type ClientOptions,
  type FetchFn,
} from "../src/entsoe/client";
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

test("429: pauses 11 minutes and continues; the second ban stops the client", async () => {
  const a = makeClient([status(429), ok(xml)]);
  await a.client.get({ documentType: "A11" });
  assert.deepEqual(a.sleeps, [660_000]);
  const b = makeClient([status(429), status(429), ok(xml)]);
  await assert.rejects(b.client.get({}), RateLimitStop);
  assert.equal(b.client.stopped, true);
  // No request is sent after the stop.
  await assert.rejects(b.client.get({}), RateLimitStop);
  assert.equal(b.client.requestCount, 2);
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

// Virtual time: parallel sleeps and in-flight requests wait side by side, like real timers.
function virtualClient(
  respond: (sentAt: number) => number,
  opts: { latencyMs?: number } & Partial<ClientOptions> = {},
) {
  let clock = 0;
  const timers: { at: number; wake: () => void }[] = [];
  const later = (ms: number) => new Promise<void>((wake) => timers.push({ at: clock + ms, wake }));
  const sentAt: number[] = [];
  const logs: string[] = [];
  const { latencyMs = 0, ...extra } = opts;
  const client = new EntsoeClient({
    token: TOKEN,
    fetchFn: async () => {
      const at = clock;
      sentAt.push(at);
      if (latencyMs > 0) await later(latencyMs);
      return status(respond(at), xml);
    },
    sleep: later,
    clock: () => clock,
    log: (m) => logs.push(m),
    ...extra,
  });
  async function run(count: number) {
    let finished = false;
    const all = Promise.allSettled(
      Array.from({ length: count }, (_, i) => client.get({ i: String(i) })),
    ).then((r) => {
      finished = true;
      return r;
    });
    while (!finished) {
      await new Promise((r) => setImmediate(r));
      if (timers.length === 0) continue;
      clock = Math.min(...timers.map((x) => x.at));
      for (const x of timers.filter((x) => x.at <= clock)) {
        timers.splice(timers.indexOf(x), 1);
        x.wake();
      }
    }
    return all;
  }
  return { client, sentAt, logs, run, now: () => clock };
}

function maxInWindow(times: number[], windowMs: number): number {
  return Math.max(...times.map((t) => times.filter((s) => s > t - windowMs && s <= t).length));
}

test("default caps: 2 requests per second and 120 per minute, also in parallel", async () => {
  const v = virtualClient(() => 200);
  const results = await v.run(300);
  assert.ok(results.every((r) => r.status === "fulfilled"));
  assert.equal(v.sentAt.length, 300);
  assert.ok(maxInWindow(v.sentAt, 1_000) <= 2, `${maxInWindow(v.sentAt, 1_000)} in one second`);
  assert.ok(maxInWindow(v.sentAt, 60_000) <= 120, `${maxInWindow(v.sentAt, 60_000)} in a minute`);
  // 300 requests at 120 per minute need at least 2 minutes.
  assert.ok(Math.max(...v.sentAt) >= 120_000, `last at ${Math.max(...v.sentAt)}`);
});

test("caps can be changed by option", async () => {
  const v = virtualClient(() => 200, { maxPerSecond: 5, maxPerMinute: 1_000 });
  await v.run(30);
  assert.ok(maxInWindow(v.sentAt, 1_000) <= 5);
  // 30 requests at 5 per second need at least 5 seconds.
  assert.ok(Math.max(...v.sentAt) >= 5_000 && Math.max(...v.sentAt) < 7_000);
});

test("429: one shared pause for all requests; in-flight 429s count as the same ban", async () => {
  // Every request sent in the first 10 minutes gets 429; later ones succeed.
  const v = virtualClient((at) => (at < 600_000 ? 429 : 200), { latencyMs: 500 });
  const results = await v.run(3);
  assert.ok(results.every((r) => r.status === "fulfilled"));
  assert.equal(v.client.bans, 1);
  assert.equal(v.logs.filter((l) => l.includes("HTTP 429")).length, 1);
  // The first 429 arrives at 500 ms. Nothing is sent until 11 minutes after that.
  assert.ok(
    v.sentAt.every((t) => t <= 500 || t >= 500 + 660_000),
    `sent at ${v.sentAt.join(", ")}`,
  );
  assert.equal(v.sentAt.filter((t) => t >= 660_500).length, 3);
});

test("429: the second ban stops all requests, waiting ones too", async () => {
  const v = virtualClient(() => 429, { latencyMs: 500 });
  const results = await v.run(5);
  assert.ok(results.every((r) => r.status === "rejected" && r.reason instanceof RateLimitStop));
  assert.equal(v.client.bans, 2);
  assert.equal(v.client.stopped, true);
  // At most 2 requests before the pause and 2 after it (2 per second, 500 ms in flight).
  assert.ok(v.sentAt.length <= 4, `${v.sentAt.length} requests sent`);
  assert.ok(v.logs.some((l) => l.includes("Stopping")));
});

test("requestsLastMinute counts requests sent in the last 60 seconds", async () => {
  const v = virtualClient(() => 200);
  await v.run(10);
  assert.equal(v.client.requestsLastMinute(), 10);
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
