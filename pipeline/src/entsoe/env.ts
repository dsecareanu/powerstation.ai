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
