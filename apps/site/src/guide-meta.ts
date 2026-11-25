// <head> tags for the guide page: canonical URL, Open Graph and structured data.
// Title and description stay close to the old powerstation.ai page (search value).
// Keep the FAQ answers here the same as the text in pages/guide.html.

export const GUIDE_TITLE = "powerstation.ai: Power infrastructure for the AI era";
export const GUIDE_DESCRIPTION =
  "How AI is changing power demand: data center electricity use, grid connection limits, on-site generation, nuclear and SMRs, and who is building the power for AI.";
const URL = "https://powerstation.ai/guide/";
const UPDATED = "2026-11-25";

const FAQ: [string, string][] = [
  [
    "How much electricity do data centers use?",
    'The IEA estimates about 415 TWh in 2024, about 1.5% of the world\'s electricity. It expects about 945 TWh by 2030, with AI as the main driver (IEA, "Energy and AI", 2025).',
  ],
  [
    "Why is the grid connection the bottleneck for AI data centers?",
    "A large AI campus can need hundreds of megawatts or more, in every hour. New transmission lines, substations and power plants take years to approve and build. In many markets, the wait for a connection is now longer than the time to build the data center.",
  ],
  [
    "Will nuclear power supply AI data centers?",
    "Partly, over time. Large cloud companies have signed long-term deals to restart or extend existing reactors, and to buy power from small modular reactors. Most new SMR capacity is not expected before the 2030s. Until then, gas, renewables with storage, and grid upgrades supply most of the new demand.",
  ],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      headline: "Power infrastructure for the AI era",
      dateModified: UPDATED,
      mainEntityOfPage: URL,
      publisher: { "@type": "Organization", name: "powerstation.ai" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(([name, text]) => ({
        "@type": "Question",
        name,
        acceptedAnswer: { "@type": "Answer", text },
      })),
    },
  ],
};

export function guideHead(): string {
  return [
    `<link rel="canonical" href="${URL}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="${URL}" />`,
    `<meta property="og:title" content="${GUIDE_TITLE}" />`,
    `<meta property="og:description" content="Data center power demand, grid limits, on-site generation and nuclear for AI computing." />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ]
    .map((line) => `    ${line}\n`)
    .join("");
}

/** Script tag for the "Latest news" block (src/news.ts, built to /site-news.js). */
export const NEWS_SCRIPT_TAG = `<script type="module" src="/site-news.js"></script>`;

/** Sets the news.json URL on the guide's news block. Fails if the block is missing. */
export function withNewsSource(guideBody: string, newsUrl: string): string {
  const marker = 'data-news-src=""';
  if (!guideBody.includes(marker)) throw new Error(`guide.html has no ${marker} block`);
  return guideBody.replace(marker, `data-news-src="${newsUrl}"`);
}
