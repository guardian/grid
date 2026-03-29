/**
 * Main application store — windowed buffer architecture.
 *
 * Manages search params, results buffer, loading state, and the data source.
 * URL sync is handled by the useUrlSearchSync hook (URL → store → search).
 *
 * Results are stored in a fixed-capacity windowed buffer. `bufferOffset` maps
 * buffer[0] to a global position in the result set. The buffer slides as the
 * user scrolls — `extendForward` and `extendBackward` fetch pages via
 * `search_after` cursors, and old entries are evicted to keep memory bounded.
 *
 * For random access (scrubber, sort-around-focus), `seek()` clears the buffer
 * and refills at the target position using `from/size` (≤100k) or
 * `search_after` with sort-value estimation (>100k).
 *
 * PIT (Point In Time) is used on non-local ES for pagination consistency.
 * On local ES (stable 10k dataset), PIT is skipped — search_after still works
 * but without snapshot isolation.
 */

import { create } from "zustand";
import type { Image } from "@/types/image";
import type {
  ImageDataSource,
  SearchParams,
  SortValues,
  AggregationsResult,
  AggregationResult,
  KeywordDistribution,
} from "@/dal";
import { ElasticsearchDataSource, buildSortClause, parseSortField } from "@/dal";
import { IS_LOCAL_ES } from "@/dal/es-config";
import { FIELD_REGISTRY } from "@/lib/field-registry";
import { resolveKeywordSortInfo } from "@/lib/sort-context";

// ---------------------------------------------------------------------------
// Buffer constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of images in the buffer at any time.
 * At ~5-10KB per image: 5-10MB. Comfortable for any device.
 * Provides ~10 screens of overscan at typical viewport heights.
 */
const BUFFER_CAPACITY = 1000;

/**
 * Number of images to fetch per extend (forward or backward).
 * Smaller than BUFFER_CAPACITY so extends don't replace the entire buffer.
 */
const PAGE_SIZE = 200;

/**
 * Maximum total result count for which the store will eagerly fetch ALL
 * results into the buffer after the initial page. When total ≤ this value,
 * the scrubber enters "scroll mode" (drag directly scrolls content, no
 * seek-on-pointer-up). When total > this value, the scrubber stays in
 * "seek mode" (windowed buffer, scrubber is a position-seeking control).
 *
 * Two-phase approach: search() always fetches PAGE_SIZE first (instant
 * results), then if total ≤ threshold, fires a follow-up fetch for the
 * remainder. User sees results immediately; scroll mode activates ~200-
 * 500ms later.
 *
 * Configurable via VITE_SCROLL_MODE_THRESHOLD env var (set in .env).
 */
const SCROLL_MODE_THRESHOLD = Number(
  import.meta.env.VITE_SCROLL_MODE_THRESHOLD ?? 1000,
);

/**
 * Maximum number of rows addressable via `from/size` pagination.
 *
 * Must match the ES index's `max_result_window` setting.
 * Real clusters (TEST/PROD): 101,000 (custom setting).
 * Local docker ES: 500 (deliberately low so e2e tests exercise the deep
 * seek path with only 10k docs — see load-sample-data.sh).
 *
 * Configurable via VITE_MAX_RESULT_WINDOW env var (set in .env).
 */
const MAX_RESULT_WINDOW = Number(
  import.meta.env.VITE_MAX_RESULT_WINDOW ?? 100_000,
);

/**
 * Threshold above which seek uses the deep path (percentile estimation +
 * search_after + countBefore) instead of from/size. Set well below
 * MAX_RESULT_WINDOW because from/size at large offsets is painfully slow
 * (~1-3s on real clusters) — ES must score and skip all preceding docs.
 * The deep path is ~20-70ms regardless of depth.
 *
 * Configurable via VITE_DEEP_SEEK_THRESHOLD env var (set in .env).
 */
const DEEP_SEEK_THRESHOLD = Number(
  import.meta.env.VITE_DEEP_SEEK_THRESHOLD ?? 10_000,
);

/** How often to poll for new images (ms). */
const NEW_IMAGES_POLL_INTERVAL = 10_000;

// ---------------------------------------------------------------------------
// Aggregation constants
// ---------------------------------------------------------------------------

/** Debounce delay for aggregation fetches (ms). Longer than search (~300ms). */
const AGG_DEBOUNCE_MS = 500;

/** Circuit breaker threshold — if agg response exceeds this, disable auto-fetch. */
const AGG_CIRCUIT_BREAKER_MS = 2000;

/** Default number of buckets per field in the batched request. */
const AGG_DEFAULT_SIZE = 10;

/** Bucket count for "show more" — single-field on-demand request. */
const AGG_EXPANDED_SIZE = 100;

