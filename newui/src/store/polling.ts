/**
 * Configurable polling utility for verifying async mutations.
 *
 * Supports fixed-interval and exponential-backoff strategies,
 * and respects AbortSignal for cancellation from listener forks.
 */

export interface PollingConfig {
  /** Polling strategy */
  strategy: 'fixed' | 'exponential';
  /** Initial interval in ms between poll attempts */
  initialIntervalMs: number;
  /** Maximum number of poll attempts before giving up */
  maxAttempts: number;
  /** Multiplier applied each attempt when using exponential backoff (default 1.5) */
  backoffMultiplier?: number;
  /** Upper bound on interval when using exponential backoff (default 10_000) */
  maxIntervalMs?: number;
}

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  strategy: 'exponential',
  initialIntervalMs: 500,
  maxAttempts: 12,
  backoffMultiplier: 1.5,
  maxIntervalMs: 10_000,
};

/**
 * Sleep for `ms` milliseconds, aborting early if the signal fires.
 */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export interface PollOptions {
  /**
   * Function that returns `true` when the expected state is observed.
   * Receives the current attempt number (0-indexed).
   */
  pollFn: (attempt: number) => Promise<boolean>;
  /** Polling configuration — uses sensible exponential defaults if omitted */
  config?: Partial<PollingConfig>;
  /** AbortSignal for cancellation (e.g. from a listener fork) */
  signal?: AbortSignal;
}

export interface PollResult {
  /** Whether the poll condition was satisfied before exhausting attempts */
  success: boolean;
  /** Number of poll attempts made */
  attempts: number;
}

/**
 * Poll `pollFn` until it returns `true` or attempts are exhausted.
 *
 * @returns `PollResult` with success flag and attempt count.
 * @throws {DOMException} with name `AbortError` if the signal fires.
 */
export async function poll({
  pollFn,
  config: configOverrides,
  signal,
}: PollOptions): Promise<PollResult> {
  const config: PollingConfig = {
    ...DEFAULT_POLLING_CONFIG,
    ...configOverrides,
  };
  const {
    strategy,
    initialIntervalMs,
    maxAttempts,
    backoffMultiplier = 1.5,
    maxIntervalMs = 10_000,
  } = config;

  let interval = initialIntervalMs;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before polling (so the backend has time to process)
    await abortableSleep(interval, signal);

    const satisfied = await pollFn(attempt);
    if (satisfied) {
      return { success: true, attempts: attempt + 1 };
    }

    // Increase interval for next attempt if using exponential backoff
    if (strategy === 'exponential') {
      interval = Math.min(interval * backoffMultiplier, maxIntervalMs);
    }
  }

  return { success: false, attempts: maxAttempts };
}
