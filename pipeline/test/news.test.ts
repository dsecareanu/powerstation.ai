import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDataFile } from "@powerstation/schema/validate";
import { SCHEMA_VERSION, type NewsFile } from "@powerstation/schema";
import {
  FEEDS,
  KEYWORDS,
  MAX_ITEMS,
  NEWS_HEADER,
  parseFeed,
  plainText,
  selectItems,
  toUtc,
  type NewsItem,
} from "../src/news";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const feed = { source: "Test Publisher", url: "https://news.example.org/feed.xml" };

const rss = `<?xml version="1.0"?><rss><channel><title>Feed</title>
<item><title><![CDATA[Grid operators &amp; TSOs plan new interconnector]]></title>
  <link>https://news.example.org/a</link><pubDate>Tue, 24 Nov 2026 08:13:42 +0000</pubDate>
  <description>Article text that must never be kept.</description>
  <enclosure url="https://news.example.org/a.jpg" type="image/jpeg"/></item>
<item><title>Data centre load &#8216;doubles&#8217; in Ireland</title>
  <link>https://news.example.org/b</link><pubDate>not a date</pubDate></item>
<item><title>No link here</title></item>
</channel></rss>`;

const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title type="html">AI power demand &lt;b&gt;rises&lt;/b&gt;</title>
  <link rel="alternate" href="https://atom.example.org/x?a=1&amp;b=2"/>
  <published>2026-11-23T10:00:00Z</published></entry></feed>`;

// ACER style: <link> holds an encoded <a> tag; the real link is inside the title.
const acer = `<rss><channel><item>
<title><a href="/news/acer-grid-report" hreflang="en">ACER grid report</a></title>
<link>https://www.acer.europa.eu/%3Ca%20href%3D%22/news/acer-grid-report%22%3EACER%3C/a%3E</link>
<pubDate>Fri, 11/20/2026 - 15:03</pubDate></item></channel></rss>`;

test("parseFeed reads RSS: title, link and date only", () => {
  const items = parseFeed(rss, feed, NOW);
  assert.deepEqual(items, [
    {
      title: "Grid operators & TSOs plan new interconnector",
      url: "https://news.example.org/a",
      source: "Test Publisher",
      published_at: "2026-11-24T08:13:42Z",
    },
    {
      title: "Data centre load ‘doubles’ in Ireland",
      url: "https://news.example.org/b",
      source: "Test Publisher",
      published_at: null,
    },
  ]);
});

test("parseFeed reads Atom: link href, encoded markup removed", () => {
  assert.deepEqual(parseFeed(atom, feed, NOW), [
    {
      title: "AI power demand rises",
      url: "https://atom.example.org/x?a=1&b=2",
      source: "Test Publisher",
      published_at: "2026-11-23T10:00:00Z",
    },
  ]);
});

test("parseFeed repairs an ACER-style link and date", () => {
  const acerFeed = { source: "ACER", url: "https://www.acer.europa.eu/rss.xml" };
  assert.deepEqual(parseFeed(acer, acerFeed, NOW), [
    {
      title: "ACER grid report",
      url: "https://www.acer.europa.eu/news/acer-grid-report",
      source: "ACER",
      published_at: "2026-11-20T15:03:00Z",
    },
  ]);
});

test("parseFeed drops non-http links", () => {
  const xml = `<rss><item><title>Grid story</title><link>javascript:alert(1)</link></item></rss>`;
  assert.deepEqual(parseFeed(xml, feed, NOW), []);
});

test("toUtc: valid, invalid and future dates", () => {
  assert.equal(toUtc("Wed, 25 Nov 2026 09:30:00 +0100", NOW), "2026-11-25T08:30:00Z");
  assert.equal(toUtc("", NOW), null);
  assert.equal(toUtc("soon", NOW), null);
  assert.equal(toUtc("Mon, 24 May 2027 14:00:33 +0200", NOW), null);
});

test("plainText decodes entities and removes tags", () => {
  assert.equal(plainText("<![CDATA[A &amp; B]]>"), "A & B");
  assert.equal(plainText("&lt;i&gt;x&lt;/i&gt; &#x2019; &hellip;"), "x ’ …");
});

test("keywords match the project topics and skip others", () => {
  for (const t of [
    "New HVDC interconnector links two grids",
    "ENTSO-E winter outlook",
    "Hyperscaler signs PPA for 500 MW",
    "AI drives electricity demand in Europe",
    "Small modular reactor plan",
    "Data center campus approved",
  ]) {
    assert.ok(KEYWORDS.test(t), t);
  }
  for (const t of ["Commissioner visits Ireland", "Gas storage confirmed for winter"]) {
    assert.ok(!KEYWORDS.test(t), t);
  }
});

const item = (title: string, source: string, at: string | null): NewsItem => ({
  title,
  url: `https://example.org/${encodeURIComponent(title)}`,
  source,
  published_at: at,
});

