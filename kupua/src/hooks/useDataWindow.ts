/**
 * Data window hook — the shared interface between the search store and view
 * components (ImageTable, ImageDetail, future ImageGrid).
 *
 * ## Why this exists
 *
 * This hook mediates between the search store (which manages raw ES results)
 * and view components (which render them). It provides:
 *
 * 1. **Sparse data access** — `getImage(index)` returns the image at a global
 *    index, or undefined if that slot hasn't been loaded yet. Views render
 *    placeholder skeletons for undefined slots.
 *
 * 2. **Gap detection + range loading** — `reportVisibleRange(start, end)` tells
 *    the hook which indices are currently on screen. The hook detects gaps
 *    (unloaded slots) in that range and fires `loadRange()` requests to fill
 *    them, with debouncing to avoid flooding during fast scroll.
 *
 * 3. **Density-independent API** — table, grid, and image detail all consume
 *    the same hook. Switching density swaps the render component; the data
 *    window, focus, and loaded ranges persist.
 *
 * ## What belongs here vs. in the search store
 *
 * - **Here:** sparse data access, gap detection, visible range tracking,
 *   debounced loading, focus, and helpers for navigation (prev/next image).
 * - **Search store:** raw results array, params, search(), loadMore(),
 *   loadRange(), dataSource, newCount/ticker, frozenUntil.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";

/**
 * Maximum rows addressable via native scrollbar + from/size pagination.
 * Must match MAX_RESULT_WINDOW in search-store.ts.
 */
const MAX_SPARSE_ROWS = 100_000;

/** Debounce delay for gap detection after visible range changes (ms). */
const GAP_DETECT_DELAY = 80;

/** How many extra rows to load on each side of the visible range (buffer). */
const LOAD_OVERSCAN = 50;

/** Maximum number of rows to request in a single loadRange call. */
const MAX_RANGE_SIZE = 200;

export interface DataWindow {
  /** Loaded images in display order (may have undefined gaps). */
  results: (Image | undefined)[];
  /** Total number of matching images (may be >> loaded count). */
  total: number;
  /** Number of rows the virtualizer should render (min(total, cap)). */
  virtualizerCount: number;
  /** Whether a search or loadMore is currently in flight. */
  loading: boolean;
  /** Last error message, or null. */
  error: string | null;
  /** Load the next page of results (append-only, for backward compat). */
  loadMore: () => Promise<void>;
  /** The currently focused image ID (single, ephemeral). */
  focusedImageId: string | null;
  /** Set the focused image ID. */
  setFocusedImageId: (id: string | null) => void;
  /**
   * Report the currently visible index range. The hook will detect gaps
   * (unloaded slots) and fire loadRange requests to fill them.
   * Call this from the scroll handler with the virtualizer's visible range.
   */
  reportVisibleRange: (startIndex: number, endIndex: number) => void;
  /** Get the image at a global index, or undefined if not loaded. */
  getImage: (index: number) => Image | undefined;
  /** Find the global index of an image by ID, or -1 if not loaded. */
  findImageIndex: (imageId: string) => number;
}

/**
 * Provides the data window for view components.
 *
 * Usage:
 * ```ts
 * const {
 *   results, total, virtualizerCount, loading, loadMore,
 *   focusedImageId, setFocusedImageId,
 *   reportVisibleRange, getImage, findImageIndex,
 * } = useDataWindow();
 * ```
 */
export function useDataWindow(): DataWindow {
  const results = useSearchStore((s) => s.results);
  const total = useSearchStore((s) => s.total);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const loadMore = useSearchStore((s) => s.loadMore);
  const loadRange = useSearchStore((s) => s.loadRange);
  const focusedImageId = useSearchStore((s) => s.focusedImageId);
  const setFocusedImageId = useSearchStore((s) => s.setFocusedImageId);

  // The number of rows the virtualizer should create.
  // When results haven't arrived yet (empty array), use 0 — don't pre-size
  // to 100k placeholders before we have any data (causes a flash of empty table).
  // Once at least one page is loaded, cap at MAX_SPARSE_ROWS so the native
  // scrollbar represents the full addressable range.
  const virtualizerCount = results.length === 0 ? 0 : Math.min(total, MAX_SPARSE_ROWS);

  // --- Gap detection + range loading ---

  // Ref to track the last reported visible range (avoid redundant work)
  const visibleRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs for values needed in the debounced callback to avoid
  // re-creating the callback on every render
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const totalRef = useRef(total);
  totalRef.current = total;

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    };
  }, []);

  const reportVisibleRange = useCallback(
    (startIndex: number, endIndex: number) => {
      visibleRangeRef.current = { start: startIndex, end: endIndex };

      // Debounce gap detection — during fast scrolling we don't want to
      // fire a loadRange for every scroll frame
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
      gapTimerRef.current = setTimeout(() => {
        const currentResults = resultsRef.current;
        const currentTotal = totalRef.current;
        const cap = Math.min(currentTotal, MAX_SPARSE_ROWS);

        // Expand range with overscan buffer
        const rangeStart = Math.max(0, startIndex - LOAD_OVERSCAN);
        const rangeEnd = Math.min(cap - 1, endIndex + LOAD_OVERSCAN);

        // Find gaps (undefined slots) in the expanded range
        let gapStart: number | null = null;
        for (let i = rangeStart; i <= rangeEnd; i++) {
          const isLoaded = i < currentResults.length && currentResults[i] != null;

          if (!isLoaded && gapStart === null) {
            gapStart = i;
          }

          if ((isLoaded || i === rangeEnd) && gapStart !== null) {
            const gapEnd = isLoaded ? i - 1 : i;
            // Break large gaps into chunks of MAX_RANGE_SIZE
            for (let chunkStart = gapStart; chunkStart <= gapEnd; chunkStart += MAX_RANGE_SIZE) {
              const chunkEnd = Math.min(chunkStart + MAX_RANGE_SIZE - 1, gapEnd);
              loadRange(chunkStart, chunkEnd);
            }
            gapStart = null;
          }
        }
      }, GAP_DETECT_DELAY);
    },
    [loadRange],
  );

  // --- O(1) image ID → index lookup ---
  // Build a Map<imageId, index> from the results array. This avoids the
  // O(n) linear scan that caused 7-second stalls when the sparse array
  // had 100k entries. Only iterates defined entries (using for...in which
  // skips sparse array holes), so it's O(loaded) not O(array.length).
  const imagePositions = useMemo(() => {
    const map = new Map<string, number>();
    // for...in on an array iterates only defined indices (skips holes)
    for (const key in results) {
      const idx = Number(key);
      const img = results[idx];
      if (img?.id) {
        map.set(img.id, idx);
      }
    }
    return map;
  }, [results]);

  const getImage = useCallback(
    (index: number): Image | undefined => {
      if (index < 0 || index >= results.length) return undefined;
      return results[index];
    },
    [results],
  );

  const findImageIndex = useCallback(
    (imageId: string): number => {
      return imagePositions.get(imageId) ?? -1;
    },
    [imagePositions],
  );

  return {
    results,
    total,
    virtualizerCount,
    loading,
    error,
    loadMore,
    focusedImageId,
    setFocusedImageId,
    reportVisibleRange,
    getImage,
    findImageIndex,
  };
}
