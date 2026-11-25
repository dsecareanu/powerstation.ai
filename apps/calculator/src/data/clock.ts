/** Current time in ms. Dev override: set VITE_FAKE_NOW to an ISO time. */
export function nowMs(): number {
  const fake = import.meta.env.VITE_FAKE_NOW;
  if (fake) {
    const ms = Date.parse(fake);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}
