import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// Demo page for @powerstation/ui. Run: pnpm --filter @powerstation/ui demo
export default defineConfig({
  root: import.meta.dirname,
  plugins: [preact()],
});
