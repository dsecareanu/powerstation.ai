import type { Period } from "../state/url";

export function PeriodPicker(props: { value: Period; onChange: (p: Period) => void }) {
  const options: { value: Period; label: string }[] = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
  ];
  return (
    <fieldset class="field">
      <legend class="sr-only">Period</legend>
      <div class="radio-row" role="radiogroup">
        {options.map((o) => (
          <label key={o.value} class="radio">
            <input
              type="radio"
              name="period"
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
