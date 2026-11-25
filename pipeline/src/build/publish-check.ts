// Content check before an upload. It looks at what is in the files, not at flags.
// Restricted ENTSO-E data may not be published until ENTSO-E gives written permission.
import type { DataFile } from "@powerstation/schema";

export interface PublishFile {
  path: string;
  data: DataFile;
}

/** Problems with restricted content. */
export function restrictedProblems(files: PublishFile[]): string[] {
  const out: string[] = [];
  for (const { path, data } of files) {
    if (data.dataset === "flows" && data.borders.some((b) => b.kind === "scheduled")) {
      out.push(`${path}: has scheduled exchanges (restricted)`);
    }
    if (data.dataset === "generation") {
      out.push(`${path}: has actual generation and load (restricted)`);
    }
    if (data.dataset === "forecasts" && data.zones.some((z) => Object.keys(z.generation).length)) {
      out.push(`${path}: has wind or solar forecasts (restricted)`);
    }
  }
  return out;
}

/** Problems with mock data. */
export function mockProblems(files: PublishFile[]): string[] {
  return files
    .filter(({ data }) => (data as { mock?: unknown }).mock !== false)
    .map(({ path }) => `${path}: mock is not false`);
}

/**
 * All reasons why the files may not be published. Restricted content is allowed
 * only with ENTSOE_RESTRICTED_PUBLISH_OK=yes. Mock files are never allowed.
 */
export function publishProblems(
  files: PublishFile[],
  env: Record<string, string | undefined> = process.env,
): string[] {
  const restricted = env["ENTSOE_RESTRICTED_PUBLISH_OK"] === "yes" ? [] : restrictedProblems(files);
  return [...mockProblems(files), ...restricted];
}
