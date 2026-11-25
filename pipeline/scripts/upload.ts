// Uploads every v1/**/*.json file under <dir> to R2. status.json goes last.
// zones.json must be in <dir>, unless every file is zone-free (for example news.json alone).
// Usage: tsx scripts/upload.ts <dir>
// Needs the R2 settings. It checks the content first and refuses to upload mock data,
// invalid files, or restricted ENTSO-E data (unless ENTSOE_RESTRICTED_PUBLISH_OK=yes).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { DATA_PATHS, type DataFile, type ZonesFile } from "@powerstation/schema";
import { validateAll, ZONE_FREE } from "../src/build/output";
import { publishProblems } from "../src/build/publish-check";
import { loadDotEnv, requireSecrets } from "../src/entsoe/env";
import { readR2Config, uploadFiles } from "../src/r2";

function collect(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return collect(path);
      return name.endsWith(".json") ? [path] : [];
    });
}

async function main(): Promise<void> {
  loadDotEnv();
  const dirArg = process.argv[2];
  if (!dirArg) throw new Error("Usage: upload.ts <dir>");
  requireSecrets(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]);
  const dir = resolve(process.env["INIT_CWD"] ?? process.cwd(), dirArg);

  const items = collect(join(dir, "v1")).map((file) => {
    const path = relative(dir, file).split(sep).join("/");
    return { path, text: readFileSync(file, "utf8") };
  });
  if (items.length === 0) throw new Error(`No v1/**/*.json files under ${dir}`);
  const parsed = items.map((i) => ({ path: i.path, data: JSON.parse(i.text) as DataFile }));

  const problems = publishProblems(parsed);
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    throw new Error("Refusing to upload. Nothing was uploaded.");
  }
  const zones = parsed.find((f) => f.path === DATA_PATHS.zones)?.data as ZonesFile | undefined;
  // zones.json is needed to check zone references. A folder with only zone-free files
  // (for example news.json alone) may be uploaded without it.
  if (!zones && !parsed.every((f) => ZONE_FREE.has(f.data.dataset))) {
    throw new Error(`${DATA_PATHS.zones} is not in ${dir}. Nothing was uploaded.`);
  }
  const files = Object.fromEntries(parsed.map((f) => [f.path, f.data]));
  const errors = validateAll(files, zones ?? null);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    throw new Error("Validation failed. Nothing was uploaded.");
  }

  // status.json goes last, so the UI never sees a status newer than its data.
  const status = DATA_PATHS.status;
  const ordered = [
    ...items.filter((i) => i.path !== status),
    ...items.filter((i) => i.path === status),
  ];
  console.log(`Uploading ${ordered.length} file(s).`);
  await uploadFiles(
    ordered.map((i) => ({ key: i.path, body: i.text })),
    readR2Config(),
    undefined,
    (m) => console.log(m),
  );
  console.log("Upload done.");
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
