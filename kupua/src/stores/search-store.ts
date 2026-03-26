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
import type { ImageDataSource, SearchParams, AggregationsResult } from "@/dal";
import { ElasticsearchDataSource } from "@/dal";
import { FIELD_REGISTRY } from "@/lib/field-registry";

/** How often to poll for new images (ms). */
const NEW_IMAGES_POLL_INTERVAL = 10_000;

/**
 * Maximum number of rows addressable via `from/size` pagination.
 * Matches the ES `max_result_window` on TEST/PROD (101,000).
 * Local docker ES uses the default 10,000 — `loadRange` will fail
 * gracefully if offset exceeds the window.
 */
const MAX_RESULT_WINDOW = 100_000;

// ---------------------------------------------------------------------------
// Aggregation constants
// ---------------------------------------------------------------------------

/** Debounce delay for aggregation fetches (ms). Longer than search (~300ms). */
const AGG_DEBOUNCE_MS = 500;

/** Circuit breaker threshold — if agg response exceeds this, disable auto-fetch. */
const AGG_CIRCUIT_BREAKER_MS = 2000;

/** Default number of buckets per field in the batched request. */
const AGG_DEFAULT_SIZE = 10;

/** Aggregatable fields derived from the field registry — built once. */
const AGG_FIELDS = FIELD_REGISTRY
  .filter((f) => f.aggregatable && f.sortKey)
  .map((f) => ({ field: f.sortKey!, size: AGG_DEFAULT_SIZE }));

interface SearchState {
  // Data source (swappable between ES and Grid API)
  dataSource: ImageDataSource;

  // Search state
  params: SearchParams;
  results: Image[];
  total: number;
  loading: boolean;
  error: string | null;

  /** ES query time in ms from the most recent primary search (not loadMore/loadRange). */
  took: number | null;

  /** Rolling average of recent loadRange ES times (ms). Updated every few loads. */
  scrollAvg: number | null;

  // O(1) image ID → index lookup, maintained incrementally.
  imagePositions: Map<string, number>;

  // Focus
  focusedImageId: string | null;

  // New images ticker
  newCount: number;
  newCountSince: string | null;

  // Result set freezing
  frozenUntil: string | null;

  // Track which ranges are currently being fetched to avoid duplicate requests
  _inflight: Set<string>;
  _failedRanges: Set<string>;

  // --- Aggregation state ---
  /** Cached aggregation results, keyed by field path. */
  aggregations: AggregationsResult | null;
  /** ES took time for the most recent agg request. */
  aggTook: number | null;
  /** True while an aggregation request is in flight. */
  aggLoading: boolean;
  /** Circuit breaker tripped — auto-fetch disabled until manual refresh succeeds. */
  aggCircuitOpen: boolean;
  /**
   * Hash of the SearchParams that produced the cached aggregations.
   * If the current params hash differs, the cache is stale.
   */
  _aggCacheKey: string | null;

  // Actions
  setParams: (params: Partial<SearchParams>) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadRange: (start: number, end: number) => Promise<void>;
  setFocusedImageId: (id: string | null) => void;
  /**
   * Fetch aggregations for the current search params.
   * Called when Filters section is expanded or after a search completes
   * while Filters is already expanded. Respects cache and circuit breaker.
   * @param force — bypass cache + circuit breaker (manual refresh button).
   */
  fetchAggregations: (force?: boolean) => Promise<void>;
}

let _newImagesPollTimer: ReturnType<typeof setInterval> | null = null;
/** Module-level flag to prevent concurrent loadMore without triggering re-renders */
let _loadMoreInFlight = false;

/**
 * Generation-based abort for loadRange requests.
 */
let _rangeAbortController = new AbortController();

/** Rolling window of recent loadRange ES took values for computing scrollAvg. */
const _scrollTookWindow: number[] = [];
const SCROLL_TOOK_WINDOW_SIZE = 10;

// ---------------------------------------------------------------------------
// Aggregation module-level state
// ---------------------------------------------------------------------------

/** Debounce timer for aggregation fetches. */
let _aggDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Abort controller for the current aggregation request. */
let _aggAbortController: AbortController | null = null;

/**
 * Compute a cache key from SearchParams that affect the result set.
 * Only includes fields that change what documents match — not pagination
 * or display params. This way, scrolling doesn't invalidate the agg cache.
 */
function aggCacheKey(params: SearchParams): string {
  const { query, nonFree, since, until, takenSince, takenUntil,
    modifiedSince, modifiedUntil, uploadedBy, ids, hasCrops,
    hasRightsAcquired, syndicationStatus, persisted } = params;
  return JSON.stringify({
    query, nonFree, since, until, takenSince, takenUntil,
    modifiedSince, modifiedUntil, uploadedBy, ids, hasCrops,
    hasRightsAcquired, syndicationStatus, persisted,
  });
}

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

/**
 * Build an imagePositions Map from a hits array starting at `offset`.
 * Used for full rebuilds (search) and incremental updates (loadMore, loadRange).
 */
