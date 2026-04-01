/**
 * useScrollEffects — shared scroll/lifecycle hook for ImageGrid and ImageTable.
 *
 * Consolidates all scroll-related effects that were duplicated between the two
 * density components:
 *   - Scroll container registration (for Scrubber)
 *   - Virtualizer scroll-reset registration (for Home/logo click)
 *   - handleScroll definition + listener registration
 *   - Buffer-change handleScroll re-fire (Scrubber thumb sync)
 *   - Prepend/forward-evict scroll compensation
 *   - Seek scroll-to-target
 *   - Search params scroll reset (with sort-around-focus detection)
 *   - BufferOffset→0 guard
 *   - Sort-around-focus generation scroll restoration
 *   - Density-focus mount restore + unmount save
 *
 * Each density component passes a geometry descriptor that captures the
 * structural differences (row height, columns, header offset, index↔pixel
 * math). The hook handles all scroll orchestration; the components handle
 * only rendering and component-specific concerns.
 *
 * Part A Steps 1–2 of scroll-consolidation-and-signals-plan.md.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useSearch } from "@tanstack/react-router";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useSearchStore } from "@/stores/search-store";
import { registerScrollContainer, getScrollContainer } from "@/lib/scroll-container-ref";
import { resetVisibleRange } from "@/hooks/useDataWindow";
import { URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";

// ---------------------------------------------------------------------------
// Density-focus bridge (previously src/lib/density-focus.ts)
//
// Module-level state for preserving the focused item's viewport-relative
// position across density switches (table ↔ grid). Written by the
// unmounting density, consumed once by the mounting density.
//
// The local index is saved alongside the ratio because imagePositions may
// evict the focused image between unmount and mount (async extends can
// complete in between). Storing the index at unmount time avoids a stale
// lookup at mount time.
// ---------------------------------------------------------------------------

interface DensityFocusState {
  ratio: number;
  localIndex: number;
}

let _densityFocusSaved: DensityFocusState | null = null;

function saveDensityFocusRatio(ratio: number, localIndex: number): void {
  _densityFocusSaved = { ratio, localIndex };
}

function consumeDensityFocusRatio(): DensityFocusState | null {
  const s = _densityFocusSaved;
  _densityFocusSaved = null;
  return s;
}

// ---------------------------------------------------------------------------
// Sort-focus bridge (previously src/lib/sort-focus.ts)
//
// Module-level state for preserving the focused item's viewport-relative
// position across sort changes. Written synchronously before the async
// search, consumed by the sortAroundFocusGeneration effect after search
// completes.
// ---------------------------------------------------------------------------

let _sortFocusRatio: number | null = null;

function saveSortFocusRatio(ratio: number): void {
  _sortFocusRatio = ratio;
}

function consumeSortFocusRatio(): number | null {
  const r = _sortFocusRatio;
  _sortFocusRatio = null;
  return r;
}

// ---------------------------------------------------------------------------
// Scroll-reset orchestration (previously src/lib/scroll-reset.ts +
// src/lib/scroll-reset-ref.ts)
//
// The hook registers the virtualizer's scrollToOffset(0) callback and the
// scroll container. This exported function is called imperatively by
// SearchBar (logo click) and ImageDetail (logo click, metadata click) —
// it is NOT a hook, just a plain function that accesses module-level state.
//
// IMPORTANT: calls abortExtends() BEFORE resetting scrollTop. The synthetic
// scroll event fires synchronously and triggers the scroll handler →
// reportVisibleRange → extendBackward. If the buffer is at a deep offset
// (e.g. after a scrubber seek), extendBackward would prepend stale data
// and corrupt the buffer. abortExtends() sets a 2-second cooldown that
// blocks extendBackward at its synchronous guard.
// ---------------------------------------------------------------------------

let _virtualizerReset: (() => void) | null = null;

/**
 * Imperatively reset scroll position to top — called by SearchBar logo,
 * ImageDetail logo, and metadata clicks. Orchestrates:
 * 1. Abort in-flight extends (buffer corruption prevention)
 * 2. DOM scrollTop/scrollLeft reset
 * 3. Virtualizer internal offset reset
 * 4. Visible range reset (Scrubber thumb sync)
 * 5. Direct scrubber thumb DOM reset
 * 6. Focus CQL input (next frame)
 */
