// Test only. Vite dedupes `preact` in the build (@preact/preset-vite). Node does not:
// @powerstation/ui would load its own dev copy of preact, and a second copy renders nothing.
// This hook resolves every `preact` import from the calculator, as the build does.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const parent = ${JSON.stringify(import.meta.url)};
      export async function resolve(specifier, context, next) {
        if (specifier === "preact" || specifier.startsWith("preact/")) {
          return next(specifier, { ...context, parentURL: parent });
        }
        return next(specifier, context);
      }
    `),
);
