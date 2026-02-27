/**
 * Listener middleware that orchestrates async batch updates.
 *
 * Flow per image inside a batch:
 *   pending → mutating → polling → succeeded | failed
 *
 * After the batch settles, frontend-driven cascades are dispatched.
 * Backend-driven cascades are handled implicitly because polling fetches
 * the full ImageData and replaces it in the store.
 */

import { createAction, createListenerMiddleware } from '@reduxjs/toolkit';
import {
  batchCompleted,
  batchStarted,
  imageUpdateStatusChanged,
} from './asyncUpdates';
import { updateImageData } from './imagesSlice';
import { getMutation } from './mutationRegistry';
import { poll } from './polling';

// ---- Public action to kick off a batch ----------------------------------

export interface StartBatchUpdatePayload {
  /** Which registered mutation to use (e.g. "metadata.title") */
  operationType: string;
  /** The field name, if applicable — stored for UI lookups */
  field: string | null;
  /** The value to write */
  value: unknown;
  /** One or more image IDs to apply the update to */
  imageIds: Array<string>;
}

/**
 * Dispatch this action to start an async batch update.
 *
 * ```ts
 * dispatch(startBatchUpdate({
 *   operationType: 'metadata.title',
 *   field: 'title',
 *   value: 'New Title',
 *   imageIds: ['img1', 'img2'],
 * }));
 * ```
 */
export const startBatchUpdate = createAction<StartBatchUpdatePayload>(
  'updates/startBatchUpdate',
);

// ---- Helpers ------------------------------------------------------------

let batchCounter = 0;

function generateBatchId(): string {
  batchCounter += 1;
  return `batch_${Date.now()}_${batchCounter}`;
}

// ---- Listener setup -----------------------------------------------------

export const updateListenerMiddleware = createListenerMiddleware();

const startAppListening = updateListenerMiddleware.startListening;

startAppListening({
  actionCreator: startBatchUpdate,
  effect: async (action, listenerApi) => {
    const { operationType, field, value, imageIds } = action.payload;
    const mutationConfig = getMutation(operationType);
    const batchId = generateBatchId();

    // 1. Initialise batch state
    listenerApi.dispatch(
      batchStarted({
        batchId,
        operationType,
        field,
        value,
        imageIds,
      }),
    );

    // 2. Fork a child task for each image
    const forks = imageIds.map((imageId) =>
      listenerApi.fork(async (forkApi) => {
        // --- Mutate ---
        listenerApi.dispatch(
          imageUpdateStatusChanged({
            batchId,
            imageId,
            status: 'mutating',
          }),
        );

        try {
          await mutationConfig.mutateFn(imageId, value);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Mutation failed';
          listenerApi.dispatch(
            imageUpdateStatusChanged({
              batchId,
              imageId,
              status: 'failed',
              error: message,
            }),
          );
          return { imageId, success: false } as const;
        }

        // --- Poll ---
        listenerApi.dispatch(
          imageUpdateStatusChanged({
            batchId,
            imageId,
            status: 'polling',
          }),
        );

        try {
          const pollResult = await poll({
            pollFn: () => mutationConfig.pollFn(imageId, value),
            config: mutationConfig.pollingConfig,
            signal: forkApi.signal,
          });

          if (pollResult.success) {
            // Grab the latest ImageData that the pollFn stashed
            const latestData = mutationConfig.getLastFetchedData?.();
            if (latestData) {
              listenerApi.dispatch(
                updateImageData({ imageId, data: latestData }),
              );
            }

            listenerApi.dispatch(
              imageUpdateStatusChanged({
                batchId,
                imageId,
                status: 'succeeded',
              }),
            );
            return { imageId, success: true } as const;
          } else {
            listenerApi.dispatch(
              imageUpdateStatusChanged({
                batchId,
                imageId,
                status: 'failed',
                error: `Polling timed out after ${pollResult.attempts} attempts`,
              }),
            );
            return { imageId, success: false } as const;
          }
        } catch (err) {
          // AbortError means the fork was cancelled
          const message =
            err instanceof DOMException && err.name === 'AbortError'
              ? 'Update cancelled'
              : err instanceof Error
                ? err.message
                : 'Polling failed';
          listenerApi.dispatch(
            imageUpdateStatusChanged({
              batchId,
              imageId,
              status: 'failed',
              error: message,
            }),
          );
          return { imageId, success: false } as const;
        }
      }),
    );

    // 3. Wait for all forks to settle
    const results = await Promise.allSettled(forks.map((f) => f.result));

    // 4. Mark batch as complete
    listenerApi.dispatch(batchCompleted({ batchId }));

    // 5. Frontend-driven cascades
    if (mutationConfig.cascades && mutationConfig.cascades.length > 0) {
      // Collect image IDs that succeeded
      const succeededImageIds: Array<string> = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const taskResult = r.value;
          if (taskResult.status === 'ok' && taskResult.value.success) {
            succeededImageIds.push(taskResult.value.imageId);
          }
        }
      }

      if (succeededImageIds.length > 0) {
        for (const cascade of mutationConfig.cascades) {
          const cascadeValue = cascade.resolveValue
            ? cascade.resolveValue(value)
            : value;

          listenerApi.dispatch(
            startBatchUpdate({
              operationType: cascade.operationType,
              field: cascade.operationType.split('.')[1] ?? null,
              value: cascadeValue,
              imageIds: succeededImageIds,
            }),
          );
        }
      }
    }
  },
});
