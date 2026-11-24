const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call `check` every `intervalMs` until `done` accepts what it returns, and return that.
 * Throws `failure(last)` with the last value once `timeoutMs` has passed.
 */
export async function pollUntil<T>(
  check: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs, intervalMs, failure }: { timeoutMs: number; intervalMs: number; failure: (last: T) => string },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(failure(value));
    await sleep(intervalMs);
  }
}
