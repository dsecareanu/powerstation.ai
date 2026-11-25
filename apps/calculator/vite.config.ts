import preact from "@preact/preset-vite";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const fixturesRoot = resolve(import.meta.dirname, "..", "..", "fixtures");

// Dev only: serves ../../fixtures/v1/* at /data/v1/*. It never runs in `vite build`
// or `vite preview`, and fixtures are never copied into the production build.
function devFixtures(): Plugin {
  return {
    name: "powerstation-dev-fixtures",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data/", (req, res, next) => {
        const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/"));
        const file = join(fixturesRoot, path);
        if (
          !file.startsWith(fixturesRoot + "/") ||
          extname(file) !== ".json" ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), devFixtures()],
  // @powerstation/ui has its own dev copy of preact. Two copies in one bundle drop the shared
  // components from the page (for example the data-state badges), so use one copy.
  resolve: { dedupe: ["preact"] },
});
