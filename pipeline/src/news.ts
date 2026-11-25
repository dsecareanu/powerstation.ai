// Headlines for the news list on /guide/, from public RSS and Atom feeds.
// We keep only the title, the link, the publisher name and the date. Never article text or images.
// Parsing follows the old powerstation.ai lander (regex over <item>/<entry> blocks).
import type { NewsFile } from "@powerstation/schema";

export interface Feed {
  /** Publisher name shown next to the headline. */
  source: string;
  url: string;
}

// Terms checked 2026-11-25 (see DATA_SOURCES.md). Not used: ENTSO-E news (its website
// terms forbid reuse without written permission), Euractiv (terms page not reachable),
// Clean Energy Wire (no news-only feed), WindEurope (industry association).
export const FEEDS: readonly Feed[] = [
  { source: "DatacenterDynamics", url: "https://www.datacenterdynamics.com/en/rss/" },
  {
    source: "Data Center Frontier",
    url: "https://www.datacenterfrontier.com/__rss/website-scheduled-content.xml?input=%7B%22sectionAlias%22%3A%22home%22%7D",
  },
  { source: "Latitude Media", url: "https://www.latitudemedia.com/feed" },
  { source: "World Nuclear News", url: "https://www.world-nuclear-news.org/rss" },
  { source: "European Commission (Energy)", url: "https://energy.ec.europa.eu/node/2/rss_en" },
  { source: "ACER", url: "https://www.acer.europa.eu/rss.xml" },
];

/** A headline is kept if its title matches. Grid, cross-border flows, data centers, AI power. */
export const KEYWORDS =
  /\bgrids?\b|interconnect|cross-border|transmission|\bTSOs?\b|ENTSO-E|\bACER\b|electricity|power (market|price|demand|supply|plant|line|cable|system)|blackout|data ?cent(er|re)|hyperscal|\bAI\b|artificial intelligence|load growth|nuclear|\bSMRs?\b|small modular|gigawatt|\bGW\b|megawatt|\bMW\b|\bPPAs?\b|power purchase|curtail|congestion|HVDC|subsea cable/i;

export const PER_SOURCE = 2;
export const MAX_ITEMS = 8;
/** Items older than this are left out, so a feed that stopped does not fill the list. */
export const MAX_AGE_DAYS = 30;
const BLOCKS_PER_FEED = 40;
const MAX_TITLE = 300;

export const NEWS_HEADER = {
  dataset: "news",
  source: "Public RSS and Atom feeds of the publishers named in each item",
  license: "Headlines and links belong to their publishers",
  attribution:
    "Headlines and links belong to their publishers. We show only the title, a link, the publisher name and the date.",
} as const;

export type NewsItem = NewsFile["items"][number];

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1]! : "";
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/** Plain text: no CDATA, no tags, entities decoded, whitespace collapsed. */
export function plainText(s: string): string {
  const decode = (x: string) =>
    x
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);
  // Tags are removed before and after decoding, so encoded tags (&lt;b&gt;) go too.
  const noCdata = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decode(noCdata.replace(/<[^>]+>/g, " "))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** UTC ISO time without milliseconds, or null for a missing, invalid or future date. */
export function toUtc(raw: string, nowMs: number): string | null {
  if (!raw) return null;
  // Drupal style "Fri, 11/20/2026 - 15:03" (ACER): month/day/year, no time zone, read as UTC.
  const d = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}) - (\d{1,2}):(\d{2})/);
  const ms = d ? Date.UTC(+d[3]!, +d[1]! - 1, +d[2]!, +d[4]!, +d[5]!) : Date.parse(raw);
  if (Number.isNaN(ms) || ms > nowMs + 60 * 60_000) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Absolute http(s) URL, or null. Relative links resolve against the feed URL. */
function validUrl(s: string, base: string): string | null {
  const v = s.trim();
  // A link that holds an encoded tag is broken (ACER puts "<a href=...>" in <link>).
  if (!v || /%3C|</i.test(v)) return null;
  try {
    const url = new URL(v, base);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * All items of one feed, in feed order. Items without a title or a valid link are left out.
 * Link order: <link> text, <link href>, then the first href inside the title.
 */
export function parseFeed(xml: string, feed: Feed, nowMs: number): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)) {
    if (out.length >= BLOCKS_PER_FEED) break;
    const b = m[0];
    const rawTitle = tag(b, "title");
    const title = plainText(rawTitle);
    const titleHref = decodeHref(rawTitle);
    const href = b.match(/<link[^>]*?href="([^"]+)"/)?.[1] ?? "";
    const url =
      validUrl(plainText(tag(b, "link")), feed.url) ??
      validUrl(href.replace(/&amp;/g, "&"), feed.url) ??
      validUrl(titleHref, feed.url);
    const date = plainText(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated"));
    if (!title || title.length > MAX_TITLE || !url) continue;
    out.push({ title, url, source: feed.source, published_at: toUtc(date, nowMs) });
  }
  return out;
}

/** Newest first; items without a date go last. */
export function byDate(a: NewsItem, b: NewsItem): number {
  const ta = a.published_at === null ? -Infinity : Date.parse(a.published_at);
  const tb = b.published_at === null ? -Infinity : Date.parse(b.published_at);
  return tb - ta;
}

/** The first href="..." in a title (plain or entity-encoded markup). */
function decodeHref(rawTitle: string): string {
  const s = rawTitle
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
  return s.match(/<a\s[^>]*?href="([^"]+)"/i)?.[1] ?? "";
}

/**
 * Keyword match, not older than MAX_AGE_DAYS (undated items stay), at most PER_SOURCE per
 * feed, dedupe by title, newest first, at most MAX_ITEMS.
 */
export function selectItems(perFeed: NewsItem[][], nowMs: number): NewsItem[] {
  const seen = new Set<string>();
  const oldest = nowMs - MAX_AGE_DAYS * 24 * 60 * 60_000;
  return perFeed
    .flatMap((items) =>
      items
        .filter((i) => KEYWORDS.test(i.title) && !/^sponsored/i.test(i.title))
        .filter((i) => i.published_at === null || Date.parse(i.published_at) >= oldest)
        .sort(byDate)
        .slice(0, PER_SOURCE),
    )
    .sort(byDate)
    .filter((i) => {
      const key = i.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS);
}
