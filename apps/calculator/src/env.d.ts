/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL of the data files (R2). In `vite dev` it defaults to `/data/`. */
  readonly VITE_DATA_BASE_URL?: string;
  /** Dev only: ISO time that replaces the real clock, e.g. 2026-11-25T12:00:00Z. */
  readonly VITE_FAKE_NOW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
