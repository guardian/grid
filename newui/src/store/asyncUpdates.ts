/**
 * Redux slice for tracking in-flight asynchronous batch updates.
 *
 * Each "batch" represents one user action (e.g. "set title to X") applied
 * across one or more images.  The slice tracks per-image progress so the
 * UI can show granular feedback.
 */

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

// ---- State types --------------------------------------------------------

export type ImageUpdateStatus =
  | 'pending'
  | 'mutating'
  | 'polling'
  | 'succeeded'
  | 'failed';

export interface ImageUpdateEntry {
  status: ImageUpdateStatus;
  error?: string;
}

export interface BatchOperation {
  batchId: string;
  operationType: string;
  /** The metadata field being updated, if applicable */
  field: string | null;
  /** The value being written */
  value: unknown;
  /** Per-image status map */
  imageUpdates: { [imageId: string]: ImageUpdateEntry | undefined };
  startedAt: string;
  /** Set when every image has reached a terminal state */
  completedAt: string | null;
}

export interface UpdatesState {
  batches: { [batchId: string]: BatchOperation | undefined };
}

const initialState: UpdatesState = {
  batches: {},
};

// ---- Action payloads ----------------------------------------------------

interface BatchStartedPayload {
  batchId: string;
  operationType: string;
  field: string | null;
  value: unknown;
  imageIds: Array<string>;
}

interface ImageStatusPayload {
  batchId: string;
  imageId: string;
  status: ImageUpdateStatus;
  error?: string;
}

interface BatchCompletedPayload {
  batchId: string;
}

// ---- Slice --------------------------------------------------------------

const updatesSlice = createSlice({
  name: 'updates',
  initialState,
  reducers: {
    batchStarted(state, action: PayloadAction<BatchStartedPayload>) {
      const { batchId, operationType, field, value, imageIds } = action.payload;
      const imageUpdates: Record<string, ImageUpdateEntry> = {};
      for (const id of imageIds) {
        imageUpdates[id] = { status: 'pending' };
      }
      state.batches[batchId] = {
        batchId,
        operationType,
        field,
        value,
        imageUpdates,
        startedAt: new Date().toISOString(),
        completedAt: null,
      };
    },

    imageUpdateStatusChanged(state, action: PayloadAction<ImageStatusPayload>) {
      const { batchId, imageId, status, error } = action.payload;
      const batch = state.batches[batchId];
      if (!batch) return;
      batch.imageUpdates[imageId] = { status, error };
    },

    batchCompleted(state, action: PayloadAction<BatchCompletedPayload>) {
      const batch = state.batches[action.payload.batchId];
      if (batch) {
        batch.completedAt = new Date().toISOString();
      }
    },

    /**
     * Remove a completed batch from state (garbage collection).
     * The UI can call this after it's done showing the result.
     */
    batchDismissed(state, action: PayloadAction<{ batchId: string }>) {
      delete state.batches[action.payload.batchId];
    },
  },
});

export const {
  batchStarted,
  imageUpdateStatusChanged,
  batchCompleted,
  batchDismissed,
} = updatesSlice.actions;

export default updatesSlice.reducer;

// ---- Selectors ----------------------------------------------------------

export interface BatchProgress {
  total: number;
  succeeded: number;
  failed: number;
  inProgress: number;
}

/**
 * Aggregate progress for a single batch.
 */
export function selectBatchProgress(
  state: RootState,
  batchId: string,
): BatchProgress | undefined {
  const batch = state.updates.batches[batchId];
  if (!batch) return undefined;

  const entries = Object.values(batch.imageUpdates).filter(
    (e): e is ImageUpdateEntry => e !== undefined,
  );
  return {
    total: entries.length,
    succeeded: entries.filter((e) => e.status === 'succeeded').length,
    failed: entries.filter((e) => e.status === 'failed').length,
    inProgress: entries.filter(
      (e) =>
        e.status === 'pending' ||
        e.status === 'mutating' ||
        e.status === 'polling',
    ).length,
  };
}

/**
 * Check whether a specific image + field combination has an active update
 * in any batch.  Useful for per-field "saving…" indicators.
 */
export function selectIsFieldUpdating(
  state: RootState,
  imageId: string,
  field: string,
): boolean {
  return Object.values(state.updates.batches).some((batch) => {
    if (!batch) return false;
    if (batch.completedAt) return false;
    if (batch.field !== field) return false;
    const entry = batch.imageUpdates[imageId];
    return (
      entry !== undefined &&
      entry.status !== 'succeeded' &&
      entry.status !== 'failed'
    );
  });
}

/**
 * Check whether *any* image in the given list has an active (non-terminal)
 * update for the given field.  Useful when multiple images are selected and
 * we want to show a single "saving…" state for the field row.
 */
export function selectIsFieldUpdatingForAny(
  state: RootState,
  imageIds: Array<string>,
  field: string,
): boolean {
  return imageIds.some((id) => selectIsFieldUpdating(state, id, field));
}

/**
 * Return all batches that are still in progress.
 */
export function selectActiveBatches(state: RootState): Array<BatchOperation> {
  return Object.values(state.updates.batches).filter(
    (b): b is BatchOperation => b !== undefined && b.completedAt === null,
  );
}

/**
 * Collect errors for a specific batch, keyed by imageId.
 */
export function selectBatchErrors(
  state: RootState,
  batchId: string,
): Record<string, string> {
  const batch = state.updates.batches[batchId];
  if (!batch) return {};

  const errors: Record<string, string> = {};
  for (const [imageId, entry] of Object.entries(batch.imageUpdates)) {
    if (entry && entry.status === 'failed' && entry.error) {
      errors[imageId] = entry.error;
    }
  }
  return errors;
}

/**
 * Get the most recent error for a field across all active batches targeting
 * any of the given images.  Useful for showing a single error string in the UI.
 */
export function selectFieldError(
  state: RootState,
  imageIds: Array<string>,
  field: string,
): string | undefined {
  const idSet = new Set(imageIds);
  for (const batch of Object.values(state.updates.batches)) {
    if (!batch) continue;
    if (batch.field !== field) continue;
    for (const [imageId, entry] of Object.entries(batch.imageUpdates)) {
      if (
        entry &&
        idSet.has(imageId) &&
        entry.status === 'failed' &&
        entry.error
      ) {
        return entry.error;
      }
    }
  }
  return undefined;
}
