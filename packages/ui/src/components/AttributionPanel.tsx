import type { Envelope } from "@powerstation/schema";

export type AttributionSource = Pick<
  Envelope,
  "source" | "source_url" | "license" | "attribution" | "mock"
>;

export interface AttributionPanelProps {
  /** The data files the page has loaded. Duplicate sources are shown once. */
  files: readonly AttributionSource[];
  /** Start expanded. Default: false. */
  open?: boolean;
  title?: string;
  class?: string;
}

/** Link to the SPDX page for a license id, e.g. CC-BY-4.0 or ODbL-1.0. */
export function licenseUrl(license: string): string | undefined {
  return /^[A-Za-z0-9.+-]+$/.test(license)
    ? `https://spdx.org/licenses/${license}.html`
    : undefined;
}

/** Unique sources, in first-seen order. */
export function uniqueSources(files: readonly AttributionSource[]): AttributionSource[] {
  const seen = new Map<string, AttributionSource>();
  for (const f of files) {
    const key = [f.source, f.source_url ?? "", f.license, f.attribution].join("\u0000");
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}

/** Lists source, license and attribution text of all loaded data files. */
export function AttributionPanel({
  files,
  open = false,
  title = "Data sources",
  class: className,
}: AttributionPanelProps) {
  const sources = uniqueSources(files);
  const hasMock = files.some((f) => f.mock);
  return (
    <details class={["ps-attribution", className].filter(Boolean).join(" ")} open={open}>
      <summary>
        {title} ({sources.length})
      </summary>
      <div class="ps-attribution__body">
        {hasMock ? (
          <p class="ps-attribution__demo">
            Demo data: some values on this page are not real grid data.
          </p>
        ) : null}
        <ul class="ps-attribution__list">
          {sources.map((s) => {
            const url = licenseUrl(s.license);
            return (
              <li key={`${s.source}|${s.license}|${s.attribution}`}>
                <div class="ps-attribution__source">
                  {s.source_url ? <a href={s.source_url}>{s.source}</a> : s.source}
                </div>
                <div>{s.attribution}</div>
                <div class="ps-attribution__meta">
                  License: {url ? <a href={url}>{s.license}</a> : s.license}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
