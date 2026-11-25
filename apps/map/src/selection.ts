// Country selection rules, kept pure so tests can run without a DOM.

/** Map click: clicking the selected country clears it; any other country selects it. */
export function toggleNode(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}

/** Dropdown change: the empty first option ("Choose a country") clears the selection. */
export function nodeFromSelect(value: string): string | null {
  return value === "" ? null : value;
}