export function resetScrollAndFocusSearch(): void {
  // Abort in-flight extends and set cooldown BEFORE the synthetic scroll
  // event can trigger extendBackward on a stale deep-offset buffer.
  useSearchStore.getState().abortExtends();

  const scrollContainer = getScrollContainer();
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
    scrollContainer.dispatchEvent(new Event("scroll"));
  }

  // Also reset the virtualizer's internal scrollOffset — setting DOM scrollTop
  // alone is insufficient because TanStack Virtual syncs asynchronously via
  // scroll events. During rapid state transitions (deep seek → Home click),
  // the virtualizer can lag behind the DOM.
  _virtualizerReset?.();

  // Immediately reset the visible range so the Scrubber thumb reflects
  // position 0 without waiting for the scroll handler to fire.
  resetVisibleRange();

  // Directly reset the scrubber thumb and tooltip DOM positions to top.
  // This bypasses React's render cycle for instant visual feedback — the
  // React-computed position will catch up on the next render after search
  // completes with bufferOffset: 0.
  const thumb = document.querySelector<HTMLElement>("[data-scrubber-thumb]");
  if (thumb) thumb.style.top = "0px";

  requestAnimationFrame(() => {
    const cqlInput = document.querySelector("cql-input");
    if (cqlInput instanceof HTMLElement) cqlInput.focus();
  });
}

// ---------------------------------------------------------------------------
// Geometry descriptor — captures grid vs table structural differences
// ---------------------------------------------------------------------------

export interface ScrollGeometry {
  /** Row height in pixels (303 for grid, 32 for table). */
  rowHeight: number;

  /**
   * Number of columns per row (grid: dynamic from ResizeObserver, table: 1).
   * Used to convert flat image indices ↔ row indices.
   */
  columns: number;

  /**
   * Pixel offset of the sticky header inside the scroll container (table: ~45px, grid: 0).
   * Used in density-focus ratio save/restore to account for the table header.
   */
  headerOffset: number;

  /**
   * Whether to preserve horizontal scroll on sort-only changes (table: true, grid: false).
   * The table user may have scrolled right to reach a sort column header.
   */
  preserveScrollLeftOnSort: boolean;
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

export interface UseScrollEffectsConfig {
  /** The virtualizer instance (TanStack Virtual). */
  virtualizer: Virtualizer<HTMLDivElement, Element>;

  /** Ref to the scroll container element. */
  parentRef: React.RefObject<HTMLDivElement | null>;

  /** Geometry descriptor for this density mode. */
  geometry: ScrollGeometry;

  /** From useDataWindow: report visible range for gap detection + extends. */
  reportVisibleRange: (startIndex: number, endIndex: number) => void;

  /** From useDataWindow: results array length. */
  resultsLength: number;

  /** From useDataWindow: total result count. */
  total: number;

  /** From useDataWindow: buffer offset. */
  bufferOffset: number;

  /** From useDataWindow: extend buffer forward. */
  loadMore: () => Promise<void>;

  /** From useDataWindow: currently focused image ID. */
  focusedImageId: string | null;

