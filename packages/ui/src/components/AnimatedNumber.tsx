import { useEffect, useRef, useState } from "preact/hooks";

export interface AnimatedNumberProps {
  value: number;
  /** Formats the shown number. Default: rounded, with thousands separators. */
  format?: (n: number) => string;
  /** Animation length in ms. Default 600. */
  duration?: number;
  class?: string;
}

const defaultFormat = (n: number) => new Intl.NumberFormat("en-GB").format(Math.round(n));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts from the old value to the new one. Jumps at once under
 * prefers-reduced-motion. Screen readers get only the final value.
 */
export function AnimatedNumber({
  value,
  format = defaultFormat,
  duration = 600,
  class: className,
}: AnimatedNumberProps) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    if (duration <= 0 || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      shownRef.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const v = from + (value - from) * eased;
      shownRef.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span class={["ps-number", className].filter(Boolean).join(" ")}>
      <span aria-hidden="true">{format(shown)}</span>
      <span class="ps-visually-hidden">{format(value)}</span>
    </span>
  );
}
