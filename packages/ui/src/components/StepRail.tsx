export interface Step {
  id: string;
  label: string;
}

export interface StepRailProps {
  steps: readonly Step[];
  /** id of the current step. */
  current: string;
  /** If given, steps are buttons and the user can jump between them. */
  onSelect?: (id: string) => void;
  label?: string;
  class?: string;
}

/** Numbered steps. The current step is highlighted and marked aria-current="step". */
export function StepRail({
  steps,
  current,
  onSelect,
  label = "Steps",
  class: className,
}: StepRailProps) {
  const currentIndex = steps.findIndex((s) => s.id === current);
  return (
    <nav class={["ps-steps", className].filter(Boolean).join(" ")} aria-label={label}>
      <ol class="ps-steps__list">
        {steps.map((s, i) => {
          const state = i === currentIndex ? "current" : i < currentIndex ? "done" : "todo";
          const content = (
            <>
              <span class="ps-step__number" aria-hidden="true">
                {i + 1}
              </span>
              <span class="ps-step__label">
                <span class="ps-visually-hidden">Step {i + 1}: </span>
                {s.label}
              </span>
            </>
          );
          return (
            <li key={s.id} class={`ps-step ps-step--${state}`}>
              {onSelect ? (
                <button
                  type="button"
                  class="ps-step__button"
                  aria-current={state === "current" ? "step" : undefined}
                  onClick={() => onSelect(s.id)}
                >
                  {content}
                </button>
              ) : (
                <span
                  class="ps-step__button"
                  aria-current={state === "current" ? "step" : undefined}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
