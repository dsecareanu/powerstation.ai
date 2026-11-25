import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { checkBudget, checkDemo, checkProduction, measurePageJs } from "../src/checks";
import { DEMO_BANNER_TEXT, injectShell, sitePage } from "../src/shell";
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
  const base = { name: "powerstation-site", workers_dev: true, assets: { directory: "./dist" } };
  assert.match(checkWorkerConfig({ ...base, name: "domain-landers" }).join(), /only "powerstation-site"/);
  assert.match(checkWorkerConfig({ ...base, routes: [] }).join(), /"routes" is not allowed/);
  assert.match(checkWorkerConfig({ ...base, env: {} }).join(), /"env" is not allowed/);
  assert.match(checkWorkerConfig({ ...base, main: "x.js" }).join(), /"main" is not allowed/);
  assert.match(checkWorkerConfig({ ...base, workers_dev: false }).join(), /workers_dev/);
});

test("injectShell adds header, footer and, in demo, the banner", () => {
  const prod = injectShell(APP_HTML, { demo: false, active: "map" });
  assert.match(prod, /<header class="site-header">/);
  assert.match(prod, /<a href="\/" aria-current="page">Map<\/a>/);
  assert.match(prod, /<footer class="site-footer">.*AGPL-3.0/);
  assert.match(prod, /href="\/site.css"/);
  assert.doesNotMatch(prod, /site-demo/);
  assert.doesNotMatch(prod, /noindex/);

  const demo = injectShell(APP_HTML, { demo: true, active: null });
  assert.match(demo, /<body><div class="site-demo" role="note">/);
  assert.match(demo, /noindex/);
  assert.doesNotMatch(demo, /aria-current/);
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
