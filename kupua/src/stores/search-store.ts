/**
 * Main application store.
 *
 * Manages search params, results, loading state, and the data source.
 * URL sync is handled by the useUrlSearchSync hook (URL → store → search).
 */

import { create } from "zustand";
import type { Image } from "@/types/image";
import type { ImageDataSource, SearchParams } from "@/dal";
import { ElasticsearchDataSource } from "@/dal";

/** How often to poll for new images (ms). */
const NEW_IMAGES_POLL_INTERVAL = 10_000;

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

  // Actions
  setParams: (params: Partial<SearchParams>) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  setFocusedImageId: (id: string | null) => void;
}

let _newImagesPollTimer: ReturnType<typeof setInterval> | null = null;

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
    const { dataSource, params, results, total, loading } = get();
    if (loading || results.length >= total) return;

    const nextOffset = results.length;
    set({ loading: true });

    try {
      const result = await dataSource.search({
        ...params,
        offset: nextOffset,
      });

      // Use a functional updater so we read the *current* results array,
      // not the stale snapshot from before the await.  If another loadMore
      // already appended at this offset, skip to avoid duplicates.
      set((state) => {
        if (state.results.length !== nextOffset) {
          // Another loadMore already landed — discard this batch.
          return { loading: false };
        }
        return {
          results: [...state.results, ...result.hits],
          total: result.total,
          took: result.took,
          loading: false,
          params: { ...state.params, offset: nextOffset },
        };
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Load more failed",
        loading: false,
      });
    }
  },
}));

