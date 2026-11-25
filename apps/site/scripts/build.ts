// Builds the whole static site into apps/site/dist:
//   /             map (apps/map)
//   /calculator/  calculator (apps/calculator)
//   /about/       About and sources (apps/site/pages)
//   /404.html     not-found page
//
// Production (default): apps read VITE_DATA_BASE_URL (default https://data.powerstation.ai/),
// real clock, no fixtures. The build fails if fixtures or demo markers are in the output.
// Demo (--demo or VITE_DEMO=1): fixtures copied to /demo-data/v1/, apps read them, the clock is
// fixed to the fixtures' "now", and every page shows the demo banner.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkBudget,
  checkDemo,
  checkProduction,
  JS_BUDGET_BYTES,
  measurePageJs,
} from "../src/checks";
import { FIXTURES_NOW, injectShell, sitePage, type NavKey } from "../src/shell";

const siteDir = resolve(import.meta.dirname, "..");
const repoDir = resolve(siteDir, "..", "..");
const dist = join(siteDir, "dist");

const demo = process.argv.includes("--demo") || process.env.VITE_DEMO === "1";
const dataBase = demo
  ? "/demo-data/"
  : process.env.VITE_DATA_BASE_URL || "https://data.powerstation.ai/";

if (!demo && process.env.VITE_FAKE_NOW) {
  throw new Error("VITE_FAKE_NOW is set. A production build must use the real clock.");
}
if (!dataBase.endsWith("/")) throw new Error(`VITE_DATA_BASE_URL must end in "/": ${dataBase}`);

const env: NodeJS.ProcessEnv = { ...process.env, VITE_DATA_BASE_URL: dataBase };
delete env.VITE_FAKE_NOW;
delete env.VITE_CALCULATOR_URL;
if (demo) env.VITE_FAKE_NOW = FIXTURES_NOW;

console.log(`Building the site in ${demo ? "DEMO" : "production"} mode. Data: ${dataBase}`);

function viteBuild(pkg: string, base: string, outDir: string): void {
  execFileSync(
    "pnpm",
    ["--filter", pkg, "exec", "vite", "build", "--base", base, "--outDir", outDir, "--emptyOutDir"],
    { cwd: repoDir, env, stdio: "inherit" },
  );
}

rmSync(dist, { recursive: true, force: true });
viteBuild("@powerstation/map", "/", dist);
viteBuild("@powerstation/calculator", "/calculator/", join(dist, "calculator"));

// One stylesheet for the shell: the shared tokens + the shell styles.
const tokens = readFileSync(fileURLToPath(import.meta.resolve("@powerstation/ui/tokens.css")));
const shellCss = readFileSync(join(siteDir, "src", "shell.css"));
writeFileSync(join(dist, "site.css"), `${tokens}\n${shellCss}`);

// The site's own pages.
mkdirSync(join(dist, "about"), { recursive: true });
writeFileSync(
  join(dist, "about", "index.html"),
  sitePage({
    title: "About and sources | powerstation.ai",
    description:
      "What powerstation.ai is, how to read its numbers, and where the data comes from, with licenses.",
    body: readFileSync(join(siteDir, "pages", "about.html"), "utf8"),
  }),
);
writeFileSync(
  join(dist, "404.html"),
  sitePage({
    title: "Page not found | powerstation.ai",
    description: "This page does not exist.",
    body: readFileSync(join(siteDir, "pages", "404.html"), "utf8"),
  }),
);

// Add the shell to every page.
const pages: [string, NavKey | null][] = [
  ["index.html", "map"],
  ["calculator/index.html", "calculator"],
  ["about/index.html", "about"],
  ["404.html", null],
];
for (const [page, active] of pages) {
  const file = join(dist, page);
  writeFileSync(file, injectShell(readFileSync(file, "utf8"), { demo, active }));
}

if (demo) cpSync(join(repoDir, "fixtures", "v1"), join(dist, "demo-data", "v1"), { recursive: true });

// Checks. Any problem fails the build.
const sizes = measurePageJs(dist);
for (const s of sizes) {
  console.log(`  ${s.page.padEnd(24)} initial JS ${(s.gzipBytes / 1024).toFixed(1)} KB gzip`);
}
const problems = [...checkBudget(sizes), ...(demo ? checkDemo(dist) : checkProduction(dist))];
if (problems.length > 0) {
  console.error(`\nSite build check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `\nSite built in ${dist} (${demo ? "demo" : "production"}). JS budget ${JS_BUDGET_BYTES / 1024} KB per page: OK.`,
);
