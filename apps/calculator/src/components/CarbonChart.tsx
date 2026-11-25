// Hand-rolled SVG line of carbon intensity per hour. Dashed line = modelled.
export function CarbonChart(props: { hourly: { hour: string; gPerKwh: number }[] }) {
  const { hourly } = props;
  if (hourly.length < 2) return null;
  const W = 300;
  const H = 80;
  const values = hourly.map((h) => h.gPerKwh);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = hourly
    .map((h, i) => {
      const x = (i / (hourly.length - 1)) * W;
      const y = H - 4 - ((h.gPerKwh - min) / span) * (H - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      class="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Carbon intensity per hour, modelled. Lowest ${Math.round(min)}, highest ${Math.round(max)} grams of CO2 per kWh.`}
      preserveAspectRatio="none"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="5 3"
      />
    </svg>
  );
}
