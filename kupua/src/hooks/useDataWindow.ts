/**
 * Data window hook — the shared interface between the search store and view
 * components (ImageTable, ImageGrid, ImageDetail).
 *
 * ## Why this exists
 *
 * This hook mediates between the search store (which manages a windowed buffer
 * of ES results) and view components (which render them). It provides:
 *
 * 1. **Buffer-aware data access** — `getImage(index)` accepts an index and
 *    returns the image, or undefined if that slot hasn't been loaded.
 *    In normal mode, indices are buffer-local. In two-tier mode, indices
 *    are global (the virtualizer spans all `total` items).
 *
 * 2. **Edge detection + extend triggers** — `reportVisibleRange(start, end)`
 *    tells the hook which indices are on screen. When the viewport
 *    approaches the buffer boundaries, the hook triggers `extendForward` or
 *    `extendBackward` to fetch more data.
 *
 * 3. **Density-independent API** — table, grid, and image detail all consume
 *    the same hook. Switching density swaps the render component; the data
 *    window, focus, and buffer state persist.
 *
 * ## Buffer model
 *
 * The store holds a fixed-capacity buffer (`results[]`, max ~1000 entries)
 * with `bufferOffset` mapping buffer[0] to a global position.
 *
 * ### Normal mode (`twoTier = false`)
 * Views work with buffer-local indices (0 to results.length). When they need
 * global positions (e.g. for the image counter "X of Y"), they add `bufferOffset`.
 *
 * ### Two-tier mode (`twoTier = true`, when total is in the position-map-eligible range)
 * `virtualizerCount = total`, so the scroll container spans all items.
 * Indices from the virtualizer are global (0..total-1). `getImage()` maps
 * global→buffer-local internally. Cells outside the buffer show skeletons.
 * The scrubber drag directly scrolls the container (like a real scrollbar).
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import { useSearchStore } from "@/stores/search-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import {
  PAGE_SIZE,
  EXTEND_THRESHOLD,
  VELOCITY_EMA_ALPHA,
  VELOCITY_LOOKAHEAD_MS,
  VELOCITY_IDLE_RESET_MS,
} from "@/constants/tuning";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Velocity-aware forward-extend trigger
//
// Today the forward extend fires when the viewport's endIndex is within
// EXTEND_THRESHOLD items of the buffer end. At sustained fast wheel velocity
// the user eats that headroom in less than the ES round-trip (~100-500ms),
// so the browser pins scrollTop at the bottom of the buffer until the
// extend completes. To mitigate this, we track an EMA-smoothed velocity
// (items/ms) and predict where the viewport will be in LOOKAHEAD_MS. The
// effective forward threshold widens with velocity, capped at PAGE_SIZE
// (no benefit beyond "one fetch in flight").
//
// Forward-only by design. Backward extends pair with prepend compensation
// — the central swimming risk — and we leave them strictly alone.
//
// Constants live in constants/tuning.ts.
// ---------------------------------------------------------------------------

/** Module-level velocity state. Reset on idle gap > VELOCITY_IDLE_RESET_MS. */
let _lastReportTime = 0;
let _lastEndIndex = 0;
/** EMA-smoothed velocity in items/ms. Signed; negative = scrolling up. */
let _velocityEma = 0;

/**
 * Compute the EMA-smoothed forward velocity (items/ms) given the current
 * viewport endIndex and timestamp. Pure — separated for testability.
 */
export function _updateForwardVelocity(
  endIndex: number,
  now: number,
  prevTime: number,
  prevEndIndex: number,
  prevEma: number,
): number {
  const dt = now - prevTime;
  if (prevTime === 0 || dt <= 0 || dt > VELOCITY_IDLE_RESET_MS) {
    // Fresh start, idle reset, or non-monotonic clock — drop the sample.
    return 0;
  }
  const instant = (endIndex - prevEndIndex) / dt;
  return VELOCITY_EMA_ALPHA * instant + (1 - VELOCITY_EMA_ALPHA) * prevEma;
}

/**
 * Compute the effective forward-extend threshold given current EMA velocity.
 * Returns at least EXTEND_THRESHOLD; widens proportionally to predicted
 * forward travel during one extend round-trip; caps at PAGE_SIZE.
 *
 * Pure — separated for testability.
 */
