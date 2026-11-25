// Measures what @powerstation/ui adds to an app: minified + gzipped JS and CSS,
// with Preact and the schema package left out. Run: pnpm --filter @powerstation/ui size
import { build } from "esbuild";
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