  /** From useDataWindow: find buffer-local index by image ID. */
  findImageIndex: (imageId: string) => number;
}

// ---------------------------------------------------------------------------
// Helper: convert flat image index to pixel offset
// ---------------------------------------------------------------------------

function localIndexToPixelTop(localIdx: number, geo: ScrollGeometry): number {
  return Math.floor(localIdx / geo.columns) * geo.rowHeight;
}

function localIndexToRowIndex(localIdx: number, geo: ScrollGeometry): number {
  return Math.floor(localIdx / geo.columns);
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useScrollEffects(config: UseScrollEffectsConfig): void {
  const {
    virtualizer,
    parentRef,
    geometry,
    reportVisibleRange,
    resultsLength,
    total,
    bufferOffset,
    loadMore,
    focusedImageId,
    findImageIndex,
  } = config;

  const searchParams = useSearch({ from: "/search" });

  // -------------------------------------------------------------------------
  // 1. Register scroll container for Scrubber (mount/unmount)
  // -------------------------------------------------------------------------

  useEffect(() => {
    registerScrollContainer(parentRef.current);
    return () => registerScrollContainer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  // -------------------------------------------------------------------------
  // 2. Register virtualizer scroll-reset callback (Home/logo click)
  // -------------------------------------------------------------------------

  useEffect(() => {
    _virtualizerReset = () => virtualizer.scrollToOffset(0);
    return () => { _virtualizerReset = null; };
  }, [virtualizer]);

  // -------------------------------------------------------------------------
  // 3. handleScroll — report visible range + fallback loadMore
  // -------------------------------------------------------------------------

  // Ref-stabilise values so the callback doesn't churn on every data load
  const resultsLengthRef = useRef(resultsLength);
  resultsLengthRef.current = resultsLength;
  const totalRef = useRef(total);
  totalRef.current = total;

  // A.1: Stabilise virtualizer ref (new object every render)
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  // Stable ref for loadMore
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Geometry ref — columns can change mid-render for grid
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    const range = virtualizerRef.current.range;
    if (range) {
      const geo = geometryRef.current;
      if (geo.columns > 1) {
        // Grid: convert row indices → flat image indices
        reportVisibleRange(
          range.startIndex * geo.columns,
          (range.endIndex + 1) * geo.columns - 1,
        );
      } else {
        // Table: flat indices ARE row indices
        reportVisibleRange(range.startIndex, range.endIndex);
      }
    }

    // Fallback loadMore near bottom
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (scrollBottom < 500 && resultsLengthRef.current < totalRef.current) {
      loadMoreRef.current();
    }
  }, [reportVisibleRange, parentRef]);

  // Register scroll listener
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, parentRef]);

  // Re-fire after buffer changes (Scrubber thumb sync)
  useEffect(() => {
    handleScroll();
  }, [bufferOffset, resultsLength, handleScroll]);

  // -------------------------------------------------------------------------
  // 4. Prepend scroll compensation
  // -------------------------------------------------------------------------

  const prependGeneration = useSearchStore((s) => s._prependGeneration);
  const lastPrependCount = useSearchStore((s) => s._lastPrependCount);
  const prevPrependGenRef = useRef(prependGeneration);
  useLayoutEffect(() => {
    if (prependGeneration === prevPrependGenRef.current) return;
    prevPrependGenRef.current = prependGeneration;
    const el = parentRef.current;
    if (!el || lastPrependCount <= 0) return;
    const geo = geometryRef.current;
    const prependedRows = geo.columns > 1
      ? Math.ceil(lastPrependCount / geo.columns)
      : lastPrependCount;
    el.scrollTop += prependedRows * geo.rowHeight;
  }, [prependGeneration, lastPrependCount, parentRef]);

  // -------------------------------------------------------------------------
  // 5. Forward evict scroll compensation
  // -------------------------------------------------------------------------

  const forwardEvictGeneration = useSearchStore((s) => s._forwardEvictGeneration);
  const lastForwardEvictCount = useSearchStore((s) => s._lastForwardEvictCount);
  const prevForwardEvictGenRef = useRef(forwardEvictGeneration);
  useLayoutEffect(() => {
    if (forwardEvictGeneration === prevForwardEvictGenRef.current) return;
    prevForwardEvictGenRef.current = forwardEvictGeneration;
    const el = parentRef.current;
    if (!el || lastForwardEvictCount <= 0) return;
    const geo = geometryRef.current;
    const evictedRows = geo.columns > 1
      ? Math.ceil(lastForwardEvictCount / geo.columns)
      : lastForwardEvictCount;
    el.scrollTop -= evictedRows * geo.rowHeight;
  }, [forwardEvictGeneration, lastForwardEvictCount, parentRef]);

