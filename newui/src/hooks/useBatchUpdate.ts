/**
 * Hook for dispatching batch updates and tracking their progress.
 *
 * **This is the ONLY entry point for all data mutations in the app.**
 * Every create, update, and delete operation — whether targeting a single
 * image or many — MUST go through this hook.  Do NOT create one-off
 * mutation hooks or call APIs + dispatch store updates directly from
 * components.  The batch framework (listener middleware + mutation registry)
 * handles the full mutate → poll → store-update → cascade lifecycle.
 *
 * Usage:
 * ```tsx
 * const { execute, latestBatchId, progress } = useBatchUpdate();
 * execute('metadata.title', 'title', imageIds, 'New Title');
 * execute('lease.delete', `lease.delete.${leaseId}`, [imageId], { leaseId });
 * ```
 */

import { useCallback, useRef } from 'react';
import type { RootState } from '@/store/store';
import type { BatchProgress } from '@/store/asyncUpdates';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { startBatchUpdate } from '@/store/updateListeners';
import { selectBatchErrors, selectBatchProgress } from '@/store/asyncUpdates';

export interface UseBatchUpdateResult {
  /**
   * Start a batch update across one or more images.
   * Returns the generated batchId for tracking.
   */
  execute: (
    operationType: string,
    field: string | null,
    imageIds: Array<string>,
    value: unknown,
  ) => void;

  /** The batchId of the most recently dispatched batch from this hook instance */
  latestBatchId: string | undefined;

  /** Aggregate progress of the latest batch (undefined if no batch yet) */
  progress: BatchProgress | undefined;

  /** Per-image errors for the latest batch */
  errors: Record<string, string>;
}

export function useBatchUpdate(): UseBatchUpdateResult {
  const dispatch = useAppDispatch();
  const latestBatchIdRef = useRef<string | undefined>(undefined);

  // We need a stable reference to the latest batchId for the selector.
  // Since batchId is generated inside the listener (not returned from dispatch),
  // we track it by observing the store after dispatch.
  const latestBatchId = useAppSelector((state: RootState) => {
    // Find the most recently started batch — it will have the latest startedAt
    const batches = Object.values(state.updates.batches).filter(
      (b): b is NonNullable<typeof b> => b !== undefined,
    );
    if (batches.length === 0) return undefined;

    // If we have a stored ref and it still exists, prefer that
    if (
      latestBatchIdRef.current &&
      state.updates.batches[latestBatchIdRef.current]
    ) {
      return latestBatchIdRef.current;
    }

    // Otherwise return the latest by startedAt
    const sorted = [...batches].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    return sorted[0]?.batchId;
  });

  const progress = useAppSelector((state: RootState) =>
    latestBatchId ? selectBatchProgress(state, latestBatchId) : undefined,
  );

  const errors = useAppSelector((state: RootState) =>
    latestBatchId ? selectBatchErrors(state, latestBatchId) : {},
  );

  const execute = useCallback(
    (
      operationType: string,
      field: string | null,
      imageIds: Array<string>,
      value: unknown,
    ) => {
      dispatch(
        startBatchUpdate({
          operationType,
          field,
          value,
          imageIds,
        }),
      );
      // The batchId is generated inside the listener; we'll pick it up
      // via the selector on next render.
    },
    [dispatch],
  );

  return { execute, latestBatchId, progress, errors };
}