function buildPositions(
  hits: Image[],
  offset: number,
  existing?: Map<string, number>,
): Map<string, number> {
  const map = existing ? new Map(existing) : new Map<string, number>();
  for (let i = 0; i < hits.length; i++) {
    const img = hits[i];
    if (img?.id) {
      map.set(img.id, offset + i);
    }
  }
  return map;
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
  loading: false,
  error: null,
  took: null,
  scrollAvg: null,

  imagePositions: new Map(),

  focusedImageId: null,

  newCount: 0,
  newCountSince: null,
  frozenUntil: null,
  _inflight: new Set(),
  _failedRanges: new Set(),

  // Aggregation state
  aggregations: null,
  aggTook: null,
  aggLoading: false,
  aggCircuitOpen: false,
  _aggCacheKey: null,

  setParams: (newParams) => {
    set((state) => ({
      params: { ...state.params, ...newParams, offset: 0 },
    }));
  },

  setFocusedImageId: (id) => set({ focusedImageId: id }),

  search: async () => {
    const { dataSource, params } = get();
    set({ loading: true, error: null });

    // Abort all in-flight loadRange requests from the previous search.
    // They're for stale offsets — responses would be discarded anyway,
    // but cancelling frees up browser connections for the new search.
    _rangeAbortController.abort();
    _rangeAbortController = new AbortController();

    try {
      const result = await dataSource.search({ ...params, offset: 0 });
      const now = new Date().toISOString();
      _scrollTookWindow.length = 0;
      set({
        results: result.hits,
        total: result.total,
        loading: false,
        took: result.took ?? null,
        scrollAvg: null,
        params: { ...params, offset: 0 },
        imagePositions: buildPositions(result.hits, 0),
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
          params: { ...state.params, offset: nextOffset },
          imagePositions: buildPositions(result.hits, nextOffset, state.imagePositions),
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
      }, _rangeAbortController.signal);

      if (result.took != null) {
        _scrollTookWindow.push(result.took);
        if (_scrollTookWindow.length > SCROLL_TOOK_WINDOW_SIZE) _scrollTookWindow.shift();
      }

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

        // Incrementally extend imagePositions — O(page size) not O(total loaded)
        const newPositions = buildPositions(result.hits, start, state.imagePositions);

        // Update scrollAvg only when the rounded value changes
        const avg = _scrollTookWindow.length > 0
          ? Math.round(_scrollTookWindow.reduce((a, b) => a + b, 0) / _scrollTookWindow.length)
          : null;
        const avgChanged = avg !== state.scrollAvg;

        return {
          results: newResults,
          total: result.total,
          _inflight: newInflight,
          imagePositions: newPositions,
          ...(avgChanged ? { scrollAvg: avg } : {}),
        };
      });
    } catch (e) {
      // Aborted requests (from a new search cancelling the previous generation)
      // are intentional — just clean up inflight tracking, don't set error or
      // record as failed (the range isn't actually broken, it was just stale).
      if (e instanceof DOMException && e.name === "AbortError") {
        set((state) => {
          const newInflight = new Set(state._inflight);
          newInflight.delete(key);
          return { _inflight: newInflight };
        });
        return;
      }
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

  fetchAggregations: async (force) => {
    const { dataSource, params, aggCircuitOpen, _aggCacheKey } = get();

    // Check cache — if params haven't changed, skip (unless forced)
    const key = aggCacheKey(params);
    if (!force && key === _aggCacheKey) return;

    // Circuit breaker — skip auto-fetch if tripped (unless forced)
    if (!force && aggCircuitOpen) return;

    // Cancel any pending debounce or in-flight request
    if (_aggDebounceTimer) clearTimeout(_aggDebounceTimer);
    if (_aggAbortController) _aggAbortController.abort();

    // Debounce — wait AGG_DEBOUNCE_MS before firing (unless forced)
    if (!force) {
      await new Promise<void>((resolve) => {
        _aggDebounceTimer = setTimeout(resolve, AGG_DEBOUNCE_MS);
      });
    }

    // Re-check cache after debounce — params may have changed again
    const currentKey = aggCacheKey(get().params);
    if (!force && currentKey === get()._aggCacheKey) return;

    _aggAbortController = new AbortController();
    set({ aggLoading: true });

    const startTime = performance.now();

    try {
      const result = await dataSource.getAggregations(
        get().params,
        AGG_FIELDS,
        _aggAbortController.signal,
      );

      const elapsed = performance.now() - startTime;

      set({
        aggregations: result,
        aggTook: result.took ?? null,
        aggLoading: false,
        _aggCacheKey: aggCacheKey(get().params),
        // Reset circuit breaker on fast response
        aggCircuitOpen: elapsed > AGG_CIRCUIT_BREAKER_MS,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Intentional cancellation — don't update state
        set({ aggLoading: false });
        return;
      }
      set({
        aggLoading: false,
        // Don't overwrite search error — agg errors are non-critical
      });
    }
  },
}));

