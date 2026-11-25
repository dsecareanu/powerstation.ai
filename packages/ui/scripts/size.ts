// Measures what @powerstation/ui adds to an app: minified + gzipped JS and CSS,
// with Preact and the schema package left out. Run: pnpm --filter @powerstation/ui size
import { build } from "esbuild";
import { readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

const common = { bundle: true, minify: true, write: false, logLevel: "silent" } as const;

const js = await build({
  ...common,
  entryPoints: [new URL("../src/index.ts", import.meta.url).pathname],
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "preact",
  external: ["preact", "preact/*", "@powerstation/schema"],
});
const css = await build({
  ...common,
  entryPoints: [new URL("../src/styles.css", import.meta.url).pathname],
  // Font files load separately (fonts.css). They are reported below, outside the budget.
  external: ["*.woff2"],
});

let total = 0;
for (const [name, result] of [
  ["JS", js],
  ["CSS", css],
] as const) {
  const bytes = result.outputFiles[0]!.contents;
  const gz = gzipSync(bytes).length;
  total += gz;
  console.log(
    `${name}: ${(bytes.length / 1024).toFixed(1)} KB min, ${(gz / 1024).toFixed(1)} KB gzip`,
  );
}
console.log(`Total: ${(total / 1024).toFixed(1)} KB gzip (budget 30 KB)`);

const fontDir = new URL("../src/fonts/", import.meta.url);
const fontBytes = readdirSync(fontDir)
  .filter((f) => f.endsWith(".woff2"))
  .reduce((sum, f) => sum + statSync(new URL(f, fontDir)).size, 0);
console.log(
  `Fonts: ${(fontBytes / 1024).toFixed(1)} KB woff2 (4 files, loaded on demand, not in the budget)`,
);
