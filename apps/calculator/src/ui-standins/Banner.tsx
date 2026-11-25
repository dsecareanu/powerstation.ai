// TODO(D): replace with @powerstation/ui
import type { ComponentChildren } from "preact";

export function Banner(props: { tone: "warn" | "info"; children: ComponentChildren }) {
  return (
    <div class={`banner banner-${props.tone}`} role="status">
      {props.children}
    </div>
  );
}
