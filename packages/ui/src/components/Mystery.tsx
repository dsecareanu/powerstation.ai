import type { ComponentChildren } from "preact";

export interface MysteryProps {
  question: string;
  /** The answer. Shown when the user opens the mystery. */
  children: ComponentChildren;
  open?: boolean;
  /** Called with true when opened, false when closed. */
  onToggle?: (open: boolean) => void;
  class?: string;
}

/** Expandable question and answer. Native <details>, so it works with the keyboard. */
export function Mystery({
  question,
  children,
  open = false,
  onToggle,
  class: className,
}: MysteryProps) {
  return (
    <details
      class={["ps-mystery", className].filter(Boolean).join(" ")}
      open={open}
      onToggle={
        onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined
      }
    >
      <summary class="ps-mystery__question">
        <span class="ps-mystery__mark" aria-hidden="true">
          ?
        </span>
        {question}
      </summary>
      <div class="ps-mystery__answer">{children}</div>
    </details>
  );
}
