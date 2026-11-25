// Short "how to read this map" guide.
export function Guide() {
  return (
    <details class="guide">
      <summary>How to read this map</summary>
      <ul>
        <li>
          <strong>Countries</strong> are shaded by the layer you choose: the share of renewables, or
          whether a country imports or exports power.
        </li>
        <li>
          <strong>Moving dots</strong> show power crossing borders. They move from the country that
          exports to the country that imports. Bigger dots carry more power.
        </li>
        <li>
          <strong>Solid dots</strong> on a solid line are measured by grid operators.{" "}
          <strong>Hollow dots</strong> on a dashed line are planned trade: what traders scheduled a
          day ahead. Planned trade is not a measurement and not a forecast of physical flows.
        </li>
        <li>
          <strong>Modelled</strong> values are estimates we made to fill a short gap: hatched
          countries and dots on a short-dash line. The label names the method. A dotted line with a{" "}
          <strong>?</strong>, or a dotted country, means no data for that hour.
        </li>
        <li>
          Some countries share data. Germany and Luxembourg form one bidding zone, so they show the
          same values. Italy and Norway have several zones; we add them up.
        </li>
        <li>
          <strong>Planned vs measured</strong> compares the plan with what happened on one border.
          Pick a border or tap a flow.
        </li>
        <li>Times are in your local time zone.</li>
      </ul>
    </details>
  );
}
