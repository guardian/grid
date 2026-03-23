/**
 * Main application store.
 *
 * Manages search params, results, loading state, and the data source.
 * URL sync is handled by the useUrlSearchSync hook (URL → store → search).
 *
 * Results are stored as a dense array starting at offset 0. The `loadMore`
 * action appends pages sequentially. The `loadRange` action fetches an
 * arbitrary offset range and fills specific indices (extending the array
 * with undefined gaps if needed — the `useDataWindow` hook handles gap
 * detection and placeholder rendering).
 */

import { create } from "zustand";
import type { Image } from "@/types/image";
import type { ImageDataSource, SearchParams } from "@/dal";
import { ElasticsearchDataSource } from "@/dal";

/** How often to poll for new images (ms). */
const NEW_IMAGES_POLL_INTERVAL = 10_000;

/**
 * Maximum number of rows addressable via `from/size` pagination.
 * Matches the ES `max_result_window` on TEST/PROD (101,000).
 * Local docker ES uses the default 10,000 — `loadRange` will fail
 * gracefully if offset exceeds the window.
 */
const MAX_RESULT_WINDOW = 100_000;

interface SearchState {
  // Data source (swappable between ES and Grid API)
  dataSource: ImageDataSource;

  // Search state
  params: SearchParams;
  results: Image[];
  total: number;
  took: number;
  loading: boolean;
  error: string | null;

  // Focus — the "current" row, distinct from selection (which comes later).
  // Set by clicking a row or returning from image detail. Cleared on new search.
  focusedImageId: string | null;

  // New images ticker
  newCount: number;
  newCountSince: string | null; // ISO timestamp of when results were frozen

  // Result set freezing — stabilise offsets while the user scrolls.
  // Set by search(), passed as `until` on all loadMore/loadRange calls.
  // Prevents new uploads from shifting row positions mid-scroll.
  frozenUntil: string | null;

  // Track which ranges are currently being fetched to avoid duplicate requests
  _inflight: Set<string>; // "start-end" keys
  // Track ranges that failed (e.g. beyond max_result_window) to avoid infinite retry
  _failedRanges: Set<string>;

  // Actions
  setParams: (params: Partial<SearchParams>) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadRange: (start: number, end: number) => Promise<void>;
  setFocusedImageId: (id: string | null) => void;
}

let _newImagesPollTimer: ReturnType<typeof setInterval> | null = null;
/** Module-level flag to prevent concurrent loadMore without triggering re-renders */
let _loadMoreInFlight = false;

function startNewImagesPoll(get: () => SearchState, set: (s: Partial<SearchState>) => void) {
  stopNewImagesPoll();
  _newImagesPollTimer = setInterval(async () => {
    const { dataSource, params, newCountSince } = get();
    if (!newCountSince) return;
    try {
      // Use whichever is later: the user's date filter or our poll timestamp.
      // If the user filtered to "since 2026-06-01" and the last search was at
      // 2026-06-15T10:00:00Z, we want images since 2026-06-15T10:00:00Z that
      // also match the user's filter.  If the user's since is *after* our
      // poll timestamp we keep the user's — everything before it is already
      // excluded by their filter anyway.
      const since =
        params.since && params.since > newCountSince
          ? params.since
          : newCountSince;

      const count = await dataSource.count({
        ...params,
        since,
        offset: 0,
        length: 0,
      });
      set({ newCount: count });
    } catch {
      // Silently ignore — ticker is non-critical
    }
  }, NEW_IMAGES_POLL_INTERVAL);
}

function stopNewImagesPoll() {
  if (_newImagesPollTimer) {
    clearInterval(_newImagesPollTimer);
    _newImagesPollTimer = null;
  }
}