/** Aggregatable fields derived from the field registry — built once. */
const AGG_FIELDS = FIELD_REGISTRY
  .filter((f) => f.aggregatable && f.esSearchPath && typeof f.esSearchPath === "string")
  .map((f) => ({ field: f.esSearchPath as string, size: AGG_DEFAULT_SIZE }));

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface SearchState {
  // Data source (swappable between ES and Grid API)
  dataSource: ImageDataSource;

  // Search state
  params: SearchParams;
  /**
   * Windowed buffer of loaded images. Dense array, max BUFFER_CAPACITY entries.
   * May contain `undefined` gaps during loading (same as the old sparse array).
   * buffer[0] corresponds to global position `bufferOffset`.
   */
  results: (Image | undefined)[];
  /** Global offset of buffer[0] in the full result set. */
  bufferOffset: number;
  total: number;
  loading: boolean;
  error: string | null;

  /** ES query time in ms from the most recent primary search. */
  took: number | null;
  /** Wall-clock time in ms of the most recent seek operation (null if no seek yet). */
  seekTime: number | null;

  // O(1) image ID → global index lookup, maintained incrementally.
  imagePositions: Map<string, number>;

  // Cursors for search_after pagination
  /** Sort values of the first buffer entry — for backward extend. */
  startCursor: SortValues | null;
  /** Sort values of the last buffer entry — for forward extend. */
  endCursor: SortValues | null;

  /** PIT ID for consistent pagination (null on local ES or before first search). */
  pitId: string | null;

  // Focus
  focusedImageId: string | null;

  /** Non-null while sort-around-focus is finding the image's new position. */
  sortAroundFocusStatus: string | null;
  /**
   * Incremented each time sort-around-focus completes and sets focusedImageId.
   * Views watch this to scroll to the focused image at its new position.
   */
  sortAroundFocusGeneration: number;

  // New images ticker
  newCount: number;
  newCountSince: string | null;

  // Result set freezing (used when PIT is not active — local ES)
  frozenUntil: string | null;

  // Track in-flight extend operations to avoid duplicates
  _extendForwardInFlight: boolean;
  _extendBackwardInFlight: boolean;

  /**
   * Number of items prepended by the most recent backward extend.
   * Incremented as a generation counter (not reset to 0) so views can
   * detect the change via useEffect. Views must adjust scrollTop by
   * `prependCount * rowHeight` to prevent content shift.
   */
  _lastPrependCount: number;
  /** Generation counter — bumped on every backward extend for change detection. */
  _prependGeneration: number;

  /**
   * Number of items evicted from the start by the most recent forward extend.
   * Views must adjust scrollTop by `-evictCount * rowHeight` to keep the
   * viewport pointing at the same data. Without this, the viewport sits near
   * the buffer end after eviction, causing an infinite extend loop (Bug #16).
   */
  _lastForwardEvictCount: number;
  /** Generation counter — bumped on every forward-extend-with-eviction. */
  _forwardEvictGeneration: number;

  /**
   * Generation counter — bumped on every seek (and sort-around-focus reposition).
   * Views watch this to reset scrollTop after the buffer is replaced.
   * The buffer-local target index is stored in `_seekTargetLocalIndex`
   * so views can scroll to the right position (not always 0).
   */
  _seekGeneration: number;
  /**
   * Buffer-local index the seek targeted. Views should scroll here after
   * the seek completes. -1 means "scroll to 0" (default).
   */
  _seekTargetLocalIndex: number;

  // --- Aggregation state (unchanged from before) ---
  aggregations: AggregationsResult | null;
  aggTook: number | null;
  aggLoading: boolean;
  aggCircuitOpen: boolean;
  _aggCacheKey: string | null;
  expandedAggs: Record<string, AggregationResult>;
  expandedAggsLoading: Set<string>;

  // --- Keyword distribution for scrubber tooltip (sort-context) ---
  /** Pre-fetched keyword distribution for the current keyword sort field. */
  keywordDistribution: KeywordDistribution | null;
  /** Cache key: query params + orderBy. Null = not fetched. */
  _kwDistCacheKey: string | null;

  // Actions
  setParams: (params: Partial<SearchParams>) => void;
  /**
   * Run a new search. If `sortAroundFocusId` is provided, attempts to find
   * that image's position in the new results and seek to it after the
   * initial page loads. Used for sort-around-focus ("Never Lost").
   */
  search: (sortAroundFocusId?: string | null) => Promise<void>;
  /**
   * Extend the buffer forward (append pages after the current end).
   * Uses search_after with endCursor. Evicts from start if over capacity.
   */
  extendForward: () => Promise<void>;
  /**
   * Extend the buffer backward (prepend pages before the current start).
   * Uses reverse search_after with startCursor. Evicts from end if over capacity.
   */
  extendBackward: () => Promise<void>;
  /**
   * Seek to a global offset — clear buffer and refill at the target position.
   * Used by scrubber drags and sort-around-focus.
   */
  seek: (globalOffset: number) => Promise<void>;

  // Legacy compatibility — thin wrappers over extend/seek
  /** @deprecated Use extendForward instead. Kept for view compatibility during migration. */
  loadMore: () => Promise<void>;
  /** @deprecated Use seek instead. Kept for ImageDetail offset restore during migration. */
  loadRange: (start: number, end: number) => Promise<void>;

  setFocusedImageId: (id: string | null) => void;
  fetchAggregations: (force?: boolean) => Promise<void>;
  fetchExpandedAgg: (field: string) => Promise<void>;
  collapseExpandedAgg: (field: string) => void;
  /**
   * Fetch keyword distribution for the current sort field (if keyword sort).
   * Lazy — called on first scrubber interaction, cached until query/sort changes.
   */
  fetchKeywordDistribution: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level state (not in Zustand — avoids re-renders)
// ---------------------------------------------------------------------------

let _newImagesPollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Generation-based abort for extend/seek requests.
 * search() aborts all in-flight extends from the previous search.
 */
let _rangeAbortController = new AbortController();

/**
 * Cooldown timestamp after a seek. Extends are suppressed until this time
 * to prevent a cascade of backward extends when the virtualizer starts at
 * scrollTop=0 after a seek (visible range [0..20], bufferOffset > 0 →
 * extendBackward fires repeatedly until bufferOffset reaches 0).
 * The cooldown gives the view time to settle at the correct position.
 */
let _seekCooldownUntil = 0;

/** Debounce timer for aggregation fetches. */
let _aggDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Abort controller for the current aggregation request. */
let _aggAbortController: AbortController | null = null;

/** Abort controller for the keyword distribution request. */
let _kwDistAbortController: AbortController | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Cache key for keyword distribution — includes orderBy (sort field + direction
 * matter) on top of the result-set-affecting params from aggCacheKey.
 */
function kwDistCacheKey(params: SearchParams): string {
  return aggCacheKey(params) + "|" + (params.orderBy ?? "");
}

function startNewImagesPoll(get: () => SearchState, set: (s: Partial<SearchState>) => void) {
  stopNewImagesPoll();
  _newImagesPollTimer = setInterval(async () => {
    const { dataSource, params, newCountSince } = get();
    if (!newCountSince) return;
    try {
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
 * Used for full rebuilds (search) and incremental updates (extend).
 */
function buildPositions(
  hits: (Image | undefined)[],
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

/**
 * Remove positions for images in a given global index range from the Map.
 * Used during eviction to keep imagePositions accurate.
 */
function evictPositions(
  map: Map<string, number>,
  buffer: (Image | undefined)[],
  evictStart: number,  // buffer-local start index
  evictEnd: number,    // buffer-local end index (exclusive)
): Map<string, number> {
  const newMap = new Map(map);
  for (let i = evictStart; i < evictEnd; i++) {
    const img = buffer[i];
    if (img?.id) {
      newMap.delete(img.id);
    }
  }
  return newMap;
}

// ---------------------------------------------------------------------------
// Scroll-mode buffer fill — eagerly load all results for small sets
// ---------------------------------------------------------------------------

/**
 * After the initial search, if total ≤ SCROLL_MODE_THRESHOLD, fetch all
 * remaining results so the buffer contains the entire result set. This
 * activates "scroll mode" in the scrubber (drag directly scrolls content).
 *
 * Runs in the background — user already sees the first PAGE_SIZE results.
 * Fetches in PAGE_SIZE chunks via searchAfter, appending to the buffer.
 * Aborted if a new search starts (signal is cancelled).
 */
async function _fillBufferForScrollMode(
  dataSource: ImageDataSource,
  params: SearchParams,
  loadedSoFar: number,
  total: number,
  cursor: SortValues,
  pitId: string | null,
  signal: AbortSignal,
  get: () => SearchState,
  set: (partial: Partial<SearchState> | ((s: SearchState) => Partial<SearchState>)) => void,
): Promise<void> {
  let currentCursor = cursor;
  let fetched = loadedSoFar;

  console.log(`[scroll-mode-fill] Fetching remaining ${total - fetched} results (total: ${total})`);

  // Suppress forward extends while filling — prevents the virtualizer's
  // reportVisibleRange from firing overlapping searchAfter requests.
  set({ _extendForwardInFlight: true });

  while (fetched < total) {
    if (signal.aborted) {
      set({ _extendForwardInFlight: false });
      return;
    }

    const remaining = total - fetched;
    const chunkSize = Math.min(PAGE_SIZE, remaining);

    try {
      const result = await dataSource.searchAfter(
        { ...params, length: chunkSize },
        currentCursor,
        pitId,
        signal,
      );

      if (signal.aborted) {
        set({ _extendForwardInFlight: false });
        return;
      }
      if (result.hits.length === 0) break;

      // Update cursor for next iteration
      const newEndCursor = result.sortValues.length > 0
        ? result.sortValues[result.sortValues.length - 1]
        : null;
      if (!newEndCursor) break;
      currentCursor = newEndCursor;

      // Append to buffer — no eviction (we want the full set)
      set((state) => {
        const newBuffer = [...state.results, ...result.hits];
        const newPositions = buildPositions(
          result.hits,
          state.bufferOffset + state.results.length,
          state.imagePositions,
        );
        return {
          results: newBuffer,
          imagePositions: newPositions,
          endCursor: newEndCursor,
          total: result.total, // may have changed
        };
      });

      fetched += result.hits.length;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        set({ _extendForwardInFlight: false });
        return;
      }
      // Non-fatal — user already has partial results, scroll mode just
      // won't activate. Log and stop.
      console.warn("[scroll-mode-fill] Failed to fetch chunk:", e);
      break;
    }
  }

  console.log(`[scroll-mode-fill] Complete — buffer now has ${get().results.length} results`);
  set({ _extendForwardInFlight: false });
}

// ---------------------------------------------------------------------------
// Sort-around-focus — async find-and-seek after sort change
// ---------------------------------------------------------------------------

/**
 * After a sort change, asynchronously find a specific image's new position
 * and seek to it. This runs after the initial search has completed and
 * results are showing at position 0. Non-blocking — the user sees fresh
 * results immediately; this work happens in the background.
 *
 * Algorithm:
 * 1. Fetch image by ID with current sort to get its sort[] values.
 * 2. countBefore query → exact global offset.
 * 3. If offset is within the current buffer → just focus + scroll. Done.
 * 4. If outside → use searchAfter directly with the image's sort values
 *    (NOT seek(), which uses imprecise percentile estimation for deep
 *    positions). This guarantees the image is near the start of the
 *    fetched page.
 * 5. Graceful degradation: any failure → stay at top, clear status.
 */
async function _findAndFocusImage(
  imageId: string,
  params: SearchParams,
  signal: AbortSignal,
  get: () => SearchState,
  set: (s: Partial<SearchState>) => void,
): Promise<void> {
  const { dataSource } = get();

  set({ sortAroundFocusStatus: "Finding image…" });

  // Timeout: if the whole process takes longer than 8s, give up gracefully.
  // This prevents "Seeking... forever" if ES is slow or queries are expensive.
  const timeoutId = setTimeout(() => {
    console.warn("[sort-around-focus] Timed out after 8s");
    set({ sortAroundFocusStatus: null, loading: false });
  }, 8000);

  try {
    // Step 1: Search for this specific image with the current sort to get
    // both the image and its sort[] values in one request.
    if (signal.aborted) return;
    const sortClause = buildSortClause(params.orderBy);
    const sortResult = await dataSource.searchAfter(
      { ...params, ids: imageId, length: 1 },
      null,
      null,
      signal,
    );

    if (signal.aborted) return;
    if (sortResult.hits.length === 0 || sortResult.sortValues.length === 0) {
      // Image not in results (maybe filtered out) — degrade gracefully
      set({ sortAroundFocusStatus: null, loading: false });
      return;
    }

    const targetHit = sortResult.hits[0];
    const imageSortValues = sortResult.sortValues[0];

    // Step 2: countBefore → exact global offset
    if (signal.aborted) return;
    const offset = await dataSource.countBefore(
      params,
      imageSortValues,
      sortClause,
      signal,
    );

    if (signal.aborted) return;

    // Step 3: Check if the offset is within the current buffer
    const { bufferOffset, results } = get();
    const bufferEnd = bufferOffset + results.length;
    const isInBuffer = offset >= bufferOffset && offset < bufferEnd;

    if (isInBuffer) {
      // Image is in the buffer — just focus it
      set({
        focusedImageId: imageId,
        sortAroundFocusStatus: null,
        loading: false,
        sortAroundFocusGeneration: get().sortAroundFocusGeneration + 1,
      });
    } else {
      // Outside buffer — fetch a page directly using the image's sort
      // values as the search_after cursor. This lands us right after
      // the target image (search_after is exclusive). We'll also fetch
      // backward to get items before it, centering the image in the buffer.
      set({ sortAroundFocusStatus: "Seeking…" });

      // Abort any in-flight extends from the previous search and create
      // a fresh controller for our own requests. Note: this aborts the
      // parent `signal` (which came from the same controller), so we must
      // NOT check `signal.aborted` after this point — only `seekSignal`.
      _rangeAbortController.abort();
      _rangeAbortController = new AbortController();
      const seekSignal = _rangeAbortController.signal;

      // Forward page: items after the target image
      const forwardResult = await dataSource.searchAfter(
        { ...params, length: Math.floor(PAGE_SIZE / 2) },
        imageSortValues,
        get().pitId,
        seekSignal,
      );
      if (seekSignal.aborted) return;

      // Backward page: items before the target image
      const backwardResult = await dataSource.searchAfter(
        { ...params, length: Math.floor(PAGE_SIZE / 2) },
        imageSortValues,
        get().pitId,
        seekSignal,
        true, // reverse
      );
      if (seekSignal.aborted) return;

      // Combine: backward hits + target image + forward hits
      // The target image itself is NOT in either result (search_after is exclusive).
      const combinedHits: (Image | undefined)[] = [
        ...backwardResult.hits,
        targetHit,
        ...forwardResult.hits,
      ];
      const combinedSortValues: SortValues[] = [
        ...backwardResult.sortValues,
        imageSortValues,
        ...forwardResult.sortValues,
      ];

      const bufferStart = Math.max(0, offset - backwardResult.hits.length);
      const startCursor = combinedSortValues.length > 0
        ? combinedSortValues[0]
        : null;
      const endCursor = combinedSortValues.length > 0
        ? combinedSortValues[combinedSortValues.length - 1]
        : null;

      _seekCooldownUntil = Date.now() + 500;

      // NOTE: we intentionally do NOT bump _seekGeneration here.
      // sortAroundFocusGeneration is the sole scroll trigger — its effect
      // scrolls to the focused image with align: "center". Bumping
      // _seekGeneration too would fire the seek scroll effect (align:
      // "start") in the same layout pass, causing two conflicting
      // scroll positions and a visible grid-cell recomposition twitch.
      set({
        results: combinedHits,
        bufferOffset: bufferStart,
        total: forwardResult.total,
        loading: false,
        imagePositions: buildPositions(combinedHits, bufferStart),
        startCursor,
        endCursor,
        pitId: forwardResult.pitId ?? get().pitId,
        _extendForwardInFlight: false,
        _extendBackwardInFlight: false,
        focusedImageId: imageId,
        sortAroundFocusStatus: null,
        sortAroundFocusGeneration: get().sortAroundFocusGeneration + 1,
      });
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    // Any failure → degrade gracefully (stay at top)
    console.warn("[sort-around-focus] Failed to find image:", e);
    set({ sortAroundFocusStatus: null, loading: false });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSearchStore = create<SearchState>((set, get) => ({
  dataSource: new ElasticsearchDataSource(),

  params: {
    query: undefined,
    offset: 0,
    length: PAGE_SIZE,
    orderBy: "-uploadTime",
    nonFree: "true",
  },
  results: [],
  bufferOffset: 0,
  total: 0,
  loading: false,
  error: null,
  took: null,
  seekTime: null,

  imagePositions: new Map(),

  startCursor: null,
  endCursor: null,
  pitId: null,

  focusedImageId: null,
  sortAroundFocusStatus: null,
  sortAroundFocusGeneration: 0,

  newCount: 0,
  newCountSince: null,
  frozenUntil: null,
  _extendForwardInFlight: false,
  _extendBackwardInFlight: false,
  _lastPrependCount: 0,
  _prependGeneration: 0,
  _lastForwardEvictCount: 0,
  _forwardEvictGeneration: 0,
  _seekGeneration: 0,
  _seekTargetLocalIndex: -1,

  // Aggregation state
  aggregations: null,
  aggTook: null,
  aggLoading: false,
  aggCircuitOpen: false,
  _aggCacheKey: null,
  expandedAggs: {},
  expandedAggsLoading: new Set(),

  // Keyword distribution state (scrubber tooltip)
  keywordDistribution: null,
  _kwDistCacheKey: null,

  setParams: (newParams) => {
    set((state) => ({
      params: { ...state.params, ...newParams, offset: 0 },
    }));
  },

  setFocusedImageId: (id) => set({ focusedImageId: id }),

  search: async (sortAroundFocusId?: string | null) => {
    const { dataSource, params, pitId: oldPitId } = get();
    set({ loading: true, error: null, sortAroundFocusStatus: null });

    // Abort all in-flight extends from the previous search
    _rangeAbortController.abort();
    _rangeAbortController = new AbortController();
    const signal = _rangeAbortController.signal;

    // Abort any in-flight keyword distribution fetch
    if (_kwDistAbortController) _kwDistAbortController.abort();

    // Clear extend-in-flight flags — the abort above cancels any in-flight
    // extends or scroll-mode fill from the previous search. Without this,
    // a scroll-mode fill that gets aborted leaves _extendForwardInFlight
    // stuck at true, blocking sort-around-focus and future extends.
    set({
      _extendForwardInFlight: false, _extendBackwardInFlight: false,
      keywordDistribution: null, _kwDistCacheKey: null,
    });

    // Close old PIT (fire-and-forget)
    if (oldPitId) {
      dataSource.closePit(oldPitId);
    }

    try {
      // Open a new PIT on non-local ES for consistent pagination
      let newPitId: string | null = null;
      if (!IS_LOCAL_ES) {
        try {
          newPitId = await dataSource.openPit("5m");
        } catch (e) {
          console.warn("[search] Failed to open PIT, proceeding without:", e);
        }
      }

      // Initial search — use searchAfter (first page, no cursor)
      const result = await dataSource.searchAfter(
        { ...params, length: PAGE_SIZE },
        null, // no cursor — first page
        newPitId,
      );

      const now = new Date().toISOString();

      // Extract cursors from sort values
      const startCursor = result.sortValues.length > 0 ? result.sortValues[0] : null;
      const endCursor = result.sortValues.length > 0
        ? result.sortValues[result.sortValues.length - 1]
        : null;

      // Check if the focused image landed in the first page
      const focusedInFirstPage = sortAroundFocusId
        ? result.hits.some((img) => img?.id === sortAroundFocusId)
        : false;

      // -----------------------------------------------------------------
      // Sort-around-focus: if we have a target image that wasn't in the
      // first page, DON'T expose the initial results to the view. The user
      // doesn't want to see position-0 results — they want the focused
      // image's neighbourhood. Keep loading=true and let _findAndFocusImage
      // do the buffer replacement in one shot, eliminating the flash of
      // wrong content. We still update metadata (total, pitId, etc.) so
      // _findAndFocusImage has what it needs.
      // -----------------------------------------------------------------
      if (sortAroundFocusId && !focusedInFirstPage && result.total > 0) {
        set({
          total: result.total,
          took: result.took ?? null,
          seekTime: null,
          params: { ...params, offset: 0 },
          pitId: result.pitId ?? newPitId,
          newCount: 0,
          newCountSince: now,
          frozenUntil: now,
          // Keep loading: true — _findAndFocusImage will set it to false.
          // Keep results/bufferOffset/imagePositions unchanged — old buffer
          // stays visible (or empty on first load) until the focused image's
          // neighbourhood is loaded, preventing flash of wrong content.
        });
        startNewImagesPoll(get, set);
        // Fire async — stays loading until complete
        _findAndFocusImage(sortAroundFocusId, params, signal, get, set);
      } else {
        set({
          results: result.hits,
          bufferOffset: 0,
          total: result.total,
          loading: false,
          took: result.took ?? null,
          seekTime: null,
          params: { ...params, offset: 0 },
          imagePositions: buildPositions(result.hits, 0),
          startCursor,
          endCursor,
          pitId: result.pitId ?? newPitId,
          focusedImageId: focusedInFirstPage ? sortAroundFocusId! : null,
          newCount: 0,
          newCountSince: now,
          frozenUntil: now,
          _extendForwardInFlight: false,
          _extendBackwardInFlight: false,
          // When sort-around-focus image is in the first page, bump the
          // generation so the view scrolls to its new position. Without
          // this, the scroll-reset effect leaves scrollTop=0 and the
          // focused image may be off-screen in its new sort position.
          ...(focusedInFirstPage
            ? { sortAroundFocusGeneration: get().sortAroundFocusGeneration + 1 }
            : {}),
        });
        startNewImagesPoll(get, set);

        // -----------------------------------------------------------
        // Scroll-mode fill: if the total is small enough, eagerly
        // fetch ALL remaining results so the scrubber enters scroll
        // mode (drag directly scrolls content, no seek needed).
        // Runs in the background — user already sees the first page.
        // -----------------------------------------------------------
        if (
          result.total > result.hits.length &&
          result.total <= SCROLL_MODE_THRESHOLD &&
          endCursor
        ) {
          _fillBufferForScrollMode(
            dataSource, params, result.hits.length, result.total,
            endCursor, result.pitId ?? newPitId, signal, get, set,
          );
        }
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Search failed",
        loading: false,
        sortAroundFocusStatus: null,
      });
    }
  },

  extendForward: async () => {
    const {
      dataSource, params, results, bufferOffset, total,
      endCursor, pitId, _extendForwardInFlight,
    } = get();

    // Guards
    if (_extendForwardInFlight) return;
    if (!endCursor) return; // no cursor — can't extend
    if (Date.now() < _seekCooldownUntil) return; // post-seek cooldown
    const globalEnd = bufferOffset + results.length;
    if (globalEnd >= total) return; // already at the end

    set({ _extendForwardInFlight: true });

    try {
      const result = await dataSource.searchAfter(
        { ...params, length: PAGE_SIZE },
        endCursor,
        pitId,
        _rangeAbortController.signal,
      );

      if (result.hits.length === 0) {
        set({ _extendForwardInFlight: false });
        return;
      }

      set((state) => {
        const newBuffer = [...state.results, ...result.hits];
        let newOffset = state.bufferOffset;
        let newStartCursor = state.startCursor;
        let newPositions = buildPositions(
          result.hits,
          state.bufferOffset + state.results.length,
          state.imagePositions,
        );

        // Eviction: if buffer exceeds capacity, evict from start
        let evictedFromStart = 0;
        if (newBuffer.length > BUFFER_CAPACITY) {
          evictedFromStart = newBuffer.length - BUFFER_CAPACITY;
          newPositions = evictPositions(
            newPositions, newBuffer, 0, evictedFromStart,
          );
          newBuffer.splice(0, evictedFromStart);
          newOffset += evictedFromStart;
          // Update start cursor to the new first entry's sort values
          // We don't have sort values stored per-entry in the buffer,
          // so we use the first result from the extend response if eviction
          // consumed the entire old buffer, otherwise the cursor stays
          // (it's stale but won't be used until we extend backward)
          newStartCursor = null; // Invalidate — backward extend will need a fresh fetch
        }

        const newEndCursor = result.sortValues.length > 0
          ? result.sortValues[result.sortValues.length - 1]
          : state.endCursor;

        return {
          results: newBuffer,
          bufferOffset: newOffset,
          total: result.total,
          endCursor: newEndCursor,
          startCursor: newStartCursor ?? state.startCursor,
          pitId: result.pitId ?? state.pitId,
          imagePositions: newPositions,
          _extendForwardInFlight: false,
          // Signal views to compensate scrollTop for evicted items (Bug #16)
          ...(evictedFromStart > 0 ? {
            _lastForwardEvictCount: evictedFromStart,
            _forwardEvictGeneration: state._forwardEvictGeneration + 1,
          } : {}),
        };
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        set({ _extendForwardInFlight: false });
        return;
      }
      set({
        _extendForwardInFlight: false,
        error: e instanceof Error ? e.message : "Extend forward failed",
      });
    }
  },

  extendBackward: async () => {
    const {
      dataSource, params, bufferOffset, startCursor, pitId,
      _extendBackwardInFlight,
    } = get();

    // Guards
    if (_extendBackwardInFlight) return;
    if (bufferOffset <= 0) return; // already at the start
    if (Date.now() < _seekCooldownUntil) return; // post-seek cooldown
    if (!startCursor) return; // no cursor — can't extend backward

    const fetchCount = Math.min(PAGE_SIZE, bufferOffset);

    set({ _extendBackwardInFlight: true });

    try {
      // Reverse search_after: flip sort, use startCursor as anchor,
      // results come back in reversed order (adapter reverses them).
      // Works at any depth — no from/size offset limit.
      const result = await dataSource.searchAfter(
        { ...params, length: fetchCount },
        startCursor,
        pitId,
        _rangeAbortController.signal,
        true, // reverse
      );

      if (result.hits.length === 0) {
        set({ _extendBackwardInFlight: false });
        return;
      }

      set((state) => {
        // result.hits are already in correct (forward) order after reversal
        const newBuffer = [...result.hits, ...state.results];
        const newOffset = Math.max(0, state.bufferOffset - result.hits.length);
        let newEndCursor = state.endCursor;
        let newPositions = buildPositions(
          result.hits,
          newOffset,
          state.imagePositions,
        );

        // Eviction: if buffer exceeds capacity, evict from end
        if (newBuffer.length > BUFFER_CAPACITY) {
          const evictCount = newBuffer.length - BUFFER_CAPACITY;
          const evictStart = newBuffer.length - evictCount;
          newPositions = evictPositions(
            newPositions, newBuffer, evictStart, newBuffer.length,
          );
          newBuffer.splice(evictStart, evictCount);
          newEndCursor = null; // Invalidate — forward extend will refetch
        }

        // Start cursor from the first result (earliest in sort order)
        const newStartCursor = result.sortValues.length > 0
          ? result.sortValues[0]
          : state.startCursor;

        return {
          results: newBuffer,
          bufferOffset: newOffset,
          startCursor: newStartCursor,
          endCursor: newEndCursor ?? state.endCursor,
          total: result.total,
          imagePositions: newPositions,
          _extendBackwardInFlight: false,
          _lastPrependCount: result.hits.length,
          _prependGeneration: state._prependGeneration + 1,
        };
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        set({ _extendBackwardInFlight: false });
        return;
      }
      set({
        _extendBackwardInFlight: false,
        error: e instanceof Error ? e.message : "Extend backward failed",
      });
    }
  },

  seek: async (globalOffset: number) => {
    const { dataSource, params, pitId } = get();

    // Clamp to valid range
    const { total } = get();
    const clampedOffset = Math.max(0, Math.min(globalOffset, Math.max(0, total - 1)));

    // Abort in-flight extends / previous seeks
    _rangeAbortController.abort();
    _rangeAbortController = new AbortController();
    // Capture the signal NOW — if another seek starts later, it will abort
    // this controller and all our in-flight requests will be cancelled.
    // Without this capture, requests made later in this async function would
    // read the module-level _rangeAbortController (which may have been
    // replaced by a newer seek), allowing stale seeks to complete uncancelled.
    const signal = _rangeAbortController.signal;

    // Set cooldown IMMEDIATELY (synchronous, before any await). This prevents
    // extendForward/extendBackward from racing when a scroll event and seek
    // fire in the same microtask (e.g. Home key sets scrollTop=0 then seeks).
    // Without this, the scroll handler triggers reportVisibleRange → extend
    // before the seek's async fetch can set the cooldown.
    _seekCooldownUntil = Date.now() + 500;

    set({ loading: true, error: null });

    const seekStartTime = Date.now();

    try {
      // Center the buffer around the target offset
      const halfBuffer = Math.floor(PAGE_SIZE / 2);
      const fetchStart = Math.max(0, clampedOffset - halfBuffer);

      let result;
      let actualOffset = fetchStart;

      if (fetchStart < DEEP_SEEK_THRESHOLD) {
        // ---------------------------------------------------------------
        // Shallow seek — from/size is fast at small offsets (<10k)
        // ---------------------------------------------------------------
        result = await dataSource.searchAfter(
          { ...params, offset: fetchStart, length: PAGE_SIZE },
          null,
          null,
          signal,
        );
      } else {
        // ---------------------------------------------------------------
        // Deep seek — percentile estimation + search_after + countBefore
        //
        // 1. Estimate the sort value at the target percentile
        // 2. search_after from that value (no from/size depth limit)
        // 3. countBefore to find the exact global offset we landed at
        // ---------------------------------------------------------------
        const sortClause = buildSortClause(params.orderBy);
        const primarySort = sortClause[0];
        const primaryField = primarySort ? Object.keys(primarySort)[0] : null;
        const primaryDir = primaryField
          ? (primarySort[primaryField] as string)
          : "desc";

        // For desc sort: position 0 = highest value. To find the value at
        // position P in N results, we need percentile (100 - P/N * 100).
        // For asc sort: position 0 = lowest value → percentile P/N * 100.
        const positionRatio = clampedOffset / Math.max(1, total);
        const percentile =
          primaryDir === "desc"
            ? (1 - positionRatio) * 100
            : positionRatio * 100;

        // Clamp percentile to avoid 0/100 edge cases (ES returns -Inf/+Inf)
        const clampedPercentile = Math.max(0.01, Math.min(99.99, percentile));

        let estimatedValue: number | null = null;
        if (primaryField && primaryField !== "_script") {
          estimatedValue = await dataSource.estimateSortValue(
            params,
            primaryField,
            clampedPercentile,
            signal,
          );
        }

        if (estimatedValue != null) {
          // Use search_after with the estimated sort value. Secondary sort
          // fields get type-appropriate anchors so ES doesn't reject the
          // cursor (e.g. "" is not valid for a date field like uploadTime).
          const searchAfterValues: SortValues = [estimatedValue];
          for (let i = 1; i < sortClause.length; i++) {
            const clause = sortClause[i];
            const { field } = parseSortField(clause);
            // The last field is always `id` (keyword) → "".
            // Date/numeric fields → 0 (epoch zero for dates, zero for numbers).
            // Unknown fields → 0 (safer than "" for non-keyword types).
            if (field === "id") {
              searchAfterValues.push("");
            } else {
              searchAfterValues.push(0);
            }
          }

          result = await dataSource.searchAfter(
            { ...params, length: PAGE_SIZE },
            searchAfterValues,
            pitId,
            signal,
          );

          // Find where we actually landed via countBefore
          if (result.hits.length > 0 && result.sortValues.length > 0) {
            // Check abort before starting another async operation —
            // searchAfter may have completed just before we were aborted.
            if (signal.aborted) return;
            const landedSortValues = result.sortValues[0];
            const countBefore = await dataSource.countBefore(
              params,
              landedSortValues,
              sortClause,
              signal,
            );
            actualOffset = countBefore;
          }
        } else {
          // Keyword / script sorts — percentile estimation unavailable.
          // Two strategies:
          //   A. Keyword fields: composite aggregation to walk unique values
          //      and find the value at the target position. O(unique_values/1000)
          //      ES requests — typically 2-10 for real-world data.
          //   B. Script sorts: iterative search_after to skip forward in chunks.
          //      Slower but works for any computed sort expression.
          const { field: pField, isScript } = parseSortField(sortClause[0]);

          // -----------------------------------------------------------------
          // Strategy A: Composite aggregation for keyword fields
          // -----------------------------------------------------------------
          if (!isScript && pField && dataSource.findKeywordSortValue) {
            console.log(
              `[seek] keyword strategy A: field=${pField}, target=${fetchStart}, ` +
              `dir=${primaryDir}, total=${total}`,
            );
            const keywordValue = await dataSource.findKeywordSortValue(
              params,
              pField,
              fetchStart,
              primaryDir as "asc" | "desc",
              signal,
            );

            if (signal.aborted) return;

            console.log(
              `[seek] findKeywordSortValue returned: ${JSON.stringify(keywordValue)}`,
            );

            if (keywordValue != null) {
              // Build search_after cursor from the keyword value
              const searchAfterValues: SortValues = [keywordValue];
              for (let i = 1; i < sortClause.length; i++) {
                const clause = sortClause[i];
                const { field } = parseSortField(clause);
                if (field === "id") {
                  searchAfterValues.push("");
                } else {
                  searchAfterValues.push(0);
                }
              }

              console.log(
                `[seek] search_after cursor: ${JSON.stringify(searchAfterValues)}`,
              );

              result = await dataSource.searchAfter(
                { ...params, length: PAGE_SIZE },
                searchAfterValues,
                pitId,
                signal,
              );

              // Verify actual position via countBefore
              if (result.hits.length > 0 && result.sortValues.length > 0) {
                if (signal.aborted) return;
                const landedSortValues = result.sortValues[0];
                const countBefore = await dataSource.countBefore(
                  params,
                  landedSortValues,
                  sortClause,
                  signal,
                );
                actualOffset = countBefore;
                console.log(
                  `[seek] countBefore=${countBefore}, landedSortValues=${JSON.stringify(landedSortValues)}, ` +
                  `target was ${fetchStart}, drift=${Math.abs(countBefore - fetchStart)}`,
                );
              }

              // -----------------------------------------------------------------
              // Refinement: if we landed far from the target (large keyword
              // bucket — e.g. 400k docs all with credit "PA"), binary-search
              // on the tiebreaker field to find a precise cursor.
              //
              // Old approach: iterative search_after hops transferring 100k+
              // sort values per hop — 46s for a 456k drift through SSH tunnel.
              //
              // New approach: binary search using countBefore (a single _count
              // query per iteration, ~5-10ms each). The tiebreaker is always
              // the `id` field (40-char hex SHA-1), uniformly distributed.
              // ~20 binary search steps → ~200ms total.
              // -----------------------------------------------------------------
              const drift = fetchStart - actualOffset;
              if (drift > PAGE_SIZE && result.hits.length > 0 && result.sortValues.length > 0) {
                // Identify the tiebreaker field (last sort clause — always `id`)
                const lastClause = sortClause[sortClause.length - 1];
                const { field: tiebreakerField } = parseSortField(lastClause);

                if (tiebreakerField === "id") {
                  console.log(
                    `[seek] large bucket drift=${drift}, refining via binary search on id...`,
                  );

                  // Binary search bounds: hex values for the id field.
                  // IDs are 40-char hex SHA-1 hashes (chars 0-9, a-f).
                  // We interpolate on the first 12 hex chars (~48 bits).
                  let loNum = 0;
                  let hiNum = 0xffffffffffff; // 12 hex "f"s
                  const MAX_BISECT = 50;
                  let bestCursor: SortValues = searchAfterValues;
                  let bestOffset = actualOffset;

                  for (let step = 0; step < MAX_BISECT; step++) {
                    if (signal.aborted) return;

                    if (hiNum - loNum <= 1) break; // converged

                    const midNum = Math.floor((loNum + hiNum) / 2);
                    const mid = midNum.toString(16).padStart(12, "0");

                    // Build cursor with the keyword value + interpolated id
                    const probeCursor: SortValues = [...searchAfterValues];
                    probeCursor[probeCursor.length - 1] = mid;

                    const count = await dataSource.countBefore(
                      params,
                      probeCursor,
                      sortClause,
                      signal,
                    );

                    if (step < 5 || step % 5 === 0) {
                      console.log(
                        `[seek] bisect step ${step}: mid=${mid}, count=${count}, ` +
                        `target=${fetchStart}, gap=${count - fetchStart}`,
                      );
                    }

                    if (count <= fetchStart) {
                      loNum = midNum;
                      if (count > bestOffset) {
                        bestOffset = count;
                        bestCursor = probeCursor;
                      }
                    } else {
                      hiNum = midNum;
                    }

                    // Close enough — within PAGE_SIZE of target
                    if (Math.abs(count - fetchStart) <= PAGE_SIZE) {
                      bestOffset = count;
                      bestCursor = probeCursor;
                      console.log(
                        `[seek] binary search converged at step ${step + 1}: ` +
                        `count=${count}, target=${fetchStart}, gap=${Math.abs(count - fetchStart)}`,
                      );
                      break;
                    }
                  }

                  if (signal.aborted) return;

                  // Fetch the actual page from the converged cursor
                  const refinedResult = await dataSource.searchAfter(
                    { ...params, length: PAGE_SIZE },
                    bestCursor,
                    pitId,
                    signal,
                  );

                  if (refinedResult.hits.length > 0) {
                    result = refinedResult;
                    actualOffset = bestOffset;
                    console.log(
                      `[seek] binary search refinement complete: ` +
                      `actualOffset=${actualOffset}, target=${fetchStart}`,
                    );
                  }
                } else {
                  // Non-id tiebreaker (shouldn't happen with current sort configs).
                  // Fall through to the reverse-seek-to-end check below.
                  console.warn(
                    `[seek] large drift=${drift} but tiebreaker is "${tiebreakerField}", not "id". ` +
                    `Binary search not applicable — results may be approximate.`,
                  );
                }
              }

              // If we landed far from the target and the target is near the
              // end of the result set, the gap is likely null/missing-value
              // docs that composite agg doesn't count. Use reverse search_after
              // (no cursor = last PAGE_SIZE results) to land at the true end.
              //
              // Subtlety: ES sorts nulls as `_last` by default for BOTH asc
              // and desc. A naive reverse sort would put nulls last again —
              // returning the highest keyword values, not the true end. We
              // pass `missingFirst: true` so the reversed sort uses
              // `missing: "_first"`, putting nulls first in reversed order
              // (= last in original order).
              if (
                actualOffset + PAGE_SIZE < fetchStart &&
                fetchStart > total - MAX_RESULT_WINDOW
              ) {
                if (signal.aborted) return;
                const reverseResult = await dataSource.searchAfter(
                  { ...params, length: PAGE_SIZE },
                  null,
                  pitId,
                  signal,
                  true,  // reverse
                  false, // noSource
                  true,  // missingFirst — nulls come first in reversed order
                );
                if (reverseResult.hits.length > 0) {
                  result = reverseResult;
                  // We fetched the last PAGE_SIZE results via reverse search,
                  // so actualOffset = total - hits.length. We do NOT use
                  // countBefore here because the first hit likely has a null
                  // sort value for the keyword field, and countBefore can't
                  // build a correct range query for null values.
                  actualOffset = Math.max(0, total - reverseResult.hits.length);
                }
              }
            } else {
              // findKeywordSortValue returned null (field not aggregatable,
              // exceeded page limit, or target past end). Fall back to
              // from/size at the capped position.
              const cappedStart = Math.min(fetchStart, MAX_RESULT_WINDOW - PAGE_SIZE);
              result = await dataSource.searchAfter(
                { ...params, offset: Math.max(0, cappedStart), length: PAGE_SIZE },
                null,
                null,
                signal,
              );
              actualOffset = Math.max(0, cappedStart);
            }
          } else {
            // ---------------------------------------------------------------
            // Strategy B: Iterative search_after for script sorts
            // ---------------------------------------------------------------
            const capOffset = Math.min(fetchStart, MAX_RESULT_WINDOW - 1);

            // Step 1: Get a pivot point via from/size (size=1, fast)
            const pivotResult = await dataSource.searchAfter(
              { ...params, offset: capOffset, length: 1 },
              null,
              null,
              signal,
            );

            if (signal.aborted) return;

            if (pivotResult.hits.length > 0 && pivotResult.sortValues.length > 0 && fetchStart > capOffset) {
              // Step 2: Iterative search_after to skip forward from the pivot.
              // Each iteration advances the cursor by `chunkSize` positions.
              // We use _source:false (noSource) so ES only returns sort values
              // and _id — no document bodies. Chunk size is capped below
              // MAX_RESULT_WINDOW to keep each response small enough for
              // fast transfer through SSH tunnels.
              const maxChunk = Math.min(MAX_RESULT_WINDOW, 10_000);
              let cursor = pivotResult.sortValues[0];
              let skippedTotal = capOffset + 1; // we've passed capOffset + 1 docs
              const targetStart = fetchStart;

              const MAX_SKIP_ITERATIONS = 200;
              for (let iter = 0; iter < MAX_SKIP_ITERATIONS && skippedTotal < targetStart; iter++) {
                if (signal.aborted) return;
                const remaining = targetStart - skippedTotal;
                const chunkSize = Math.min(maxChunk, remaining);

                const skipResult = await dataSource.searchAfter(
                  { ...params, length: chunkSize },
                  cursor,
                  pitId,
                  signal,
                  false, // not reverse
                  true,  // noSource — only need sort values for cursor advancement
                );

                if (skipResult.hits.length === 0) break; // reached end of results
                cursor = skipResult.sortValues[skipResult.sortValues.length - 1];
                skippedTotal += skipResult.hits.length;
              }

              if (signal.aborted) return;

              // Step 3: Fetch the actual page at the target position
              result = await dataSource.searchAfter(
                { ...params, length: PAGE_SIZE },
                cursor,
                pitId,
                signal,
              );
              actualOffset = skippedTotal;
            } else {
              // Fallback: from/size at the capped position
              const cappedStart = Math.min(fetchStart, MAX_RESULT_WINDOW - PAGE_SIZE);
              result = await dataSource.searchAfter(
                { ...params, offset: Math.max(0, cappedStart), length: PAGE_SIZE },
                null,
                null,
                signal,
              );
              actualOffset = Math.max(0, cappedStart);
            }

            // Verify actual position via countBefore (if we used search_after)
            if (result.hits.length > 0 && result.sortValues.length > 0 && actualOffset > MAX_RESULT_WINDOW) {
              if (signal.aborted) return;
              const landedSortValues = result.sortValues[0];
              const countBefore = await dataSource.countBefore(
                params,
                landedSortValues,
                sortClause,
                signal,
              );
              actualOffset = countBefore;
            }
          }
        }
      }

      // If this seek was superseded by a newer one, our signal is aborted.
      // Don't overwrite the store with stale results.
      if (signal.aborted) return;

      if (result.hits.length === 0) {
        set({ loading: false });
        return;
      }

      const startCursor = result.sortValues.length > 0 ? result.sortValues[0] : null;
      const endCursor = result.sortValues.length > 0
        ? result.sortValues[result.sortValues.length - 1]
        : null;

      // Note: the cooldown was set synchronously at seek start and should
      // NOT be refreshed here. By the time data arrives, the initial 500ms
      // cooldown has likely expired — the virtualizer has had time to render
      // at the correct scroll position, and extend operations should be
      // allowed immediately so the user can scroll past the buffer boundary.

      // Compute the buffer-local target index so views can scroll there.
      const targetLocalIdx = Math.max(0, clampedOffset - actualOffset);

      set({
        results: result.hits,
        bufferOffset: actualOffset,
        total: result.total,
        loading: false,
        imagePositions: buildPositions(result.hits, actualOffset),
        startCursor,
        endCursor,
        pitId: result.pitId ?? pitId,
        _extendForwardInFlight: false,
        _extendBackwardInFlight: false,
        _seekGeneration: get()._seekGeneration + 1,
        _seekTargetLocalIndex: targetLocalIdx,
        seekTime: Date.now() - seekStartTime,
      });

      console.log(
        `[seek] COMPLETE: target=${clampedOffset}, actualOffset=${actualOffset}, ` +
        `hits=${result.hits.length}, targetLocalIdx=${targetLocalIdx}, ` +
        `ratio=${(actualOffset / (result.total || 1)).toFixed(4)}`,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // Don't set loading: false here — the newer seek/search that
        // aborted us now owns the loading state.
        return;
      }
      set({
        error: e instanceof Error ? e.message : "Seek failed",
        loading: false,
      });
    }
  },

  // -------------------------------------------------------------------------
  // Legacy compatibility wrappers
  // -------------------------------------------------------------------------

  loadMore: async () => {
    // Delegate to extendForward — same semantics (append more data)
    return get().extendForward();
  },

  loadRange: async (start: number, end: number) => {
    // loadRange is used by ImageDetail's offset restore (loads a window
    // around a cached offset). With the windowed buffer, this is a seek.
    const { bufferOffset, results } = get();
    const bufferEnd = bufferOffset + results.length;

    // If the requested range is already within the buffer, no-op
    if (start >= bufferOffset && end < bufferEnd) return;

    // Otherwise seek to center the requested range in the buffer
    const center = Math.floor((start + end) / 2);
    return get().seek(center);
  },

  // -------------------------------------------------------------------------
  // Aggregation actions (unchanged from pre-buffer architecture)
  // -------------------------------------------------------------------------

  fetchAggregations: async (force) => {
    const { dataSource, params, aggCircuitOpen, _aggCacheKey } = get();

    const key = aggCacheKey(params);
    if (!force && key === _aggCacheKey) return;
    if (!force && aggCircuitOpen) return;

    if (_aggDebounceTimer) clearTimeout(_aggDebounceTimer);
    if (_aggAbortController) _aggAbortController.abort();

    if (!force) {
      await new Promise<void>((resolve) => {
        _aggDebounceTimer = setTimeout(resolve, AGG_DEBOUNCE_MS);
      });
    }

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
        aggCircuitOpen: elapsed > AGG_CIRCUIT_BREAKER_MS,
        expandedAggs: {},
        expandedAggsLoading: new Set(),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        set({ aggLoading: false });
        return;
      }
      set({ aggLoading: false });
    }
  },

  fetchExpandedAgg: async (field: string) => {
    const { dataSource, params, expandedAggs, expandedAggsLoading } = get();

    if (expandedAggs[field] || expandedAggsLoading.has(field)) return;

    set({ expandedAggsLoading: new Set([...expandedAggsLoading, field]) });

    try {
      const result = await dataSource.getAggregations(
        params,
        [{ field, size: AGG_EXPANDED_SIZE }],
      );

      const fieldResult = result.fields[field];
      if (fieldResult) {
        set((state) => {
          const newLoading = new Set(state.expandedAggsLoading);
          newLoading.delete(field);
          return {
            expandedAggs: { ...state.expandedAggs, [field]: fieldResult },
            expandedAggsLoading: newLoading,
          };
        });
      }
    } catch {
      set((state) => {
        const newLoading = new Set(state.expandedAggsLoading);
        newLoading.delete(field);
        return { expandedAggsLoading: newLoading };
      });
    }
  },

  collapseExpandedAgg: (field: string) => {
    set((state) => {
      const { [field]: _, ...rest } = state.expandedAggs;
      return { expandedAggs: rest };
    });
  },

  fetchKeywordDistribution: async () => {
    const { dataSource, params, _kwDistCacheKey } = get();

    // Check if the current sort is a keyword sort
    const sortInfo = resolveKeywordSortInfo(params.orderBy);
    if (!sortInfo) return; // Not a keyword sort — nothing to fetch

    // Check cache — skip if already fetched for this query + sort
    const key = kwDistCacheKey(params);
    if (key === _kwDistCacheKey) return;

    // Abort previous in-flight request
    if (_kwDistAbortController) _kwDistAbortController.abort();
    _kwDistAbortController = new AbortController();

    // Check if the data source supports this method
    if (!dataSource.getKeywordDistribution) return;

    try {
      const dist = await dataSource.getKeywordDistribution(
        params,
        sortInfo.field,
        sortInfo.direction,
        _kwDistAbortController.signal,
      );

      // Guard: params may have changed while awaiting
      if (kwDistCacheKey(get().params) !== key) return;

      set({
        keywordDistribution: dist,
        _kwDistCacheKey: key,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.warn("[search-store] fetchKeywordDistribution failed:", e);
    }
  },
}));

// Expose store on window in dev mode for E2E test state inspection.
// Playwright tests use window.__kupua_store__ to read buffer state,
// focused image, and other internals without relying on DOM scraping.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_store__ = useSearchStore;
}

