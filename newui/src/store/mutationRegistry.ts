/**
 * Mutation registry — maps operation type strings to their async mutation configs.
 *
 * This allows Redux actions to stay serializable (no function payloads) while
 * the listener middleware looks up the concrete mutateFn / pollFn at runtime.
 *
 * Every new kind of data mutation (metadata fields, leases, collections, etc.)
 * MUST be registered here via `registerMutation()`.  Registration modules
 * live in `src/store/mutations/` and are imported by `src/store/store.ts`
 * so they execute at boot before any component can dispatch a batch update.
 */

import type { PollingConfig } from './polling';
import type { ImageData } from '@/types/api';

/**
 * A cascade causes a follow-up batch update to be dispatched for
 * succeeded images after the current batch completes.
 */
export interface CascadeConfig {
  /** The operation type to trigger as a follow-up */
  operationType: string;
  /**
   * Optional value resolver — if omitted the cascade inherits the
   * parent batch's value.  Receives the parent value.
   */
  resolveValue?: (parentValue: unknown) => unknown;
}

export interface MutationConfig {
  /**
   * Perform the mutation for a single image.
   * Should throw on failure (network or non-ok status).
   * A successful return means the backend accepted the request (typically 202).
   */
  mutateFn: (imageId: string, value: unknown) => Promise<void>;

  /**
   * Check whether the mutation has been applied for a single image.
   * Return `true` when the expected state is observed, `false` otherwise.
   * The function receives both the imageId and the value that was submitted,
   * so it can compare.
   *
   * When it detects success it should return the latest ImageData so the
   * listener can update the store in one step.  To keep the boolean return
   * simple, the convention is to stash the fetched data on a closure and
   * let the caller retrieve it via `getLastFetchedData()` — see the
   * `createMetadataPollFn` helper in mutations/metadata.ts for an example.
   */
  pollFn: (imageId: string, value: unknown) => Promise<boolean>;

  /**
   * Retrieve the latest ImageData fetched during the most recent successful
   * poll.  This avoids a redundant fetch after polling confirms the mutation.
   */
  getLastFetchedData?: () => ImageData | undefined;

  /** Override the default polling strategy */
  pollingConfig?: Partial<PollingConfig>;

  /** Frontend-driven cascading updates to trigger after success */
  cascades?: Array<CascadeConfig>;
}

// ---- Registry -----------------------------------------------------------

const registry = new Map<string, MutationConfig>();

/**
 * Register a mutation config for a given operation type.
 * Call at application boot (e.g. from src/store/mutations/metadata.ts).
 */
export function registerMutation(
  operationType: string,
  config: MutationConfig,
): void {
  if (registry.has(operationType)) {
    console.warn(
      `[mutationRegistry] Overwriting existing registration for "${operationType}"`,
    );
  }
  registry.set(operationType, config);
}

/**
 * Look up a previously-registered mutation config.
 * @throws if the operation type was never registered.
 */
export function getMutation(operationType: string): MutationConfig {
  const config = registry.get(operationType);
  if (!config) {
    throw new Error(
      `[mutationRegistry] No mutation registered for operation type "${operationType}". ` +
        `Did you forget to import the registration module?`,
    );
  }
  return config;
}

/**
 * Check whether an operation type has been registered (useful in tests).
 */
export function hasMutation(operationType: string): boolean {
  return registry.has(operationType);
}

/**
 * Remove all registrations (useful in tests).
 */
export function clearRegistry(): void {
  registry.clear();
}