export const useSearchStore = create<SearchState>((set, get) => ({
  dataSource: new ElasticsearchDataSource(),

  params: {
    query: undefined,
    offset: 0,
    length: 50,
    orderBy: "-uploadTime",
    nonFree: "true",
  },
  results: [],
  total: 0,
  took: 0,
  loading: false,
  error: null,

  focusedImageId: null,

  newCount: 0,
  newCountSince: null,
  frozenUntil: null,
  _inflight: new Set(),
  _failedRanges: new Set(),

  setParams: (newParams) => {
    set((state) => ({
      params: { ...state.params, ...newParams, offset: 0 },
    }));
  },

  setFocusedImageId: (id) => set({ focusedImageId: id }),

  search: async () => {
    const { dataSource, params } = get();
    set({ loading: true, error: null });

    try {
      const result = await dataSource.search({ ...params, offset: 0 });
      const now = new Date().toISOString();
      set({
        results: result.hits,
        total: result.total,
        took: result.took,
        loading: false,
        params: { ...params, offset: 0 },
        focusedImageId: null, // clear focus on new search
        newCount: 0,
        newCountSince: now,
        frozenUntil: now,
        _inflight: new Set(),
        _failedRanges: new Set(),
      });
      // Restart the poll with fresh params + timestamp
      startNewImagesPoll(get, set);
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Search failed",
        loading: false,
      });
    }
  },

  loadMore: async () => {
    const { dataSource, params, results, total, frozenUntil } = get();
    if (_loadMoreInFlight || results.length >= total) return;

    const nextOffset = results.length;
    // Don't set loading: true — it triggers a full re-render of the view
    // components (ImageTable, ImageDetail) for every page load, causing a
    // visible hiccup during image traversal. The offset guard in the
    // functional updater below already prevents duplicate data.
    _loadMoreInFlight = true;

    try {
      const result = await dataSource.search({
        ...params,
        offset: nextOffset,
        // Freeze result set so new uploads don't shift offsets
        ...(frozenUntil ? { until: frozenUntil } : {}),
      });

      // Use a functional updater so we read the *current* results array,
      // not the stale snapshot from before the await.  If another loadMore
      // already appended at this offset, skip to avoid duplicates.
      set((state) => {
        _loadMoreInFlight = false;
        if (state.results.length !== nextOffset) {
          // Another loadMore already landed — discard this batch.
          return {};
        }
        // Guard: don't overwrite total with 0 from an aborted response
        if (result.hits.length === 0 && result.total === 0) {
          return {};
        }
        return {
          results: [...state.results, ...result.hits],
          total: result.total,
          took: result.took,
          params: { ...state.params, offset: nextOffset },
        };
      });
    } catch (e) {
      _loadMoreInFlight = false;
      set({
        error: e instanceof Error ? e.message : "Load more failed",
      });
    }
  },

  loadRange: async (start: number, end: number) => {
    const { dataSource, params, total, frozenUntil, _inflight } = get();

    // Clamp to valid range
    const clampedEnd = Math.min(end, Math.min(total, MAX_RESULT_WINDOW) - 1);
    if (start > clampedEnd || start < 0) return;

    // Deduplicate in-flight requests and skip previously failed ranges
    const key = `${start}-${clampedEnd}`;
    if (_inflight.has(key)) return;
    const { _failedRanges } = get();
    if (_failedRanges.has(key)) return;
    set({ _inflight: new Set([..._inflight, key]) });

    try {
      const length = clampedEnd - start + 1;
      const result = await dataSource.searchRange({
        ...params,
        offset: start,
        length,
        ...(frozenUntil ? { until: frozenUntil } : {}),
      });

      set((state) => {
        // Extend the results array if needed — fill gaps with undefined
        // (useDataWindow will treat undefined slots as unloaded)
        const newResults = [...state.results];
        const neededLength = start + result.hits.length;
        if (newResults.length < neededLength) {
          newResults.length = neededLength;
        }

        // Fill in the loaded images at their correct indices
        for (let i = 0; i < result.hits.length; i++) {
          newResults[start + i] = result.hits[i];
        }

        // Remove from inflight
        const newInflight = new Set(state._inflight);
        newInflight.delete(key);

        return {
          results: newResults,
          total: result.total,
          _inflight: newInflight,
        };
      });
    } catch (e) {
      // Remove from inflight and record as failed to prevent infinite retry
      // (e.g. offset beyond max_result_window returns ES 400)
      set((state) => {
        const newInflight = new Set(state._inflight);
        newInflight.delete(key);
        const newFailed = new Set(state._failedRanges);
        newFailed.add(key);
        return {
          _inflight: newInflight,
          _failedRanges: newFailed,
          error: e instanceof Error ? e.message : "Load range failed",
        };
      });
    }
  },
}));

