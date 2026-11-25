import { useRef, useState } from "preact/hooks";

/** Copies `getText()` to the clipboard. Falls back to a selected textarea. */
export function CopyButton(props: { getText: () => string }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    const text = props.getText();
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      setMessage("Copied");
    } catch {
      setFallback(text);
      setMessage("Select the text and copy it");
      setTimeout(() => area.current?.select(), 0);
    }
    setTimeout(() => setMessage(""), 4000);
  }

  return (
    <div class="copy">
      <button type="button" class="button" onClick={copy}>
        Copy result
      </button>
      <span class="sr-only" role="status" aria-live="polite">
        {message}
      </span>
      <span class="copy-message" aria-hidden="true">
        {message}
      </span>
      {fallback !== null ? (
        <textarea
          ref={area}
          class="copy-fallback"
          readOnly
          rows={8}
          value={fallback}
          aria-label="Result text to copy"
        />
      ) : null}
    </div>
  );
}
