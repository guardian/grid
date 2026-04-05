/**
 * Data window hook — the shared interface between the search store and view
 * components (ImageTable, ImageGrid, ImageDetail).
 *
 * ## Why this exists
 *
 * This hook mediates between the search store (which manages a windowed buffer
 * of ES results) and view components (which render them). It provides:
 *
 * 1. **Buffer-aware data access** — `getImage(index)` accepts a buffer-local
 *    index and returns the image, or undefined if that slot hasn't been loaded.
 *
 * 2. **Edge detection + extend triggers** — `reportVisibleRange(start, end)`
 *    tells the hook which buffer-local indices are on screen. When the viewport
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
 * with `bufferOffset` mapping buffer[0] to a global position. Views work
 * with buffer-local indices (0 to results.length). When they need global
 * positions (e.g. for the image counter "X of Y"), they add `bufferOffset`.
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";

/** How close to the buffer edge before triggering an extend (buffer-local indices). */
const EXTEND_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Post-seek backward extend suppression — REMOVED (Agent 10)
//
// A module-level flag previously blocked extendBackward after seek to prevent
// swimming. Removed because it also prevented scrolling UP. Now relying on
// SEEK_COOLDOWN_MS + POST_EXTEND_COOLDOWN_MS only. See changelog 5 Apr 2026.
// ---------------------------------------------------------------------------

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
  /** Number of rows the virtualizer should render (= buffer length). */
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
   * Report the currently visible buffer-local index range. The hook will
   * detect proximity to buffer edges and trigger extend operations.
   */
  reportVisibleRange: (startIndex: number, endIndex: number) => void;
  /** Get the image at a buffer-local index, or undefined if not loaded. */
  getImage: (index: number) => Image | undefined;
  /** Find the buffer-local index of an image by ID, or -1 if not in the buffer. */
  findImageIndex: (imageId: string) => number;
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

  // The virtualizer count is simply the buffer length.
  // When no results have loaded yet, use 0.
  const virtualizerCount = results.length;

  // Use refs for values needed in the callback to keep it stable
  const bufferOffsetRef = useRef(bufferOffset);
  bufferOffsetRef.current = bufferOffset;
  const resultsLenRef = useRef(results.length);
  resultsLenRef.current = results.length;
  const totalRef = useRef(total);
  totalRef.current = total;

  const reportVisibleRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const offset = bufferOffsetRef.current;
      const len = resultsLenRef.current;
      const t = totalRef.current;

      // Update module-level visible range for Scrubber (useSyncExternalStore)
      if (startIndex !== _visibleStart || endIndex !== _visibleEnd) {
        _visibleStart = startIndex;
        _visibleEnd = endIndex;
        _notifyVisibleListeners();
      }

      // Near the end of the buffer → extend forward
      if (endIndex >= len - EXTEND_THRESHOLD && offset + len < t) {
        extendForward();
      }

      // Near the start of the buffer → extend backward
      //
      // APPROACH #4 (Agent 10): Removed _postSeekBackwardSuppress flag.
      // Previously, a flag blocked extendBackward after seek until the user
      // scrolled past EXTEND_THRESHOLD (~7 rows). This prevented swimming
      // but also prevented scrolling UP after seek. With the 700ms cooldown
      // (SEEK_COOLDOWN_MS) blocking ALL extends post-seek, and the deferred
      // scroll firing at 800ms (after the virtualizer has settled), the
      // first extendBackward should happen in a stable state where
      // useLayoutEffect compensation is invisible. If swimming returns,
      // increase SEEK_COOLDOWN_MS — don't re-add the flag.
      if (startIndex <= EXTEND_THRESHOLD && offset > 0) {
        extendBackward();
      }
    },
    [extendForward, extendBackward],
  );

  const getImage = useCallback(
    (index: number): Image | undefined => {
      if (index < 0 || index >= results.length) return undefined;
      return results[index];
    },
    [results],
  );

  /**
   * Find the buffer-local index of an image by ID.
   * Returns -1 if the image is not in the current buffer.
   */
  const findImageIndex = useCallback(
    (imageId: string): number => {
      const globalIdx = imagePositions.get(imageId);
      if (globalIdx == null) return -1;
      const localIdx = globalIdx - bufferOffset;
      if (localIdx < 0 || localIdx >= results.length) return -1;
      return localIdx;
    },
    [imagePositions, bufferOffset, results.length],
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
  };
}
