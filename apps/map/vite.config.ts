// Vite config for the map app.
// Dev only: serves the repo fixtures at /data/ and fixes the clock to the fixtures' "now".
// Production reads data from VITE_DATA_BASE_URL (the public R2 base URL) and uses the real clock.
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { defineConfig, type Plugin } from "vite";

const fixtures = join(import.meta.dirname, "..", "..", "fixtures");

function serveFixtures(): Plugin {
  return {
    name: "serve-fixtures",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const file = normalize(join(fixtures, decodeURIComponent((req.url ?? "/").split("?")[0]!)));
        if (!file.startsWith(fixtures) || !existsSync(file) || !statSync(file).isFile())
          return next();
        res.setHeader("Content-Type", "application/json");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [serveFixtures()],
  define: {
    // Fixtures have a fixed "now" (see briefs/session-0-report.md). Override with ?now=<ISO>.
    // The site's demo build (apps/site) sets VITE_FAKE_NOW to fix the clock in a build too.
    __DEV_NOW__: JSON.stringify(
      command === "serve" ? "2026-11-25T12:30:00Z" : (process.env.VITE_FAKE_NOW ?? ""),
    ),
  },
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: { target: "es2022", sourcemap: true },
}));
