// Number and text formatting for the page. Pure functions.
const nf = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const utc = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatInt = (n: number): string => nf.format(n);

/** MW below 1000, GW from 1000 up. */
export function formatMw(mw: number): string {
  if (mw >= 1000) {
    const gw = Math.round((mw / 1000) * 10) / 10;
    return `${gw} GW`;
  }
  return `${nf.format(mw)} MW`;
}

/** A ratio (0.05) as a percent text ("5.0%"). */
export function formatShare(ratio: number): string {
  const pct = ratio * 100;
  if (pct > 0 && pct < 0.1) return "less than 0.1%";
  return pct < 10 ? `${pct.toFixed(1)}%` : `${nf.format(pct)}%`;
}

/** Rounded to two significant digits so it does not look more exact than it is. */
export function formatHomes(homes: number): string {
  if (homes >= 1_000_000) return `${(homes / 1_000_000).toFixed(1)} million`;
  return nf.format(Number(homes.toPrecision(2)));
}

export function formatUtc(iso: string): string {
  return `${utc.format(new Date(iso)).replace(",", "")} UTC`;
}

export const plural = (n: number, word: string): string =>
  `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;

/** "1 hour", "3 hours". */
export const hours = (n: number): string => plural(n, "hour");
