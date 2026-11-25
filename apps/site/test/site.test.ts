import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  checkBudget,
  checkDemo,
  checkFontsOnce,
  checkProduction,
  dropAppFonts,
  measurePageJs,
} from "../src/checks";
import { DEMO_BANNER_TEXT, injectShell, NOINDEX_TAG, sitePage } from "../src/shell";
import { checkWorkerConfig, readWorkerConfig } from "../src/worker-guard";

const APP_HTML = `<!doctype html><html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/assets/a.js"></script></body></html>`;

function tempSite(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ps-site-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

test("the committed wrangler.jsonc passes the Worker guard", () => {
  const config = readWorkerConfig(resolve(import.meta.dirname, "..", "wrangler.jsonc"));
  assert.equal(config.name, "powerstation-site");
  assert.deepEqual(checkWorkerConfig(config), []);
});

test("the Worker guard refuses another name, routes and a script", () => {
  const base = { name: "powerstation-site", workers_dev: false, assets: { directory: "./dist" } };
  assert.match(
    checkWorkerConfig({ ...base, name: "domain-landers" }).join(),
    /only "powerstation-site"/,
  );
  assert.match(checkWorkerConfig({ ...base, routes: [] }).join(), /"routes" is not allowed/);
  assert.match(checkWorkerConfig({ ...base, env: {} }).join(), /"env" is not allowed/);
  assert.match(checkWorkerConfig({ ...base, main: "x.js" }).join(), /"main" is not allowed/);
  assert.match(
    checkWorkerConfig({ ...base, workers_dev: true }).join(),
    /"workers_dev" must be false/,
  );
  const noWorkersDev = { name: base.name, assets: base.assets };
  assert.match(checkWorkerConfig(noWorkersDev).join(), /"workers_dev" must be false/);
});

test("injectShell adds header, footer and, in demo, the banner", () => {
  const prod = injectShell(APP_HTML, { demo: false, active: "map" });
  assert.match(prod, /<header class="site-header">/);
  assert.match(prod, /<a href="\/" aria-current="page">Map<\/a>/);
  assert.match(prod, /<footer class="site-footer">.*AGPL-3.0/);
  assert.match(
    prod,
    /Created by <a href="https:\/\/bio.link\/dsecareanu" rel="noopener">Daniel Secareanu<\/a>/,
  );
  assert.match(prod, /href="\/site.css"/);
  assert.doesNotMatch(prod, /site-demo/);
  assert.doesNotMatch(prod, /noindex/);

  const demo = injectShell(APP_HTML, { demo: true, active: null });
  assert.match(demo, /<body><div class="site-demo" role="note">/);
  assert.doesNotMatch(demo, /noindex/);
  assert.doesNotMatch(demo, /aria-current/);
});

test("demo builds set noindex on the map and calculator only; production never", () => {
  for (const active of ["map", "calculator"] as const) {
    assert.ok(injectShell(APP_HTML, { demo: true, active }).includes(NOINDEX_TAG), active);
    assert.ok(!injectShell(APP_HTML, { demo: false, active }).includes(NOINDEX_TAG), active);
  }
  for (const active of ["guide", "about", null] as const) {
    assert.ok(!injectShell(APP_HTML, { demo: true, active }).includes(NOINDEX_TAG), String(active));
  }
});

test("checkProduction finds fixtures, mock files, the banner and the demo clock", () => {
  const clean = tempSite({ "index.html": injectShell(APP_HTML, { demo: false, active: "map" }) });
  assert.deepEqual(checkProduction(clean), []);

  const dirty = tempSite({
    "index.html": injectShell(APP_HTML, { demo: true, active: "map" }),
    "demo-data/v1/meta/status.json": '{ "mock": true }',
    "assets/a.js": 'const now="2026-11-25T12:30:00Z";',
  });
  const problems = checkProduction(dirty).join("\n");
  assert.match(problems, /demo-data\/ is in the build/);
  assert.match(problems, /status.json is a mock data file/);
  assert.match(problems, /index.html has the demo banner/);
  assert.match(problems, /a.js has the demo clock/);
  assert.match(problems, /index.html has a noindex tag/);
});

test("checkDemo needs the banner on every page and the fixtures", () => {
  const ok = tempSite({
    "index.html": injectShell(APP_HTML, { demo: true, active: "map" }),
    "about/index.html": injectShell(sitePage({ title: "t", description: "d", body: "" }), {
      demo: true,
      active: "about",
    }),
    "demo-data/v1/meta/status.json": "{}",
  });
  assert.deepEqual(checkDemo(ok), []);

  const bad = tempSite({ "index.html": injectShell(APP_HTML, { demo: false, active: "map" }) });
  const problems = checkDemo(bad).join("\n");
  assert.match(problems, /status.json is missing/);
  assert.match(problems, /index.html has no demo banner/);
  assert.match(problems, /index.html has no noindex tag/);

  const noindexOnAbout = tempSite({
    "about/index.html": injectShell(APP_HTML, { demo: true, active: "about" }).replace(
      "</head>",
      `${NOINDEX_TAG}</head>`,
    ),
    "demo-data/v1/meta/status.json": "{}",
  });
  assert.match(checkDemo(noindexOnAbout).join(), /about\/index.html has a noindex tag/);
  assert.ok(DEMO_BANNER_TEXT.startsWith("Demo data:"));
});

test("measurePageJs counts module scripts and preloads, and the budget flags big pages", () => {
  const big = "x".repeat(10);
  const dir = tempSite({ "index.html": APP_HTML, "assets/a.js": big });
  const [page] = measurePageJs(dir);
  assert.equal(page!.page, "index.html");
  assert.ok(page!.gzipBytes > 0);
  assert.deepEqual(checkBudget([{ page: "index.html", gzipBytes: 100 }]), []);
  assert.equal(checkBudget([{ page: "index.html", gzipBytes: 300 * 1024 }]).length, 1);
});

test("injectShell adds the wordmark with a name, and the icon links", () => {
  const html = injectShell(APP_HTML, { demo: false, active: "map" });
  assert.match(html, /<a class="site-logo" href="\/" aria-label="powerstation.ai"><svg /);
  assert.match(html, /<link rel="icon" href="\/brand\/favicon.svg" type="image\/svg\+xml" \/>/);
  assert.match(html, /<link rel="icon" href="\/brand\/favicon.ico" sizes="32x32" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/brand\/apple-touch-icon.png" \/>/);
  assert.match(html, /<link rel="manifest" href="\/brand\/site.webmanifest" \/>/);
});

test("every brand file the pages link to exists", () => {
  const brand = resolve(import.meta.dirname, "..", "public", "brand");
  for (const f of [
    "favicon.svg",
    "favicon.ico",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
    "site.webmanifest",
    "logo-light.svg",
    "logo-dark.svg",
    "logo-mono.svg",
    "mark.svg",
  ]) {
    assert.ok(existsSync(join(brand, f)), f);
  }
});

test("dropAppFonts leaves one copy of each font, in /fonts/ via site.css", () => {
  const face = (url: string) =>
    `@font-face{font-family:IBM Plex Sans;font-weight:400;src:url(${url})format("woff2")}`;
  const dir = tempSite({
    "site.css": face("/fonts/ibm-plex-sans-latin-400-normal.woff2") + "body{color:red}",
    "fonts/ibm-plex-sans-latin-400-normal.woff2": "font",
    "assets/index-a.css":
      face("/assets/ibm-plex-sans-latin-400-normal-Ab12.woff2") + ".map{fill:red}",
    "assets/ibm-plex-sans-latin-400-normal-Ab12.woff2": "font",
    "calculator/assets/index-b.css": face(
      "/calculator/assets/ibm-plex-mono-latin-400-normal-Cd34.woff2",
    ),
    "calculator/assets/ibm-plex-mono-latin-400-normal-Cd34.woff2": "font",
  });
  assert.equal(checkFontsOnce(dir).length, 4);
  assert.equal(dropAppFonts(dir), 4);
  assert.deepEqual(checkFontsOnce(dir), []);
  assert.ok(existsSync(join(dir, "fonts", "ibm-plex-sans-latin-400-normal.woff2")));
  assert.ok(!existsSync(join(dir, "assets", "ibm-plex-sans-latin-400-normal-Ab12.woff2")));
  assert.equal(readFileSync(join(dir, "assets", "index-a.css"), "utf8"), ".map{fill:red}");
  assert.match(readFileSync(join(dir, "site.css"), "utf8"), /@font-face/);
});
