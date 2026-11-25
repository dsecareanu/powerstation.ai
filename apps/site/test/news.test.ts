import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { NewsFile } from "@powerstation/schema";
import { withNewsSource } from "../src/guide-meta";
import { loadNews, NEWS_UNAVAILABLE, newsHtml } from "../src/news";

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../fixtures/v1/meta/news.json"), "utf8"),
) as NewsFile;
const UTC = { locale: "en-GB", timeZone: "UTC" };

function fakeFetch(res: { ok: boolean; body?: unknown } | Error): typeof fetch {
  return (async () => {
    if (res instanceof Error) throw res;
    return { ok: res.ok, json: async () => res.body } as Response;
  }) as typeof fetch;
}

test("renders every item of the fixture: link, source and local date", () => {
  const html = newsHtml(fixture, UTC);
  assert.equal(html.match(/<li>/g)?.length, fixture.items.length);
  const first = fixture.items[0]!;
  assert.ok(html.includes(`<a href="${first.url}" rel="noopener" target="_blank">`));
  assert.ok(html.includes(first.source));
  assert.ok(html.includes('<time datetime="2026-11-25T09:00:00Z">25 Nov 2026</time>'));
  assert.ok(html.includes(fixture.attribution));
});

test("an item without a date shows the source only", () => {
  const file = { ...fixture, items: [{ ...fixture.items[0]!, published_at: null }] };
  const html = newsHtml(file, UTC);
  assert.doesNotMatch(html, /<time/);
  assert.match(html, /Mock Grid News<\/span>/);
});

test("escapes titles and drops non-http links", () => {
  const file = {
    ...fixture,
    items: [
      { title: "<b>A & B</b>", url: "https://example.org/a", source: "S", published_at: null },
      { title: "Bad", url: "javascript:alert(1)", source: "S", published_at: null },
    ],
  };
  const html = newsHtml(file, UTC);
  assert.ok(html.includes("&lt;b&gt;A &amp; B&lt;/b&gt;"));
  assert.doesNotMatch(html, /javascript:/);
  assert.equal(html.match(/<li>/g)?.length, 1);
});

test("an empty list shows the one-line notice", () => {
  assert.equal(newsHtml({ ...fixture, items: [] }), `<p class="site-note">${NEWS_UNAVAILABLE}</p>`);
});

test("a failed fetch gives null, and null shows the notice", async () => {
  assert.equal(await loadNews("/x", fakeFetch(new Error("offline"))), null);
  assert.equal(await loadNews("/x", fakeFetch({ ok: false })), null);
  assert.equal(await loadNews("/x", fakeFetch({ ok: true, body: { dataset: "zones" } })), null);
  assert.equal(newsHtml(null), `<p class="site-note">${NEWS_UNAVAILABLE}</p>`);
});

test("a good fetch returns the file", async () => {
  const file = await loadNews("/x", fakeFetch({ ok: true, body: fixture }));
  assert.equal(file?.items.length, fixture.items.length);
});

test("the build sets the news URL on the guide's news block", () => {
  const guide = readFileSync(resolve(import.meta.dirname, "../pages/guide.html"), "utf8");
  const out = withNewsSource(guide, "/demo-data/v1/meta/news.json");
  assert.match(out, /id="latest"/);
  assert.match(out, /data-news-src="\/demo-data\/v1\/meta\/news.json"/);
  assert.throws(() => withNewsSource("<p></p>", "/x"));
});
