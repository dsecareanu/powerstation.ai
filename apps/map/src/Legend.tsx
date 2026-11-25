// Legend: layer colours, plus how each data state looks on the map.
import { LAYERS, type LayerId } from "./layers";

export function Legend(props: { layer: LayerId; future: boolean; onLayer: (l: LayerId) => void }) {
  const L = LAYERS[props.layer];
  return (
    <section class="legend" aria-label="Legend">
      <div class="legend__layers" role="radiogroup" aria-label="Shade countries by">
        {(Object.keys(LAYERS) as LayerId[]).map((id) => (
          <label key={id}>
            <input
              type="radio"
              name="layer"
              checked={props.layer === id}
              onChange={() => props.onLayer(id)}
            />
            {LAYERS[id].name}
          </label>
        ))}
      </div>
      <p class="legend__explain">{L.explain}</p>
      {props.future && props.layer === "renewables" ? (
        <p class="legend__explain">
          <strong>This hour is not measured yet,</strong> so countries show no data. Choose “Imports
          and exports” to see planned trade.
        </p>
      ) : null}
      <ul class="legend__bins">
        {L.bins.map((b) => (
          <li key={b.label}>
            <span class="legend__swatch" style={{ background: b.color }} aria-hidden="true" />
            {b.label}
          </li>
        ))}
      </ul>
      <ul class="legend__states">
        <li>
          <svg width="44" height="14" aria-hidden="true">
            <line x1="2" y1="7" x2="42" y2="7" class="key key--measured" />
          </svg>
          Measured flow
        </li>
        <li>
          <svg width="44" height="14" aria-hidden="true">
            <line x1="2" y1="7" x2="42" y2="7" class="key key--planned" />
          </svg>
          Planned trade (not measured)
        </li>
        <li>
          <svg width="44" height="14" aria-hidden="true">
            <line x1="2" y1="7" x2="42" y2="7" class="key key--modelled" />
          </svg>
          Modelled (estimated; method in the label)
        </li>
        <li>
          <svg width="44" height="14" aria-hidden="true">
            <line x1="2" y1="7" x2="42" y2="7" class="key key--missing" />
          </svg>
          No data (?)
        </li>
        <li>
          <svg width="44" height="14" aria-hidden="true">
            <rect width="44" height="14" fill="url(#pat-missing)" class="key-box" />
          </svg>
          Country with no data for this hour
        </li>
      </ul>
    </section>
  );
}
