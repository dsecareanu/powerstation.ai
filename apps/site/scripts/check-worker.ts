// Guard: fails unless apps/site/wrangler.jsonc deploys only the Worker "powerstation-site",
// as assets only, on its workers.dev URL, with no routes or custom domains.
// The same Cloudflare account hosts "domain-landers" (13 domains). Never deploy to it.
import { resolve } from "node:path";
import { checkWorkerConfig, readWorkerConfig } from "../src/worker-guard";

const file = resolve(import.meta.dirname, "..", "wrangler.jsonc");
const problems = checkWorkerConfig(readWorkerConfig(file));
if (problems.length > 0) {
  console.error(`Worker guard failed for ${file}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log('Worker guard: OK (name "powerstation-site", assets only, no routes).');
