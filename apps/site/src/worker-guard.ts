import { readFileSync } from "node:fs";

export const ALLOWED_WORKER_NAME = "powerstation-site";

/** Reads wrangler.jsonc. Comments must be on their own line (starting with //). */
export function readWorkerConfig(file: string): Record<string, unknown> {
  const json = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  return JSON.parse(json) as Record<string, unknown>;
}

/** Problems with the config. Empty = safe to deploy. */
export function checkWorkerConfig(config: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (config.name !== ALLOWED_WORKER_NAME) {
    problems.push(`name is ${JSON.stringify(config.name)}; only "${ALLOWED_WORKER_NAME}" is allowed`);
  }
  for (const key of ["routes", "route", "env", "main", "services", "durable_objects"]) {
    if (key in config) problems.push(`"${key}" is not allowed (assets-only preview Worker)`);
  }
  if (config.workers_dev !== true) problems.push('"workers_dev" must be true');
  const assets = config.assets as { directory?: unknown } | undefined;
  if (!assets || typeof assets.directory !== "string") {
    problems.push('"assets.directory" must be set');
  }
  return problems;
}
