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
 *   - Explicit fresh-publication scroll reset
 *   - Sort-around-focus generation scroll restoration
 *   - Density-focus mount restore + unmount save
 *
 * Each density component passes a geometry descriptor that captures the
 * structural differences (row height, columns, header offset, index↔pixel
 * math). The hook handles all scroll orchestration; the components handle
 * only rendering and component-specific concerns.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import type { Virtualizer } from "@tanstack/react-virtual";
import { getSearchGeneration, useSearchStore } from "@/stores/search-store";
import { registerScrollContainer } from "@/lib/scroll-container-ref";
import { registerScrollGeometry } from "@/lib/scroll-geometry-ref";
import { registerVirtualizerReset, registerScrollToFocused, isUserInitiatedNavigation } from "@/lib/orchestration/search";
import { captureSearchContinuity, saveSearchContinuity } from "@/lib/search-continuity";
import { SCROLL_MODE_THRESHOLD, SEEK_DEFERRED_SCROLL_MS } from "@/constants/tuning";
import { GRID_ROW_HEIGHT } from "@/constants/layout";
import { URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import { getViewportAnchorId } from "@/hooks/useDataWindow";
import { useSelectionStore } from "@/stores/selection-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { isNativeInputTarget } from "@/lib/dom-utils";
import { devLog } from "@/lib/dev-log";

/**
 * Convert a global image index to the index the virtualizer expects.
 * In two-tier mode the virtualizer uses global indices (0..total-1).
 * In normal mode it uses buffer-local indices (0..results.length-1).
 */
function toVirtualizerIdx(globalIdx: number, bufferOffset: number, isTwoTier: boolean): number {
  return isTwoTier ? globalIdx : globalIdx - bufferOffset;
}

// ---------------------------------------------------------------------------
// Density-focus bridge
//
// Module-level state for preserving the focused item's viewport-relative
// position across density switches (table ↔ grid). Written by the
// unmounting density, consumed once by the mounting density.
//
// Stores globalIndex (stable across buffer extends) rather than localIndex
// (shifts when bufferOffset changes due to prepends between unmount/mount).
// ---------------------------------------------------------------------------

interface DensityFocusState {
  target: { id: string; globalIndex: number };
  placement: { kind: "ratio"; ratio: number } | { kind: "centre" };
  searchGeneration: number;
  publication: { seek: number; sort: number; reset: number };
  mode: { kind: "settled"; focusIntent: number; edge: "none" | "start" | "end" }
    | { kind: "departure"; navigationSignal: AbortSignal };
  retired: boolean;
}

let _densityFocusSaved: DensityFocusState | null = null;
let _densityRestoreGeneration = 0;

function markDensityRestoreComplete(): void {
  if (import.meta.env.DEV) _densityRestoreGeneration += 1;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_getDensityRestoreGeneration__ =
    () => _densityRestoreGeneration;
}

/**
 * When true, the unmount save in effect #10 is suppressed. Set by
 * resetToHome() to prevent the table's unmount from saving a stale
 * scroll position that would cause the grid to restore to the wrong
 * place. Cleared automatically after the grid mount reads (or skips)
 * the density-focus state.
 */
let _suppressDensityFocusSave: symbol | null = null;

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
export function suppressDensityFocusSave(): () => void {
  const owner = Symbol();
  _suppressDensityFocusSave = owner;
  return () => { if (_suppressDensityFocusSave === owner) _suppressDensityFocusSave = null; };
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
  reportVisibleRange: (startIndex: number, endIndex: number, userInitiated?: boolean) => void;

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

  /**
   * Optional custom centering callback — used by ImageTable to bypass
   * TanStack's scrollToIndex({align:"center"}) which doesn't account
   * for the sticky header.  When absent, falls back to scrollToIndex.
   */
  scrollRowToCenter?: (rowIdx: number) => void;

  chooseDensityAnchor?: (residentFocus: string | null, viewportAnchor: () => string | null) => string | null;
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
    scrollRowToCenter,
  } = config;

  const searchParams = useSearch({ from: "/search" });
  const [densityReady, setDensityReady] = useState(() =>
    _densityFocusSaved === null && useSearchStore.getState()._browseNavigation === null);
  const densityMountedReadyRef = useRef(false);
  const densityMountHadReadyPublicationRef = useRef(useSearchStore.getState()._searchContinuity?.phase === "ready");
  const densityAnchorPolicyRef = useRef(config.chooseDensityAnchor);
  densityAnchorPolicyRef.current = config.chooseDensityAnchor;

  // Ref-stabilise the optional centering callback so closures in
  // mount-only effects always see the latest version.
  const scrollRowToCenterRef = useRef(scrollRowToCenter);
  scrollRowToCenterRef.current = scrollRowToCenter;

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
      if (scrollRowToCenterRef.current) {
        scrollRowToCenterRef.current(rowIdx);
      } else {
        virtualizerRef.current.scrollToIndex(rowIdx, { align: "center" });
      }
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

  // Register geometry for external consumers (e.g. Scrubber, diagnostics)
  registerScrollGeometry({ rowHeight: geometry.rowHeight, columns: geometry.columns });

  const scrollInputRef = useRef<{ search: number; seek: number } | null>(null);
  const handleScroll = useCallback((event?: Event) => {
    const el = parentRef.current;
    if (!el) return;
    const input = scrollInputRef.current;
    const userInitiated = event !== undefined && input !== null &&
      input.search === getSearchGeneration() && input.seek === useSearchStore.getState()._seekGeneration;

    const range = virtualizerRef.current.range;
    if (range) {
      const geo = geometryRef.current;
      if (geo.columns > 1) {
        // Grid: convert row indices → flat image indices
        reportVisibleRange(
          range.startIndex * geo.columns,
          (range.endIndex + 1) * geo.columns - 1,
          userInitiated,
        );
      } else {
        // Table: flat indices ARE row indices
        reportVisibleRange(range.startIndex, range.endIndex, userInitiated);
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
    const captureInput = () => {
      scrollInputRef.current = { search: getSearchGeneration(), seek: useSearchStore.getState()._seekGeneration };
    };
    const onWheel = (event: WheelEvent) => { if (!event.ctrlKey && event.deltaY !== 0) captureInput(); };
    const onKey = (event: KeyboardEvent) => {
      if (!isNativeInputTarget(event) && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) captureInput();
    };
    const stopInput = () => { scrollInputRef.current = null; };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", captureInput, { passive: true });
    el.addEventListener("scrollend", stopInput);
    document.addEventListener("keydown", onKey, true);
    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", captureInput);
      el.removeEventListener("scrollend", stopInput);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [handleScroll, parentRef]);

  // Re-fire after buffer changes (Scrubber thumb sync).
  // Guard: skip the first fire after a seek — the stale virtualizer range would
  // trigger a spurious extendBackward (Chrome-only, render pipeline > cooldown).
  const seekGenForHandleScrollRef = useRef(
    useSearchStore.getState()._seekGeneration,
  );
  useEffect(() => {
    const gen = useSearchStore.getState()._seekGeneration;
    if (gen !== seekGenForHandleScrollRef.current) {
      seekGenForHandleScrollRef.current = gen;
      return;
    }
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
    // items), which would produce a +3 item jump in a 3-column grid.
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
  const browseNavigation = useSearchStore((state) => state._browseNavigation);
  const prevSeekGenRef = useRef(seekGeneration);
  const seekScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => () => { clearTimeout(seekScrollTimerRef.current); }, []);
  useLayoutEffect(() => {
    if (!densityReady || (browseNavigation && browseNavigation.phase !== "ready")) return;
    if (seekGeneration === prevSeekGenRef.current && browseNavigation?.phase !== "ready") return;
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

    if (el && browseNavigation?.targetOffset === 0) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    } else if (el && (seekSubRowOffset > 0 || Math.abs(el.scrollTop - targetPixelTop) > geo.rowHeight)) {
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
      const mayMoveFocus = pendingFocus.focusedImageId !== null &&
        store.focusedImageId === pendingFocus.focusedImageId &&
        getEffectiveFocusMode() === "explicit" && useSelectionStore.getState().selectedIds.size === 0;
      if (pendingFocus.edge === "first") {
        if (mayMoveFocus) {
          const firstImg = store.results[0];
          if (firstImg) useSearchStore.setState({ focusedImageId: firstImg.id });
        }
        virtualizerRef.current.scrollToIndex(0, { align: "start" });
      } else {
        if (mayMoveFocus) {
          for (let i = store.results.length - 1; i >= Math.max(0, store.results.length - 50); i--) {
            const img = store.results[i];
            if (img) {
              useSearchStore.setState({ focusedImageId: img.id });
              break;
            }
          }
        }
        // Scroll last row into view via the virtualizer
        const count = virtualizerRef.current.options.count;
        virtualizerRef.current.scrollToIndex(count - 1, { align: "end" });
      }
      useSearchStore.setState({ _pendingFocusAfterSeek: null });
    }

    if (browseNavigation && useSearchStore.getState()._browseNavigation?.signal === browseNavigation.signal) {
      useSearchStore.setState({ _browseNavigation: null });
    }

    // Dispatch a deferred scroll event after the seek has settled — triggers
    // reportVisibleRange for Scrubber thumb sync and gap detection.
    // SEEK_DEFERRED_SCROLL_MS is derived from SEEK_COOLDOWN_MS + 100ms margin
    // in tuning.ts — see that file for the timing constraint.
    if (el) {
      clearTimeout(seekScrollTimerRef.current);
      const searchGeneration = getSearchGeneration();
      const input = scrollInputRef.current;
      seekScrollTimerRef.current = setTimeout(() => {
        const state = useSearchStore.getState();
        if (searchGeneration !== getSearchGeneration() || seekGeneration !== state._seekGeneration ||
            state.loading || state._browseNavigation || scrollInputRef.current !== input) return;
        el.dispatchEvent(new Event("scroll"));
      }, SEEK_DEFERRED_SCROLL_MS);
    }
  }, [seekGeneration, seekTargetLocalIndex, seekTargetGlobalIndex, seekSubRowOffset, twoTier, parentRef, browseNavigation, densityReady]);

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

    if (isUserInitiatedNavigation()) {
      saveSearchContinuity(searchParams, sortOnly, captureSearchContinuity(sortOnly, el, geometryRef.current));
    }
  }, [searchParams, virtualizer, focusedImageId, parentRef]);

  // -------------------------------------------------------------------------
  // 7b. Deferred scroll reset — atomic with data swap (Bug 2 fix)
  // -------------------------------------------------------------------------
  //
  // When search() lands fresh results without focus preservation (sort change,
  // query change, filter change — all with no focusedImageId), the store bumps
  // _scrollReset.gen in the same set() call that swaps the buffer. This
  // effect resets scrollTop in the same useLayoutEffect frame as that render,
  // so the user never sees old buffer content at scrollTop=0.
  //
  // _scrollReset.sortOnly (piped from search() options) tells us whether to
  // preserve scrollLeft in table view — table users scroll right to see
  // columns, losing that on sort change is jarring.

  const scrollReset = useSearchStore(
    (s) => s._scrollReset,
  );

  useLayoutEffect(() => {
    if (scrollReset.gen === 0) return;
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const geo = geometryRef.current;
    if (!geo.preserveScrollLeftOnSort || !scrollReset.sortOnly) {
      el.scrollLeft = 0;
    }
    virtualizer.scrollToOffset(0);
    queueMicrotask(() => el.dispatchEvent(new Event("scroll")));
  }, [scrollReset, parentRef, virtualizer]);

  // -------------------------------------------------------------------------
  // 9. Sort-around-focus generation — scroll to focused image at new position
  // -------------------------------------------------------------------------
  //
  // Must stay a useLayoutEffect, not useEffect/rAF, so the final aligned
  // buffer and its preserved placement are applied in the same pre-paint
  // commit.

  const sortAroundFocusGeneration = useSearchStore(
    (s) => s.sortAroundFocusGeneration,
  );
  // Track which generation was handled by snap-back delta consumption.
  const snapBackHandledGenRef = useRef(0);
  // Guard against unrelated rerenders if a dependency identity ever changes.
  const handledSortFocusGenRef = useRef(0);
  const pendingSortFocusRef = useRef<{
    imageId: string;
    focusedImageId: string | null;
    ratio: number;
    scrollTop: number;
    resultsLength: number;
    pitGeneration: number;
    seekGeneration: number;
    owner?: AbortSignal;
  } | null>(null);

  useLayoutEffect(() => {
    if (sortAroundFocusGeneration === 0) return;
    if (snapBackHandledGenRef.current === sortAroundFocusGeneration) return;
    const store = useSearchStore.getState();
    const continuity = store._searchContinuity;
    if (continuity?.phase === "pending") return;
    if (continuity && (continuity.phase === "retired" || continuity.owner.aborted || continuity.searchGeneration !== getSearchGeneration())) {
      pendingSortFocusRef.current = null;
      handledSortFocusGenRef.current = sortAroundFocusGeneration;
      return;
    }
    if (continuity && !densityReady) return;
    if (continuity?.phase === "placed" && handledSortFocusGenRef.current !== sortAroundFocusGeneration) {
      handledSortFocusGenRef.current = sortAroundFocusGeneration;
      return;
    }
    const el = parentRef.current;
    let pending = pendingSortFocusRef.current;
    if (handledSortFocusGenRef.current === sortAroundFocusGeneration) {
      if (!pending) return;
      if (
        !el || store.loading || bufferOffset !== 0 ||
        store._pitGeneration !== pending.pitGeneration ||
        store._seekGeneration !== pending.seekGeneration ||
        (pending.owner !== undefined && (pending.owner.aborted || continuity?.owner !== pending.owner)) ||
        store.focusedImageId !== pending.focusedImageId ||
        store._pendingFocusDelta != null ||
        resultsLength < pending.resultsLength ||
        Math.abs(el.scrollTop - pending.scrollTop) > 1
      ) {
        pendingSortFocusRef.current = null;
        return;
      }
      if (resultsLength === pending.resultsLength) return;
    } else {
      handledSortFocusGenRef.current = sortAroundFocusGeneration;
      pending = null;
    }
    pendingSortFocusRef.current = null;
    const geo = geometryRef.current;
    const savedRatio = pending ? pending.ratio : continuity
      ? continuity.placement.kind === "ratio" ? continuity.placement.ratio
        : continuity.placement.kind === "centre" && el && el.clientHeight > 0
          ? (el.clientHeight - geo.headerOffset - geo.rowHeight) / (2 * el.clientHeight) : null
      : null;
    const id = pending?.imageId ?? continuity?.targetId ?? store._phantomFocusImageId ?? store.focusedImageId;
    if (!id) return;
    const idx = findImageIndex(id);
    if (idx < 0) return;

    // Consume phantom focus — it's a one-shot positioning aid, not persistent.
    if (store._phantomFocusImageId || continuity?.phase === "ready") {
      useSearchStore.setState({ _phantomFocusImageId: null,
        ...(continuity?.phase === "ready" && { _searchContinuity: { ...continuity, phase: "placed" } }) });
    }

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
              if (scrollRowToCenterRef.current) {
                scrollRowToCenterRef.current(rowIdx);
              } else {
                virtualizer.scrollToIndex(rowIdx, { align: "center" });
              }
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
      if (
        !twoTier && bufferOffset === 0 && total <= SCROLL_MODE_THRESHOLD &&
        resultsLength < total && target - clamped > 1
      ) {
        pendingSortFocusRef.current = {
          imageId: id,
          focusedImageId: store.focusedImageId,
          ratio: savedRatio,
          scrollTop: el.scrollTop,
          resultsLength,
          pitGeneration: store._pitGeneration,
          seekGeneration: store._seekGeneration,
          owner: continuity?.owner,
        };
      }
    } else {
      const rowIdx = localIndexToRowIndex(idx, geo);
      virtualizer.scrollToIndex(rowIdx, { align: "start" });
    }

  }, [sortAroundFocusGeneration, findImageIndex, virtualizer, parentRef, resultsLength, bufferOffset, total, twoTier, focusedImageId, densityReady]);

  // -------------------------------------------------------------------------
  // 10. Density-focus: mount restore + unmount save
  // -------------------------------------------------------------------------

  const captureDensity = (placement: "ratio" | "centre"): DensityFocusState | null => {
    const state = useSearchStore.getState();
    const navigation = state._browseNavigation;
    const el = parentRef.current;
    const indexed = isTwoTierFromTotal(state.total);
    if (!el || !el.clientHeight || (navigation && (placement === "centre" || indexed || navigation.phase === "ready"))) return null;
    const resolve = (id: string | null) => {
      const globalIndex = id ? state.imagePositions.get(id) : undefined;
      return id && globalIndex !== undefined && state.results[globalIndex - state.bufferOffset]?.id === id
        ? { id, globalIndex } : null;
    };
    const focus = resolve(state.focusedImageId);
    const target = resolve(navigation ? getViewportAnchorId() : densityAnchorPolicyRef.current
      ? densityAnchorPolicyRef.current(focus?.id ?? null, getViewportAnchorId)
      : focus?.id ?? getViewportAnchorId());
    if (!target) return null;
    const geo = geometryRef.current;
    const index = toVirtualizerIdx(target.globalIndex, state.bufferOffset, indexed);
    const maxScroll = el.scrollHeight - el.clientHeight;
    const edge = (indexed || state.bufferOffset === 0) && el.scrollTop === 0 ? "start"
      : (indexed || state.bufferOffset + state.results.length >= state.total) && maxScroll > 0 &&
        maxScroll - el.scrollTop < GRID_ROW_HEIGHT ? "end" : "none";
    return { target, placement: placement === "centre" ? { kind: "centre" }
      : { kind: "ratio", ratio: (localIndexToPixelTop(index, geo) + geo.headerOffset - el.scrollTop) / el.clientHeight },
      searchGeneration: getSearchGeneration(),
      publication: { seek: state._seekGeneration, sort: state.sortAroundFocusGeneration, reset: state._scrollReset.gen },
      mode: navigation ? { kind: "departure", navigationSignal: navigation.signal }
        : { kind: "settled", focusIntent: state._focusIntent, edge: placement === "centre" ? "none" : edge },
      retired: false };
  };

  const placeDensity = (saved: DensityFocusState | null) => {
    if (!saved || saved.retired || _densityFocusSaved !== saved) return;
    const state = useSearchStore.getState();
    const navigation = state._browseNavigation;
    const publication = saved.publication;
    if (saved.searchGeneration !== getSearchGeneration() || publication.seek !== state._seekGeneration ||
        publication.sort !== state.sortAroundFocusGeneration || publication.reset !== state._scrollReset.gen ||
        state._searchContinuity?.phase === "ready" ||
        (saved.mode.kind === "settled" ? saved.mode.focusIntent !== state._focusIntent || navigation !== null
          : saved.mode.navigationSignal.aborted || navigation?.signal !== saved.mode.navigationSignal || navigation.phase === "ready")) {
      saved.retired = true;
      return;
    }
    const el = parentRef.current;
    if (!el) return;
    if (state.results[saved.target.globalIndex - state.bufferOffset]?.id !== saved.target.id) {
      saved.retired = true;
      return;
    }
    const geo = geometryRef.current;
    const columns = geo.minCellWidth ? Math.max(1, Math.floor(el.clientWidth / geo.minCellWidth)) : geo.columns;
    const indexed = isTwoTierFromTotal(state.total);
    const row = Math.floor(toVirtualizerIdx(saved.target.globalIndex, state.bufferOffset, indexed) / columns);
    const start = indexed || state.bufferOffset === 0;
    const end = indexed || state.bufferOffset + state.results.length >= state.total;
    if (saved.placement.kind === "centre") {
      if (scrollRowToCenterRef.current) scrollRowToCenterRef.current(row);
      else virtualizerRef.current.scrollToIndex(row, { align: "center" });
    } else if (saved.mode.kind === "settled" && saved.mode.edge === "end" && end) {
      virtualizerRef.current.scrollToIndex(virtualizerRef.current.options.count - 1, { align: "end" });
    } else {
      const rowTop = row * geo.rowHeight;
      let placement = saved.placement.ratio * el.clientHeight;
      if (placement < geo.headerOffset) placement = geo.headerOffset;
      else if (placement + geo.rowHeight > el.clientHeight) placement = el.clientHeight - geo.rowHeight;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      let offset = Math.max(0, Math.min(maxScroll, rowTop + geo.headerOffset - placement));
      if (saved.mode.kind === "settled") {
        if (start && (saved.mode.edge === "start" || offset < geo.rowHeight)) offset = 0;
        else if (end && maxScroll - offset < geo.rowHeight) offset = maxScroll;
      }
      el.scrollTop = offset;
    }
  };

  useLayoutEffect(() => {
    if (!densityReady && _densityFocusSaved?.mode.kind === "departure") placeDensity(_densityFocusSaved);
  });

  useLayoutEffect(() => {
    _suppressDensityFocusSave = null;
    const el = parentRef.current;
    if (!el) return;
    const inherited = _densityFocusSaved;
    const saved = inherited ?? (densityMountHadReadyPublicationRef.current ? null : captureDensity("centre"));
    if (saved) _densityFocusSaved = saved;
    if (inherited || useSearchStore.getState()._browseNavigation) useSearchStore.getState().cancelWindowMaintenance();
    let active = true;
    const interrupt = () => {
      if (!active) return;
      if (saved) saved.retired = true;
      const continuity = useSearchStore.getState()._searchContinuity;
      if (continuity?.phase === "ready") {
        useSearchStore.setState({ _searchContinuity: { ...continuity, phase: "retired" }, _phantomFocusImageId: null });
      }
    };
    const onWheel = (event: WheelEvent) => { if (!event.ctrlKey && event.deltaY !== 0) interrupt(); };
    const onKey = (event: KeyboardEvent) => {
      if (isNativeInputTarget(event)) return;
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") &&
          (geometryRef.current.columns <= 1 || getEffectiveFocusMode() !== "explicit" ||
            useSearchStore.getState().focusedImageId === null || useSelectionStore.getState().selectedIds.size > 0)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) interrupt();
    };
    const onBoundaryKey = (event: KeyboardEvent) => { if (event.key === "Home" || event.key === "End") onKey(event); };
    const onScrubber = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-testid='scrubber-track']")) return;
      if (event instanceof WheelEvent && (event.ctrlKey || event.deltaY === 0)) return;
      interrupt();
    };
    const stop = () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", interrupt);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", onBoundaryKey, true);
      document.removeEventListener("pointerdown", onScrubber, true);
      document.removeEventListener("click", onScrubber, true);
      document.removeEventListener("wheel", onScrubber, true);
    };
    const finishDensityReady = () => {
      if (!active) return;
      active = false;
      stop();
      placeDensity(saved);
      if (_densityFocusSaved === saved) _densityFocusSaved = null;
      const state = useSearchStore.getState();
      const navigation = state._browseNavigation;
      if (navigation && !navigation.signal.aborted && navigation.phase !== "ready" && isTwoTierFromTotal(state.total)) {
        const geo = geometryRef.current;
        el.scrollTop = Math.floor(navigation.targetOffset / geo.columns) * geo.rowHeight;
      }
      densityMountedReadyRef.current = true;
      setDensityReady(true);
      markDensityRestoreComplete();
    };
    let secondFrame = 0;
    let firstFrame = 0;
    densityMountedReadyRef.current = false;
    if (saved || useSearchStore.getState()._browseNavigation) {
      el.addEventListener("wheel", onWheel, { passive: true });
      el.addEventListener("touchmove", interrupt, { passive: true });
      document.addEventListener("keydown", onKey);
      document.addEventListener("keydown", onBoundaryKey, true);
      document.addEventListener("pointerdown", onScrubber, true);
      document.addEventListener("click", onScrubber, true);
      document.addEventListener("wheel", onScrubber, { capture: true, passive: true });
      firstFrame = requestAnimationFrame(() => {
        if (active) secondFrame = requestAnimationFrame(finishDensityReady);
      });
    } else finishDensityReady();
    return () => {
      active = false;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      stop();
    };
  }, []);

  useLayoutEffect(() => () => {
    if (densityMountedReadyRef.current && !_suppressDensityFocusSave && _densityFocusSaved === null) {
      _densityFocusSaved = captureDensity("ratio");
    }
  }, []);
}