export function forwardExtendThreshold(velocityEma: number): number {
  // Only widen on positive (downward) velocity. Negative (scrolling up)
  // gets the base threshold — the forward extend isn't the relevant trigger.
  const lookaheadItems = Math.max(0, velocityEma) * VELOCITY_LOOKAHEAD_MS;
  return Math.min(PAGE_SIZE, EXTEND_THRESHOLD + lookaheadItems);
}

/** Test-only: reset velocity state. */
export function _resetForwardVelocity(): void {
  _lastReportTime = 0;
  _lastEndIndex = 0;
  _velocityEma = 0;
}

/**
 * Debounce delay for scroll-triggered seeks in two-tier mode (ms).
 * When the user scrolls (wheel/trackpad or scrubber drag) past the buffer,
 * we wait this long before firing a seek — coalesces rapid scroll events.
 * The existing seek abort pattern handles concurrent seeks, but rapid fire
 * without debounce causes flicker.
 */
const SCROLL_SEEK_DEBOUNCE_MS = 200;

/** Module-level debounce timer for scroll-triggered seek. */
let _scrollSeekTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Post-seek backward extend suppression — REMOVED (Agent 10)
//
// A module-level flag previously blocked extendBackward after seek to prevent
// swimming. Removed because it also prevented scrolling UP. Now relying on
// SEEK_COOLDOWN_MS + POST_EXTEND_COOLDOWN_MS only. See changelog 5 Apr 2026.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Viewport anchor — always the image nearest the viewport centre.
//
// Used by density-focus and sort-around-focus as a fallback when
// focusedImageId is null. Updated on every reportVisibleRange call.
// NOT a React subscription — consumed imperatively by useScrollEffects
// and useUrlSearchSync via getViewportAnchorId().
// ---------------------------------------------------------------------------

let _viewportAnchorId: string | null = null;

/**
 * Get the current viewport-centre image ID. Returns null if no images
 * have been rendered yet. Used as a fallback scroll anchor when the
 * user hasn't explicitly focused an image.
 */
export function getViewportAnchorId(): string | null {
  return _viewportAnchorId;
}

/**
 * Clear the viewport anchor. Call alongside resetVisibleRange() when
 * resetting all scroll state (e.g. logo click / go home).
 */
export function resetViewportAnchor(): void {
  _viewportAnchorId = null;
}

/**
 * Get the IDs of images currently visible in the viewport, ordered by
 * distance from the viewport centre (nearest first). Excludes the
 * viewport anchor itself (it's already the primary search target).
 * Used by phantom focus promotion to restrict neighbour fallback to
 * images the user actually saw.
 */
