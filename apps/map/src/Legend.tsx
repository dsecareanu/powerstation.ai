// Legend: layer colours, plus how each data state looks on the map.
import { LAYERS, type LayerId } from "./layers";
import { DOT_LEGEND_MW, DOT_R_MAX, dotRadius } from "./map/flowDots";
import { formatPower } from "@powerstation/ui";

export function Legend(props: {
  layer: LayerId;
  future: boolean;
  /** False when generation data is not published: the renewables layer has no values. */
  hasGeneration: boolean;
  /** False when no planned trade is published: its line is left out of the key. */
  hasPlanned: boolean;
  /** True when at least one country has a load forecast for the selected hour. */
  forecastHere: boolean;
  onLayer: (l: LayerId) => void;
}) {
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
      {!props.hasGeneration && props.layer === "renewables" ? (
        <p class="legend__explain">
          <strong>Generation data is not published here yet,</strong> so countries show no data.
        </p>
      ) : props.future && props.layer === "renewables" ? (
        <p class="legend__explain">
          <strong>This hour is not measured yet,</strong> so countries show no data.{" "}
          {props.hasPlanned
            ? "Choose “Imports and exports” to see planned trade."
            : "Choose “Expected demand” to see the forecast."}
        </p>
      ) : null}
      {props.layer === "loadForecast" && !props.forecastHere ? (
        <p class="legend__explain">
          <strong>No forecast for this hour,</strong> so countries show no data. Move the timeline
          to the hours ahead.
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
      <div class="legend__sizes">
        <span>Flow size</span>
        <ul>
          {DOT_LEGEND_MW.map((mw) => {
            const r = dotRadius(mw);
            return (
              <li key={mw}>
                <svg width={2 * DOT_R_MAX + 4} height={2 * DOT_R_MAX + 4} aria-hidden="true">
                  <circle cx={DOT_R_MAX + 2} cy={DOT_R_MAX + 2} r={r} class="key-dot" />
                </svg>
                {formatPower(mw)}
              </li>
            );
          })}
        </ul>
      </div>
      <ul class="legend__states">
        <li>
          <FlowKey state="measured" />
          Measured flow (dots move in the flow direction)
        </li>
        {props.hasPlanned ? (
          <li>
            <FlowKey state="planned" />
            Planned trade (not measured): hollow dots
          </li>
        ) : null}
        <li>
          <FlowKey state="modelled" />
          Modelled (estimated; method in the label)
        </li>
        <li>
          <svg width="44" height="16" aria-hidden="true">
            <line x1="2" y1="8" x2="42" y2="8" class="key key--missing" />
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

/** Legend key for a flow state: three still dots on a faint guide line in the state's pattern. */
function FlowKey(props: { state: "measured" | "planned" | "modelled" }) {
  return (
    <svg width="44" height="16" aria-hidden="true" class={`flow-key flow-key--${props.state}`}>
      <line x1="2" y1="8" x2="42" y2="8" class="flow-key__guide" />
      {[8, 22, 36].map((cx) => (
        <circle key={cx} cx={cx} cy="8" r="4" class="flow-key__dot" />
      ))}
    </svg>
  );
}
