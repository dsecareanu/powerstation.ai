// TODO(D): replace with @powerstation/ui
// Colour is never the only signal: the badge always shows the state as text, with a dashed edge.
export function StateBadge(props: { state: "modelled" | "measured" | "planned" | "missing" }) {
  return <span class={`state-badge state-${props.state}`}>{props.state}</span>;
}
