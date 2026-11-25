// The site shell: header, footer, demo banner and the HTML wrapper for the site's own pages.
// The build (scripts/build.ts) adds the shell to the map and calculator pages after Vite builds them,
// so the apps stay unchanged and keep working on their own.

import { LOGO_SVG } from "./logo";

export const REPO_URL = "https://github.com/dsecareanu/powerstation.ai";

/** The fixtures' "now" (see briefs/session-0-report.md). Demo builds fix the clock here. */
export const FIXTURES_NOW = "2026-11-25T12:30:00Z";

export const DEMO_BANNER_TEXT =
  "Demo data: these numbers are made up for testing. Real data from ENTSO-E is coming.";

export type NavKey = "map" | "calculator" | "guide" | "about";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "map", href: "/", label: "Map" },
  { key: "calculator", href: "/calculator/", label: "Calculator" },
  { key: "guide", href: "/guide/", label: "Guide" },
  { key: "about", href: "/about/", label: "About" },
];

export const NOINDEX_TAG = `<meta name="robots" content="noindex" />`;

/** Pages that show demo numbers. In demo builds they carry NOINDEX_TAG; the guide, About and 404 stay indexable. */
export const NOINDEX_IN_DEMO: readonly NavKey[] = ["map", "calculator"];

export function demoBanner(): string {
  return `<div class="site-demo" role="note"><strong>Demo data:</strong> these numbers are made up for testing. Real data from ENTSO-E is coming.</div>`;
}

export function header(active: NavKey | null): string {
  const links = NAV.map(
    (n) =>
      `<li><a href="${n.href}"${n.key === active ? ' aria-current="page"' : ""}>${n.label}</a></li>`,
  ).join("");
  return `<header class="site-header"><a class="site-logo" href="/" aria-label="powerstation.ai">${LOGO_SVG}</a><nav aria-label="Site"><ul>${links}</ul></nav></header>`;
}

export function footer(): string {
  return `<footer class="site-footer"><p>Data: <a href="https://transparency.entsoe.eu/">ENTSO-E Transparency Platform</a> (CC BY 4.0), <a href="https://epoch.ai/data/ai-supercomputers">Epoch AI</a> (CC BY 4.0), <a href="https://ec.europa.eu/eurostat">Eurostat</a>, <a href="https://www.ipcc.ch/">IPCC</a> and <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain). Each page lists the sources it uses. <a href="/about/">All sources and licenses</a>.</p><p>Free and open source. Code: <a href="${REPO_URL}">GitHub</a>, license <a href="${REPO_URL}/blob/main/LICENSE">AGPL-3.0</a>.</p><p>Created by <a href="https://bio.link/dsecareanu" rel="noopener">Daniel Secareanu</a>.</p></footer>`;
}

/** Favicon, touch icon and manifest links, for every page. Files: public/brand/. */
export const ICON_LINKS =
  `<link rel="icon" href="/brand/favicon.ico" sizes="32x32" />` +
  `<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />` +
  `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />` +
  `<link rel="manifest" href="/brand/site.webmanifest" />` +
  `<meta name="theme-color" content="#15191E" />`;

export interface ShellOptions {
  demo: boolean;
  active: NavKey | null;
}

/** Adds the stylesheet, banner, header and footer to a built HTML page. */
export function injectShell(html: string, opts: ShellOptions): string {
  const head =
    `<link rel="stylesheet" href="/site.css" />` +
    ICON_LINKS +
    (opts.demo && opts.active !== null && NOINDEX_IN_DEMO.includes(opts.active) ? NOINDEX_TAG : "");
  const top = (opts.demo ? demoBanner() : "") + header(opts.active);
  if (!html.includes("</head>") || !/<body[^>]*>/.test(html) || !html.includes("</body>")) {
    throw new Error("Cannot add the site shell: the page has no <head> or <body>.");
  }
  return html
    .replace("</head>", `${head}</head>`)
    .replace(/<body([^>]*)>/, (m) => `${m}${top}`)
    .replace("</body>", `${footer()}</body>`);
}

/** A full HTML document for one of the site's own pages (About, 404). */
export function sitePage(opts: {
  title: string;
  description: string;
  body: string;
  /** Extra tags for <head> (canonical link, Open Graph, structured data). */
  head?: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${opts.title}</title>
    <meta name="description" content="${opts.description}" />
${opts.head ?? ""}  </head>
  <body class="site-doc">
    <main id="main" class="site-main">
${opts.body}
    </main>
  </body>
</html>
`;
}
