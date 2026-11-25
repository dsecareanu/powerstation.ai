// Choropleth layers: which value shades a country, and the colour bins.
// Colours: ColorBrewer YlGnBu (sequential) and PuOr (diverging), both colour-blind safe.
import type { Point } from "./data/series";
import { formatPercent } from "./format";
import { formatPower } from "./standins/ui"; // TODO(D): import from @powerstation/ui

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
      { max: 0.2, color: "#ffffcc", label: `under ${formatPercent(0.2)}` },
      { max: 0.4, color: "#a1dab4", label: "20–40%" },
      { max: 0.6, color: "#41b6c4", label: "40–60%" },
      { max: 0.8, color: "#2c7fb8", label: "60–80%" },
      { max: Infinity, color: "#253494", label: "80% or more" },
    ],
  },
  netImport: {
    id: "netImport",
    name: "Imports and exports",
    explain:
      "Net power flowing in or out of a country across its borders. Measured flows up to the latest hour, planned trade after it.",
    bins: [
      { max: -3000, color: "#b35806", label: `exports over ${formatPower(3000)}` },
      { max: -1000, color: "#f1a340", label: "exports 1–3 GW" },
      { max: -200, color: "#fee0b6", label: "exports 0.2–1 GW" },
      { max: 200, color: "#f7f7f7", label: "about balanced" },
      { max: 1000, color: "#d8daeb", label: "imports 0.2–1 GW" },
      { max: 3000, color: "#998ec3", label: "imports 1–3 GW" },
      { max: Infinity, color: "#542788", label: `imports over ${formatPower(3000)}` },
    ],
  },
};

export function binFor(layer: Layer, p: Point): Bin | null {
  if (p.value === null) return null;
  return layer.bins.find((b) => p.value! < b.max) ?? null;
}