test("selectItems: keywords, 2 per source, dedupe, newest first, max 8, max age", () => {
  const perFeed = [
    [
      item("Grid story 1", "A", "2026-11-25T10:00:00Z"),
      item("Grid story 2", "A", "2026-11-25T11:00:00Z"),
      item("Grid story 3", "A", "2026-11-25T11:30:00Z"),
      item("Unrelated story", "A", "2026-11-25T11:59:00Z"),
      item("Sponsored: grid webinar", "A", "2026-11-25T11:59:00Z"),
    ],
    [
      item("grid story 3", "B", "2026-11-24T00:00:00Z"),
      item("Old grid story", "B", "2026-10-01T00:00:00Z"),
      item("Undated grid story", "B", null),
    ],
    ...Array.from({ length: 6 }, (_, i) => [
      item(`Nuclear story ${i}`, `C${i}`, `2026-11-2${i}T00:00:00Z`),
    ]),
  ];
  const out = selectItems(perFeed, NOW);
  assert.equal(out.length, MAX_ITEMS);
  assert.deepEqual(
    out.map((i) => i.title),
    [
      "Grid story 3",
      "Grid story 2",
      "Nuclear story 5",
      "Nuclear story 4",
      "Nuclear story 3",
      "Nuclear story 2",
      "Nuclear story 1",
      "Nuclear story 0",
    ],
  );
});

test("selectItems keeps undated items last and drops a duplicate title", () => {
  const out = selectItems(
    [
      [item("Grid A", "A", null), item("Grid B", "A", "2026-11-20T00:00:00Z")],
      [item("GRID B", "B", "2026-11-19T00:00:00Z")],
    ],
    NOW,
  );
  assert.deepEqual(
    out.map((i) => `${i.source}:${i.title}`),
    ["A:Grid B", "A:Grid A"],
  );
});

test("a built news file is valid against the schema", () => {
  const file: NewsFile = {
    schema_version: SCHEMA_VERSION,
    generated_at: "2026-11-25T12:00:00Z",
    mock: false,
    ...NEWS_HEADER,
    items: selectItems(
      [parseFeed(rss, feed, NOW), parseFeed(atom, { ...feed, source: "Other Publisher" }, NOW)],
      NOW,
    ),
  };
  assert.deepEqual(validateDataFile(file).errors, []);
  assert.equal(file.items.length, 3);
});

test("feed list: 6 to 8 feeds, unique names, https", () => {
  assert.ok(FEEDS.length >= 6 && FEEDS.length <= 8);
  assert.equal(new Set(FEEDS.map((f) => f.source)).size, FEEDS.length);
  assert.ok(FEEDS.every((f) => f.url.startsWith("https://")));
});

test("validateAll without zones.json: news passes, a file with zones does not", async () => {
  const { validateAll } = await import("../src/build/output");
  const file: NewsFile = {
    schema_version: SCHEMA_VERSION,
    generated_at: "2026-11-25T12:00:00Z",
    mock: false,
    ...NEWS_HEADER,
    items: [item("Grid story", "A", "2026-11-25T10:00:00Z")],
  };
  assert.deepEqual(validateAll({ "v1/meta/news.json": file }, null), []);
  const flows = {
    ...file,
    dataset: "flows",
    window: { start: "2026-11-25T00:00:00Z", end: "2026-11-25T01:00:00Z" },
    borders: [],
  } as unknown as NewsFile;
  delete (flows as unknown as Record<string, unknown>)["items"];
  assert.match(validateAll({ "v1/flows/x.json": flows }, null).join("\n"), /needs zones\.json/);
});
