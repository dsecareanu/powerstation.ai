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
          <strong>Arrows</strong> show power crossing borders. Wider arrows carry more power. The
          arrow points where the power goes.
        </li>
        <li>
          <strong>Solid arrows</strong> are measured by grid operators.{" "}
          <strong>Dashed arrows</strong> are planned trade: what traders scheduled a day ahead.
          Planned trade is not a measurement and not a forecast of physical flows.
        </li>
        <li>
          <strong>Modelled</strong> values are estimates we made to fill a short gap: hatched
          countries and dotted gold arrows. The label names the method. A <strong>?</strong> on an
          arrow or a dotted country means no data for that hour.
        </li>
        <li>
          Some countries share data. Germany and Luxembourg form one bidding zone, so they show the
          same values. Italy and Norway have several zones; we add them up.
        </li>
        <li>
          <strong>Planned vs measured</strong> compares the plan with what happened on one border.
          Pick a border or tap an arrow.
        </li>
        <li>Times are in your local time zone.</li>
      </ul>
    </details>
  );
}
