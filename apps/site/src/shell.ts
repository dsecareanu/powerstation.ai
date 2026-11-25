// The site shell: header, footer, demo banner and the HTML wrapper for the site's own pages.
// The build (scripts/build.ts) adds the shell to the map and calculator pages after Vite builds them,
// so the apps stay unchanged and keep working on their own.

export const REPO_URL = "https://github.com/dsecareanu/powerstation.ai";

/** The fixtures' "now" (see briefs/session-0-report.md). Demo builds fix the clock here. */
export const FIXTURES_NOW = "2026-11-25T12:30:00Z";

export const DEMO_BANNER_TEXT =
  "Demo data: these numbers are made up for testing. Real data from ENTSO-E is coming.";

export type NavKey = "map" | "calculator" | "about";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "map", href: "/", label: "Map" },
  { key: "calculator", href: "/calculator/", label: "Calculator" },
  { key: "about", href: "/about/", label: "About" },
];

export function demoBanner(): string {
  return `<div class="site-demo" role="note"><strong>Demo data:</strong> these numbers are made up for testing. Real data from ENTSO-E is coming.</div>`;
}

export function header(active: NavKey | null): string {
  const links = NAV.map(
    (n) =>
      `<li><a href="${n.href}"${n.key === active ? ' aria-current="page"' : ""}>${n.label}</a></li>`,
  ).join("");
  return `<header class="site-header"><a class="site-logo" href="/">powerstation.ai</a><nav aria-label="Site"><ul>${links}</ul></nav></header>`;
}

export function footer(): string {
  return `<footer class="site-footer"><p>Data: <a href="https://transparency.entsoe.eu/">ENTSO-E Transparency Platform</a> (CC BY 4.0), <a href="https://epoch.ai/data/ai-supercomputers">Epoch AI</a> (CC BY 4.0), <a href="https://ec.europa.eu/eurostat">Eurostat</a>, <a href="https://www.ipcc.ch/">IPCC</a> and <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain). Each page lists the sources it uses. <a href="/about/">All sources and licenses</a>.</p><p>Free and open source. Code: <a href="${REPO_URL}">GitHub</a>, license <a href="${REPO_URL}/blob/main/LICENSE">AGPL-3.0</a>.</p></footer>`;
}

export interface ShellOptions {
  demo: boolean;
  active: NavKey | null;
}

/** Adds the stylesheet, banner, header and footer to a built HTML page. */
export function injectShell(html: string, opts: ShellOptions): string {
  const head =
    `<link rel="stylesheet" href="/site.css" />` +
    (opts.demo ? `<meta name="robots" content="noindex" />` : "");
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
export function sitePage(opts: { title: string; description: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${opts.title}</title>
    <meta name="description" content="${opts.description}" />
  </head>
  <body class="site-doc">
    <main id="main" class="site-main">
${opts.body}
    </main>
  </body>
</html>
`;
}
