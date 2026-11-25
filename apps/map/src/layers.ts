// Choropleth layers: which value shades a country, and the colour bins.
// Colours: hand-tuned, no green and no violet (DESIGN.md). Sequential: pale yellow to brown,
// lighter = less (after ColorBrewer YlOrBr). Diverging: brown for exports, slate for imports, a
// light neutral for balanced. Checked with Machado (2009) protan/deutan/tritan simulation:
// lightness stays in order and neighbouring bins differ by at least CIELAB delta E 12.8.
import type { Point } from "./data/series";
import { formatPercent } from "./format";
import { formatPower } from "@powerstation/ui";

export type LayerId = "renewables" | "netImport" | "loadForecast";

export interface Bin {
  color: string;
  label: string;
  /** Upper bound (exclusive); the last bin has Infinity. */
  max: number;
}

export interface Layer {
  id: LayerId;
  name: string;
  /** One sentence for the legend. */
  explain: string;
  bins: Bin[];
}

export const LAYERS: Record<LayerId, Layer> = {
  renewables: {
    id: "renewables",
    name: "Renewables share",
    explain:
      "Share of generation from wind, solar, hydro (not pumped storage), biomass, geothermal and other renewables. Measured hours only.",
    bins: [
      { max: 0.2, color: "#fbe9a9", label: `under ${formatPercent(0.2)}` },
      { max: 0.4, color: "#f6cf62", label: "20–40%" },
      { max: 0.6, color: "#e3a33a", label: "40–60%" },
      { max: 0.8, color: "#b8732a", label: "60–80%" },
      { max: Infinity, color: "#7c4a17", label: "80% or more" },
    ],
  },
  netImport: {
    id: "netImport",
    name: "Imports and exports",
    explain:
      "Net power flowing in or out of a country across its borders. Measured flows up to the latest hour; after it, planned trade where it is published.",
    bins: [
      { max: -3000, color: "#7a440a", label: `exports over ${formatPower(3000)}` },
      { max: -1000, color: "#b47a2c", label: "exports 1–3 GW" },
      { max: -200, color: "#e3c07a", label: "exports 0.2–1 GW" },
      { max: 200, color: "#efede6", label: "about balanced" },
      { max: 1000, color: "#c3cdd9", label: "imports 0.2–1 GW" },
      { max: 3000, color: "#7f8fa6", label: "imports 1–3 GW" },
      { max: Infinity, color: "#3b4a5f", label: `imports over ${formatPower(3000)}` },
    ],
  },
  loadForecast: {
    id: "loadForecast",
    name: "Expected demand (day-ahead forecast)",
    explain:
      "Electricity use that grid operators expect for each hour, published the day before. A forecast, not a measurement. Only for the hours it covers, usually the next 24 hours.",
    // Sequential slate ramp, lighter = less. Not the brown ramp, so it does not read as renewables.
    bins: [
      { max: 2000, color: "#e8ecf1", label: `under ${formatPower(2000)}` },
      { max: 5000, color: "#c3cdd9", label: "2–5 GW" },
      { max: 15000, color: "#93a2b6", label: "5–15 GW" },
      { max: 40000, color: "#637690", label: "15–40 GW" },
      { max: Infinity, color: "#3b4a5f", label: `${formatPower(40000)} or more` },
    ],
  },
};

export function binFor(layer: Layer, p: Point): Bin | null {
  if (p.value === null) return null;
  return layer.bins.find((b) => p.value! < b.max) ?? null;
}
