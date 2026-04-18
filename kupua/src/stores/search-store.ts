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
  SortDistribution,
} from "@/dal";
import type { PositionMap } from "@/dal/position-map";
import { cursorForPosition } from "@/dal/position-map";
import { ElasticsearchDataSource, buildSortClause, parseSortField } from "@/dal";
import { IS_LOCAL_ES } from "@/dal/es-config";
import { FIELD_REGISTRY } from "@/lib/field-registry";
import { resolveKeywordSortInfo, resolveDateSortInfo, resolvePrimarySortKey } from "@/lib/sort-context";
import { extractSortValues } from "@/lib/image-offset-cache";
import { devLog } from "@/lib/dev-log";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { getScrollGeometry } from "@/lib/scroll-geometry-ref";
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH, TABLE_ROW_HEIGHT } from "@/constants/layout";
import {
  BUFFER_CAPACITY,
  PAGE_SIZE,
  SCROLL_MODE_THRESHOLD,
  POSITION_MAP_THRESHOLD,
  MAX_RESULT_WINDOW,
  DEEP_SEEK_THRESHOLD,
  NEW_IMAGES_POLL_INTERVAL,
  AGG_DEBOUNCE_MS,
  AGG_CIRCUIT_BREAKER_MS,
  AGG_DEFAULT_SIZE,
  AGG_EXPANDED_SIZE,
  SEEK_COOLDOWN_MS,
  SEARCH_FETCH_COOLDOWN_MS,
  POST_EXTEND_COOLDOWN_MS,
} from "@/constants/tuning";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";

/** Aggregatable fields derived from the field registry — built once. */
const AGG_FIELDS = FIELD_REGISTRY
  .filter((f) => f.aggregatable && f.esSearchPath && typeof f.esSearchPath === "string")
  .map((f) => ({ field: f.esSearchPath as string, size: AGG_DEFAULT_SIZE }));

// ---------------------------------------------------------------------------
// Reverse-compute: pure function extracted from seek() for independent testing.
//
// Given the user's current scroll position and the new buffer geometry after
// a seek, computes the buffer-local index that keeps the user's visual
// position stable (zero flash, zero swimming). Also handles:
// - Bidirectional seek headroom offset (backward items prepended)
// - Sub-row pixel preservation (seekSubRowOffset for effect #6)
// - Buffer-shrink clamping (End key, small buffers)
// - At-real-end detection (End key fast path)
//
// ---------------------------------------------------------------------------

export interface ComputeScrollTargetInput {
  /** User's current scrollTop in the scroll container (px). */
  currentScrollTop: number;
  /** Whether the active view is table (1 col, 32px rows) or grid (N cols, 303px rows). */
  isTable: boolean;
  /** Scroll container's clientWidth — used to compute grid column count. */
  clientWidth: number;
  /** Scroll container's clientHeight — used for maxScroll computation. */
  clientHeight: number;
  /** Number of backward items prepended by bidirectional seek (0 if none). */
  backwardItemCount: number;
  /** Total number of items in the new buffer (result.hits.length). */
  bufferLength: number;
  /** Effective total result count (null-zone-aware). */
  total: number;
  /** Actual buffer offset in the full result set. */
  actualOffset: number;
  /** Clamped seek target offset (before buffer fetch). */
  clampedOffset: number;
}

export interface ComputeScrollTargetResult {
  /** Buffer-local index for the virtualizer to scroll to. */
  scrollTargetIndex: number;
  /** Sub-row pixel offset for effect #6 to apply after render. */
  seekSubRowOffset: number;
}

export function computeScrollTarget(input: ComputeScrollTargetInput): ComputeScrollTargetResult {
  const {
    currentScrollTop,
    isTable,
    clientWidth,
    clientHeight,
    backwardItemCount,
    bufferLength,
    total,
    actualOffset,
    clampedOffset,
  } = input;

  const rowH = isTable ? TABLE_ROW_HEIGHT : GRID_ROW_HEIGHT;
  const cols = isTable ? 1 : Math.max(1, Math.floor(clientWidth / GRID_MIN_CELL_WIDTH));

  const currentRow = Math.round(currentScrollTop / rowH);
  let reverseIndex = currentRow * cols;
  let seekSubRowOffset = 0;

  // Bidirectional seek offset: shift reverseIndex past the headroom zone.
  if (backwardItemCount > 0 && reverseIndex < backwardItemCount) {
    const subRowOffset = currentScrollTop - (currentRow * rowH);
    reverseIndex += backwardItemCount;
    seekSubRowOffset = subRowOffset;
  }

  // At-real-end detection
  const atRealEnd = actualOffset + bufferLength >= total;

  let scrollTargetIndex: number;

  if (atRealEnd) {
    const soughtNearEnd = clampedOffset >= total - bufferLength;
    if (soughtNearEnd) {
      scrollTargetIndex = bufferLength - 1;
    } else {
      scrollTargetIndex = Math.max(0, Math.min(reverseIndex, bufferLength - 1));
    }
  } else {
    const totalRows = Math.ceil(bufferLength / cols);
    const newScrollHeight = totalRows * rowH;
    const maxScroll = newScrollHeight - clientHeight;
    const reversePixelTop = Math.floor(reverseIndex / cols) * rowH;

    if (reversePixelTop < maxScroll) {
      scrollTargetIndex = reverseIndex;
    } else {
      // Buffer-shrink: last visible row whose top pixel ≤ maxScroll.
      const lastVisibleRow = Math.max(0, Math.floor(maxScroll / rowH));
      scrollTargetIndex = Math.min(lastVisibleRow * cols, bufferLength - 1);
    }
  }

  return { scrollTargetIndex, seekSubRowOffset };
}

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
  /**
   * Bumped every time search() opens a new PIT. seek/extend capture this at
   * start and skip the PIT if it changed mid-flight (avoids 404 round-trip
   * on a stale PIT that search() already closed). See es-audit.md Issue #1.
   */
  _pitGeneration: number;

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

  /**
   * Global index the seek targeted, for two-tier mode. When twoTier is active,
   * effect #6 uses this instead of _seekTargetLocalIndex because the virtualizer's
   * coordinate space is global (row 0 = global position 0).
   * -1 means "not set" (use _seekTargetLocalIndex instead).
   */
  _seekTargetGlobalIndex: number;

  /**
   * Sub-row pixel offset to preserve after seek. When the headroom pre-set
   * fires, the user's sub-row offset (scrollTop % rowHeight) must be restored
   * by effect #6 AFTER the new buffer is rendered (so scrollHeight is large
   * enough to avoid browser clamping). 0 means "snap to row boundary".
   */
  _seekSubRowOffset: number;

  /**
   * Post-seek focus intent for Home/End keys.
   * When Home/End triggers a seek (because the buffer doesn't cover the
   * target position), focus can't be set immediately — the buffer hasn't
   * arrived yet. This field records the intent so effect #6 in
   * useScrollEffects can apply it after the seek completes.
   * "first" = focus first image in new buffer, "last" = focus last.
   */
  _pendingFocusAfterSeek: "first" | "last" | null;

  /**
   * Pending focus delta for arrow snap-back.
   * When the user presses an arrow key but the focused image is not in the
   * buffer (seeked away), the snap-back seek loads the buffer around the
   * focused image. This field records the key's delta so effect #9
   * (sortAroundFocusGeneration) can apply it after the scroll completes.
   * Cleared by search() and consumed by the scroll effect.
   */
  _pendingFocusDelta: number | null;

  /**
   * Last known global offset of the focused image. Saved when focus is set
   * (from imagePositions) so that seekToFocused can pass a reasonable offset
   * to _findAndFocusImage instead of 0 on large datasets where countBefore
   * would take 2-5s. Without this, bufferOffset stays at 0 and the scrubber
   * / position counter show wrong values until the async correction resolves.
   */
  _focusedImageKnownOffset: number | null;

  // --- Aggregation state (unchanged from before) ---
  aggregations: AggregationsResult | null;
  aggTook: number | null;
  aggLoading: boolean;
  aggCircuitOpen: boolean;
  _aggCacheKey: string | null;
  expandedAggs: Record<string, AggregationResult>;
  expandedAggsLoading: Set<string>;

  // --- Sort distribution for scrubber (tooltip + track ticks) ---
  /** Pre-fetched distribution for the current sort field (keyword or date). */
  sortDistribution: SortDistribution | null;
  /** Cache key: query params + orderBy. Null = not fetched. */
  _sortDistCacheKey: string | null;

  // --- Null-zone distribution (uploadTime) for scrubber null-zone labels + ticks ---
  /** Pre-fetched uploadTime distribution for null-zone docs. Only set when
   *  the primary sort has a null zone (coveredCount < total). */
  nullZoneDistribution: SortDistribution | null;
  /** Cache key for null-zone distribution. */
  _nullZoneDistCacheKey: string | null;

  // --- Position map (lightweight index for indexed scroll mode) ---
  /**
   * Complete [id, sortValues] index for all results, fetched in the background
   * with `_source: false` after search when total is in the position-map range
   * (SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD).
   *
   * When available, seek() uses exact position→sortValues lookup (one search_after
   * call) instead of percentile estimation or composite walks. Null when: not yet
   * fetched, fetch in progress, total out of range, or fetch failed/aborted.
   */
  positionMap: PositionMap | null;
  /** True while the background position map fetch is in progress. */
  positionMapLoading: boolean;

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
   * Abort all in-flight extends and set a cooldown so no new extends fire
   * for 2 seconds. Call this before any action that resets scroll on a
   * deep buffer (logo click, metadata click-to-search) to prevent a rogue
   * extendBackward from prepending stale data.
   */
  abortExtends: () => void;
  /**
   * Seek to a global offset — clear buffer and refill at the target position.
   * Used by scrubber drags and sort-around-focus.
   */
  seek: (globalOffset: number) => Promise<void>;

  /**
   * Restore the buffer around a specific image using its cached sort cursor.
   * Used by ImageDetail on page reload to recover the counter + prev/next.
   *
   * With a cursor: `search_after` forward + backward from the cursor, then
   * `countBefore` for exact bufferOffset. Guaranteed to land the image in
   * the buffer regardless of depth.
   *
   * Without a cursor (old cache, missing fields): falls back to `seek(offset)`
   * which works for shallow offsets (<10k) and degrades gracefully for deep ones.
   */
  restoreAroundCursor: (
    imageId: string,
    cursor: SortValues | null,
    cachedOffset: number,
  ) => Promise<void>;

  // Legacy compatibility — thin wrapper over extendForward
  /** @deprecated Use extendForward instead. Kept for view compatibility during migration. */
  loadMore: () => Promise<void>;

  setFocusedImageId: (id: string | null) => void;
  /**
   * Seek the buffer back to the focused image's position.
   * Used by arrow snap-back: when the user pressed an arrow key but the
   * focused image is not in the buffer (seeked away via scrubber).
   * Calls _findAndFocusImage with no fallback (same query/sort).
   * On failure (image deleted), clears focus.
   */
  seekToFocused: () => Promise<void>;
  fetchAggregations: (force?: boolean) => Promise<void>;
  fetchExpandedAgg: (field: string) => Promise<void>;
  collapseExpandedAgg: (field: string) => void;
  /**
   * Fetch sort distribution for the current sort field (keyword or date).
   * Lazy — called on first scrubber interaction, cached until query/sort changes.
   */
  fetchSortDistribution: () => Promise<void>;

  /**
   * Fetch the uploadTime distribution for null-zone docs. Only does work when
   * the primary sort has coveredCount < total (meaning a null zone exists).
   * Lazy — triggered when the primary distribution reveals a null zone.
   */
  fetchNullZoneDistribution: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level state (not in Zustand — avoids re-renders)
// ---------------------------------------------------------------------------

let _newImagesPollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Generation counter for the new-images poll. Bumped every time
 * startNewImagesPoll is called. The poll callback captures the current
 * generation and skips the set() if a newer generation has started.
 * This prevents a dangling in-flight count() from a stale poll from
 * overwriting newCount: 0 after search() clears it.
 */
let _newImagesPollGeneration = 0;

/**
 * Generation-based abort for extend/seek requests.
 * search() aborts all in-flight extends from the previous search.
 */
let _rangeAbortController = new AbortController();

/**
 * Dedicated abort controller for _findAndFocusImage (Steps 1-2: find image
 * sort values + countBefore). Only aborted by search() — NOT by seek().
 *
 * Why: when search() sets a new `total` (e.g. 1.3M → 30k), the virtualizer
 * re-renders, browser clamps scrollTop, reportVisibleRange fires, and
 * two-tier mode schedules a debounced seek(). That seek aborts
 * _rangeAbortController, which used to kill _findAndFocusImage mid-flight.
 * This dedicated controller isolates the focus-finding work from seek
 * interference. _findAndFocusImage's Step 3 (the actual buffer load) still
 * uses _rangeAbortController via its own seekSignal.
 */
let _findFocusAbortController = new AbortController();

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

/** Abort controller for in-flight expanded aggregation requests. */
let _expandedAggAbortController: AbortController | null = null;

/** Abort controller for the sort distribution request (keyword or date). */
let _sortDistAbortController: AbortController | null = null;

/** Abort controller for the null-zone (uploadTime) distribution request. */
let _nullZoneDistAbortController: AbortController | null = null;

