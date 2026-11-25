// "Latest news" on /guide/: loads v1/meta/news.json and renders the headlines.
// Plain TypeScript, no framework and no imports at runtime: the build transpiles this file
// to /site-news.js and appends `startNews();`. Pure functions are exported for tests.
import type { NewsFile } from "@powerstation/schema";

type NewsItem = NewsFile["items"][number];

export const NEWS_UNAVAILABLE = "Headlines are not available right now.";

export interface DateOptions {
  /** BCP 47 locale; undefined = the browser's locale. */
  locale?: string;
  /** IANA time zone; undefined = the browser's time zone. */
  timeZone?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Fetches news.json. Returns null on any failure (network, HTTP status, bad content). */
export async function loadNews(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<NewsFile | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const file = (await res.json()) as Partial<NewsFile>;
    if (file.dataset !== "news" || !Array.isArray(file.items)) return null;
    return file as NewsFile;
  } catch {
    return null;
  }
}

/** HTML for the news block. A missing file or an empty list gives the one-line notice. */
export function newsHtml(file: NewsFile | null, dates: DateOptions = {}): string {
  const items = (file?.items ?? []).filter((i: NewsItem) => safeUrl(i.url) && i.title);
  if (items.length === 0) return `<p class="site-note">${NEWS_UNAVAILABLE}</p>`;
  const fmt = new Intl.DateTimeFormat(dates.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: dates.timeZone,
  });
  const lis = items.map((item) => {
    const ms = item.published_at ? Date.parse(item.published_at) : NaN;
    const date = Number.isNaN(ms)
      ? ""
      : ` · <time datetime="${escapeHtml(item.published_at!)}">${fmt.format(ms)}</time>`;
    return (
      `<li><a href="${escapeHtml(safeUrl(item.url)!)}" rel="noopener" target="_blank">` +
      `${escapeHtml(item.title)}</a>` +
      `<span class="site-news__meta">${escapeHtml(item.source)}${date}</span></li>`
    );
  });
  const credit = file?.attribution
    ? `<p class="site-note">${escapeHtml(file.attribution)}</p>`
    : "";
  return `<ul class="site-news__list">${lis.join("")}</ul>${credit}`;
}

/** Browser entry: fills every [data-news-src] element. */
export async function startNews(): Promise<void> {
  for (const el of document.querySelectorAll<HTMLElement>("[data-news-src]")) {
    const src = el.dataset.newsSrc;
    const file = src ? await loadNews(src) : null;
    el.innerHTML = newsHtml(file);
    el.removeAttribute("aria-busy");
  }
}