  // -------------------------------------------------------------------------
  // 6. Seek scroll-to-target
  // -------------------------------------------------------------------------

  const seekGeneration = useSearchStore((s) => s._seekGeneration);
  const seekTargetLocalIndex = useSearchStore((s) => s._seekTargetLocalIndex);
  const prevSeekGenRef = useRef(seekGeneration);
  useLayoutEffect(() => {
    if (seekGeneration === prevSeekGenRef.current) return;
    prevSeekGenRef.current = seekGeneration;
    const geo = geometryRef.current;
    const targetIdx = seekTargetLocalIndex >= 0 ? seekTargetLocalIndex : 0;
    const rowIdx = localIndexToRowIndex(targetIdx, geo);
    virtualizer.scrollToIndex(rowIdx, { align: "start" });
    // Dispatch a deferred scroll event after the seek cooldown (500ms) has
    // expired — triggers reportVisibleRange → extendForward/Backward.
    const el = parentRef.current;
    if (el) {
      const timer = setTimeout(() => {
        el.dispatchEvent(new Event("scroll"));
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [seekGeneration, seekTargetLocalIndex, virtualizer, parentRef]);

  // -------------------------------------------------------------------------
  // 7. Search params scroll reset (with sort-around-focus detection)
  // -------------------------------------------------------------------------

  const prevSearchParamsRef = useRef(searchParams);
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const prev = prevSearchParamsRef.current;
    prevSearchParamsRef.current = searchParams;

    // If only display-only keys changed, don't reset scroll
    const onlyDisplayKeysChanged = Object.keys({ ...prev, ...searchParams }).every(
      (key) =>
        URL_DISPLAY_KEYS.has(key as keyof UrlSearchParams) ||
        prev[key as keyof typeof prev] === searchParams[key as keyof typeof searchParams],
    );
    if (onlyDisplayKeysChanged) return;

    // Detect sort-only change: orderBy changed, nothing else did.
    // This covers all sort transitions including switching back to the
    // default sort (orderBy becomes undefined). In every case, the focused
    // image must stay at the same viewport position ("Never Lost").
    const orderByChanged = prev.orderBy !== searchParams.orderBy;
    const nonSortChanged = Object.keys({ ...prev, ...searchParams }).some(
      (key) =>
        key !== "orderBy" &&
        !URL_DISPLAY_KEYS.has(key as keyof UrlSearchParams) &&
        prev[key as keyof typeof prev] !== searchParams[key as keyof typeof searchParams],
    );
    const sortOnly = orderByChanged && !nonSortChanged;

    // Skip scroll-reset when sort-around-focus is active. Capture the
    // focused item's viewport ratio BEFORE the sort.
    // NOTE: sort-focus ratio does NOT include headerOffset — it measures
    // the pure row-to-viewport ratio. Density-focus DOES include headerOffset
    // because the two density modes have different headers and need to
    // compensate. These are independent save/restore cycles.
    if (sortOnly && focusedImageId) {
      const store = useSearchStore.getState();
      const gIdx = store.imagePositions.get(focusedImageId);
      if (gIdx != null) {
        const localIdx = gIdx - store.bufferOffset;
        if (localIdx >= 0) {
          const geo = geometryRef.current;
          const rowTop = localIndexToPixelTop(localIdx, geo);
          saveSortFocusRatio((rowTop - el.scrollTop) / el.clientHeight);
        }
      }
      return;
    }

    // For ImageGrid: the original code did NOT include isSortAction/sortOnly
    // distinction — it always reset scrollLeft. The table version preserves
    // scrollLeft on sort-only changes.
    el.scrollTop = 0;
    const geo = geometryRef.current;
    if (!geo.preserveScrollLeftOnSort || !sortOnly) {
      el.scrollLeft = 0;
    }
    virtualizer.scrollToOffset(0);
  }, [searchParams, virtualizer, focusedImageId, parentRef]);

  // -------------------------------------------------------------------------
  // 8. BufferOffset→0 guard (belt-and-suspenders)
  // -------------------------------------------------------------------------

  const prevBufferOffsetRef = useRef(bufferOffset);
  useLayoutEffect(() => {
    const prev = prevBufferOffsetRef.current;
    prevBufferOffsetRef.current = bufferOffset;
    if (prev > 0 && bufferOffset === 0) {
      const el = parentRef.current;
      if (el && el.scrollTop > 0) {
        el.scrollTop = 0;
        virtualizer.scrollToOffset(0);
      }
    }
  }, [bufferOffset, virtualizer, parentRef]);

  // -------------------------------------------------------------------------
  // 9. Sort-around-focus generation — scroll to focused image at new position
  // -------------------------------------------------------------------------

  const sortAroundFocusGeneration = useSearchStore(
    (s) => s.sortAroundFocusGeneration,
  );
  useLayoutEffect(() => {
    if (sortAroundFocusGeneration === 0) return;
    const id = useSearchStore.getState().focusedImageId;
    if (!id) return;
    const idx = findImageIndex(id);
    if (idx < 0) return;

    const el = parentRef.current;
    const savedRatio = consumeSortFocusRatio();
    const geo = geometryRef.current;
    if (el && savedRatio != null) {
      // Restore the focused item at the same viewport ratio — "Never Lost".
      const rowTop = localIndexToPixelTop(idx, geo);
      let target = rowTop - savedRatio * el.clientHeight;
      // Edge clamping
      const itemY = rowTop - target;
      if (itemY < 0) target = rowTop;
      else if (itemY > el.clientHeight - geo.rowHeight)
        target = rowTop - el.clientHeight + geo.rowHeight;
      const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target));
      virtualizer.scrollToOffset(clamped);
    } else {
      const rowIdx = localIndexToRowIndex(idx, geo);
      virtualizer.scrollToIndex(rowIdx, { align: "start" });
    }
  }, [sortAroundFocusGeneration, findImageIndex, virtualizer, parentRef]);

