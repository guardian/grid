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
import { registerScrollContainer } from "@/lib/scroll-container-ref";
import { registerScrollGeometry } from "@/lib/scroll-geometry-ref";
import { registerVirtualizerReset, registerScrollToFocused } from "@/lib/orchestration/search";
import { SEEK_DEFERRED_SCROLL_MS, SCROLL_MODE_THRESHOLD, POSITION_MAP_THRESHOLD } from "@/constants/tuning";
import { URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";
import { getViewportAnchorId } from "@/hooks/useDataWindow";
import { devLog } from "@/lib/dev-log";

/**
 * Check whether two-tier virtualisation is active from imperative store state.
 * Mirrors the reactive derivation in useDataWindow — must stay in sync.
 */
function isTwoTierFromTotal(total: number): boolean {
  return POSITION_MAP_THRESHOLD > 0 &&
    total > SCROLL_MODE_THRESHOLD &&
    total <= POSITION_MAP_THRESHOLD;
}

/**
 * Convert a global image index to the index the virtualizer expects.
 * In two-tier mode the virtualizer uses global indices (0..total-1).
 * In normal mode it uses buffer-local indices (0..results.length-1).
 */
function toVirtualizerIdx(globalIdx: number, bufferOffset: number, isTwoTier: boolean): number {
  return isTwoTier ? globalIdx : globalIdx - bufferOffset;
}

// ---------------------------------------------------------------------------
// Density-focus bridge (previously src/lib/density-focus.ts)
//
// Module-level state for preserving the focused item's viewport-relative
// position across density switches (table ↔ grid). Written by the
// unmounting density, consumed once by the mounting density.
//
// Stores globalIndex (stable across buffer extends) rather than localIndex
// (shifts when bufferOffset changes due to prepends between unmount/mount).
// ---------------------------------------------------------------------------

interface DensityFocusState {
  ratio: number;
  globalIndex: number;
  /** scrollTop of the source density at save time. When 0, the restore
   *  should snap to 0 instead of computing from the ratio — avoids small
   *  pixel offsets from geometry mismatch at the top edge. */
  sourceScrollTop: number;
  /** scrollHeight - clientHeight of the source density at save time.
   *  When sourceScrollTop is within one row of this value, the restore
   *  should snap to the target's maxScroll (bottom-edge extremum). */
  sourceMaxScroll: number;
}

let _densityFocusSaved: DensityFocusState | null = null;

/**
 * When true, the unmount save in effect #10 is suppressed. Set by
 * resetToHome() to prevent the table's unmount from saving a stale
 * scroll position that would cause the grid to restore to the wrong
 * place. Cleared automatically after the grid mount reads (or skips)
 * the density-focus state.
 */
let _suppressDensityFocusSave = false;

function saveDensityFocusRatio(ratio: number, globalIndex: number, sourceScrollTop: number, sourceMaxScroll: number): void {
  if (_suppressDensityFocusSave) {
    devLog(`[density-focus SAVE SUPPRESSED] going home — ignoring save`);
    return;
  }
  _densityFocusSaved = { ratio, globalIndex, sourceScrollTop, sourceMaxScroll };
}

/** Read without clearing — for deferred consumption (survives React Strict Mode double-mount). */
function peekDensityFocusRatio(): DensityFocusState | null {
  return _densityFocusSaved;
}

/** Clear the saved state — call after the deferred scroll has been applied. */
export function clearDensityFocusRatio(): void {
  _densityFocusSaved = null;
}

/**
 * Suppress density-focus saves from unmount cleanups. Call before a
 * "go home" navigation to prevent the unmounting table from saving a
 * stale scroll position (see resetToHome). The suppress is automatically
 * cleared after the next grid mount reads the density-focus state.
 */
export function suppressDensityFocusSave(): void {
  _suppressDensityFocusSave = true;
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

  /**
   * Minimum cell width for column calculation (grid: 280px, table: undefined).
   * When provided, the mount-restore density-focus effect will compute the
   * real column count from `el.clientWidth / minCellWidth` instead of using
   * `geo.columns` — which may still be the useState default (4) on mount,
   * before the ResizeObserver fires. Without this, the mount restore scrolls
   * to the wrong pixel position at deep scroll (Bug #17).
   */
  minCellWidth?: number;
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

  /**
   * Whether two-tier virtualisation is active. When true, virtualizerCount
   * is `total` (not buffer length), indices are global, and scroll
   * compensation (prepend/evict) must NOT fire.
   */
  twoTier: boolean;
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
    twoTier,
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
    registerVirtualizerReset(() => virtualizer.scrollToOffset(0));
    return () => { registerVirtualizerReset(null); };
  }, [virtualizer]);

  // -------------------------------------------------------------------------
  // 2b. Register scroll-to-focused callback (FullscreenPreview exit)
  // -------------------------------------------------------------------------
  //
  // When exiting FullscreenPreview after traversing images, the focused item
  // may be off-screen. This callback scrolls it into view using align: "center"
  // — same as useReturnFromDetail, because the user has been in a focused view
  // and has no memory of where this image sits in the list. Centering gives
  // equal context above and below for reorientation.
  // Uses refs and getState() to always have fresh values without re-registering.

  useEffect(() => {
    registerScrollToFocused(() => {
      const { focusedImageId: fid, imagePositions, bufferOffset: bo, total: t } =
        useSearchStore.getState();
      if (!fid) return;
      const globalIdx = imagePositions.get(fid);
      if (globalIdx == null) return;
      // In two-tier mode, virtualizer row 0 = global 0
      const localIdx = toVirtualizerIdx(globalIdx, bo, isTwoTierFromTotal(t));
      if (localIdx < 0) return;
      const geo = geometryRef.current;
      const rowIdx = Math.floor(localIdx / geo.columns);
      virtualizerRef.current.scrollToIndex(rowIdx, { align: "center" });
    });
    return () => { registerScrollToFocused(null); };
  }, []);

  // -------------------------------------------------------------------------
  // 3. handleScroll — report visible range + fallback loadMore
  // -------------------------------------------------------------------------

  // Ref-stabilise values so the callback doesn't churn on every data load
  const resultsLengthRef = useRef(resultsLength);
  resultsLengthRef.current = resultsLength;
  const totalRef = useRef(total);
  totalRef.current = total;
  const bufferOffsetRef = useRef(bufferOffset);
  bufferOffsetRef.current = bufferOffset;

  // A.1: Stabilise virtualizer ref (new object every render)
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  // Stable ref for loadMore
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Geometry ref — columns can change mid-render for grid
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  // Two-tier ref — used in handleScroll for loadMore guard
  const twoTierRef = useRef(twoTier);
  twoTierRef.current = twoTier;

  // Register geometry for external consumers (e.g. Scrubber, diagnostics)
  registerScrollGeometry({ rowHeight: geometry.rowHeight, columns: geometry.columns });

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
    } else {
      devLog(`[handleScroll] WARNING: virtualizer.range is null — reportVisibleRange skipped`);
    }

    // Fallback loadMore near bottom — guard with buffer coverage check.
    // In two-tier mode, resultsLength < total is always true (buffer is 1000,
    // total is 12k), so we check bufferOffset + resultsLength < total instead.
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (scrollBottom < 500 && bufferOffsetRef.current + resultsLengthRef.current < totalRef.current) {
      loadMoreRef.current();
    }
  }, [reportVisibleRange, parentRef]);

  // Register scroll listener
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, parentRef]);

  // Re-fire after buffer changes (Scrubber thumb sync)
  useEffect(() => {
    handleScroll();
  }, [bufferOffset, resultsLength, handleScroll]);

  // -------------------------------------------------------------------------
  // 4. Prepend scroll compensation
  // -------------------------------------------------------------------------

  // Subscribe to seekGeneration early — needed by section 6 (seek scroll-to-target).
  const seekGeneration = useSearchStore((s) => s._seekGeneration);

  const prependGeneration = useSearchStore((s) => s._prependGeneration);
  const lastPrependCount = useSearchStore((s) => s._lastPrependCount);
  const prevPrependGenRef = useRef(prependGeneration);
  useLayoutEffect(() => {
    if (prependGeneration === prevPrependGenRef.current) return;
    prevPrependGenRef.current = prependGeneration;
    // In two-tier mode, virtualizerCount is constant (total). Items are
    // replaced at fixed global positions, not inserted. No compensation needed.
    if (twoTier) return;
    const el = parentRef.current;
    if (!el || lastPrependCount <= 0) return;


    const geo = geometryRef.current;
    // Compute the row shift of the topmost visible item, NOT the change in
    // total row count. The old formula (ceil(new/cols) - ceil(old/cols)) gives
    // the total-row-count delta, which can overshoot by 1 row when
    // prependCount % columns ≠ 0. The overshoot is exactly 1 row (= `columns`
    // items) — matching the +3 item jump observed in S26a with 3-column grid.
    //
    // Correct formula: the topmost visible item was at local index v (row
    // floor(v/cols)). After prepend it's at index v + prependCount (row
    // floor((v + prependCount)/cols)). The pixel compensation is the row
    // difference × rowHeight. This is exact regardless of partial-row
    // alignment, buffer eviction, or total count.
    const scrollBefore = el.scrollTop;
    const firstVisibleRow = Math.floor(scrollBefore / geo.rowHeight);
    const firstVisibleIndex = firstVisibleRow * geo.columns;
    const shiftedRow = Math.floor(
      (firstVisibleIndex + lastPrependCount) / geo.columns,
    );
    const rowDelta = shiftedRow - firstVisibleRow;
    el.scrollTop += rowDelta * geo.rowHeight;
    // DIAG: prepend compensation
    devLog(`[prepend-comp] prepended=${lastPrependCount} cols=${geo.columns} firstVisibleRow=${firstVisibleRow} firstVisibleIndex=${firstVisibleIndex} shiftedRow=${shiftedRow} rowDelta=${rowDelta} scrollBefore=${scrollBefore.toFixed(1)} scrollAfter=${el.scrollTop.toFixed(1)} delta=${(el.scrollTop - scrollBefore).toFixed(1)}`);
  }, [prependGeneration, lastPrependCount, parentRef, twoTier]);

  // -------------------------------------------------------------------------
  // 5. Forward evict scroll compensation
  // -------------------------------------------------------------------------

  const forwardEvictGeneration = useSearchStore((s) => s._forwardEvictGeneration);
  const lastForwardEvictCount = useSearchStore((s) => s._lastForwardEvictCount);
  const prevForwardEvictGenRef = useRef(forwardEvictGeneration);
  useLayoutEffect(() => {
    if (forwardEvictGeneration === prevForwardEvictGenRef.current) return;
    prevForwardEvictGenRef.current = forwardEvictGeneration;
    // In two-tier mode, no scroll compensation — items replaced at fixed positions.
    if (twoTier) return;
    const el = parentRef.current;
    if (!el || lastForwardEvictCount <= 0) return;
    const geo = geometryRef.current;
    // Viewport-aware row-delta — same principle as prepend compensation.
    // Forward eviction removes items from the START of the buffer, so all
    // remaining items shift left. The topmost visible item at index v becomes
    // index v - evictCount. Its row shifts from floor(v/cols) to
    // floor((v - evictCount)/cols). The compensation is the difference.
    const scrollBefore = el.scrollTop;
    const firstVisibleRow = Math.floor(scrollBefore / geo.rowHeight);
    const firstVisibleIndex = firstVisibleRow * geo.columns;
    const shiftedRow = Math.floor(
      (firstVisibleIndex - lastForwardEvictCount) / geo.columns,
    );
    const rowDelta = firstVisibleRow - shiftedRow;
    el.scrollTop -= rowDelta * geo.rowHeight;
  }, [forwardEvictGeneration, lastForwardEvictCount, parentRef, twoTier]);

  // -------------------------------------------------------------------------
  // 6. Seek scroll-to-target
  // -------------------------------------------------------------------------

  // seekGeneration already subscribed in section 4 above.
  const seekTargetLocalIndex = useSearchStore((s) => s._seekTargetLocalIndex);
  const seekTargetGlobalIndex = useSearchStore((s) => s._seekTargetGlobalIndex);
  const seekSubRowOffset = useSearchStore((s) => s._seekSubRowOffset);
  const prevSeekGenRef = useRef(seekGeneration);
  useLayoutEffect(() => {
    if (seekGeneration === prevSeekGenRef.current) return;
    prevSeekGenRef.current = seekGeneration;

    const geo = geometryRef.current;
    // In two-tier mode, the virtualizer's coordinate space is global (row 0 =
    // global position 0). Use the global index for pixel computation.
    const targetIdx = twoTier && seekTargetGlobalIndex >= 0
      ? seekTargetGlobalIndex       // two-tier: virtualizer row 0 = global 0
      : seekTargetLocalIndex >= 0
        ? seekTargetLocalIndex      // buffer-local, as today
        : 0;
    const targetPixelTop = localIndexToPixelTop(targetIdx, geo);
    // When the store passes a sub-row offset (headroom pre-set couldn't apply
    // it synchronously because the old buffer's scrollHeight was too small),
    // apply it here. Effect #6 runs in useLayoutEffect AFTER the new 300-item
    // buffer is rendered → scrollHeight is large enough → no browser clamping.
    const targetWithSubRow = targetPixelTop + seekSubRowOffset;

    const el = parentRef.current;

    if (el && (seekSubRowOffset > 0 || Math.abs(el.scrollTop - targetPixelTop) > geo.rowHeight)) {
      // Only adjust scrollTop if there's a large difference (> 1 row).
      // The store's seek() reverse-computes _seekTargetLocalIndex from the
      // user's current scrollTop, so the delta is typically 0–15px (sub-row
      // rounding). Skipping small adjustments prevents visible flash — any
      // scrollTop change, however small, shifts the currently-rendered content.
      // Large deltas (> rowHeight) indicate browser clamping (new buffer is
      // shorter) or first seek from a distant position — those must be applied.
      //
      // When seekSubRowOffset > 0 (headroom zone seek), always apply — the
      // store's pre-set was clamped by the browser, so el.scrollTop is wrong
      // and needs correction regardless of delta size.
      devLog(
        `[effect6-seek] ADJUSTING scrollTop: ${el.scrollTop.toFixed(1)} → ${targetWithSubRow.toFixed(1)} ` +
        `(targetPixelTop=${targetPixelTop.toFixed(1)}, subRowOffset=${seekSubRowOffset.toFixed(1)}, ` +
        `delta=${Math.abs(el.scrollTop - targetPixelTop).toFixed(1)}, threshold=${geo.rowHeight}, ` +
        `cols=${geo.columns}, targetIdx=${targetIdx})`,
      );
      el.scrollTop = targetWithSubRow;
    } else if (el) {
      devLog(
        `[effect6-seek] NO-OP: scrollTop=${el.scrollTop.toFixed(1)}, targetPixelTop=${targetPixelTop.toFixed(1)}, ` +
        `delta=${Math.abs(el.scrollTop - targetPixelTop).toFixed(1)}, threshold=${geo.rowHeight}, ` +
        `cols=${geo.columns}, targetIdx=${targetIdx}, seekTargetLocalIndex=${seekTargetLocalIndex}`,
      );
    }


    // -----------------------------------------------------------------------
    // Post-seek focus: Home/End with active focus triggers a seek, but focus
    // can't be set until the new buffer arrives. Consume the pending intent.
    // -----------------------------------------------------------------------
    const pendingFocus = useSearchStore.getState()._pendingFocusAfterSeek;
    if (pendingFocus) {
      const store = useSearchStore.getState();
      if (pendingFocus === "first") {
        const firstImg = store.results[0];
        if (firstImg) useSearchStore.setState({ focusedImageId: firstImg.id });
      } else {
        // "last" — scan backwards for a non-placeholder image
        for (let i = store.results.length - 1; i >= Math.max(0, store.results.length - 50); i--) {
          const img = store.results[i];
          if (img) {
            useSearchStore.setState({ focusedImageId: img.id });
            break;
          }
        }
      }
      useSearchStore.setState({ _pendingFocusAfterSeek: null });
    }

    // Dispatch a deferred scroll event after the seek has settled — triggers
    // reportVisibleRange for Scrubber thumb sync and gap detection.
    // SEEK_DEFERRED_SCROLL_MS is derived from SEEK_COOLDOWN_MS + 100ms margin
    // in tuning.ts — see that file for the timing constraint.
    if (el) {
      const timer = setTimeout(() => {
        el.dispatchEvent(new Event("scroll"));
      }, SEEK_DEFERRED_SCROLL_MS);
      return () => clearTimeout(timer);
    }
  }, [seekGeneration, seekTargetLocalIndex, seekTargetGlobalIndex, seekSubRowOffset, twoTier, parentRef]);

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

    // Skip scroll-reset when sort-around-focus is active OR when focus
    // preservation is active (non-sort change with a focused image — e.g.
    // clicking a metadata value). Capture the anchor item's viewport ratio
    // BEFORE the change so effect 9 can restore exact position.
    // NOTE: sort-focus ratio does NOT include headerOffset — it measures
    // the pure row-to-viewport ratio. Density-focus DOES include headerOffset
    // because the two density modes have different headers and need to
    // compensate. These are independent save/restore cycles.
    //
    // Phantom promotion: when there's no explicit focus but there IS a
    // viewport anchor and the change isn't sort-only, phantom focus
    // promotion will fire in search(). Save the anchor's viewport ratio
    // and return — same path as explicit focus. Effect #9 will restore
    // the ratio when sortAroundFocusGeneration bumps.
    //
    // Explicit focus: save the focused image's viewport ratio for
    // restoration by effect #9 after the buffer swap.
    const preserveId = focusedImageId ?? (!sortOnly ? getViewportAnchorId() : null);
    if (preserveId) {
      const store = useSearchStore.getState();
      const gIdx = store.imagePositions.get(preserveId);
      if (gIdx != null) {
        const localIdx = toVirtualizerIdx(gIdx, store.bufferOffset, isTwoTierFromTotal(store.total));
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

  // 8. BufferOffset→0 guard — primary scroll-reset for "go home" transitions
  // -------------------------------------------------------------------------
  //
  // When bufferOffset transitions from deep (>0) to 0, the buffer has been
  // replaced with fresh page-1 data. Reset scroll in the SAME layout frame
  // so the user never sees the old deep-offset content at scrollTop 0.
  //
  // This is the mechanism that eliminates the "flash of wrong content" on
  // Home key / logo click. The eager scrollTop=0 was removed from those
  // handlers — the old buffer stays visible (harmlessly, at its deep scroll
  // position) until this effect fires with the new data.

  const prevBufferOffsetRef = useRef(bufferOffset);
  useLayoutEffect(() => {
    const prev = prevBufferOffsetRef.current;
    prevBufferOffsetRef.current = bufferOffset;
    // NOTE: no twoTier guard here. In two-tier mode, bufferOffset→0 happens
    // in two cases: (a) the user scrolled to the top naturally (scrollTop is
    // already ~0 — the reset is a harmless no-op), or (b) a search()/resetToHome
    // replaced the buffer (scrollTop may be at ~1.3M — must be reset to 0).
    // Case (b) would fail without the reset, and case (a) is safe, so we
    // always fire. The original twoTier guard was added assuming only case (a)
    // exists, but the position-map-independent twoTier derivation makes
    // case (b) real.
    if (prev > 0 && bufferOffset === 0) {
      const el = parentRef.current;
      if (el) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
        virtualizer.scrollToOffset(0);
        // Dispatch scroll event AFTER React finishes rendering — triggers
        // reportVisibleRange for Scrubber thumb sync and gap detection.
        // Must be deferred: dispatching from inside useLayoutEffect causes
        // "flushSync inside lifecycle method" errors because the scroll
        // handler triggers state updates while React is still rendering.
        queueMicrotask(() => el.dispatchEvent(new Event("scroll")));
      }
    }
  }, [bufferOffset, virtualizer, parentRef, twoTier]);

  // -------------------------------------------------------------------------
  // 9. Sort-around-focus generation — scroll to focused image at new position
  // -------------------------------------------------------------------------

  const sortAroundFocusGeneration = useSearchStore(
    (s) => s.sortAroundFocusGeneration,
  );
  // Track which generation was handled by snap-back delta consumption.
  // When async offset correction re-fires this effect (via findImageIndex
  // dep change), we must skip the normal scroll-to-focus to avoid flashing
  // from "center" to "start".
  const snapBackHandledGenRef = useRef(0);

  // Persist the sort-focus ratio across re-fires within the same generation.
  // In deep-seek mode (>65k), _findAndFocusImage uses a placeholder offset
  // (bufferOffset=0) and corrects it async via countBefore. The correction
  // changes findImageIndex → re-fires this effect. Without the ref, the
  // ratio is already consumed and the re-fire falls to align:"start",
  // losing the viewport row. With the ref, the re-fire recomputes scroll
  // from the correct pixel coordinates using the same ratio.
  const sortFocusRatioRef = useRef<number | null>(null);
  const sortFocusRatioGenRef = useRef(0);
  // Persist the phantom focus image ID across re-fires within the same
  // generation. _phantomFocusImageId is cleared after the first fire, but
  // countBefore correction may re-fire this effect. Without persisting the
  // ID, the re-fire bails (both focusedImageId and _phantomFocusImageId are
  // null) and the corrected pixel position is never applied.
  const phantomIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (sortAroundFocusGeneration === 0) return;
    if (snapBackHandledGenRef.current === sortAroundFocusGeneration) return;
    const store = useSearchStore.getState();

    // On a new generation, capture the IDs and ratio. Re-fires for the
    // same generation reuse the refs.
    const isNewGen = sortAroundFocusGeneration !== sortFocusRatioGenRef.current;
    if (isNewGen) {
      const moduleRatio = consumeSortFocusRatio();
      sortFocusRatioRef.current = moduleRatio;
      phantomIdRef.current = store._phantomFocusImageId;
      sortFocusRatioGenRef.current = sortAroundFocusGeneration;
    }

    const id = store.focusedImageId ?? phantomIdRef.current;
    if (!id) return;
    const idx = findImageIndex(id);
    if (idx < 0) return;

    // Consume phantom focus — it's a one-shot positioning aid, not persistent.
    if (store._phantomFocusImageId) {
      useSearchStore.setState({ _phantomFocusImageId: null });
    }

    const el = parentRef.current;
    const geo = geometryRef.current;
    const savedRatio = sortFocusRatioRef.current;

    // -------------------------------------------------------------------
    // Arrow snap-back: if there's a pending delta, skip the initial
    // scroll-to-focus and go straight to the delta target. Two sequential
    // scrolls in one effect cause a visible flash (first scroll paints at
    // "start", second repaints at "center").
    // -------------------------------------------------------------------
    const pendingDelta = useSearchStore.getState()._pendingFocusDelta;
    if (pendingDelta != null) {
      useSearchStore.setState({ _pendingFocusDelta: null });
      const state = useSearchStore.getState();
      const focusId = state.focusedImageId;
      if (focusId) {
        const globalIdx = state.imagePositions.get(focusId);
        if (globalIdx != null) {
          const targetGlobalIdx = Math.max(0, Math.min(state.total - 1, globalIdx + pendingDelta));
          const targetLocalIdx = targetGlobalIdx - state.bufferOffset;
          if (targetLocalIdx >= 0 && targetLocalIdx < state.results.length) {
            const nextImage = state.results[targetLocalIdx];
            if (nextImage) {
              useSearchStore.setState({ focusedImageId: nextImage.id, _focusedImageKnownOffset: targetGlobalIdx });
              const nextIdx = twoTier ? targetGlobalIdx : targetLocalIdx;
              const rowIdx = localIndexToRowIndex(nextIdx, geo);
              virtualizer.scrollToIndex(rowIdx, { align: "center" });
            }
          }
        }
      }
      snapBackHandledGenRef.current = sortAroundFocusGeneration;
      return; // skip the normal scroll-to-focus below
    }

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

  // Mount: restore scroll position for focused image.
  //
  // Bug #17 fix: uses peekDensityFocusRatio() (non-destructive read) instead of
  // consumeDensityFocusRatio() (destructive). In React Strict Mode (dev), mount
  // effects fire twice: mount → cleanup → mount. If the first mount consumes the
  // saved state and cleanup cancels the rAF, the second mount sees null and can't
  // restore. Peeking lets the state survive the double-mount; clearDensityFocusRatio()
  // is called inside the rAF callback after the scroll is actually applied.
  useLayoutEffect(() => {
    // Clear the suppress flag — it only needs to survive one navigate()
    // cycle (resetToHome sets it before navigate, table unmount is
    // suppressed, grid mount clears it here).
    _suppressDensityFocusSave = false;

    const el = parentRef.current;
    if (!el) return;

    // Use focusedImageId if set, otherwise fall back to the viewport anchor
    // (the image nearest the viewport centre, tracked by useDataWindow).
    // This ensures density switches preserve scroll position even when the
    // user hasn't explicitly clicked an image.
    const id = focusedImageId ?? getViewportAnchorId();
    if (!id) return;

    const saved = peekDensityFocusRatio();
    // For initial idx: convert saved globalIndex to local, or use findImageIndex.
    // In two-tier mode, virtualizer uses global indices — no subtraction needed.
    const store = useSearchStore.getState();
    const idx = saved != null
      ? toVirtualizerIdx(saved.globalIndex, store.bufferOffset, isTwoTierFromTotal(store.total))
      : findImageIndex(id);
    if (idx < 0) return;

    // Bug #17 fix: compute real columns from the DOM element's width, not
    // geo.columns which may still be the useState default (4) before the
    // ResizeObserver fires. For table (no minCellWidth), geo.columns is
    // always 1 and correct. Both branches recompute inside rAF2 with
    // current geometry, so we don't need mountGeo here.

    if (saved != null) {
      // Abort in-flight extends and set a 2-second cooldown BEFORE the
      // rAF restore chain. This prevents extends (and their subsequent
      // prepend/evict compensation) from firing during the density-switch
      // settle window. Without this, the restore's scroll position triggers
      // reportVisibleRange → extendBackward → prepend compensation, and if
      // the compensated scrollTop exceeds maxScroll the browser clamps it —
      // losing pixels each cycle (density-focus drift bug).
      // The cooldown is identical to what resetScrollAndFocusSearch() and
      // scrubber seek() use — 2 seconds is plenty for the restore to settle.
      useSearchStore.getState().abortExtends();

      // Bug #17 fix: virtualizer.scrollToOffset() doesn't work at mount time
      // because the virtualizer hasn't measured the spacer element yet (scrollHeight
      // is too small to clamp against). The ResizeObserver also hasn't fired yet
      // to set the correct column count (grid) — that fires in the first frame
      // and triggers a React re-render. We need to wait for:
      //   Frame 1: ResizeObserver fires, React re-renders with real columns
      //   Frame 2: virtualizer spacer has correct total size, scrollHeight is valid
      // Then we can safely set scrollTop directly on the DOM.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          // Extremum snapping: if the source density was at the very top
          // (scrollTop=0), snap the target to 0 instead of computing from
          // the ratio. The ratio math maps viewport-centre positions between
          // different row heights, which can produce small non-zero offsets
          // (e.g. 4px) at the edges. At the top, the user expects to stay
          // at the top.
          if (saved.sourceScrollTop === 0) {
            devLog(`[density-focus RESTORE] extremum snap → 0 (source was at top)`);
            el.scrollTop = 0;
            clearDensityFocusRatio();
            return;
          }

          // Bottom extremum snap: if the source density was at (or within one
          // row of) the bottom edge, snap to the target's maxScroll. The
          // ratio-based restore uses the viewport-centre anchor which is
          // naturally a few rows above the bottom — landing 2-3 rows short.
          // Use 303 (grid row height) as threshold — the largest row height
          // of any density, so this catches "near bottom" in both table and grid.
          const targetMaxScroll = el.scrollHeight - el.clientHeight;
          if (saved.sourceMaxScroll > 0 &&
              saved.sourceMaxScroll - saved.sourceScrollTop < 303) {
            devLog(`[density-focus RESTORE] extremum snap → maxScroll=${targetMaxScroll} (source was at bottom: scrollTop=${saved.sourceScrollTop} maxScroll=${saved.sourceMaxScroll} gap=${saved.sourceMaxScroll - saved.sourceScrollTop})`);
            el.scrollTop = targetMaxScroll;
            clearDensityFocusRatio();
            return;
          }

          // Re-lookup local index from the saved globalIndex — the buffer
          // may have extended between mount and rAF2, shifting bufferOffset.
          // We use saved.globalIndex directly (a stable global position)
          // rather than looking up the viewport anchor id via imagePositions,
          // because the viewport anchor can be overwritten by the NEW
          // component's initial scroll/render before rAF2 fires — causing
          // the re-lookup to find a completely different image near the top.
          const { bufferOffset: boNow, total: totalNow } = useSearchStore.getState();
          const idxNow = toVirtualizerIdx(saved.globalIndex, boNow, isTwoTierFromTotal(totalNow));

          // Recompute with the now-correct geometry
          const geoNow = geometryRef.current;
          const colsNow = geoNow.minCellWidth
            ? Math.max(1, Math.floor(el.clientWidth / geoNow.minCellWidth))
            : geoNow.columns;
          const rowTopNow = Math.floor(idxNow / colsNow) * geoNow.rowHeight;
          const rawTarget = rowTopNow + geoNow.headerOffset - saved.ratio * el.clientHeight;
          // Edge clamping: if the focused item would be partially clipped at
          // a viewport edge, nudge scrollTop so the full row is visible at
          // that edge. This improves on the raw ratio restore — a partially
          // off-screen image in grid becomes fully visible at the nearest
          // edge in table (and vice versa). Same pattern as sort-around-focus
          // (effect #9), adjusted for headerOffset.
          let targetNow = rawTarget;
          const itemY = rowTopNow + geoNow.headerOffset - rawTarget;
          let edgeClamp: "top" | "bottom" | "none" = "none";
          if (itemY < geoNow.headerOffset) {
            // Clipped at top (behind sticky header or above viewport)
            targetNow = rowTopNow;
            edgeClamp = "top";
          } else if (itemY + geoNow.rowHeight > el.clientHeight) {
            // Clipped at bottom
            targetNow = rowTopNow + geoNow.headerOffset - el.clientHeight + geoNow.rowHeight;
            edgeClamp = "bottom";
          }
          const maxScroll = el.scrollHeight - el.clientHeight;
          let clampedNow = Math.max(0, Math.min(maxScroll, targetNow));
          // Extremum snapping: when the computed position is within one row
          // of an edge, snap to the edge. This prevents small pixel offsets
          // (e.g. 4px) when switching densities at the top/bottom — the
          // ratio math can't perfectly map between grid (303px rows) and
          // table (32px rows) geometry at the extremes.
          if (clampedNow < geoNow.rowHeight) clampedNow = 0;
          else if (maxScroll - clampedNow < geoNow.rowHeight) clampedNow = maxScroll;
          // DIAG: density-focus restore
          devLog(`[density-focus RESTORE] savedGlobalIdx=${saved.globalIndex} localIdx=${idxNow} bo=${boNow} cols=${colsNow} rowH=${geoNow.rowHeight} headerOff=${geoNow.headerOffset} rowTop=${rowTopNow} savedRatio=${saved.ratio.toFixed(6)} clientH=${el.clientHeight} scrollTopBefore=${el.scrollTop.toFixed(1)} rawTarget=${rawTarget.toFixed(1)} edgeClamp=${edgeClamp} target=${targetNow.toFixed(1)} scrollH=${el.scrollHeight} maxScroll=${maxScroll} clamped=${clampedNow.toFixed(1)} wasClamped=${Math.abs(targetNow - clampedNow) > 1}`);
          el.scrollTop = clampedNow;
          // NOTE: We intentionally do NOT dispatch a synthetic scroll event here.
          // The old code had `el.dispatchEvent(new Event("scroll"))` which triggered
          // reportVisibleRange → extendBackward → prepend compensation. When the
          // compensated scrollTop exceeded maxScroll, the browser clamped it — losing
          // pixels each density-switch cycle (the "drift" bug). The scrubber thumb
          // syncs via effect #3 (buffer-change re-fire) and the next real user scroll,
          // so this event was always redundant. Removing it eliminates the drift.
          clearDensityFocusRatio();
        });
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    } else {
      // No saved density-focus state — scroll the anchor into view.
      // Capture the anchor's global index NOW (mount time), before the
      // new component's scroll events can overwrite the viewport anchor.
      const store = useSearchStore.getState();
      const anchorGlobalIdx = store.imagePositions.get(id) ?? -1;

      // scrollToIndex also may not work on mount — defer similarly
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          // Re-derive local index from the stable global index.
          // In two-tier mode, the virtualizer uses global indices.
          const { bufferOffset: boNow, total: totalNow } = useSearchStore.getState();
          const isTT = isTwoTierFromTotal(totalNow);
          const idxNow = isTT
            ? (anchorGlobalIdx >= 0 ? anchorGlobalIdx : idx)
            : (anchorGlobalIdx >= 0 ? anchorGlobalIdx - boNow : idx);
          const geoNow = geometryRef.current;
          const colsNow = geoNow.minCellWidth
            ? Math.max(1, Math.floor(el.clientWidth / geoNow.minCellWidth))
            : geoNow.columns;
          const rowIdxNow = localIndexToRowIndex(idxNow, { ...geoNow, columns: colsNow });
          virtualizer.scrollToIndex(rowIdxNow, { align: "center" });
          clearDensityFocusRatio();
        });
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // Unmount: save the scroll anchor's viewport ratio for density-switch restore.
  // Uses focusedImageId if set, otherwise falls back to the viewport anchor
  // (viewport-centre image). This ensures density switches preserve scroll
  // position even without explicit focus.
  // Separate from mount so the cleanup is registered unconditionally —
  // even when focusedImageId was null at mount time (Bug #17).
  useLayoutEffect(() => {
    return () => {
      const el = parentRef.current;
      if (!el) return;
      const { focusedImageId: fid, imagePositions, bufferOffset: bo, total: t } = useSearchStore.getState();
      // Fall back to viewport anchor when no explicit focus
      const anchorId = fid ?? getViewportAnchorId();
      if (!anchorId) return;
      const globalIdx = imagePositions.get(anchorId) ?? -1;
      if (globalIdx < 0) return;
      // In two-tier mode, the virtualizer uses global indices.
      const localIdx = toVirtualizerIdx(globalIdx, bo, isTwoTierFromTotal(t));
      if (localIdx < 0) return;
      const geo = geometryRef.current;
      const rowTop = localIndexToPixelTop(localIdx, geo);
      const ratio = (rowTop + geo.headerOffset - el.scrollTop) / el.clientHeight;
      // Bug #17: Don't overwrite a save from a real unmount with a save from
      // React Strict Mode's cleanup of the first phantom mount. The real
      // component (table) unmounts and saves correctly; then the grid mounts
      // (Strict Mode phantom), immediately unmounts, and would overwrite with
      // wrong geometry (columns=4 default, scrollTop=0). Only save if there's
      // no pending unconsumed state.
      if (_densityFocusSaved == null) {
        const sourceMaxScroll = el.scrollHeight - el.clientHeight;
        // DIAG: density-focus save
        devLog(`[density-focus SAVE] anchor=${anchorId} (focus=${!!fid}) globalIdx=${globalIdx} bo=${bo} localIdx=${localIdx} cols=${geo.columns} rowH=${geo.rowHeight} headerOff=${geo.headerOffset} rowTop=${rowTop} scrollTop=${el.scrollTop.toFixed(1)} maxScroll=${sourceMaxScroll} clientH=${el.clientHeight} ratio=${ratio.toFixed(6)}`);
        saveDensityFocusRatio(ratio, globalIdx, el.scrollTop, sourceMaxScroll);
      } else {
        devLog(`[density-focus SAVE SKIPPED] pending state exists (Strict Mode guard)`);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only
  }, []);
}