export function getVisibleImageIds(): string[] {
  const { results, bufferOffset } = useSearchStore.getState();
  const ids: string[] = [];
  const centre = Math.round((_visibleStart + _visibleEnd) / 2);
  const half = Math.ceil((_visibleEnd - _visibleStart) / 2) + 1;

  for (let d = 1; d <= half; d++) {
    for (const i of [centre + d, centre - d]) {
      if (i < _visibleStart || i > _visibleEnd) continue;
      // In two-tier mode indices are global; in normal mode buffer-local.
      const localIdx = i - bufferOffset;
      if (localIdx < 0 || localIdx >= results.length) continue;
      const img = results[localIdx];
      if (img?.id) ids.push(img.id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Visible-range external store (module-level, no React re-renders on write)
// ---------------------------------------------------------------------------

/** Current buffer-local visible start index (set by reportVisibleRange). */
let _visibleStart = 0;
/** Current buffer-local visible end index. */
let _visibleEnd = 0;
/** Cached snapshot object — replaced only when values change. */
let _visibleSnapshot = { start: 0, end: 0 };
/** Listeners for useSyncExternalStore. */
const _visibleListeners = new Set<() => void>();

function _notifyVisibleListeners() {
  _visibleSnapshot = { start: _visibleStart, end: _visibleEnd };
  for (const fn of _visibleListeners) fn();
}

function _subscribeVisible(listener: () => void) {
  _visibleListeners.add(listener);
  return () => { _visibleListeners.delete(listener); };
}

function _getVisibleSnapshot(): { start: number; end: number } {
  return _visibleSnapshot;
}

/**
 * React hook that returns the current buffer-local visible range.
 * Re-renders only when the range actually changes (i.e. on scroll).
 * Used by the Scrubber to track thumb position without polling.
 */
export function useVisibleRange(): { start: number; end: number } {
  return useSyncExternalStore(_subscribeVisible, _getVisibleSnapshot, _getVisibleSnapshot);
}

/**
 * Imperatively reset the visible range to 0. Call this alongside
 * programmatic scroll resets (e.g. logo click) to ensure the
 * Scrubber thumb immediately reflects position 0 without waiting
 * for a scroll event.
 */
export function resetVisibleRange(): void {
  if (_visibleStart !== 0 || _visibleEnd !== 0) {
    _visibleStart = 0;
    _visibleEnd = 0;
    _notifyVisibleListeners();
  }
}

export interface DataWindow {
  /** Windowed buffer of loaded images (may have undefined gaps during loading). */
  results: (Image | undefined)[];
  /** Global offset of buffer[0] in the full result set. */
  bufferOffset: number;
  /** Total number of matching images in ES (may be >> buffer size). */
  total: number;
  /** Number of items the virtualizer should render. In two-tier mode = total; otherwise = buffer length. */
  virtualizerCount: number;
  /** Whether a search or seek is currently in flight. */
  loading: boolean;
  /** Last error message, or null. */
  error: string | null;
  /** Extend the buffer forward (append pages). */
  extendForward: () => Promise<void>;
  /** Extend the buffer backward (prepend pages). */
  extendBackward: () => Promise<void>;
  /** Seek to a global offset — clear buffer and refill at that position. */
  seek: (globalOffset: number) => Promise<void>;
  /** @deprecated Alias for extendForward — kept for view compatibility. */
  loadMore: () => Promise<void>;
  /** The currently focused image ID (single, ephemeral). */
  focusedImageId: string | null;
  /** Set the focused image ID. */
  setFocusedImageId: (id: string | null) => void;
  /**
   * Report the currently visible index range. In normal mode, indices are
   * buffer-local. In two-tier mode, indices are global (0..total-1).
   * The hook detects proximity to buffer edges and triggers extend/seek.
   */
  reportVisibleRange: (startIndex: number, endIndex: number) => void;
  /**
   * Get the image at an index, or undefined if not loaded.
   * In normal mode: buffer-local index. In two-tier mode: global index
   * (returns undefined for positions outside the buffer window).
   */
  getImage: (index: number) => Image | undefined;
  /**
   * Find the index of an image by ID.
   * In normal mode: buffer-local index, or -1 if not in the buffer.
   * In two-tier mode: global index, or -1 if not in the position map.
   */
  findImageIndex: (imageId: string) => number;
  /**
   * Whether two-tier virtualisation is active. When true, the virtualizer
   * spans all `total` items (not just the buffer), indices are global,
   * and the scrubber drag directly scrolls the container.
   * Derived from total range (`SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD`).
   */
  twoTier: boolean;
}

/**
 * Provides the data window for view components.
 *
 * Usage:
 * ```ts
 * const {
 *   results, total, bufferOffset, virtualizerCount, loading,
 *   extendForward, extendBackward, loadMore,
 *   focusedImageId, setFocusedImageId,
 *   reportVisibleRange, getImage, findImageIndex,
 * } = useDataWindow();
 * ```
 */
export function useDataWindow(): DataWindow {
  const results = useSearchStore((s) => s.results);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);
  const total = useSearchStore((s) => s.total);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const extendForward = useSearchStore((s) => s.extendForward);
  const extendBackward = useSearchStore((s) => s.extendBackward);
  const seek = useSearchStore((s) => s.seek);
  const loadMore = useSearchStore((s) => s.loadMore);
  const focusedImageId = useSearchStore((s) => s.focusedImageId);
  const setFocusedImageId = useSearchStore((s) => s.setFocusedImageId);
  const imagePositions = useSearchStore((s) => s.imagePositions);

  // ---------------------------------------------------------------------------
  // Two-tier virtualisation
  //
  // Two-tier mode is active when total is in the position-map-eligible range
  // (SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD). The virtualizer
  // spans all `total` items from the very first render — indices are global,
  // cells outside the buffer show skeletons, the buffer slides via extends
  // and seeks.
  //
  // IMPORTANT: twoTier is derived from total, NOT from positionMap being
  // loaded. The position map is a performance optimization (faster seeks);
  // twoTier is the coordinate-space decision. Deriving from positionMap
  // caused a late coordinate-space flip when the map arrived after a seek
  // (scrollHeight jumped from ~13k to ~2.6M, scrollTop stayed put → all
  // cells showed skeletons forever). By basing on total, the coordinate
  // space is stable from frame 1.
  //
  // When twoTier is false (total ≤ SCROLL_MODE_THRESHOLD or > threshold),
  // everything is identical to the pre-two-tier behaviour — buffer-local
  // indices, buffer-length virtualizer count, buffer-mode scrubber.
  // ---------------------------------------------------------------------------
  const twoTier = useSearchStore((s) => isTwoTierFromTotal(s.total));

  // In two-tier mode, the virtualizer spans all items. In normal mode, just
  // the buffer length.
  const virtualizerCount = twoTier ? total : results.length;

  // Use refs for values needed in the callback to keep it stable
  const bufferOffsetRef = useRef(bufferOffset);
  bufferOffsetRef.current = bufferOffset;
  const resultsLenRef = useRef(results.length);
  resultsLenRef.current = results.length;
  const totalRef = useRef(total);
  totalRef.current = total;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const focusedImageIdRef = useRef(focusedImageId);
  focusedImageIdRef.current = focusedImageId;
  const twoTierRef = useRef(twoTier);
  twoTierRef.current = twoTier;
  const seekRef = useRef(seek);
  seekRef.current = seek;

  const reportVisibleRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const offset = bufferOffsetRef.current;
      const len = resultsLenRef.current;
      const t = totalRef.current;
      const isTwoTier = twoTierRef.current;

      // Update module-level visible range for Scrubber (useSyncExternalStore)
      if (startIndex !== _visibleStart || endIndex !== _visibleEnd) {
        _visibleStart = startIndex;
        _visibleEnd = endIndex;
        _notifyVisibleListeners();
      }

      // Velocity-aware adaptive forward-extend threshold.
      // Tracks EMA of items/ms (forward velocity) and widens the trigger
      // threshold so a fast wheel/trackpad burst fires extendForward early
      // enough that the round-trip completes before the viewport hits the
      // buffer's bottom. Forward-only — backward extend keeps the static
      // EXTEND_THRESHOLD because prepend compensation is the swimming risk.
      const now = performance.now();
      _velocityEma = _updateForwardVelocity(
        endIndex, now, _lastReportTime, _lastEndIndex, _velocityEma,
      );
      _lastReportTime = now;
      _lastEndIndex = endIndex;
      const fwdThreshold = forwardExtendThreshold(_velocityEma);

      if (isTwoTier) {
        // --- Two-tier mode: indices are global (0..total-1) ---
        // Extend triggers use buffer-relative thresholds:
        // fire only when the viewport overlaps or is near the buffer.
        // When viewport is entirely outside the buffer, fire a debounced
        // seek to reposition the buffer — extends can't bridge the gap.
        const globalStart = startIndex;
        const globalEnd = endIndex;

        const viewportOverlapsOrNearBuffer =
          globalEnd > offset - EXTEND_THRESHOLD &&
          globalStart < offset + len + EXTEND_THRESHOLD;

        if (viewportOverlapsOrNearBuffer) {
          // Cancel any pending scroll-triggered seek — the viewport is
          // back near the buffer, extends can handle it.
          if (_scrollSeekTimer) {
            clearTimeout(_scrollSeekTimer);
            _scrollSeekTimer = null;
          }
          // Near the end of the buffer → extend forward
          if (globalEnd > offset + len - fwdThreshold && offset + len < t) {
            extendForward();
          }
          // Near the start of the buffer → extend backward
          if (globalStart < offset + EXTEND_THRESHOLD && offset > 0) {
            extendBackward();
          }
        } else {
          // Viewport entirely outside buffer — debounced seek to reposition.
          // Skip extends — they work in PAGE_SIZE increments from buffer
          // edges and can't bridge a gap of thousands of positions.
          if (_scrollSeekTimer) clearTimeout(_scrollSeekTimer);
          _scrollSeekTimer = setTimeout(() => {
            _scrollSeekTimer = null;
            seekRef.current(globalStart);
          }, SCROLL_SEEK_DEBOUNCE_MS);
          // Skip viewport anchor update — viewport is showing skeletons,
          // no valid anchor available.
          return;
        }
      } else {
        // --- Normal mode: indices are buffer-local ---
        // Near the end of the buffer → extend forward (velocity-widened)
        if (endIndex >= len - fwdThreshold && offset + len < t) {
          extendForward();
        }

        // Near the start of the buffer → extend backward
        //
        // APPROACH #4 (Agent 10): Removed _postSeekBackwardSuppress flag.
        // Previously, a flag blocked extendBackward after seek until the user
        // scrolled past EXTEND_THRESHOLD (~7 rows). This prevented swimming
        // but also prevented scrolling UP after seek. With the 100ms cooldown
        // (SEEK_COOLDOWN_MS) blocking ALL extends post-seek, and the deferred
        // scroll firing at 150ms (after the virtualizer has settled), the
        // first extendBackward should happen in a stable state where
        // useLayoutEffect compensation is invisible. If swimming returns,
        // increase SEEK_COOLDOWN_MS — don't re-add the flag.
        if (startIndex <= EXTEND_THRESHOLD && offset > 0) {
          extendBackward();
        }
      }

      // Update the viewport anchor — nearest image to the viewport centre.
      // In explicit mode, focus always wins as anchor so skip the update.
      // In phantom mode, always update — focusedImageId may be set (e.g.
      // after return-from-detail) but it's invisible and the user may have
      // scrolled far away from it.
      const currentResults = resultsRef.current;
      if (currentResults.length > 0 && (getEffectiveFocusMode() === "phantom" || !focusedImageIdRef.current)) {
        const midPoint = (startIndex + endIndex) / 2;
        // In two-tier mode, convert global midpoint to buffer-local
        const localMid = isTwoTier
          ? Math.round(midPoint) - offset
          : Math.round(midPoint);
        // If outside buffer (viewport showing skeletons), skip — no anchor
        if (localMid < 0 || localMid >= currentResults.length) return;
        const anchorIndex = Math.min(Math.max(0, localMid), currentResults.length - 1);
        const anchorImage = currentResults[anchorIndex];
        if (anchorImage) {
          _viewportAnchorId = anchorImage.id;
        }
      }
    },
    [extendForward, extendBackward],
  );

  const getImage = useCallback(
    (index: number): Image | undefined => {
      if (twoTier) {
        // Two-tier: index is global. Map to buffer-local.
        const localIdx = index - bufferOffset;
        if (localIdx < 0 || localIdx >= results.length) return undefined;
        return results[localIdx];
      }
      // Normal: index is buffer-local
      if (index < 0 || index >= results.length) return undefined;
      return results[index];
    },
    [results, twoTier, bufferOffset],
  );

  /**
   * Find the index of an image by ID.
   * Normal mode: returns buffer-local index, or -1 if not in the buffer.
   * Two-tier mode: returns global index, or -1 if not in imagePositions.
   */
  const findImageIndex = useCallback(
    (imageId: string): number => {
      const globalIdx = imagePositions.get(imageId);
      if (globalIdx == null) return -1;
      if (twoTier) {
        // Two-tier: return global index directly (the virtualizer uses global)
        return globalIdx;
      }
      // Normal: return buffer-local index
      const localIdx = globalIdx - bufferOffset;
      if (localIdx < 0 || localIdx >= results.length) return -1;
      return localIdx;
    },
    [imagePositions, bufferOffset, results.length, twoTier],
  );

  return {
    results,
    bufferOffset,
    total,
    virtualizerCount,
    loading,
    error,
    extendForward,
    extendBackward,
    seek,
    loadMore,
    focusedImageId,
    setFocusedImageId,
    reportVisibleRange,
    getImage,
    findImageIndex,
    twoTier,
  };
}

// Expose viewport-anchor helpers on window in dev mode for E2E inspection.
// Smoke tests need the real anchor ID (set by the virtualizer) rather than
// re-deriving it from pixel math, which diverges in two-tier mode.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_getViewportAnchorId__ = getViewportAnchorId;
  (window as unknown as Record<string, unknown>).__kupua_getVisibleImageIds__ = getVisibleImageIds;
}
