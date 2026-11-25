// Uploads files to Cloudflare R2 through the S3 API (SigV4).
import { AwsClient } from "aws4fetch";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

const ENV_NAMES = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

/** Reads the R2 settings from the environment. Throws and names every missing variable. */
export function readR2Config(env: Record<string, string | undefined> = process.env): R2Config {
  const missing = ENV_NAMES.filter((n) => !env[n]);
  if (missing.length > 0)
    throw new Error(`Missing R2 environment variables: ${missing.join(", ")}`);
  return {
    accountId: env["R2_ACCOUNT_ID"]!,
    accessKeyId: env["R2_ACCESS_KEY_ID"]!,
    secretAccessKey: env["R2_SECRET_ACCESS_KEY"]!,
    bucket: env["R2_BUCKET"]!,
  };
}

export interface UploadItem {
  /** Object key, e.g. v1/flows/rolling-7d.json. */
  key: string;
  body: string;
}

type FetchFn = (request: Request) => Promise<Response>;

/** Downloads one object as text. Returns null if the object does not exist (HTTP 404). */
export async function downloadFile(
  config: R2Config,
  key: string,
  fetchFn: FetchFn = (r) => fetch(r),
): Promise<string | null> {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const url = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
  const res = await fetchFn(await aws.sign(url, { method: "GET" }));
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`R2 download of ${key} failed (HTTP ${res.status}): ${detail}`);
  }
  return res.text();
}

/** Uploads the items in the given order. Stops at the first failure. */
export async function uploadFiles(
  items: UploadItem[],
  config: R2Config,
  fetchFn: FetchFn = (r) => fetch(r),
  log: (message: string) => void = () => {},
): Promise<void> {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const base = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  for (const item of items) {
    const request = await aws.sign(`${base}/${item.key}`, {
      method: "PUT",
      body: item.body,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
    const res = await fetchFn(request);
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
      throw new Error(`R2 upload of ${item.key} failed (HTTP ${res.status}): ${detail}`);
    }
    log(`Uploaded ${item.key}`);
  }
}

/**
 * Restricted ENTSO-E data (generation, load, scheduled exchanges, wind/solar forecasts)
 * may not be published until ENTSO-E gives written permission.
 */
export function assertPublishAllowed(
  includeRestricted: boolean,
  env: Record<string, string | undefined> = process.env,
): void {
  if (includeRestricted && env["ENTSOE_RESTRICTED_PUBLISH_OK"] !== "yes") {
    throw new Error(
      "Refusing to upload restricted data (generation, load, scheduled exchanges, wind/solar " +
        "forecasts). We wait for written permission from ENTSO-E. " +
        "Set ENTSOE_RESTRICTED_PUBLISH_OK=yes only after permission is recorded.",
    );
  }
}
