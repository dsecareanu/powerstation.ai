// Runs a worker on many items with at most `concurrency` workers at the same time.
// The ENTSO-E client keeps the rate limit; this only limits how many requests wait
// for a response at once. On the first error, no new items start; the error is
// thrown after the running workers finish.

export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a whole number of 1 or more, not ${concurrency}`);
  }
  let next = 0;
  let failure: { error: unknown } | null = null;
  const lane = async () => {
    while (failure === null && next < items.length) {
      const index = next++;
      try {
        await worker(items[index]!, index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  if (failure !== null) throw (failure as { error: unknown }).error;
}
