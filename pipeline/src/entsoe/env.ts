// Loads pipeline/.env (git-ignored) into process.env. Existing variables win.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadDotEnv(): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/**
 * Checks that secrets are set. Throws one line per missing secret.
 * Used by the scripts that run in GitHub Actions.
 */
export function requireSecrets(
  names: readonly string[],
  env: Record<string, string | undefined> = process.env,
): void {
  const lines = names
    .filter((n) => !env[n])
    .map((n) => `Missing secret ${n} (add it to the GitHub environment "data-publish")`);
  if (lines.length > 0) throw new Error(lines.join("\n"));
}