  // -------------------------------------------------------------------------
  // 10. Density-focus: mount restore + unmount save
  // -------------------------------------------------------------------------

  // Mount: restore scroll position for focused image
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const id = focusedImageId;
    if (!id) return;

    const saved = consumeDensityFocusRatio();
    // Prefer the saved localIndex (immune to imagePositions eviction)
    const idx = saved != null ? saved.localIndex : findImageIndex(id);
    if (idx < 0) return;

    const geo = geometryRef.current;
    if (saved != null) {
      // Reverse the save formula: saved.ratio = (rowTop + headerOffset - scrollTop) / clientHeight
      // So scrollTop = rowTop + headerOffset - saved.ratio * clientHeight
      const rowTop = localIndexToPixelTop(idx, geo);
      const targetScroll = rowTop + geo.headerOffset - saved.ratio * el.clientHeight;
      const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetScroll));
      virtualizer.scrollToOffset(clamped);
    } else {
      const rowIdx = localIndexToRowIndex(idx, geo);
      virtualizer.scrollToIndex(rowIdx, { align: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // Unmount: ALWAYS save the focused image's viewport ratio.
  // Separate from mount so the cleanup is registered unconditionally —
  // even when focusedImageId was null at mount time (Bug #17).
  useLayoutEffect(() => {
    return () => {
      const el = parentRef.current;
      if (!el) return;
      const { focusedImageId: fid, imagePositions, bufferOffset: bo } = useSearchStore.getState();
      if (!fid) return;
      const globalIdx = imagePositions.get(fid) ?? -1;
      if (globalIdx < 0) return;
      const localIdx = globalIdx - bo;
      if (localIdx < 0) return;
      const geo = geometryRef.current;
      const rowTop = localIndexToPixelTop(localIdx, geo);
      saveDensityFocusRatio((rowTop + geo.headerOffset - el.scrollTop) / el.clientHeight, localIdx);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only
  }, []);
}