/** Abort controller for the in-flight position map background fetch. */
let _positionMapAbortController: AbortController | null = null;

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
 * Cache key for sort distribution — includes orderBy (sort field + direction
 * matter) on top of the result-set-affecting params from aggCacheKey.
 */
function sortDistCacheKey(params: SearchParams): string {
  return aggCacheKey(params) + "|" + (params.orderBy ?? "");
}

function startNewImagesPoll(get: () => SearchState, set: (s: Partial<SearchState>) => void) {
  stopNewImagesPoll();
  const gen = ++_newImagesPollGeneration;
  _newImagesPollTimer = setInterval(async () => {
    if (gen !== _newImagesPollGeneration) return; // stale poll
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
      if (gen !== _newImagesPollGeneration) return; // stale after await
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
  _newImagesPollGeneration++; // invalidate any in-flight count()
}

/**
 * Apply the "frozen until" cap to search params for extend/seek/fill requests.
 *
 * After a search, `newCountSince` records the timestamp. All subsequent
 * pagination requests should exclude images uploaded after that time —
 * otherwise the ticker can say "5 new" while those images have already
 * silently leaked into the buffer via a PIT-less extend.
 *
 * The cap is applied as `until: newCountSince` (which becomes
 * `range.uploadTime.lte` in the ES query builder). If the user has already
 * set an explicit `until` (date filter), we use whichever is earlier so the
 * user's filter is never widened.
 *
 * PIT provides snapshot isolation while alive, so the cap is redundant when
 * the PIT is active — but harmless (a subset filter on a snapshot is a no-op).
 * The cap matters when the PIT has expired (idle >5 min) and requests fall
 * back to the live index.
 */
function frozenParams(params: SearchParams, get: () => SearchState): SearchParams {
  const { newCountSince } = get();
  if (!newCountSince) return params;

  // If the user set an explicit `until`, use the earlier of the two
  const effectiveUntil =
    params.until && params.until < newCountSince
      ? params.until
      : newCountSince;

  return { ...params, until: effectiveUntil };
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

/**
 * Capture the IDs of the focused image's nearest neighbours from the buffer.
 * Returns an ordered array: alternating forward/backward (±1, ±2, … ±N),
 * so the nearest neighbour is first. Used for neighbour fallback when the
 * focused image disappears after a search context change.
 */
function _captureNeighbours(
  focusedImageId: string,
  results: (Image | undefined)[],
  bufferOffset: number,
  imagePositions: Map<string, number>,
  count = 20,
): string[] {
  const globalIdx = imagePositions.get(focusedImageId);
  if (globalIdx === undefined) return [];
  const localIdx = globalIdx - bufferOffset;
  if (localIdx < 0 || localIdx >= results.length) return [];

  const neighbours: string[] = [];
  for (let d = 1; d <= count; d++) {
    const fwd = localIdx + d;
    if (fwd < results.length && results[fwd]?.id) {
      neighbours.push(results[fwd]!.id);
    }
    const bwd = localIdx - d;
    if (bwd >= 0 && results[bwd]?.id) {
      neighbours.push(results[bwd]!.id);
    }
  }
  return neighbours;
}

// ---------------------------------------------------------------------------
// search_after anchor helpers
// ---------------------------------------------------------------------------

/**
 * Build search_after anchor values for secondary sort fields.
 *
 * When seeking to a position via search_after, we have the primary sort value
 * (estimated or from keyword lookup) but need "neutral" anchors for the
 * remaining sort fields. These anchors must be positioned so that
 * search_after returns docs starting from the BEGINNING of the primary
 * sort bucket.
 *
 * Key insight: search_after returns docs strictly AFTER the cursor,
 * following each field's sort direction independently. For a desc field,
 * "after" means "less than". So:
 *   - Ascending field → anchor at minimum (0) → returns docs where value > 0 (all)
 *   - Descending field → anchor at maximum → returns docs where value < MAX (all)
 *   - `id` field (always asc keyword) → anchor at "" → returns all docs
 *
 * Without direction-aware anchors, a desc-sorted secondary field with
 * anchor 0 would require docs with value < 0 — excluding everything and
 * causing search_after to skip the entire primary bucket.
 */
function buildSeekCursorAnchors(
  sortClause: Record<string, unknown>[],
  primaryValue: string | number,
): SortValues {
  const cursor: SortValues = [primaryValue];
  for (let i = 1; i < sortClause.length; i++) {
    const clause = sortClause[i];
    const { field, direction } = parseSortField(clause);
    if (field === "id") {
      cursor.push("");
    } else if (direction === "desc") {
      // For desc-sorted fields, "after" means "less than the anchor".
      // Use MAX_SAFE_INTEGER so all real values (< MAX) are included.
      cursor.push(Number.MAX_SAFE_INTEGER);
    } else {
      // For asc-sorted fields, "after" means "greater than the anchor".
      // Use 0 so all real positive values (> 0) are included.
      cursor.push(0);
    }
  }
  return cursor;
}

// ---------------------------------------------------------------------------
// Null-zone cursor helpers — shared by seek, extend, and buffer-around-image
// ---------------------------------------------------------------------------

/**
 * Detect whether a cursor lives in the "null zone" (primary sort field value
 * is `null`). When it does, ES cannot accept the cursor directly — it rejects
 * `null` in `search_after` with a 500. Instead, callers must narrow the query
 * to docs missing the primary field, override the sort to the fallback sort
 * (uploadTime + id), and strip the null from the cursor.
 *
 * Returns `null` if the cursor is not in the null zone (no override needed).
 */
interface NullZoneOverride {
  /** Stripped cursor without the null primary value — matches sortOverride shape. */
  strippedCursor: SortValues;
  /** Override sort: [uploadTime desc, id asc]. */
  sortOverride: Record<string, unknown>[];
  /** Extra filter: must_not { exists { field: primaryField } }. */
  extraFilter: Record<string, unknown>;
  /** The primary field name (for remapping response sort values). */
  primaryField: string;
  /** The full sort clause (for remapping). */
  sortClause: Record<string, unknown>[];
}

function detectNullZoneCursor(
  cursor: SortValues,
  orderBy: string | undefined,
): NullZoneOverride | null {
  const sortClause = buildSortClause(orderBy);
  if (sortClause.length === 0) return null;

  const { field: primaryField } = parseSortField(sortClause[0]);
  if (!primaryField) return null;

  // Check if the primary field's position in the cursor is null.
  // The cursor structure mirrors the sort clause: [primary, uploadTime, id].
  if (cursor.length === 0 || cursor[0] !== null) return null;

  // Derive the uploadTime fallback direction from the sort clause.
  // buildSortClause already computed the correct direction: date primary sorts
  // inherit the primary direction (e.g. `taken` asc → uploadTime asc),
  // keyword/numeric sorts get desc. We read it from the clause directly
  // instead of hardcoding, so the null-zone override matches the real sort.
  let uploadTimeDir: "asc" | "desc" = "desc";
  for (const clause of sortClause) {
    const { field, direction } = parseSortField(clause);
    if (field === "uploadTime") {
      uploadTimeDir = direction;
      break;
    }
  }

  // Strip the null value(s) from the cursor — keep only the non-primary fields.
  // The cursor is [null, uploadTimeValue, idValue] → [uploadTimeValue, idValue].
  const strippedCursor: SortValues = [];
  for (let i = 0; i < sortClause.length; i++) {
    const { field } = parseSortField(sortClause[i]);
    if (field === primaryField) continue; // skip null primary
    if (i < cursor.length) {
      strippedCursor.push(cursor[i]);
    }
  }

  return {
    strippedCursor,
    sortOverride: [
      { uploadTime: uploadTimeDir },
      { id: "asc" },
    ],
    extraFilter: {
      bool: { must_not: { exists: { field: primaryField } } },
    },
    primaryField,
    sortClause,
  };
}

/**
 * Remap sort values from null-zone shape [uploadTime, id] back to the full
 * sort clause shape [null, uploadTime, id]. Without this, cursors stored in
 * the buffer (startCursor/endCursor) would have the wrong length and break
 * subsequent extend calls.
 */
function remapNullZoneSortValues(
  sortValues: SortValues[],
  sortClause: Record<string, unknown>[],
  primaryField: string,
): SortValues[] {
  return sortValues.map((sv) => {
    const remapped: SortValues = [];
    let svIdx = 0;
    for (const clause of sortClause) {
      const { field } = parseSortField(clause);
      if (field === primaryField) {
        remapped.push(null);
      } else if (svIdx < sv.length) {
        remapped.push(sv[svIdx++]);
      } else {
        remapped.push(null);
      }
    }
    return remapped;
  });
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
  // Apply frozen-until cap — scroll-mode fill should not include new images.
  const frozenP = frozenParams(params, get);
  let currentCursor = cursor;
  let fetched = loadedSoFar;

  devLog(`[scroll-mode-fill] Fetching remaining ${total - fetched} results (total: ${total})`);

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
      // Detect null-zone cursor — same logic as extend paths.
      const nz = detectNullZoneCursor(currentCursor, frozenP.orderBy);

      const result = await dataSource.searchAfter(
        { ...frozenP, length: chunkSize },
        nz ? nz.strippedCursor : currentCursor,
        pitId,
        signal,
        false, // reverse
        false, // noSource
        false, // missingFirst
        nz?.sortOverride,
        nz?.extraFilter,
      );

      if (signal.aborted) {
        set({ _extendForwardInFlight: false });
        return;
      }
      if (result.hits.length === 0) break;

      // Remap sort values from null-zone shape back to full sort clause shape
      if (nz && result.sortValues.length > 0) {
        result.sortValues = remapNullZoneSortValues(
          result.sortValues, nz.sortClause, nz.primaryField,
        );
      }

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
          // When a null-zone filter was used, result.total is the filtered
          // count, not the full corpus total. Keep existing total.
          total: nz ? state.total : result.total, // may have changed
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

  devLog(`[scroll-mode-fill] Complete — buffer now has ${get().results.length} results`);
  set({ _extendForwardInFlight: false });
}

// ---------------------------------------------------------------------------
// Position map background fetch — lightweight index for indexed scroll mode
// ---------------------------------------------------------------------------

/**
 * After the initial search, if total is in the position-map range
 * (SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD), fetch a
 * lightweight [id, sortValues] index for all results in the background.
 *
 * Uses the DAL's `fetchPositionIndex` which opens its own dedicated PIT
 * (decoupled from the main search PIT lifecycle). All-or-nothing: if
 * aborted or failed, the partial result is discarded and positionMap
 * stays null.
 *
 * Aborted by search() — a new search invalidates the position map.
 * Extends and seeks do NOT abort this fetch (separate abort controller).
 */
async function _fetchPositionMap(
  dataSource: ImageDataSource,
  params: SearchParams,
  signal: AbortSignal,
  get: () => SearchState,
  set: (partial: Partial<SearchState> | ((s: SearchState) => Partial<SearchState>)) => void,
): Promise<void> {
  if (!dataSource.fetchPositionIndex) {
    devLog("[position-map] dataSource does not implement fetchPositionIndex");
    set({ positionMapLoading: false });
    return;
  }

  devLog(`[position-map] Starting background fetch for ${get().total} positions...`);
  set({ positionMapLoading: true, positionMap: null });

  try {
    const map = await dataSource.fetchPositionIndex(params, signal);

    if (signal.aborted) {
      set({ positionMapLoading: false });
      return;
    }

    if (map) {
      devLog(`[position-map] Complete — ${map.length} entries loaded`);
      set({ positionMap: map, positionMapLoading: false });
    } else {
      devLog("[position-map] fetchPositionIndex returned null (aborted or empty)");
      set({ positionMap: null, positionMapLoading: false });
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      set({ positionMapLoading: false });
      return;
    }
    console.warn("[position-map] Background fetch failed:", e);
    set({ positionMap: null, positionMapLoading: false });
  }
}

// ---------------------------------------------------------------------------
// Shared buffer-loading helper — "load a page centered on a known image"
// ---------------------------------------------------------------------------

/**
 * Result of loading a buffer centered on a target image.
 * Callers use this to set the store state with caller-specific extras
 * (e.g. sort-around-focus sets focusedImageId + sortAroundFocusGeneration;
 * restore-around-cursor sets _seekGeneration + _seekTargetLocalIndex).
 */
interface BufferAroundImage {
  combinedHits: (Image | undefined)[];
  bufferStart: number;
  startCursor: SortValues | null;
  endCursor: SortValues | null;
  total: number;
  pitId: string | null;
  /** Buffer-local index of the target image. */
  targetLocalIndex: number;
}

/**
 * Given a target image, its sort values, and its exact global offset,
 * fetch a buffer page centered on the image via bidirectional search_after.
 *
 * This is the shared core of sort-around-focus (_findAndFocusImage) and
 * image-detail reload restore (restoreAroundCursor). Both need to load a
 * buffer around a specific image at any depth — the only difference is how
 * they discover the image's sort values and what store state they set
 * afterwards.
 *
 * Returns null if aborted.
 */
async function _loadBufferAroundImage(
  targetHit: Image,
  sortValues: SortValues,
  exactOffset: number,
  params: SearchParams,
  pitId: string | null,
  signal: AbortSignal,
  dataSource: SearchState["dataSource"],
): Promise<BufferAroundImage | null> {
  // Detect null-zone cursor — same logic as extend paths.
  const nz = detectNullZoneCursor(sortValues, params.orderBy);
  const effectiveCursor = nz ? nz.strippedCursor : sortValues;

  // Forward page: items after the target image
  const forwardResult = await dataSource.searchAfter(
    { ...params, length: Math.floor(PAGE_SIZE / 2) },
    effectiveCursor,
    pitId,
    signal,
    false, // reverse
    false, // noSource
    false, // missingFirst
    nz?.sortOverride,
    nz?.extraFilter,
  );
  if (signal.aborted) return null;

  // Backward page: items before the target image
  const backwardResult = await dataSource.searchAfter(
    { ...params, length: Math.floor(PAGE_SIZE / 2) },
    effectiveCursor,
    pitId,
    signal,
    true, // reverse
    false, // noSource
    false, // missingFirst
    nz?.sortOverride,
    nz?.extraFilter,
  );
  if (signal.aborted) return null;

  // Remap sort values from null-zone shape back to full sort clause shape
  if (nz) {
    if (forwardResult.sortValues.length > 0) {
      forwardResult.sortValues = remapNullZoneSortValues(
        forwardResult.sortValues, nz.sortClause, nz.primaryField,
      );
    }
    if (backwardResult.sortValues.length > 0) {
      backwardResult.sortValues = remapNullZoneSortValues(
        backwardResult.sortValues, nz.sortClause, nz.primaryField,
      );
    }
  }

  // Combine: backward hits + target image + forward hits
  // The target image itself is NOT in either result (search_after is exclusive).
  const combinedHits: (Image | undefined)[] = [
    ...backwardResult.hits,
    targetHit,
    ...forwardResult.hits,
  ];
  const combinedSortValues: SortValues[] = [
    ...backwardResult.sortValues,
    sortValues,
    ...forwardResult.sortValues,
  ];

  const bufferStart = Math.max(0, exactOffset - backwardResult.hits.length);
  const startCursor = combinedSortValues.length > 0
    ? combinedSortValues[0]
    : null;
  const endCursor = combinedSortValues.length > 0
    ? combinedSortValues[combinedSortValues.length - 1]
    : null;

  return {
    combinedHits,
    bufferStart,
    startCursor,
    endCursor,
    total: forwardResult.total,
    pitId: forwardResult.pitId ?? pitId,
    /** Buffer-local index of the target image. */
    targetLocalIndex: backwardResult.hits.length,
  };
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
 * 4. If outside → _loadBufferAroundImage (bidirectional search_after).
 * 5. Graceful degradation: any failure → stay at top, clear status.
 */
async function _findAndFocusImage(
  imageId: string,
  params: SearchParams,
  get: () => SearchState,
  set: (s: Partial<SearchState>) => void,
  /** First-page results to fall back to if the image isn't found. When
   *  provided, failure shows these results at offset 0 instead of leaving
   *  a stale buffer (important for query/filter changes where the old
   *  buffer is from a different search context). */
  fallbackFirstPage?: {
    hits: Image[];
    startCursor: SortValues | null;
    endCursor: SortValues | null;
    pitId: string | null;
    /** The correct total for the new query. _findAndFocusImage sets this
     *  atomically with the new buffer so the virtualizer never sees a
     *  total/buffer mismatch (which triggers scroll-clamp → seek → flash). */
    total: number;
  },
  /** Ordered neighbour IDs from the old buffer (nearest first). When the
   *  focused image isn't found, the engine scans this list for the nearest
   *  survivor in the first page of new results. */
  prevNeighbours?: string[] | null,
  /** Known global offset of the image (e.g. from a previous focus). Used as
   *  the offset hint in deep-seek mode (>65k results) to avoid the 0-placeholder
   *  that makes the scrubber/position counter wrong until async correction. */
  hintOffset?: number | null,
): Promise<void> {
  const { dataSource } = get();
  // Apply frozen-until cap — sort-around-focus should not include new images.
  const fp = frozenParams(params, get);

  set({ sortAroundFocusStatus: "Finding image…" });

  // Use _findFocusAbortController for Steps 1-2 (find sort values +
  // countBefore). This is NOT shared with seek() — only search() can
  // abort it. This prevents the race where two-tier mode's scroll-triggered
  // seek aborts the focus-finding work.
  const findFocusSignal = _findFocusAbortController.signal;

  // Timeout controller: if the process takes longer than 8s, abort the
  // in-flight ES requests and fall back gracefully. This prevents both
  // "Seeking... forever" AND the flash bug where the timeout shows fallback
  // results but the function continues and later overwrites them.
  const timeoutController = new AbortController();
  const combinedSignal = AbortSignal.any
    ? AbortSignal.any([findFocusSignal, timeoutController.signal])
    : findFocusSignal; // Fallback for environments without AbortSignal.any
  const timeoutId = setTimeout(() => {
    console.warn("[sort-around-focus] Timed out after 8s");
    timeoutController.abort();
    if (fallbackFirstPage) {
      set({
        results: fallbackFirstPage.hits,
        bufferOffset: 0,
        total: fallbackFirstPage.total,
        loading: false,
        imagePositions: buildPositions(fallbackFirstPage.hits, 0),
        startCursor: fallbackFirstPage.startCursor,
        endCursor: fallbackFirstPage.endCursor,
        pitId: fallbackFirstPage.pitId ?? get().pitId,
        focusedImageId: null,
        sortAroundFocusStatus: null,
      });
    } else {
      set({ sortAroundFocusStatus: null, loading: false });
    }
  }, 8000);

  try {
    // Step 1: Search for this specific image with the current sort to get
    // both the image and its sort[] values in one request.
    if (combinedSignal.aborted) return;
    const sortClause = buildSortClause(fp.orderBy);
    const sortResult = await dataSource.searchAfter(
      { ...fp, ids: imageId, length: 1 },
      null,
      null,
      combinedSignal,
    );

    if (combinedSignal.aborted) return;
    if (sortResult.hits.length === 0 || sortResult.sortValues.length === 0) {
      // Image not in results (maybe filtered out) — degrade gracefully.
      // If we have first-page results, show them (query/filter changes leave
      // the old buffer stale). Otherwise just clear loading (sort changes
      // where the old buffer is still from the same query).
      if (fallbackFirstPage) {
        // Neighbour fallback: batch-check which old neighbours survive in the
        // new result set. Uses a single ES ids query — works regardless of
        // where the user was scrolled (unlike first-page-only scanning).
        if (prevNeighbours && prevNeighbours.length > 0 && !combinedSignal.aborted) {
          try {
            const batchResult = await dataSource.searchAfter(
              { ...fp, ids: prevNeighbours.join(","), length: prevNeighbours.length },
              null,
              null,
              combinedSignal,
            );
            if (!combinedSignal.aborted && batchResult.hits.length > 0) {
              // Build a set of surviving IDs for O(1) lookup
              const survivorIds = new Set(batchResult.hits.map((h) => h.id));
              // Walk prevNeighbours in distance order → first hit is nearest
              for (const nId of prevNeighbours) {
                if (survivorIds.has(nId)) {
                  devLog(
                    `[sort-around-focus] neighbour fallback: focused=${imageId} gone, ` +
                    `nearest survivor=${nId} (batch ES check)`,
                  );
                  // Recurse: find-and-focus the surviving neighbour.
                  // Pass fallbackFirstPage but NOT prevNeighbours (no infinite loop).
                  clearTimeout(timeoutId);
                  await _findAndFocusImage(nId, params, get, set, fallbackFirstPage);
                  return;
                }
              }
            }
          } catch (e) {
            // Batch check failed (abort, network error) — fall through to clear focus
            if (!(e instanceof DOMException && e.name === "AbortError")) {
              console.warn("[sort-around-focus] neighbour batch check failed:", e);
            }
          }
        }

        set({
          results: fallbackFirstPage.hits,
          bufferOffset: 0,
          total: fallbackFirstPage.total,
          loading: false,
          imagePositions: buildPositions(fallbackFirstPage.hits, 0),
          startCursor: fallbackFirstPage.startCursor,
          endCursor: fallbackFirstPage.endCursor,
          pitId: fallbackFirstPage.pitId ?? get().pitId,
          focusedImageId: null,
          sortAroundFocusStatus: null,
        });
      } else {
        set({ sortAroundFocusStatus: null, loading: false });
      }
      return;
    }

    const targetHit = sortResult.hits[0];
    const imageSortValues = sortResult.sortValues[0];

    // Step 2: Determine the image's global offset.
    //
    // Three paths, fast → slow:
    // A. Position map available → O(n) scan (~<1ms for 65k strings).
    // B. Position map miss → synchronous countBefore (stale map edge case).
    // C. No position map (>65k deep-seek mode) → SKIP countBefore entirely.
    //    Use offset=0 as placeholder, load the buffer immediately (Step 3),
    //    then correct bufferOffset asynchronously when countBefore resolves.
    //    This eliminates the 2-5s bottleneck on large datasets — the buffer
    //    data is correct (uses sort-value cursors, not offsets), only the
    //    scrubber thumb and position counter are temporarily wrong.
    if (combinedSignal.aborted) return;
    let offset: number;
    let offsetIsEstimate = false;
    const posMap = get().positionMap;
    if (posMap) {
      const idx = posMap.ids.indexOf(imageId);
      if (idx !== -1) {
        offset = idx;
        devLog(
          `[sort-around-focus] position map hit: id=${imageId}, offset=${offset} (skipped countBefore)`,
        );
      } else {
        // Image not in position map (stale map or image added since map was built).
        // Fall back to countBefore — this is rare and fast (position map
        // means ≤65k results, so countBefore is ~5-10ms).
        offset = await dataSource.countBefore(
          fp,
          imageSortValues,
          sortClause,
          combinedSignal,
        );
        devLog(
          `[sort-around-focus] position map miss: id=${imageId}, countBefore=${offset}`,
        );
      }
    } else {
      // No position map → >65k results (deep-seek mode). countBefore would
      // take 2-5s. Use hintOffset if available (e.g. saved from when the user
      // focused the image), otherwise 0 as placeholder. Correct asynchronously.
      offset = hintOffset ?? 0;
      offsetIsEstimate = true;
      devLog(
        `[sort-around-focus] no position map, using ${hintOffset != null ? `hint offset=${offset}` : "estimated offset=0"} (will correct async)`,
      );
    }

    if (combinedSignal.aborted) return;

    // Step 3: Check if the offset is within the current buffer.
    // Two guards:
    //  - offsetIsEstimate: deep-seek placeholder offset=0, never trust it.
    //  - fallbackFirstPage: the buffer is from the PREVIOUS search (different
    //    query or sort). Even if the numeric offset falls within the old
    //    buffer's range, the content at that position is stale. Always load
    //    fresh content in this case.
    const { bufferOffset, results } = get();
    const bufferEnd = bufferOffset + results.length;
    const isInBuffer = !fallbackFirstPage && !offsetIsEstimate &&
      offset >= bufferOffset && offset < bufferEnd;

    if (isInBuffer) {
      // Image is in the buffer — just focus it.
      // Guard: if the timeout already fired, don't overwrite fallback state.
      if (timeoutController.signal.aborted) return;
      set({
        ...(fallbackFirstPage ? { total: fallbackFirstPage.total } : {}),
        focusedImageId: imageId,
        _focusedImageKnownOffset: offset,
        sortAroundFocusStatus: null,
        loading: false,
        sortAroundFocusGeneration: get().sortAroundFocusGeneration + 1,
      });
    } else {
      // Outside buffer — load a page centered on the image
      set({ sortAroundFocusStatus: "Seeking…" });

      // Abort any in-flight extends/scroll-seeks from the previous search
      // and create a fresh controller for post-focus extends. We use
      // combinedSignal (from _findFocusAbortController) for the actual
      // buffer load — NOT _rangeAbortController — so that scroll-triggered
      // seeks in two-tier mode can't abort this work.
      _rangeAbortController.abort();
      _rangeAbortController = new AbortController();

      const buf = await _loadBufferAroundImage(
        targetHit, imageSortValues, offset, fp,
        get().pitId, combinedSignal, dataSource,
      );
      if (!buf) return; // aborted

      _seekCooldownUntil = Date.now() + SEEK_COOLDOWN_MS;

      // Guard: if the timeout fired while _loadBufferAroundImage was
      // running, don't overwrite the fallback state with stale results.
      if (timeoutController.signal.aborted) return;

      // NOTE: we intentionally do NOT bump _seekGeneration here.
      // sortAroundFocusGeneration is the sole scroll trigger — its effect
      // scrolls to the focused image with align: "center". Bumping
      // _seekGeneration too would fire the seek scroll effect (align:
      // "start") in the same layout pass, causing two conflicting
      // scroll positions and a visible grid-cell recomposition twitch.
      set({
        results: buf.combinedHits,
        bufferOffset: buf.bufferStart,
        total: buf.total,
        loading: false,
        imagePositions: buildPositions(buf.combinedHits, buf.bufferStart),
        startCursor: buf.startCursor,
        endCursor: buf.endCursor,
        pitId: buf.pitId,
        _extendForwardInFlight: false,
        _extendBackwardInFlight: false,
        focusedImageId: imageId,
        _focusedImageKnownOffset: buf.bufferStart + buf.targetLocalIndex,
        sortAroundFocusStatus: null,
        sortAroundFocusGeneration: get().sortAroundFocusGeneration + 1,
      });

      // Async offset correction: if we used an estimated offset, fire
      // countBefore in the background and correct bufferOffset +
      // imagePositions when it resolves. Uses the same combinedSignal
      // so it's cancelled if a new search starts.
      if (offsetIsEstimate) {
        dataSource.countBefore(fp, imageSortValues, sortClause, combinedSignal)
          .then((exactOffset) => {
            if (combinedSignal.aborted) return;
            const state = get();
            // Only correct if the buffer still belongs to this focus operation.
            // Check buffer reference (not focusedImageId — delta consumption
            // in the scroll effect may have changed focus to an adjacent image
            // within the same buffer, and the correction is still valid).
            if (state.results !== buf.combinedHits) return;
            const correctedOffset = Math.max(
              0, exactOffset - buf.targetLocalIndex,
            );
            devLog(
              `[sort-around-focus] offset corrected: ${buf.bufferStart} → ${correctedOffset} (countBefore=${exactOffset})`,
            );
            set({
              bufferOffset: correctedOffset,
              imagePositions: buildPositions(state.results, correctedOffset),
            });
            // Also update _focusedImageKnownOffset for whichever image is
            // currently focused (may have changed via delta consumption).
            const currentFocus = get().focusedImageId;
            if (currentFocus) {
              const correctedGlobalIdx = get().imagePositions.get(currentFocus);
              if (correctedGlobalIdx != null) {
                set({ _focusedImageKnownOffset: correctedGlobalIdx });
              }
            }
          })
          .catch((e) => {
            if (e instanceof DOMException && e.name === "AbortError") return;
            console.warn("[sort-around-focus] async offset correction failed:", e);
            // Non-fatal — buffer data is correct, only scrubber position is off.
          });
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    // Any failure → degrade gracefully
    console.warn("[sort-around-focus] Failed to find image:", e);
    if (fallbackFirstPage) {
      set({
        results: fallbackFirstPage.hits,
        bufferOffset: 0,
        total: fallbackFirstPage.total,
        loading: false,
        imagePositions: buildPositions(fallbackFirstPage.hits, 0),
        startCursor: fallbackFirstPage.startCursor,
        endCursor: fallbackFirstPage.endCursor,
        pitId: fallbackFirstPage.pitId ?? get().pitId,
        focusedImageId: null,
        sortAroundFocusStatus: null,
      });
    } else {
      set({ sortAroundFocusStatus: null, loading: false });
    }
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
    ...DEFAULT_SEARCH,
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
  _pitGeneration: 0,

  focusedImageId: null,
  sortAroundFocusStatus: null,
  sortAroundFocusGeneration: 0,

  newCount: 0,
  newCountSince: null,
  _extendForwardInFlight: false,
  _extendBackwardInFlight: false,
  _lastPrependCount: 0,
  _prependGeneration: 0,
  _lastForwardEvictCount: 0,
  _forwardEvictGeneration: 0,
  _seekGeneration: 0,
  _seekTargetLocalIndex: -1,
  _seekTargetGlobalIndex: -1,
  _seekSubRowOffset: 0,
  _pendingFocusAfterSeek: null,
  _pendingFocusDelta: null,
  _focusedImageKnownOffset: null,

  // Aggregation state
  aggregations: null,
  aggTook: null,
  aggLoading: false,
  aggCircuitOpen: false,
  _aggCacheKey: null,
  expandedAggs: {},
  expandedAggsLoading: new Set(),

  // Sort distribution state (scrubber tooltip + ticks)
  sortDistribution: null,
  _sortDistCacheKey: null,

  // --- Null-zone distribution (uploadTime) for scrubber null-zone labels + ticks ---
  /** Pre-fetched uploadTime distribution for null-zone docs. Only set when
   *  the primary sort has a null zone (coveredCount < total). */
  nullZoneDistribution: null,
  /** Cache key for null-zone distribution. */
  _nullZoneDistCacheKey: null,

  // Position map state
  positionMap: null,
  positionMapLoading: false,

  setParams: (newParams) => {
    set((state) => ({
      params: { ...state.params, ...newParams, offset: 0 },
    }));
  },

  setFocusedImageId: (id) => {
    const offset = id ? get().imagePositions.get(id) ?? null : null;
    set({ focusedImageId: id, _focusedImageKnownOffset: offset });
  },

  seekToFocused: async () => {
    const { focusedImageId, params } = get();
    if (!focusedImageId) {
      set({ _pendingFocusDelta: null });
      return;
    }

    const genBefore = get().sortAroundFocusGeneration;
    const hintOffset = get()._focusedImageKnownOffset;
    // No fallbackFirstPage — buffer is current (same query/sort), so the
    // isInBuffer shortcut in _findAndFocusImage fires correctly.
    // No prevNeighbours — not a search context change.
    // Pass hintOffset so deep-seek mode uses the known position instead of 0.
    await _findAndFocusImage(focusedImageId, params, get, set, undefined, undefined, hintOffset);

    // If generation didn't bump, the image wasn't found (deleted/expired).
    // Clear focus and pending delta so the user isn't stuck with ghost focus.
    if (get().sortAroundFocusGeneration === genBefore) {
      devLog(`[seekToFocused] image ${focusedImageId} not found — clearing focus`);
      set({ focusedImageId: null, _pendingFocusDelta: null, _focusedImageKnownOffset: null });
    }
  },

  search: async (sortAroundFocusId?: string | null) => {
    const { dataSource, params, pitId: oldPitId } = get();

    // Capture neighbours of the focused image BEFORE the search replaces
    // the buffer. Used for neighbour fallback if the focused image
    // disappears from the new results.
    const prevNeighbours = sortAroundFocusId
      ? _captureNeighbours(
          sortAroundFocusId,
          get().results,
          get().bufferOffset,
          get().imagePositions,
        )
      : null;

    // Stop the new-images poll IMMEDIATELY — before any async work.
    // Without this, a dangling in-flight poll count() can resolve after
    // search completes and overwrite newCount: 0, causing the ticker to
    // reappear despite the user having just clicked it to refresh.
    stopNewImagesPoll();

    set({ loading: true, error: null, sortAroundFocusStatus: null, newCount: 0, _pendingFocusDelta: null });

    // Abort all in-flight extends from the previous search and set a
    // cooldown. The cooldown prevents extends triggered by scroll-reset
    // effects (useLayoutEffect in ImageGrid/ImageTable) that fire between
    // the search() call and the results arriving — during this window the
    // buffer is still at the old deep offset, and extendBackward would
    // prepend stale data.
    _rangeAbortController.abort();
    _rangeAbortController = new AbortController();
    _findFocusAbortController.abort();
    _findFocusAbortController = new AbortController();
    _seekCooldownUntil = Date.now() + SEARCH_FETCH_COOLDOWN_MS;
    const signal = _rangeAbortController.signal;

    // Abort any in-flight sort distribution or expanded agg fetch
    if (_sortDistAbortController) _sortDistAbortController.abort();
    if (_nullZoneDistAbortController) _nullZoneDistAbortController.abort();
    if (_expandedAggAbortController) _expandedAggAbortController.abort();
    if (_positionMapAbortController) _positionMapAbortController.abort();

    // Clear extend-in-flight flags — the abort above cancels any in-flight
    // extends or scroll-mode fill from the previous search. Without this,
    // a scroll-mode fill that gets aborted leaves _extendForwardInFlight
    // stuck at true, blocking sort-around-focus and future extends.
    set({
      _extendForwardInFlight: false, _extendBackwardInFlight: false,
      sortDistribution: null, _sortDistCacheKey: null,
      nullZoneDistribution: null, _nullZoneDistCacheKey: null,
      positionMap: null, positionMapLoading: false,
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
          newPitId = await dataSource.openPit("1m");
          // Bump PIT generation so in-flight seek/extend operations that
          // captured the old pitId know their PIT is stale and skip it
          // instead of hitting a 404. See es-audit.md Issue #1.
          set({ _pitGeneration: get()._pitGeneration + 1 });
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
          // NOTE: total is NOT set here. _findAndFocusImage sets it
          // atomically with the new buffer. Setting it here would cause
          // the virtualizer to re-render with a mismatched total/buffer,
          // triggering scroll-clamp → scroll-seek → flash of wrong content.
          took: result.took ?? null,
          seekTime: null,
          params: { ...params, offset: 0 },
          pitId: result.pitId ?? newPitId,
          newCount: 0,
          newCountSince: now,
          // Keep loading: true — _findAndFocusImage will set it to false.
          // Keep results/bufferOffset/imagePositions unchanged — old buffer
          // stays visible (or empty on first load) until the focused image's
          // neighbourhood is loaded, preventing flash of wrong content.
        });
        startNewImagesPoll(get, set);
        // Fire async — stays loading until complete.
        // Pass the first-page results as fallback so the view shows
        // correct content if the focused image isn't in the new results
        // (e.g. query change where the image was filtered out).
        _findAndFocusImage(sortAroundFocusId, params, get, set, {
          hits: result.hits,
          startCursor,
          endCursor,
          pitId: result.pitId ?? newPitId,
          total: result.total,
        }, prevNeighbours);

        // Position map: start background fetch even in sort-around-focus path.
        // The position map uses a dedicated PIT and abort controller, fully
        // independent of _findAndFocusImage's range controller. Without this,
        // switching sorts with a focused image leaves positionMap permanently
        // null — all subsequent seeks use the slow deep-seek path, and in
        // two-tier mode the inexact offset causes permanent skeletons.
        if (
          POSITION_MAP_THRESHOLD > 0 &&
          result.total > SCROLL_MODE_THRESHOLD &&
          result.total <= POSITION_MAP_THRESHOLD
        ) {
          _positionMapAbortController = new AbortController();
          _fetchPositionMap(
            dataSource, params,
            _positionMapAbortController.signal, get, set,
          );
        }
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

        // -----------------------------------------------------------
        // Position map: if total is in the indexed-scroll range
        // (above scroll-mode threshold, at or below position-map
        // threshold), fetch a lightweight [id, sortValues] index in
        // the background. Uses a dedicated PIT and abort controller.
        // -----------------------------------------------------------
        if (
          POSITION_MAP_THRESHOLD > 0 &&
          result.total > SCROLL_MODE_THRESHOLD &&
          result.total <= POSITION_MAP_THRESHOLD
        ) {
          _positionMapAbortController = new AbortController();
          _fetchPositionMap(
            dataSource, params,
            _positionMapAbortController.signal, get, set,
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
      dataSource, params: rawParams, results, bufferOffset, total,
      endCursor, pitId, _extendForwardInFlight, _pitGeneration,
    } = get();
    const params = frozenParams(rawParams, get);

    // Guards — with diagnostics so we can identify silent-block causes
    if (_extendForwardInFlight) {
      devLog(`[extendForward] BLOCKED: _extendForwardInFlight=true`);
      return;
    }
    if (!endCursor) {
      devLog(`[extendForward] BLOCKED: endCursor is null`);
      return;
    }
    if (Date.now() < _seekCooldownUntil) {
      devLog(`[extendForward] BLOCKED: seekCooldown (${_seekCooldownUntil - Date.now()}ms remaining)`);
      return;
    }
    const globalEnd = bufferOffset + results.length;
    if (globalEnd >= total) {
      devLog(`[extendForward] BLOCKED: at end (globalEnd=${globalEnd} >= total=${total}, bufferOffset=${bufferOffset}, results.length=${results.length})`);
      return;
    }

    set({ _extendForwardInFlight: true });

    try {
      // Detect null-zone cursor — if the primary sort value is null,
      // we need the same sortOverride + extraFilter + cursor stripping
      // that the null-zone seek uses. Without this, ES receives
      // search_after: [null, ...] and returns 500.
      const nz = detectNullZoneCursor(endCursor, params.orderBy);

      // If search() opened a new PIT since we captured ours, skip the
      // stale PIT — avoids a 404 round-trip. See es-audit.md Issue #1.
      const effectivePitId = get()._pitGeneration === _pitGeneration ? pitId : null;

      const result = await dataSource.searchAfter(
        { ...params, length: PAGE_SIZE },
        nz ? nz.strippedCursor : endCursor,
        effectivePitId,
        _rangeAbortController.signal,
        false, // reverse
        false, // noSource
        false, // missingFirst
        nz?.sortOverride,
        nz?.extraFilter,
      );

      // Remap sort values from null-zone shape back to full sort clause shape
      if (nz && result.sortValues.length > 0) {
        result.sortValues = remapNullZoneSortValues(
          result.sortValues, nz.sortClause, nz.primaryField,
        );
      }

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

        // Eviction: if buffer exceeds capacity, evict from start.
        // Round eviction count UP to the nearest multiple of columns so
        // remaining items keep their column positions — same principle as
        // the prepend trimming in extendBackward.
        let evictedFromStart = 0;
        if (newBuffer.length > BUFFER_CAPACITY) {
          const rawEvict = newBuffer.length - BUFFER_CAPACITY;
          const cols = getScrollGeometry().columns;
          evictedFromStart = cols > 1
            ? Math.ceil(rawEvict / cols) * cols
            : rawEvict;
          newPositions = evictPositions(
            newPositions, newBuffer, 0, evictedFromStart,
          );
          newBuffer.splice(0, evictedFromStart);
          newOffset += evictedFromStart;
          // Recompute startCursor from the new first buffer item.
          // extractSortValues derives ES sort values from the image's
          // fields (pure field read, no ES call). Without this,
          // extendBackward has no cursor and the user can't scroll up.
          const firstItem = newBuffer[0];
          newStartCursor = firstItem
            ? extractSortValues(firstItem, params.orderBy) ?? null
            : null;
        }

        const newEndCursor = result.sortValues.length > 0
          ? result.sortValues[result.sortValues.length - 1]
          : state.endCursor;

        return {
          results: newBuffer,
          bufferOffset: newOffset,
          // When a null-zone filter was used, result.total is the filtered
          // count (only docs missing the field), not the full corpus total.
          total: nz ? state.total : result.total,
          endCursor: newEndCursor,
          startCursor: newStartCursor,
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

  abortExtends: () => {
    _rangeAbortController.abort();
    _rangeAbortController = new AbortController();
    _seekCooldownUntil = Date.now() + SEARCH_FETCH_COOLDOWN_MS;
    set({
      _extendForwardInFlight: false,
      _extendBackwardInFlight: false,
    });
  },

  extendBackward: async () => {
    const {
      dataSource, params: rawParams, bufferOffset, startCursor, pitId,
      _extendBackwardInFlight, _pitGeneration,
    } = get();
    const params = frozenParams(rawParams, get);

    // Guards — with diagnostics so we can identify silent-block causes
    if (_extendBackwardInFlight) {
      devLog(`[extendBackward] BLOCKED: _extendBackwardInFlight=true`);
      return;
    }
    if (bufferOffset <= 0) return; // already at the start (normal, no log)
    if (Date.now() < _seekCooldownUntil) {
      devLog(`[extendBackward] BLOCKED: seekCooldown (${_seekCooldownUntil - Date.now()}ms remaining)`);
      return;
    }
    if (!startCursor) {
      devLog(`[extendBackward] BLOCKED: startCursor is null`);
      return;
    }

    const fetchCount = Math.min(PAGE_SIZE, bufferOffset);

    set({ _extendBackwardInFlight: true });

    try {
      // Reverse search_after: flip sort, use startCursor as anchor,
      // results come back in reversed order (adapter reverses them).
      // Works at any depth — no from/size offset limit.
      //
      // Detect null-zone cursor — same logic as extendForward.
      const nz = detectNullZoneCursor(startCursor, params.orderBy);

      // If search() opened a new PIT since we captured ours, skip the
      // stale PIT — avoids a 404 round-trip. See es-audit.md Issue #1.
      const effectivePitId = get()._pitGeneration === _pitGeneration ? pitId : null;

      const result = await dataSource.searchAfter(
        { ...params, length: fetchCount },
        nz ? nz.strippedCursor : startCursor,
        effectivePitId,
        _rangeAbortController.signal,
        true, // reverse
        false, // noSource
        false, // missingFirst
        nz?.sortOverride,
        nz?.extraFilter,
      );

      // Remap sort values from null-zone shape back to full sort clause shape
      if (nz && result.sortValues.length > 0) {
        result.sortValues = remapNullZoneSortValues(
          result.sortValues, nz.sortClause, nz.primaryField,
        );
      }

      if (result.hits.length === 0) {
        set({ _extendBackwardInFlight: false });
        return;
      }

      // Trim prepended items to a multiple of the current column count.
      // When prependCount % columns != 0, ALL existing items shift to
      // different column positions in the grid — the user sees images
      // rearranging sideways at the boundary between old and new content.
      // Trimming from the FRONT (earliest items) preserves the cursor
      // adjacency: the kept items are adjacent to the existing buffer start.
      const geo = getScrollGeometry();
      if (geo.columns > 1 && result.hits.length % geo.columns !== 0) {
        const excess = result.hits.length % geo.columns;
        result.hits = result.hits.slice(excess);
        result.sortValues = result.sortValues.slice(excess);
        devLog(`[extendBackward] trimmed ${excess} items to align with ${geo.columns} columns (${result.hits.length + excess} → ${result.hits.length})`);
      }

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
          // Recompute endCursor from the new last buffer item (symmetric
          // with the startCursor recomputation in extendForward eviction).
          const lastItem = newBuffer[newBuffer.length - 1];
          newEndCursor = lastItem
            ? extractSortValues(lastItem, params.orderBy) ?? null
            : null;
        }

        // Start cursor from the first result (earliest in sort order)
        const newStartCursor = result.sortValues.length > 0
          ? result.sortValues[0]
          : state.startCursor;

        return {
          results: newBuffer,
          bufferOffset: newOffset,
          startCursor: newStartCursor,
          endCursor: newEndCursor,
          // When a null-zone filter was used, result.total is the filtered
          // count (only docs missing the field), not the full corpus total.
          total: nz ? state.total : result.total,
          imagePositions: newPositions,
          _extendBackwardInFlight: false,
          _lastPrependCount: result.hits.length,
          _prependGeneration: state._prependGeneration + 1,
        };
      });

      // APPROACH #4 (Agent 10): After each backward extend completes, set a
      // short cooldown so the next extend can't fire immediately. Without this,
      // the prepend compensation (scrollTop += ~8787px) fires a scroll event
      // which triggers another extendBackward before the browser has painted
      // the compensated position — cascading compensations cause visible
      // "swimming." See POST_EXTEND_COOLDOWN_MS in tuning.ts for constraints.
      _seekCooldownUntil = Date.now() + POST_EXTEND_COOLDOWN_MS;
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
    const { dataSource, params: rawParams, pitId, _pitGeneration } = get();
    const params = frozenParams(rawParams, get);

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

    // If search() opened a new PIT since we captured ours, skip the
    // stale PIT — avoids a 404 round-trip. See es-audit.md Issue #1.
    const effectivePitId = get()._pitGeneration === _pitGeneration ? pitId : null;

    // Set cooldown IMMEDIATELY (synchronous, before any await). This prevents
    // extendForward/extendBackward from racing when a scroll event and seek
    // fire in the same microtask (e.g. Home key sets scrollTop=0 then seeks).
    // Without this, the scroll handler triggers reportVisibleRange → extend
    // before the seek's async fetch can set the cooldown.
    _seekCooldownUntil = Date.now() + SEEK_COOLDOWN_MS;

    set({ loading: true, error: null });

    const seekStartTime = Date.now();
    // Performance marks for DevTools profiling — visible in the Performance
    // tab's "Timings" lane. Cleared at the start so only the latest seek shows.
    // Clear only seek-specific marks/measures — don't wipe unrelated profiling.
    for (const name of ['seek-start', 'seek-forward-done', 'seek-backward-done', 'seek-set-done', 'seek-painted']) {
      performance.clearMarks(name);
    }
    for (const name of ['seek: forward fetch', 'seek: backward fetch', 'seek: compute + set()', 'seek: total (to paint)', 'seek: render + paint']) {
      performance.clearMeasures(name);
    }
    performance.mark('seek-start');

    try {
      // Center the buffer around the target offset
      const halfBuffer = Math.floor(PAGE_SIZE / 2);
      const fetchStart = Math.max(0, clampedOffset - halfBuffer);

      let result;
      let actualOffset = fetchStart;
      let usedNullZoneFilter = false;
      // True when the seek path gives an exact offset (position-map, shallow).
      // When true, use targetLocalIndex directly for scroll positioning instead
      // of reverse-computing from the user's current scrollTop. This prevents
      // the scrubber thumb from jumping after the seek settles.
      let exactOffset = false;
      // Bidirectional seek: after the forward fetch completes (for deep paths),
      // we add a backward fetch to place the user in the MIDDLE of the buffer.
      // This eliminates swimming — both extendBackward and extendForward operate
      // on off-screen content. The End-key and shallow paths skip this.
      let skipBackwardFetch = false;
      // Track how many backward items were prepended. Used by the reverse-compute
      // to offset scrollTargetIndex past the backward headroom.
      let backwardItemCount = 0;

      // ---------------------------------------------------------------
      // Fast path: End key — target is within PAGE_SIZE of the end.
      // Use reverse search_after (no cursor = last PAGE_SIZE results)
      // to guarantee the buffer covers the absolute last items.
      // Without this, the keyword/percentile estimation path may land
      // slightly short of the end and the buffer won't reach total.
      // ---------------------------------------------------------------
      if (clampedOffset + PAGE_SIZE >= total && fetchStart >= DEEP_SEEK_THRESHOLD) {
        result = await dataSource.searchAfter(
          { ...params, length: PAGE_SIZE },
          null,
          effectivePitId,
          signal,
          true,  // reverse
          false, // noSource
          true,  // missingFirst — nulls come first in reversed order
          undefined, // sortOverride
          undefined, // extraFilter
        );
        if (result.hits.length > 0) {
          actualOffset = Math.max(0, total - result.hits.length);
        }
        skipBackwardFetch = true; // At the absolute end — nothing beyond to fetch
        exactOffset = true; // Offset is known-exact (reverse from end)
      } else if (fetchStart < DEEP_SEEK_THRESHOLD) {
        // ---------------------------------------------------------------
        // Shallow seek — from/size is fast at small offsets (<10k)
        // ---------------------------------------------------------------
        result = await dataSource.searchAfter(
          { ...params, offset: fetchStart, length: PAGE_SIZE },
          null,
          null,
          signal,
        );
        skipBackwardFetch = true; // from/size already centers buffer via fetchStart
        exactOffset = true; // from/size gives exact positioning
      } else if (get().positionMap && clampedOffset < get().positionMap!.length) {
        // ---------------------------------------------------------------
        // Position-map fast path — exact position→sortValues lookup.
        //
        // Both forward and backward cursors are known upfront from the map,
        // so we run them in parallel via Promise.all. Saves ~250-350ms on
        // TEST (max of two fetches instead of sequential sum).
        //
        // Handles date, keyword, and null-zone sorts uniformly — the
        // position map stores the actual sort values ES returned (including
        // null for null-zone entries).
        // ---------------------------------------------------------------
        const posMap = get().positionMap!;
        const forwardCursor = cursorForPosition(posMap, clampedOffset);

        devLog(
          `[seek] POSITION MAP fast path: target=${clampedOffset}, ` +
          `mapLength=${posMap.length}, cursor=${JSON.stringify(forwardCursor)}`,
        );

        if (forwardCursor === null) {
          // Position 0 — fetch from the start (no search_after cursor)
          result = await dataSource.searchAfter(
            { ...params, length: PAGE_SIZE },
            null,
            effectivePitId,
            signal,
          );
          actualOffset = 0;
          exactOffset = true;
          skipBackwardFetch = true; // at the start — nothing before to fetch
        } else {
          // --- Parallel forward + backward fetch ---

          // Forward: fetch PAGE_SIZE items starting at clampedOffset
          const fwdNz = detectNullZoneCursor(forwardCursor, params.orderBy);

          // Backward: fetch halfBuffer items before clampedOffset.
          // The backward cursor is the entry AT the target position — with
          // reverse: true, search_after returns items strictly before it.
          const skipBackward = clampedOffset < halfBuffer;
          let backwardPromise: Promise<Awaited<ReturnType<typeof dataSource.searchAfter>> | null> | null = null;

          if (!skipBackward) {
            const backwardCursor = posMap.sortValues[clampedOffset];
            if (backwardCursor) {
              const bwdNz = detectNullZoneCursor(backwardCursor, params.orderBy);
              backwardPromise = dataSource.searchAfter(
                { ...params, length: halfBuffer },
                bwdNz ? bwdNz.strippedCursor : backwardCursor,
                effectivePitId,
                signal,
                true,  // reverse
                false, // noSource
                false, // missingFirst
                bwdNz?.sortOverride,
                bwdNz?.extraFilter,
              ).then(bwdResult => {
                // Remap backward sort values from null-zone shape
                if (bwdNz && bwdResult.sortValues.length > 0) {
                  bwdResult.sortValues = remapNullZoneSortValues(
                    bwdResult.sortValues, bwdNz.sortClause, bwdNz.primaryField,
                  );
                }
                return bwdResult;
              });
            }
          }

          // Forward fetch
          const forwardPromise = fwdNz
            ? dataSource.searchAfter(
                { ...params, length: PAGE_SIZE },
                fwdNz.strippedCursor,
                effectivePitId,
                signal,
                false, false, false,
                fwdNz.sortOverride,
                fwdNz.extraFilter,
              ).then(fwdResult => {
                if (fwdResult.sortValues.length > 0) {
                  fwdResult.sortValues = remapNullZoneSortValues(
                    fwdResult.sortValues, fwdNz.sortClause, fwdNz.primaryField,
                  );
                }
                usedNullZoneFilter = true;
                return fwdResult;
              })
            : dataSource.searchAfter(
                { ...params, length: PAGE_SIZE },
                forwardCursor,
                effectivePitId,
                signal,
              );

          // Run in parallel
          const [forwardResult, backwardResult] = await Promise.all([
            forwardPromise,
            backwardPromise ?? Promise.resolve(null),
          ]);

          if (signal.aborted) return;

          // Combine results
          result = forwardResult;

          if (backwardResult && backwardResult.hits.length > 0) {
            const combinedHits = [
              ...backwardResult.hits,
              ...forwardResult.hits,
            ];
            const combinedSortValues = [
              ...backwardResult.sortValues,
              ...forwardResult.sortValues,
            ];

            const newBufferStart = Math.max(0, clampedOffset - backwardResult.hits.length);

            result = {
              ...forwardResult,
              hits: combinedHits,
              sortValues: combinedSortValues,
            };
            actualOffset = newBufferStart;
            backwardItemCount = backwardResult.hits.length;

            devLog(
              `[seek] POSITION MAP parallel: prepended ${backwardResult.hits.length} backward items, ` +
              `buffer now ${combinedHits.length} items, bufferOffset=${newBufferStart}`,
            );
          } else {
            actualOffset = clampedOffset;
          }

          exactOffset = true;
          // Skip the sequential backward-fetch block — we already did it in parallel
          skipBackwardFetch = true;
        }
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
        //
        // CRITICAL: When a field has null values (e.g. lastModified — many
        // images never modified), ES puts nulls at the END of the sort
        // (missing: "_last" for both asc and desc). The percentile agg
        // only covers docs WITH the field. If we use `total` as the
        // denominator, we compute a percentile that's too conservative:
        // e.g. position 50k out of 1.3M = 3.8% ratio, but if only 100k
        // docs have the field, position 50k is actually at the 50th
        // percentile of those docs. Use coveredCount when available
        // (from the sort distribution), falling back to total.
        //
        // For desc: positions 0..(coveredCount-1) have values,
        //           positions coveredCount..(total-1) are nulls (sorted
        //           by the uploadTime fallback, then id tiebreaker).
        // For asc:  positions 0..(total-coveredCount-1) are nulls,
        //           positions (total-coveredCount)..(total-1) have values.
        // Ensure sortDistribution is loaded before we rely on coveredCount.
        // On first scrubber click, fetchSortDistribution fires in parallel
        // with seek — but seek needs coveredCount to detect the null zone.
        // Without it, seek treats the entire corpus as having values for the
        // primary field, and the percentile maps to the wrong position.
        // One extra round-trip on first click only (cached after that).
        let dist = get().sortDistribution;
        if (!dist && primaryField !== "uploadTime") {
          await get().fetchSortDistribution();
          dist = get().sortDistribution;
        }
        if (signal.aborted) return;
        const coveredCount = dist?.coveredCount ?? total;

        // Determine if the target position is in the "null zone" — beyond
        // the docs that have the primary sort field value. In the null zone
        // all docs tie on the primary field (null), so they're ordered by
        // the uploadTime fallback and id tiebreaker. Percentile estimation
        // on the primary field is useless here.
        const inNullZone = primaryDir === "desc"
          ? clampedOffset >= coveredCount
          : clampedOffset < (total - coveredCount);

        devLog(
          `[seek-diag] target=${clampedOffset}, total=${total}, coveredCount=${coveredCount}, ` +
          `primaryField=${primaryField}, primaryDir=${primaryDir}, inNullZone=${inNullZone}, ` +
          `distLoaded=${!!dist}, distBuckets=${dist?.buckets.length ?? 0}`,
        );


        let estimatedValue: number | null = null;

        if (inNullZone) {
          // Target is in the null-value zone. All docs here have null for
          // the primary sort field, so they're ordered by the uploadTime
          // fallback. Estimate the uploadTime at the target position within
          // the null zone, then search_after with [null, uploadTime, ""].

          const nullZoneSize = total - coveredCount;
          const posInNullZone = primaryDir === "desc"
            ? clampedOffset - coveredCount
            : clampedOffset; // asc: nulls are at the start

          // Null zone is sorted by the uploadTime fallback (direction matches
          // buildSortClause's logic — desc for date desc, asc for date asc).
          // Derive fallback direction from the sort clause.
          let fallbackDir: "asc" | "desc" = "desc";
          for (const clause of sortClause) {
            const { field, direction } = parseSortField(clause);
            if (field === "uploadTime") { fallbackDir = direction; break; }
          }

          // --- Estimate uploadTime at the target position ---
          //
          // Strategy 1 (preferred): use the null-zone distribution if loaded.
          // This is the same data the tooltip uses — binary search on bucket
          // startPositions gives the exact bucket for this position. Much more
          // accurate than percentile over all docs, because it only covers
          // null-zone docs with their actual uploadTime distribution.
          //
          // Strategy 2 (fallback): percentile over all docs via ES aggregation.
          // Inaccurate because the non-null docs have different uploadTime
          // distributions than the null-zone docs.
          const nullZoneDist = get().nullZoneDistribution;
          let uploadTimeEstimate: number | null = null;

          if (nullZoneDist && nullZoneDist.buckets.length >= 2) {
            // Binary search the distribution for the bucket at posInNullZone
            const buckets = nullZoneDist.buckets;
            let lo = 0;
            let hi = buckets.length - 1;
            while (lo < hi) {
              const mid = (lo + hi + 1) >>> 1;
              if (buckets[mid].startPosition <= posInNullZone) {
                lo = mid;
              } else {
                hi = mid - 1;
              }
            }
            const bucket = buckets[lo];
            // Interpolate within the bucket for sub-bucket precision.
            // The bucket covers positions [startPosition, nextStartPosition).
            // Linear interpolation between this bucket's date and the next.
            const bucketDate = new Date(bucket.key).getTime();
            if (lo + 1 < buckets.length) {
              const nextBucket = buckets[lo + 1];
              const nextDate = new Date(nextBucket.key).getTime();
              const posInBucket = posInNullZone - bucket.startPosition;
              const bucketSize = nextBucket.startPosition - bucket.startPosition;
              const frac = bucketSize > 0 ? posInBucket / bucketSize : 0;
              uploadTimeEstimate = bucketDate + frac * (nextDate - bucketDate);
            } else {
              uploadTimeEstimate = bucketDate;
            }
            devLog(
              `[seek-diag] NULL ZONE: posInNullZone=${posInNullZone}, nullZoneSize=${nullZoneSize}, ` +
              `using DISTRIBUTION bucket[${lo}] key=${bucket.key}, ` +
              `estimate=${new Date(uploadTimeEstimate).toISOString()}`,
            );
          } else {
            // Fallback: percentile over all docs (inaccurate for null zone)
            const nullRatio = posInNullZone / Math.max(1, nullZoneSize);
            const uploadPercentile = Math.max(0.01, Math.min(99.99,
              fallbackDir === "desc"
                ? (1 - nullRatio) * 100
                : nullRatio * 100,
            ));
            devLog(
              `[seek-diag] NULL ZONE: posInNullZone=${posInNullZone}, nullZoneSize=${nullZoneSize}, ` +
              `nullRatio=${nullRatio.toFixed(4)}, fallbackDir=${fallbackDir}, ` +
              `using PERCENTILE=${uploadPercentile.toFixed(2)} (no null-zone distribution)`,
            );
            uploadTimeEstimate = await dataSource.estimateSortValue(
              params,
              "uploadTime",
              uploadPercentile,
              signal,
            );
          }


          if (uploadTimeEstimate != null) {
            devLog(
              `[seek-diag] NULL ZONE estimate: uploadTime=${uploadTimeEstimate} ` +
              `(${new Date(uploadTimeEstimate).toISOString()})`,
            );
            // Null zone strategy: filter to docs where the primary field is
            // missing, sort by [uploadTime dir, id asc] (the fallback sort
            // that ES actually uses within the null partition), and seek via
            // search_after with [uploadTimeEstimate, ""].
            //
            // We can NOT pass null in search_after — ES rejects it with 500.
            // Instead, we narrow the query and change the sort so the cursor
            // only contains concrete values.
            //
            // Direction: derived from the sort clause's uploadTime fallback
            // (set by buildSortClause — date sorts inherit primary direction,
            // keyword/numeric sorts get desc).
            let nullZoneUploadDir: "asc" | "desc" = "desc";
            for (const clause of sortClause) {
              const { field, direction } = parseSortField(clause);
              if (field === "uploadTime") { nullZoneUploadDir = direction; break; }
            }
            const nullZoneSort: Record<string, unknown>[] = [
              { uploadTime: nullZoneUploadDir },
              { id: "asc" },
            ];
            const nullZoneFilter: Record<string, unknown> = {
              bool: { must_not: { exists: { field: primaryField! } } },
            };
            const nullZoneCursor: SortValues = [uploadTimeEstimate, ""];

            usedNullZoneFilter = true;
            result = await dataSource.searchAfter(
              { ...params, length: PAGE_SIZE },
              nullZoneCursor,
              effectivePitId,
              signal,
              false, // reverse
              false, // noSource
              false, // missingFirst
              nullZoneSort,
              nullZoneFilter,
            );

            // Find where we actually landed. The countBefore for the null
            // zone is: coveredCount (all docs with values sort before any
            // null doc) + position within the null zone. We count within
            // the null zone by asking "how many null-zone docs sort before
            // the landed position" on the uploadTime+id sort.
            if (result.hits.length > 0 && result.sortValues.length > 0) {
              if (signal.aborted) return;
              const landedSortValues = result.sortValues[0];
              const landedUploadTime = landedSortValues[0]; // first sort value = uploadTime
              devLog(
                `[seek-diag] NULL ZONE landed: uploadTime=${landedUploadTime} ` +
                `(${new Date(landedUploadTime as number).toISOString()}), ` +
                `firstHitUploadTime=${result.hits[0]?.uploadTime}`,
              );

              // Re-derive the full sort values for countBefore: the first
              // hit has sort values from the nullZoneSort [uploadTime, id].
              // We need to express this in the full sort clause terms:
              // [null (lastModified), uploadTime, id].
              const fullSortValues = remapNullZoneSortValues(
                [landedSortValues], sortClause, primaryField!,
              )[0];

              const countBefore = await dataSource.countBefore(
                params,
                fullSortValues,
                sortClause,
                signal,
              );
              devLog(
                `[seek-diag] NULL ZONE countBefore=${countBefore}, ` +
                `expected≈${clampedOffset}, coveredCount=${coveredCount}, ` +
                `impliedNullZonePos=${countBefore - coveredCount}, ` +
                `targetNullZonePos=${posInNullZone}, ` +
                `drift=${countBefore - clampedOffset}, ` +
                `fullSortValues=${JSON.stringify(fullSortValues)}`,
              );
              actualOffset = countBefore;
            }

            // Remap sort values from null-zone shape [uploadTime, id] to
            // full sort clause shape [null, uploadTime, id]. Without this,
            // startCursor/endCursor would be 2-element arrays that break
            // subsequent extendForward/extendBackward calls.
            if (result && result.sortValues.length > 0) {
              result = {
                ...result,
                sortValues: remapNullZoneSortValues(
                  result.sortValues, sortClause, primaryField!,
                ),
              };
            }
          }
          // If uploadTimeEstimate is null, fall through to the keyword/fallback path below.
        }

        if (!inNullZone) {
          // Compute percentile for the covered range (docs WITH the field).
          const posInCovered = primaryDir === "desc"
            ? clampedOffset
            : clampedOffset - (total - coveredCount);
          const positionRatio = posInCovered / Math.max(1, coveredCount);
          const percentile =
            primaryDir === "desc"
              ? (1 - positionRatio) * 100
              : positionRatio * 100;

          const clampedPercentile = Math.max(0.01, Math.min(99.99, percentile));


          if (primaryField) {
            estimatedValue = await dataSource.estimateSortValue(
              params,
              primaryField,
              clampedPercentile,
              signal,
            );
          }
        }

        // Skip percentile/keyword paths if the null zone path already handled the seek.
        if (!result && estimatedValue != null) {
          // Use search_after with the estimated sort value. Secondary sort
          // fields get direction-aware anchors (see buildSeekCursorAnchors).
          const searchAfterValues = buildSeekCursorAnchors(sortClause, estimatedValue);

          result = await dataSource.searchAfter(
            { ...params, length: PAGE_SIZE },
            searchAfterValues,
            effectivePitId,
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
        } else if (!result) {
          // Keyword sorts — percentile estimation unavailable.
          // Composite aggregation to walk unique values and find the
          // value at the target position. O(unique_values/1000) ES
          // requests — typically 2-10 for real-world data.
          const { field: pField } = parseSortField(sortClause[0]);

          if (pField && dataSource.findKeywordSortValue) {
            devLog(
              `[seek] keyword strategy: field=${pField}, target=${fetchStart}, ` +
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

            devLog(
              `[seek] findKeywordSortValue returned: ${JSON.stringify(keywordValue)}`,
            );

            if (keywordValue != null) {
              // Build search_after cursor with direction-aware anchors
              const searchAfterValues = buildSeekCursorAnchors(sortClause, keywordValue);

              devLog(
                `[seek] search_after cursor: ${JSON.stringify(searchAfterValues)}`,
              );

              result = await dataSource.searchAfter(
                { ...params, length: PAGE_SIZE },
                searchAfterValues,
                effectivePitId,
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
                devLog(
                  `[seek] countBefore=${countBefore}, landedSortValues=${JSON.stringify(landedSortValues)}, ` +
                  `target was ${fetchStart}, drift=${Math.abs(countBefore - fetchStart)}`,
                );
              }

              // -----------------------------------------------------------------
              // Refinement: if we landed far from the target (large keyword
              // bucket — e.g. 400k docs all with credit "PA"), binary-search
              // on the tiebreaker field to find a precise cursor.
              //
              // Binary search using countBefore (a single _count query per
              // iteration, ~5-10ms each). The tiebreaker is always the `id`
              // field (40-char hex SHA-1), uniformly distributed.
              // ~20 binary search steps → ~200ms total.
              // -----------------------------------------------------------------
              const drift = fetchStart - actualOffset;
              if (Math.abs(drift) > PAGE_SIZE && result.hits.length > 0 && result.sortValues.length > 0) {
                // Identify the tiebreaker field (last sort clause — always `id`)
                const lastClause = sortClause[sortClause.length - 1];
                const { field: tiebreakerField } = parseSortField(lastClause);

                if (tiebreakerField === "id") {
                  devLog(
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
                      devLog(
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
                      devLog(
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
                    effectivePitId,
                    signal,
                  );

                  if (refinedResult.hits.length > 0) {
                    result = refinedResult;
                    actualOffset = bestOffset;
                    devLog(
                      `[seek] binary search refinement complete: ` +
                      `actualOffset=${actualOffset}, target=${fetchStart}`,
                    );
                  }
                } else {
                  // Non-id tiebreaker (shouldn't happen with current sort configs).
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
                  effectivePitId,
                  signal,
                  true,  // reverse
                  false, // noSource
                  true,  // missingFirst — nulls come first in reversed order
                );
                if (reverseResult.hits.length > 0) {
                  result = reverseResult;
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
            // No keyword seek available — fall back to from/size at capped position.
            const cappedStart = Math.min(fetchStart, MAX_RESULT_WINDOW - PAGE_SIZE);
            result = await dataSource.searchAfter(
              { ...params, offset: Math.max(0, cappedStart), length: PAGE_SIZE },
              null,
              null,
              signal,
            );
            actualOffset = Math.max(0, cappedStart);
          }
        }
      }

      performance.mark('seek-forward-done');

      // -----------------------------------------------------------------
      // Bidirectional seek — backward fetch (Idea B from scroll-architecture §7)
      //
      // Deep paths above fetched PAGE_SIZE (200) items FORWARD from the
      // landed cursor. The user sees buffer[0..~15] — the very top. The
      // first extendBackward at ~800ms would prepend directly above visible
      // content, causing a ~1% visible swim.
      //
      // Fix: add a backward fetch of halfBuffer items BEFORE the landed
      // cursor. Combined buffer = [...backward, ...forward]. The user sees
      // the buffer middle (~100 items of headroom above), so both
      // extendBackward and extendForward operate on off-screen content.
      //
      // Uses detectNullZoneCursor to handle null-zone cursors automatically
      // (same pattern as _loadBufferAroundImage). The position-map path
      // handles its own parallel backward fetch and sets skipBackwardFetch=true,
      // so this block only runs for the deep seek path.
      // -----------------------------------------------------------------
      if (
        !skipBackwardFetch &&
        result &&
        result.hits.length > 0 &&
        result.sortValues.length > 0 &&
        actualOffset > 0 // no point fetching backward if we're at position 0
      ) {
        if (signal.aborted) return;

        const landedCursor = result.sortValues[0];

        // Detect null-zone cursor — same logic as _loadBufferAroundImage.
        // If the cursor's primary field is null, we need to strip it and
        // use the null-zone sort/filter overrides for the backward fetch.
        const nz = detectNullZoneCursor(landedCursor, params.orderBy);
        const effectiveCursor = nz ? nz.strippedCursor : landedCursor;

        const backwardResult = await dataSource.searchAfter(
          { ...params, length: halfBuffer },
          effectiveCursor,
          effectivePitId,
          signal,
          true,  // reverse
          false, // noSource
          false, // missingFirst
          nz?.sortOverride,
          nz?.extraFilter,
        );

        if (signal.aborted) return;

        // Remap backward sort values from null-zone shape back to full shape
        if (nz && backwardResult.sortValues.length > 0) {
          backwardResult.sortValues = remapNullZoneSortValues(
            backwardResult.sortValues, nz.sortClause, nz.primaryField,
          );
        }

        if (backwardResult.hits.length > 0) {
          // Combine: backward (reversed to restore original order) + forward
          const combinedHits = [
            ...backwardResult.hits,
            ...result.hits,
          ];
          const combinedSortValues = [
            ...backwardResult.sortValues,
            ...result.sortValues,
          ];

          // Adjust actualOffset to account for the prepended backward items
          const newBufferStart = Math.max(0, actualOffset - backwardResult.hits.length);

          // Update result with the combined buffer
          result = {
            ...result,
            hits: combinedHits,
            sortValues: combinedSortValues,
          };
          actualOffset = newBufferStart;
          backwardItemCount = backwardResult.hits.length;

          devLog(
            `[seek] bidirectional: prepended ${backwardResult.hits.length} backward items, ` +
            `buffer now ${combinedHits.length} items, bufferOffset=${newBufferStart}` +
            (nz ? ' (null-zone cursor)' : ''),
          );
        }
      }

      performance.mark('seek-backward-done');

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

      // Refresh cooldown from data arrival — the virtualizer needs time to
      // render at the new scroll position before edge-detection kicks in.
      // Without this, extendBackward can fire during a logo-click scroll
      // reset (scrollTop=0 on a deep buffer), corrupting the buffer.
      // See tuning.ts for the timing relationship with SEEK_DEFERRED_SCROLL_MS.
      _seekCooldownUntil = Date.now() + SEEK_COOLDOWN_MS;

      // NOTE: _postSeekBackwardSuppress flag was removed (Agent 10). Swimming
      // prevention now handled by SEEK_COOLDOWN_MS + POST_EXTEND_COOLDOWN_MS.

      // Compute the buffer-local target index so views can scroll there.
      // Clamp to buffer bounds — the percentile estimate may drift, landing
      // the buffer offset far enough from the target that the target falls
      // outside the fetched page. Without clamping, the view would try to
      // scroll to index 10000+ in a 200-item buffer → wild jump.
      const rawTargetLocalIndex = clampedOffset - actualOffset;
      const targetLocalIndex = Math.max(0, Math.min(
        rawTargetLocalIndex,
        result.hits.length - 1,
      ));
      const targetWasClamped = rawTargetLocalIndex !== targetLocalIndex;

      // FLASH PREVENTION / THUMB-JUMP FIX:
      //
      // For DEEP seeks (percentile estimation — inexact offset):
      //   Reverse-compute a local index from the user's current scrollTop.
      //   This prevents flash — the virtualizer renders new content at the
      //   user's current scroll position, not the (drifted) target position.
      //
      // For EXACT-OFFSET seeks (position-map and shallow — precise offset):
      //   Use targetLocalIndex directly. The offset is known-correct, so the
      //   target image IS at that local index. Using the reverse-compute here
      //   would cause a scrubber thumb jump: visibleRange.start would differ
      //   from the seek target, and the thumb would snap from the user's drag
      //   position to the reverse-computed position when pendingSeekPosRef
      //   clears. Direct targeting means the thumb stays put.
      //
      // The reverse-compute math is extracted into computeScrollTarget() for
      // independent unit testing.
      const scrollEl = getScrollContainer();
      let scrollTargetIndex: number;
      let _seekSubRowOffset = 0;

      // Diagnostic variables for the devLog below
      let _diagReverseIndex: number | string = 'N/A';
      let _diagOrigScrollTop: number | string = 'N/A';
      let _diagCurrentRow: number | string = 'N/A';
      let _diagCols: number | string = 'N/A';
      let _diagHeadroomFired = false;

      if (scrollEl) {
        if (exactOffset) {
          // EXACT-OFFSET PATH (position-map, shallow from/size):
          // The offset is known-correct — the target image IS at targetLocalIndex.
          // Use it directly. Using the reverse-compute here would cause the
          // scrubber thumb to jump: visibleRange.start would differ from the
          // seek target position, and the thumb would snap from the user's drag
          // position when pendingSeekPosRef clears.
          scrollTargetIndex = targetLocalIndex;
          // No sub-row offset needed — we want to land exactly at the target.
        } else {
          // INEXACT-OFFSET PATH (deep seek with percentile estimation):
          // Reverse-compute a local index from the user's current scrollTop.
          // This prevents flash — the virtualizer renders new content at the
          // user's current scroll position, not the (drifted) target position.
          const isTable = !!scrollEl.getAttribute("aria-label")?.includes("table");
          const effectiveTotal = usedNullZoneFilter ? get().total : result.total;

          const computed = computeScrollTarget({
            currentScrollTop: scrollEl.scrollTop,
            isTable,
            clientWidth: scrollEl.clientWidth,
            clientHeight: scrollEl.clientHeight,
            backwardItemCount,
            bufferLength: result.hits.length,
            total: effectiveTotal,
            actualOffset,
            clampedOffset,
          });

          scrollTargetIndex = computed.scrollTargetIndex;
          _seekSubRowOffset = computed.seekSubRowOffset;
        }

        // Populate diagnostics for the devLog
        const isTable = !!scrollEl.getAttribute("aria-label")?.includes("table");
        const rowH = isTable ? TABLE_ROW_HEIGHT : GRID_ROW_HEIGHT;
        const cols = isTable ? 1 : Math.max(1, Math.floor(scrollEl.clientWidth / GRID_MIN_CELL_WIDTH));
        _diagOrigScrollTop = scrollEl.scrollTop;
        _diagCurrentRow = Math.round(scrollEl.scrollTop / rowH);
        _diagCols = cols;
        let reverseIndex = _diagCurrentRow * cols;
        if (backwardItemCount > 0 && reverseIndex < backwardItemCount) {
          _diagHeadroomFired = true;
          reverseIndex += backwardItemCount;
        }
        _diagReverseIndex = reverseIndex;
      } else {
        // No scroll container (shouldn't happen) — fall back to center.
        scrollTargetIndex = Math.floor(result.hits.length / 2);
      }


      // NOTE: We generally do NOT set scrollEl.scrollTop here — the
      // _seekTargetLocalIndex is chosen so that localIndexToPixelTop()
      // matches (or is very close to) the user's current scrollTop.
      // EXCEPTION: the headroom zone (reverseIndex < backwardItemCount) —
      // that stores a sub-row offset for effect #6 to apply after the new
      // buffer is rendered (to avoid browser clamping on the old buffer).

      devLog(
        `[seek-scroll-target] exactOffset=${exactOffset}, scrollTop=${scrollEl?.scrollTop.toFixed(1)}, ` +
        `origScrollTop=${_diagOrigScrollTop}, currentRow=${_diagCurrentRow}, cols=${_diagCols}, ` +
        `reverseIndex=${_diagReverseIndex}, headroomFired=${_diagHeadroomFired}, ` +
        `scrollTargetIndex=${scrollTargetIndex}, ` +
        `rawTargetLocalIndex=${rawTargetLocalIndex}, targetLocalIndex=${targetLocalIndex}, ` +
        `bufferLen=${result.hits.length}, actualOffset=${actualOffset}, clampedOffset=${clampedOffset}, ` +
        `backwardItemCount=${backwardItemCount}, skipBackwardFetch=${skipBackwardFetch}, ` +
        `clientWidth=${scrollEl?.clientWidth}`,
      );
      // Effect #6 in useScrollEffects will only adjust scrollTop if there's
      // a meaningful difference — otherwise it's a no-op → zero flash.

      set({
        results: result.hits,
        bufferOffset: actualOffset,
        // ...existing comment about null-zone filter...
        total: usedNullZoneFilter ? get().total : result.total,
        loading: false,
        imagePositions: buildPositions(result.hits, actualOffset),
        startCursor,
        endCursor,
        pitId: result.pitId ?? effectivePitId,
        _extendForwardInFlight: false,
        _extendBackwardInFlight: false,
        _seekGeneration: get()._seekGeneration + 1,
        _seekTargetLocalIndex: scrollTargetIndex,
        // In two-tier mode, effect #6 needs the global index to compute the
        // correct pixel offset (virtualizer row 0 = global 0). Two-tier is
        // active whenever total is in position-map-eligible range, regardless
        // of whether the map has loaded yet.
        //
        // EXACT-OFFSET paths (position-map, shallow from/size): use clampedOffset
        // — the buffer is guaranteed to cover that position.
        //
        // INEXACT-OFFSET paths (deep seek with percentile estimation):
        // Use `actualOffset + backwardItemCount` — the bidirectional centre of
        // the buffer. This is the global position where "interesting" content
        // starts (100 items of headroom before, 200 forward).
        //
        // We can NOT use `clampedOffset` (the old code) because estimation
        // drift in the null zone means clampedOffset may be thousands of
        // positions away from actualOffset → Effect #6 forces scrollTop to
        // a position outside the buffer → permanent skeletons.
        //
        // We can NOT use `actualOffset + scrollTargetIndex` (from
        // computeScrollTarget) because that function clamps to buffer-local
        // scroll bounds — in two-tier mode where scrollTop is a global pixel
        // position, the reverse-computed index clamps to buffer end (299),
        // placing the viewport at the last buffer row → no scroll-up headroom.
        //
        // `actualOffset + backwardItemCount` works for both cases:
        // - Normal: ≈ clampedOffset (drift is small) → Effect #6 is a no-op
        // - Null zone: ≈ buffer centre → Effect #6 jumps to the data we found
        _seekTargetGlobalIndex: (() => {
          const effectiveTotal = usedNullZoneFilter ? get().total : result.total;
          const inTwoTier =
            POSITION_MAP_THRESHOLD > 0 &&
            effectiveTotal > SCROLL_MODE_THRESHOLD &&
            effectiveTotal <= POSITION_MAP_THRESHOLD;
          if (!inTwoTier) return -1;
          if (exactOffset) return clampedOffset;
          return actualOffset + backwardItemCount;
        })(),
        _seekSubRowOffset,
        seekTime: Date.now() - seekStartTime,
      });

      performance.mark('seek-set-done');

      const writtenTotal = usedNullZoneFilter ? get().total : result.total;

      devLog(
        `[seek] COMPLETE: target=${clampedOffset}, actualOffset=${actualOffset}, ` +
        `hits=${result.hits.length}, targetLocalIndex=${targetLocalIndex}, ` +
        `ratio=${(actualOffset / (writtenTotal || 1)).toFixed(4)}` +
        (usedNullZoneFilter ? ` (null-zone seek, result.total=${result.total} filtered, kept storeTotal=${writtenTotal})` : '') +
        (targetWasClamped ? ` CLAMPED→center=${scrollTargetIndex}` : ''),
      );

      // Performance measures — these show up as named bars in DevTools
      // Performance tab Timings lane, with duration in ms.
      // Each wrapped individually so a missing mark doesn't block the rest.
      try { performance.measure('seek: forward fetch', 'seek-start', 'seek-forward-done'); } catch { /* mark missing */ }
      try { performance.measure('seek: backward fetch', 'seek-forward-done', 'seek-backward-done'); } catch { /* mark missing */ }
      try { performance.measure('seek: compute + set()', 'seek-backward-done', 'seek-set-done'); } catch { /* mark missing */ }

      // Defer the final marks to AFTER the browser paints — this captures
      // React rendering + layout + paint, not just the synchronous set().
      // Two rAFs: first fires before paint, second fires after paint.
      // Guard: rAF doesn't exist in Vitest (Node/jsdom).
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            performance.mark('seek-painted');
            try { performance.measure('seek: total (to paint)', 'seek-start', 'seek-painted'); } catch { /* */ }
            try { performance.measure('seek: render + paint', 'seek-set-done', 'seek-painted'); } catch { /* */ }
          });
        });
      }

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

  restoreAroundCursor: async (
    imageId: string,
    cursor: SortValues | null,
    cachedOffset: number,
  ) => {
    // Without a cursor, fall back to the approximate seek. This covers
    // old cache entries and images with missing sort fields. Shallow
    // offsets (<DEEP_SEEK_THRESHOLD) will still work perfectly.
    if (!cursor) {
      return get().seek(cachedOffset);
    }

    const { dataSource, params: rawParams, pitId, _pitGeneration } = get();
    const params = frozenParams(rawParams, get);

    // Abort in-flight extends and previous restores
    _rangeAbortController.abort();
    _rangeAbortController = new AbortController();
    const signal = _rangeAbortController.signal;
    _seekCooldownUntil = Date.now() + SEEK_COOLDOWN_MS;

    // If search() opened a new PIT since we captured ours, skip the stale PIT.
    const effectivePitId = get()._pitGeneration === _pitGeneration ? pitId : null;

    set({ loading: true, error: null });

    try {
      const sortClause = buildSortClause(params.orderBy);

      // Step 1: countBefore to get the exact global offset of the cursor.
      // This is cheap (~5-10ms) and gives us the precise bufferOffset.
      const exactOffset = await dataSource.countBefore(
        params, cursor, sortClause, signal,
      );
      if (signal.aborted) return;

      // Step 2: Fetch the target image by ID — we need the hit object and
      // its current sort values (which may differ from the cached cursor if
      // the sort field was updated between store & reload).
      const targetResult = await dataSource.searchAfter(
        { ...params, ids: imageId, length: 1 },
        null, null, signal,
      );
      if (signal.aborted) return;

      const targetHit = targetResult.hits[0];
      if (!targetHit) {
        // Image no longer matches the query — degrade to standalone mode
        console.warn("[restoreAroundCursor] Image not found in results, falling back");
        set({ loading: false });
        return;
      }

      // Use fresh sort values if available, fall back to cached cursor
      const targetSortValues = targetResult.sortValues[0] ?? cursor;

      // Step 3: Load a buffer centered on the target image
      const buf = await _loadBufferAroundImage(
        targetHit, targetSortValues, exactOffset,
        params, effectivePitId, signal, dataSource,
      );
      if (!buf) return; // aborted

      _seekCooldownUntil = Date.now() + SEEK_COOLDOWN_MS;

      // In two-tier mode, effect #6 needs the global index to compute the
      // correct pixel position (virtualizer row 0 = global 0). Without this,
      // effect6 falls back to the buffer-local targetLocalIndex — which maps
      // to a pixel position near the top of the full scroll range instead of
      // the image's actual global position. That wrong scrollTop triggers a
      // scroll-seek that relocates the buffer away from the image, and the
      // restore effect fires again — infinite loop.
      // exactOffset is known-exact (from countBefore) — same as the seek()
      // exact-offset path.
      const seekTargetGlobalIndex = (() => {
        const inTwoTier =
          POSITION_MAP_THRESHOLD > 0 &&
          buf.total > SCROLL_MODE_THRESHOLD &&
          buf.total <= POSITION_MAP_THRESHOLD;
        // In scroll mode (total ≤ SCROLL_MODE_THRESHOLD) the virtualizer is
        // 1:1 with the buffer, so -1 (buffer-local) is correct. In three-tier
        // (total > POSITION_MAP_THRESHOLD) the seek pipeline handles its own
        // scrollTop computation. Only two-tier needs the explicit global index.
        return inTwoTier ? exactOffset : -1;
      })();

      set({
        results: buf.combinedHits,
        bufferOffset: buf.bufferStart,
        total: buf.total,
        loading: false,
        imagePositions: buildPositions(buf.combinedHits, buf.bufferStart),
        startCursor: buf.startCursor,
        endCursor: buf.endCursor,
        pitId: buf.pitId,
        _extendForwardInFlight: false,
        _extendBackwardInFlight: false,
        _seekGeneration: get()._seekGeneration + 1,
        _seekTargetLocalIndex: buf.targetLocalIndex,
        _seekTargetGlobalIndex: seekTargetGlobalIndex,
        _seekSubRowOffset: 0,
      });

      devLog(
        `[restoreAroundCursor] OK: imageId=${imageId}, exactOffset=${exactOffset}, ` +
        `bufferStart=${buf.bufferStart}, targetLocal=${buf.targetLocalIndex}, ` +
        `hits=${buf.combinedHits.length}`,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.warn("[restoreAroundCursor] Failed, falling back to seek:", e);
      // Fall back to approximate seek on any error
      set({ loading: false });
      try {
        return get().seek(cachedOffset);
      } catch {
        // Both paths failed — standalone mode
      }
    }
  },

  // -------------------------------------------------------------------------
  // Aggregation actions (unchanged from pre-buffer architecture)
  // -------------------------------------------------------------------------

  fetchAggregations: async (force) => {
    const { dataSource, aggCircuitOpen, _aggCacheKey } = get();

    const key = aggCacheKey(frozenParams(get().params, get));
    if (!force && key === _aggCacheKey) return;
    if (!force && aggCircuitOpen) return;

    if (_aggDebounceTimer) clearTimeout(_aggDebounceTimer);
    if (_aggAbortController) _aggAbortController.abort();

    if (!force) {
      await new Promise<void>((resolve) => {
        _aggDebounceTimer = setTimeout(resolve, AGG_DEBOUNCE_MS);
      });
    }

    const currentKey = aggCacheKey(frozenParams(get().params, get));
    if (!force && currentKey === get()._aggCacheKey) return;

    _aggAbortController = new AbortController();
    set({ aggLoading: true });

    const startTime = performance.now();

    try {
      const result = await dataSource.getAggregations(
        frozenParams(get().params, get),
        AGG_FIELDS,
        _aggAbortController.signal,
      );

      const elapsed = performance.now() - startTime;

      set({
        aggregations: result,
        aggTook: result.took ?? null,
        aggLoading: false,
        _aggCacheKey: aggCacheKey(frozenParams(get().params, get)),
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
    const { dataSource, expandedAggs, expandedAggsLoading } = get();

    if (expandedAggs[field] || expandedAggsLoading.has(field)) return;

    // Abort any previous expanded agg request and create a fresh controller.
    // Aborted by search() when a new search starts. See es-audit.md Issue #4.
    if (_expandedAggAbortController) _expandedAggAbortController.abort();
    _expandedAggAbortController = new AbortController();
    const signal = _expandedAggAbortController.signal;

    set({ expandedAggsLoading: new Set([...expandedAggsLoading, field]) });

    try {
      const result = await dataSource.getAggregations(
        frozenParams(get().params, get),
        [{ field, size: AGG_EXPANDED_SIZE }],
        signal,
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
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        set((state) => {
          const newLoading = new Set(state.expandedAggsLoading);
          newLoading.delete(field);
          return { expandedAggsLoading: newLoading };
        });
        return;
      }
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

  fetchSortDistribution: async () => {
    const { dataSource, params, _sortDistCacheKey } = get();

    // Check cache — skip if already fetched for this query + sort
    const key = sortDistCacheKey(params);
    if (key === _sortDistCacheKey) return;

    // Determine sort type — keyword or date
    const kwInfo = resolveKeywordSortInfo(params.orderBy);
    const dateInfo = resolveDateSortInfo(params.orderBy);
    if (!kwInfo && !dateInfo) return; // Not a distributable sort (e.g. script sort)

    // Abort previous in-flight request
    if (_sortDistAbortController) _sortDistAbortController.abort();
    _sortDistAbortController = new AbortController();

    try {
      let dist: SortDistribution | null = null;

      if (kwInfo && dataSource.getKeywordDistribution) {
        dist = await dataSource.getKeywordDistribution(
          params, kwInfo.field, kwInfo.direction,
          _sortDistAbortController.signal,
        );
      } else if (dateInfo && dataSource.getDateDistribution) {
        dist = await dataSource.getDateDistribution(
          params, dateInfo.field, dateInfo.direction,
          _sortDistAbortController.signal,
        );
      }

      // Guard: params may have changed while awaiting
      if (sortDistCacheKey(get().params) !== key) return;

      set({
        sortDistribution: dist,
        _sortDistCacheKey: key,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.warn("[search-store] fetchSortDistribution failed:", e);
    }
  },

  fetchNullZoneDistribution: async () => {
    const { dataSource, params, sortDistribution, _nullZoneDistCacheKey } = get();

    // Only fetch if there's a null zone (coveredCount < total)
    if (!sortDistribution || sortDistribution.coveredCount >= get().total) return;
    // Only relevant for non-uploadTime sorts (uploadTime is universal — no null zone)
    const sortKey = resolvePrimarySortKey(params.orderBy);
    if (!sortKey || sortKey === "uploadTime") return;
    if (!dataSource.getDateDistribution) return;

    // Cache key: same query params, always uploadTime, direction from sort
    const dateInfo = resolveDateSortInfo(params.orderBy);
    const kwInfo = resolveKeywordSortInfo(params.orderBy);
    const direction = dateInfo?.direction ?? "desc";
    const key = aggCacheKey(params) + `|nullzone:uploadTime:${direction}`;
    if (key === _nullZoneDistCacheKey) return;

    // Abort previous in-flight
    if (_nullZoneDistAbortController) _nullZoneDistAbortController.abort();
    _nullZoneDistAbortController = new AbortController();

    try {
      // Fetch the uploadTime distribution for NULL-ZONE DOCS ONLY.
      // The extra filter narrows to docs where the primary sort field is
      // missing — exactly the null-zone population. This gives accurate
      // bucket positions (no scaling needed). Without this filter, the
      // distribution covers all docs and positions are linearly scaled
      // by nullZoneSize/total — wildly inaccurate because null-zone docs
      // have a different uploadTime distribution than non-null docs.
      const primaryField = dateInfo?.field ?? kwInfo?.field ?? null;
      const nullZoneFilter = primaryField
        ? { bool: { must_not: { exists: { field: primaryField } } } }
        : undefined;

      const dist = await dataSource.getDateDistribution(
        params, "uploadTime", direction,
        _nullZoneDistAbortController.signal,
        nullZoneFilter,
      );

      // Guard: params may have changed while awaiting
      if (aggCacheKey(get().params) + `|nullzone:uploadTime:${direction}` !== key) return;

      if (dist) {
        const nullZoneSize = get().total - (get().sortDistribution?.coveredCount ?? 0);

        if (nullZoneSize > 0 && dist.coveredCount > 0) {
          // The distribution is already filtered to null-zone docs only,
          // so bucket positions are accurate — no scaling needed.
          set({
            nullZoneDistribution: {
              buckets: dist.buckets,
              coveredCount: dist.coveredCount,
            },
            _nullZoneDistCacheKey: key,
          });
        } else {
          set({ nullZoneDistribution: null, _nullZoneDistCacheKey: key });
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.warn("[search-store] fetchNullZoneDistribution failed:", e);
    }
  },
}));

// Expose store on window in dev mode for E2E test state inspection.
// Playwright tests use window.__kupua_store__ to read buffer state,
// focused image, and other internals without relying on DOM scraping.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_store__ = useSearchStore;
}

