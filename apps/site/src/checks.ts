// Checks on a built site folder. The build fails if any check returns a problem.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { DEMO_BANNER_TEXT, FIXTURES_NOW, NOINDEX_TAG } from "./shell";

/** Built pages that must carry noindex in a demo build (map and calculator). */
export const DEMO_NOINDEX_PAGES = ["index.html", "calculator/index.html"];

/** Initial JS per page, gzipped (CLAUDE.md quality budget). */
export const JS_BUDGET_BYTES = 200 * 1024;

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/** Plain text of an HTML page (tags removed, spaces collapsed), to find the banner text. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A production build must hold no fixtures, no mock files, no banner and no fixed clock. */
export function checkProduction(dist: string): string[] {
  const problems: string[] = [];
  if (existsSync(join(dist, "demo-data"))) problems.push("demo-data/ is in the build");
  for (const file of listFiles(dist)) {
    const rel = relative(dist, file);
    const text = readFileSync(file, "utf8");
    if (file.endsWith(".json") && /"mock"\s*:\s*true/.test(text)) {
      problems.push(`${rel} is a mock data file`);
    }
    if (file.endsWith(".html") && textOf(text).includes(DEMO_BANNER_TEXT)) {
      problems.push(`${rel} has the demo banner`);
    }
    if (file.endsWith(".html") && text.includes(NOINDEX_TAG)) {
      problems.push(`${rel} has a noindex tag`);
    }
    if (file.endsWith(".js") && text.includes(FIXTURES_NOW)) {
      problems.push(`${rel} has the demo clock (${FIXTURES_NOW})`);
    }
  }
  return problems;
}

/**
 * A demo build must show the banner on every page and hold the fixtures.
 * Map and calculator carry noindex; the other pages must not.
 */
export function checkDemo(dist: string): string[] {
  const problems: string[] = [];
  if (!existsSync(join(dist, "demo-data", "v1", "meta", "status.json"))) {
    problems.push("demo-data/v1/meta/status.json is missing");
  }
  for (const file of listFiles(dist).filter((f) => f.endsWith(".html"))) {
    const rel = relative(dist, file);
    const html = readFileSync(file, "utf8");
    if (!textOf(html).includes(DEMO_BANNER_TEXT)) problems.push(`${rel} has no demo banner`);
    const mustNoindex = DEMO_NOINDEX_PAGES.includes(rel);
    if (mustNoindex && !html.includes(NOINDEX_TAG)) problems.push(`${rel} has no noindex tag`);
    if (!mustNoindex && html.includes(NOINDEX_TAG)) problems.push(`${rel} has a noindex tag`);
  }
  return problems;
}

export interface PageJs {
  page: string;
  gzipBytes: number;
}

/** Gzipped size of the JS each page loads at start: module scripts and modulepreloads. */
export function measurePageJs(dist: string): PageJs[] {
  return listFiles(dist)
    .filter((f) => f.endsWith(".html"))
    .map((file) => {
      const html = readFileSync(file, "utf8");
      const srcs = new Set<string>();
      for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) srcs.add(m[1]!);
      for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
        srcs.add(m[1]!);
      }
      let gzipBytes = 0;
      for (const src of srcs) {
        if (!src.startsWith("/")) continue;
        gzipBytes += gzipSync(readFileSync(join(dist, src))).length;
      }
      return { page: relative(dist, file), gzipBytes };
    });
}

export function checkBudget(pages: PageJs[]): string[] {
  return pages
    .filter((p) => p.gzipBytes > JS_BUDGET_BYTES)
    .map((p) => `${p.page} loads ${(p.gzipBytes / 1024).toFixed(1)} KB of JS (gzip), over 200 KB`);
}
