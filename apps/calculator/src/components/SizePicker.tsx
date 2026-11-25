import { useState } from "preact/hooks";
import { formatPower } from "@powerstation/ui";
import { MAX_SIZE_MW, MIN_SIZE_MW } from "../state/url";

const PRESETS = [100, 500, 1000] as const;

export function SizePicker(props: { value: number; onChange: (mw: number) => void }) {
  const { value, onChange } = props;
  const [custom, setCustom] = useState(!(PRESETS as readonly number[]).includes(value));
  const [text, setText] = useState(String(value));
  const valid = /^\d+$/.test(text) && Number(text) >= MIN_SIZE_MW && Number(text) <= MAX_SIZE_MW;

  return (
    <fieldset class="field">
      <legend class="sr-only">Data center size</legend>
      <div class="radio-row" role="radiogroup">
        {PRESETS.map((mw) => (
          <label key={mw} class="radio">
            <input
              type="radio"
              name="size"
              checked={!custom && value === mw}
              onChange={() => {
                setCustom(false);
                setText(String(mw));
                onChange(mw);
              }}
            />
            <span>{formatPower(mw)}</span>
          </label>
        ))}
        <label class="radio">
          <input
            type="radio"
            name="size"
            checked={custom}
            onChange={() => {
              setCustom(true);
              if (valid) onChange(Number(text));
            }}
          />
          <span>Custom</span>
        </label>
      </div>
      {custom ? (
        <div class="field">
          <label for="size-custom">
            Size in MW (whole number, {MIN_SIZE_MW} to {MAX_SIZE_MW})
          </label>
          <input
            id="size-custom"
            type="number"
            inputMode="numeric"
            min={MIN_SIZE_MW}
            max={MAX_SIZE_MW}
            step={1}
            value={text}
            aria-invalid={!valid}
            aria-describedby="size-custom-error"
            onInput={(e) => {
              const t = e.currentTarget.value;
              setText(t);
              if (/^\d+$/.test(t) && Number(t) >= MIN_SIZE_MW && Number(t) <= MAX_SIZE_MW) {
                onChange(Number(t));
              }
            }}
          />
          <p id="size-custom-error" class="error" hidden={valid}>
            Enter a whole number from {MIN_SIZE_MW} to {MAX_SIZE_MW}.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
