// Builds v1/meta/news.json from public RSS and Atom feeds (pipeline/src/news.ts).
// Usage: tsx scripts/news.ts --out <dir>
// A feed that fails is skipped. With zero items, nothing is written, so the upload step
// is skipped and the previous file on R2 stays. No secrets needed.
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DATA_PATHS, SCHEMA_VERSION, type NewsFile } from "@powerstation/schema";
import { validateDataFile } from "@powerstation/schema/validate";
import { writeFiles } from "../src/build/output";
import { FEEDS, NEWS_HEADER, parseFeed, selectItems } from "../src/news";

const { values: args } = parseArgs({ options: { out: { type: "string" } } });
if (!args.out) throw new Error("Usage: news.ts --out <dir>");
const outDir = resolve(process.env["INIT_CWD"] ?? process.cwd(), args.out);

const USER_AGENT = "powerstation.ai news reader (+https://github.com/dsecareanu/powerstation.ai)";
const nowMs = Date.now();

const results = await Promise.allSettled(
  FEEDS.map(async (feed) => {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.text(), feed, nowMs);
  }),
);

const perFeed = results.map((r, i) => {
  const feed = FEEDS[i]!;
  if (r.status === "rejected") {
    const reason = (r.reason as Error).message;
    console.log(`::warning::Skipped ${feed.source} (${feed.url}): ${reason}`);
    return [];
  }
  console.log(`${feed.source}: ${r.value.length} items in the feed`);
  return r.value;
});

const items = selectItems(perFeed, nowMs);
if (items.length === 0) {
  console.log("::warning::No matching headlines. Nothing written; the previous news.json stays.");
  process.exit(0);
}

const file: NewsFile = {
  schema_version: SCHEMA_VERSION,
  generated_at: new Date(Math.floor(nowMs / 1000) * 1000).toISOString().replace(".000Z", "Z"),
  mock: false,
  ...NEWS_HEADER,
  items,
};
const result = validateDataFile(file);
if (!result.ok) throw new Error(`news.json is not valid:\n  ${result.errors.join("\n  ")}`);

writeFiles({ [DATA_PATHS.news]: file }, outDir, (line) => console.log(line));
for (const i of items) console.log(`  ${i.published_at ?? "(no date)"}  ${i.source}: ${i.title}`);
console.log(`Wrote ${items.length} headlines to ${join(outDir, DATA_PATHS.news)}`);
