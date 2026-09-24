export const POLL_INTERVAL_MS = 1_000;
export const POLL_MAX_ATTEMPTS = 10;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const pollUntil = async <T>(
  fetchValue: () => Promise<T>,
  isDone: (value: T) => boolean,
  attemptsRemaining: number = POLL_MAX_ATTEMPTS
): Promise<T> => {
  const value = await fetchValue();
  if (isDone(value) || attemptsRemaining <= 1) {
    return value;
  }
  await wait(POLL_INTERVAL_MS);
  return pollUntil(fetchValue, isDone, attemptsRemaining - 1);
};
