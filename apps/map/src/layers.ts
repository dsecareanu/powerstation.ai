// Choropleth layers: which value shades a country, and the colour bins.
// Colours: hand-tuned, no violet (DESIGN.md). Sequential: one blue-green hue, lighter = less.
// Diverging: brown for exports, teal for imports, a light neutral for balanced (after ColorBrewer
// BuGn and BrBG). Checked with Machado (2009) protan/deutan/tritan simulation: lightness stays in
// order and neighbouring bins differ by at least CIELAB delta E 11 (sequential) and 12 (diverging).
import type { Point } from "./data/series";
import { formatPercent } from "./format";
import { formatPower } from "@powerstation/ui";

export type LayerId = "renewables" | "netImport";

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
      { max: 0.2, color: "#d4eee6", label: `under ${formatPercent(0.2)}` },
      { max: 0.4, color: "#9fd5c2", label: "20–40%" },
      { max: 0.6, color: "#5fb79c", label: "40–60%" },
      { max: 0.8, color: "#2e8f62", label: "60–80%" },
      { max: Infinity, color: "#0a5e33", label: "80% or more" },
    ],
  },
  netImport: {
    id: "netImport",
    name: "Imports and exports",
    explain:
      "Net power flowing in or out of a country across its borders. Measured flows up to the latest hour, planned trade after it.",
    bins: [
      { max: -3000, color: "#7a440a", label: `exports over ${formatPower(3000)}` },
      { max: -1000, color: "#b47a2c", label: "exports 1–3 GW" },
      { max: -200, color: "#e3c07a", label: "exports 0.2–1 GW" },
      { max: 200, color: "#efede6", label: "about balanced" },
      { max: 1000, color: "#97cfc4", label: "imports 0.2–1 GW" },
      { max: 3000, color: "#3f968d", label: "imports 1–3 GW" },
      { max: Infinity, color: "#0b5c55", label: `imports over ${formatPower(3000)}` },
    ],
  },
};

export function binFor(layer: Layer, p: Point): Bin | null {
  if (p.value === null) return null;
  return layer.bins.find((b) => p.value! < b.max) ?? null;
}
