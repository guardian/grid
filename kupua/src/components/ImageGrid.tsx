/**
 * ImageGrid — thumbnail grid density.
 *
 * An alternative rendering of the same result set as ImageTable. Consumes
 * `useDataWindow()` for data, focus, and gap detection — shares the exact
 * same data layer, no duplication.
 *
 * Layout: responsive grid of equal-size cells. Column count derived from
 * container width via ResizeObserver. Virtualised by row (each virtual row
 * renders N cells) using TanStack Virtual.
 *
 * Cell content (v1): S3 thumbnail + description (1 line, truncated) + date.
 * See grid-view-plan.md for full spec and kahuna analysis.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useReturnFromDetail } from "@/hooks/useReturnFromDetail";
import { useSearchStore } from "@/stores/search-store";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";
import { storeImageOffset, buildSearchKey } from "@/lib/image-offset-cache";
import { registerScrollContainer } from "@/lib/scroll-container-ref";
import { registerScrollReset } from "@/lib/scroll-reset-ref";
import type { Image } from "@/types/image";
import { URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";
import { saveFocusRatio, consumeFocusRatio } from "@/lib/density-focus";
import { saveSortFocusRatio, consumeSortFocusRatio } from "@/lib/sort-focus";
import {
  GRID_ROW_HEIGHT as ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH as MIN_CELL_WIDTH,
  GRID_CELL_GAP as CELL_GAP,
} from "@/constants/layout";

// ---------------------------------------------------------------------------
// Tooltip helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | undefined): string {
  if (!iso) return "[none]";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) + ", " + d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildDescriptionTooltip(image: Image): string {
  const desc = image.metadata?.description || image.metadata?.title || "";
  const by = image.metadata?.byline || "[none]";
  const credit = image.metadata?.credit || "[none]";
  return `${desc}\n      By: ${by}\nCredit: ${credit}`;
}

function buildDateTooltip(image: Image): string {
  return `Uploaded: ${formatDate(image.uploadTime)}\n      Taken: ${formatDate(image.metadata?.dateTaken)}\n  Modified: ${formatDate(image.lastModified)}`;
}

// ---------------------------------------------------------------------------
// GridCell — memoised individual cell
// ---------------------------------------------------------------------------

interface GridCellProps {
  image: Image | undefined;
  isFocused: boolean;
  cellWidth: number;
  onCellClick: (imageId: string) => void;
  onCellDoubleClick: (imageId: string) => void;
}

const GridCell = memo(function GridCell({
  image,
  isFocused,
  cellWidth,
  onCellClick,
  onCellDoubleClick,
}: GridCellProps) {
  if (!image) {
    // Placeholder skeleton
    return (
      <div
        className="shrink-0 bg-grid-cell/30 rounded"
        style={{ width: cellWidth, height: ROW_HEIGHT - CELL_GAP }}
      />
    );
  }

  const thumbUrl = thumbnailsEnabled ? getThumbnailUrl(image) : undefined;
  const descTooltip = buildDescriptionTooltip(image);
  const dateTooltip = buildDateTooltip(image);
  const description = image.metadata?.description || image.metadata?.title || "";
  const uploadDate = formatDate(image.uploadTime);

  return (
    <div
      className={`shrink-0 flex flex-col bg-grid-cell rounded overflow-hidden cursor-pointer transition-shadow ${
        isFocused
          ? "ring-2 ring-grid-accent shadow-lg bg-grid-hover/40"
          : "hover:bg-grid-hover/15"
      }`}
      style={{ width: cellWidth, height: ROW_HEIGHT - CELL_GAP }}
      onClick={() => onCellClick(image.id)}
      onDoubleClick={() => onCellDoubleClick(image.id)}
    >
      {/* Thumbnail area — 190px block, image top-aligned, horizontally centred (matches Kahuna) */}
      <div
        className="overflow-hidden"
        style={{ height: 190 }}
        title={descTooltip}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="block w-full h-[186px] object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-grid-text-dim text-sm">No thumbnail</span>
          </div>
        )}
      </div>

      {/* Metadata — same background as cell, no separate strip */}
      <div className="px-2 py-1 space-y-0.5 shrink-0">
        <p
          className="text-xs text-grid-text truncate"
          title={descTooltip}
        >
          {description || "\u00A0"}
        </p>
        <p
          className="text-2xs text-grid-text-dim truncate"
          title={dateTooltip}
        >
          Uploaded: {uploadDate}
        </p>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ImageGrid — main component
// ---------------------------------------------------------------------------

export function ImageGrid() {
  const {
    results, total, bufferOffset, virtualizerCount, loadMore, seek,
    focusedImageId, setFocusedImageId,
    reportVisibleRange, getImage, findImageIndex,
  } = useDataWindow();
  const searchParams = useSearch({ from: "/search" });
  const parentRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // B.1: Register this component's scroll container so Scrubber can find it
  // without DOM archaeology. Runs once on mount; clears on unmount.
  useEffect(() => {
    registerScrollContainer(parentRef.current);
    return () => registerScrollContainer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  // -------------------------------------------------------------------------
  // Responsive column count + cell width via ResizeObserver
  //
  // Scroll anchoring: when the column count changes (panel toggle, panel
  // resize, browser window resize), we capture the anchor image's viewport
  // position BEFORE React re-renders, then restore it AFTER in a
  // useLayoutEffect. The anchor is the focused image (if any), otherwise
  // the image nearest the viewport centre.
  // -------------------------------------------------------------------------

  const [columns, setColumns] = useState(4);
  const [cellWidth, setCellWidth] = useState(MIN_CELL_WIDTH);

  // Ref to track previous column count for change detection in ResizeObserver
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // Anchor state: captured in ResizeObserver, consumed in useLayoutEffect
  const anchorRef = useRef<{
    /** Flat image index of the anchor image */
    imageIndex: number;
    /** Viewport ratio: 0 = top edge, 1 = bottom edge */
    viewportRatio: number;
  } | null>(null);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    // Track whether this is the first update (mount). On mount, the column
    // count changes from the useState default (4) to the real value. We must
    // NOT capture an anchor for this initial change — the mount layout effect
    // already handles scroll positioning. Capturing an anchor here uses the
    // wrong column count (the default, not the real one), producing a bad
    // ratio that the scroll-anchoring effect then uses to scroll to the wrong
    // position (Bug #17).
    let isFirstUpdate = true;

    const update = (width: number) => {
      const cols = Math.max(1, Math.floor(width / MIN_CELL_WIDTH));
      const prevCols = columnsRef.current;

      // Capture anchor BEFORE setting state (before React re-renders)
      if (cols !== prevCols && !isFirstUpdate) {
        const anchor = captureAnchor(el, prevCols);
        if (anchor) {
          anchorRef.current = anchor;
        }
      }
      isFirstUpdate = false;

      setColumns(cols);
      setCellWidth(Math.floor((width - CELL_GAP * (cols + 1)) / cols));
    };

    const observer = new ResizeObserver((entries) => {
      update(entries[0]?.contentRect.width ?? el.clientWidth);
    });
    observer.observe(el);
    // Set initial value synchronously so the first render has correct sizes
    update(el.clientWidth);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable: refs + state setters only
  }, []);

  /**
   * Capture the anchor image and its viewport position.
   * Called from ResizeObserver when column count is about to change.
   */
  function captureAnchor(el: HTMLElement, cols: number): { imageIndex: number; viewportRatio: number } | null {
    // Prefer the focused image as anchor
    const fid = focusedImageIdRef.current;
    if (fid) {
      const { imagePositions, bufferOffset } = useSearchStore.getState();
      const globalIdx = imagePositions.get(fid);
      if (globalIdx != null && globalIdx >= 0) {
        const localIdx = globalIdx - bufferOffset;
        if (localIdx >= 0) {
          const rowTop = Math.floor(localIdx / cols) * ROW_HEIGHT;
          const ratio = (rowTop - el.scrollTop) / el.clientHeight;
          return { imageIndex: localIdx, viewportRatio: ratio };
        }
      }
    }

    // Fallback: image nearest the viewport centre
    const centreScroll = el.scrollTop + el.clientHeight / 2;
    const centreRow = Math.floor(centreScroll / ROW_HEIGHT);
    const centreIdx = centreRow * cols; // first image in that row
    const ratio = (centreRow * ROW_HEIGHT - el.scrollTop) / el.clientHeight;
    return { imageIndex: centreIdx, viewportRatio: ratio };
  }

  // -------------------------------------------------------------------------
  // Derived layout values
  // -------------------------------------------------------------------------

  const rowCount = Math.ceil(virtualizerCount / columns);

  // -------------------------------------------------------------------------
  // Virtualizer — virtualises rows, not individual cells.
  // Each virtual row renders `columns` cells.
  // -------------------------------------------------------------------------

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // Register a virtualizer-level scroll-reset callback so imperative callers
  // (Home logo click) can reset BOTH DOM scrollTop AND virtualizer internal
  // state. Without this, the virtualizer can lag behind after deep seeks.
  useEffect(() => {
    registerScrollReset(() => virtualizer.scrollToOffset(0));
    return () => registerScrollReset(null);
  }, [virtualizer]);

  // -------------------------------------------------------------------------
  // Scroll anchoring: restore position after column count change.
  // Runs before paint (useLayoutEffect) so there's no visible jump.
  // The anchor was captured in the ResizeObserver callback above.
  // -------------------------------------------------------------------------

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null; // consume once

    const el = parentRef.current;
    if (!el) return;

    // Calculate the anchor image's new row position with the new column count
    const newRowTop = Math.floor(anchor.imageIndex / columns) * ROW_HEIGHT;
    const targetScroll = newRowTop - anchor.viewportRatio * el.clientHeight;
    const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetScroll));
    virtualizer.scrollToOffset(clamped);
  }, [columns, virtualizer]);

  // -------------------------------------------------------------------------
  // Click handlers (match table: single=focus, double=open detail)
  // -------------------------------------------------------------------------

  const handleCellClick = useCallback(
    (imageId: string) => {
      setFocusedImageId(imageId);
    },
    [setFocusedImageId],
  );

  const handleCellDoubleClick = useCallback(
    (imageId: string) => {
      setFocusedImageId(imageId);
      const idx = findImageIndex(imageId);
      if (idx >= 0) storeImageOffset(imageId, bufferOffset + idx, buildSearchKey(searchParams));
      navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: imageId }),
      });
    },
    [navigate, setFocusedImageId, findImageIndex, searchParams, bufferOffset],
  );

  // -------------------------------------------------------------------------
  // Scroll handler: report visible range for gap detection + loadMore
  // -------------------------------------------------------------------------

  // Ref-stabilise results.length and total so the callback doesn't churn on
  // every data load (same pattern as ImageTable fix #7).
  const resultsLengthRef = useRef(results.length);
  resultsLengthRef.current = results.length;
  const totalRef = useRef(total);
  totalRef.current = total;

  // A.1: Stabilise virtualizer ref — TanStack Virtual returns a new object
  // every render, so putting `virtualizer` directly in the useCallback dep
  // array creates a new handleScroll every render → useEffect tears down and
  // re-attaches the scroll listener every render. Store it in a ref instead;
  // the callback always reads the latest virtualizer without causing churn.
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  // Stable ref for loadMore (store-bound, but we want zero-dep callback)
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    // Report the *actual* visible range (without overscan) — see ImageTable
    // handleScroll for detailed rationale. For the grid, overscan rows are
    // converted to flat image indices.
    const range = virtualizerRef.current.range;
    if (range) {
      const firstRowIdx = range.startIndex;
      const lastRowIdx = range.endIndex;
      // Convert row indices to flat image indices
      reportVisibleRange(firstRowIdx * columns, (lastRowIdx + 1) * columns - 1);
    }

    // Fallback loadMore near bottom
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (scrollBottom < 500 && resultsLengthRef.current < totalRef.current) {
      loadMoreRef.current();
    }
  }, [reportVisibleRange, columns]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // After buffer changes (seek / search / extend), the virtualizer re-renders
  // but scrollTop may not change, so no scroll event fires. Manually refresh
  // the visible range so the Scrubber thumb stays in sync.
  useEffect(() => {
    handleScroll();
  }, [bufferOffset, results.length, handleScroll]);

  // Backward extend scroll compensation: when items are prepended to the
  // buffer, adjust scrollTop to prevent content shift (same as ImageTable).
  // Uses useLayoutEffect to adjust before paint — prevents visible flicker.
  const prependGeneration = useSearchStore((s) => s._prependGeneration);
  const lastPrependCount = useSearchStore((s) => s._lastPrependCount);
  const prevPrependGenRef = useRef(prependGeneration);
  useLayoutEffect(() => {
    if (prependGeneration === prevPrependGenRef.current) return;
    prevPrependGenRef.current = prependGeneration;
    const el = parentRef.current;
    if (!el || lastPrependCount <= 0) return;
    const prependedRows = Math.ceil(lastPrependCount / columns);
    el.scrollTop += prependedRows * ROW_HEIGHT;
  }, [prependGeneration, lastPrependCount, columns]);

  // Forward extend scroll compensation (Bug #16): when extendForward evicts
  // items from the start of the buffer, the data shifts under the viewport.
  // Without adjustment, the visible indices remain near the buffer end →
  // triggers another extendForward → infinite loop. Subtract the evicted
  // rows' pixel height so the viewport tracks the same data after eviction.
  const forwardEvictGeneration = useSearchStore((s) => s._forwardEvictGeneration);
  const lastForwardEvictCount = useSearchStore((s) => s._lastForwardEvictCount);
  const prevForwardEvictGenRef = useRef(forwardEvictGeneration);
  useLayoutEffect(() => {
    if (forwardEvictGeneration === prevForwardEvictGenRef.current) return;
    prevForwardEvictGenRef.current = forwardEvictGeneration;
    const el = parentRef.current;
    if (!el || lastForwardEvictCount <= 0) return;
    const evictedRows = Math.ceil(lastForwardEvictCount / columns);
    el.scrollTop -= evictedRows * ROW_HEIGHT;
  }, [forwardEvictGeneration, lastForwardEvictCount, columns]);

  // Scroll to target position after seek (same as ImageTable).
  const seekGeneration = useSearchStore((s) => s._seekGeneration);
  const seekTargetLocalIndex = useSearchStore((s) => s._seekTargetLocalIndex);
  const prevSeekGenRef = useRef(seekGeneration);
  useLayoutEffect(() => {
    if (seekGeneration === prevSeekGenRef.current) return;
    prevSeekGenRef.current = seekGeneration;
    const targetIdx = seekTargetLocalIndex >= 0 ? seekTargetLocalIndex : 0;
    const rowIdx = Math.floor(targetIdx / columns);
    virtualizer.scrollToIndex(rowIdx, { align: "start" });
    // Dispatch a deferred scroll event after the seek cooldown (500ms) has
    // expired. This triggers reportVisibleRange → extendForward/Backward,
    // ensuring the buffer extends if the seek landed near a buffer edge.
    // Without this, the user would be stuck at the bottom of a short buffer
    // with no way to scroll further until a manual scroll event fires.
    const el = parentRef.current;
    if (el) {
      const timer = setTimeout(() => {
        el.dispatchEvent(new Event("scroll"));
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [seekGeneration, seekTargetLocalIndex, virtualizer, columns]);

  // -------------------------------------------------------------------------
  // Scroll reset on search param change
  // -------------------------------------------------------------------------

  const prevSearchParamsRef = useRef(searchParams);
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const prev = prevSearchParamsRef.current;
    prevSearchParamsRef.current = searchParams;

    const onlyDisplayKeysChanged = Object.keys({ ...prev, ...searchParams }).every(
      (key) =>
        URL_DISPLAY_KEYS.has(key as keyof UrlSearchParams) ||
        prev[key as keyof typeof prev] === searchParams[key as keyof typeof searchParams]
    );
    if (onlyDisplayKeysChanged) return;

    // Skip scroll-reset when sort-around-focus is active. When the user
    // changes sort with a focused image, sort-around-focus handles scroll
    // positioning. Resetting scrollTop here would flash wrong content
    // (old buffer at position 0) before sort-around-focus corrects it.
    // Capture the focused item's viewport ratio BEFORE the sort — the
    // sortAroundFocusGeneration effect will restore it after the async
    // search places the image at its new position.
    const isSortOnlyChange =
      prev.orderBy !== searchParams.orderBy &&
      Object.keys({ ...prev, ...searchParams }).every(
        (key) =>
          key === "orderBy" ||
          URL_DISPLAY_KEYS.has(key as keyof UrlSearchParams) ||
          prev[key as keyof typeof prev] === searchParams[key as keyof typeof searchParams]
      );
    if (isSortOnlyChange && focusedImageId) {
      const store = useSearchStore.getState();
      const gIdx = store.imagePositions.get(focusedImageId);
      if (gIdx != null) {
        const localIdx = gIdx - store.bufferOffset;
        if (localIdx >= 0) {
          const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
          const rowTop = Math.floor(localIdx / cols) * ROW_HEIGHT;
          saveSortFocusRatio((rowTop - el.scrollTop) / el.clientHeight);
        }
      }
      return;
    }

    el.scrollTop = 0;
    virtualizer.scrollToOffset(0);
  }, [searchParams, virtualizer, focusedImageId]);

  // Belt-and-suspenders: when bufferOffset transitions to 0 from a non-zero
  // value (search completed after Home click / logo click / new query), force
  // scroll to top. This catches cases where searchParams didn't change (Home
  // click from default state) so the above effect doesn't fire, but the
  // buffer was repositioned by store.search().
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
  }, [bufferOffset, virtualizer]);

  // -------------------------------------------------------------------------
  // Ref for focused image — used by captureAnchor (scroll anchoring).
  // -------------------------------------------------------------------------

  const focusedImageIdRef = useRef(focusedImageId);
  focusedImageIdRef.current = focusedImageId;

  // -------------------------------------------------------------------------
  // Restore focus and scroll when returning from image detail overlay.
  // -------------------------------------------------------------------------

  useReturnFromDetail({
    imageParam: searchParams.image,
    focusedImageId,
    setFocusedImageId,
    findImageIndex,
    virtualizer,
    flatIndexToRow: (idx) => Math.floor(idx / columns),
  });

  // Sort-around-focus: scroll to the focused image at its new position.
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
    const saved = consumeSortFocusRatio();
    if (el && saved) {
      // Restore the focused item at the same viewport ratio it had before
      // the sort change — "Never Lost" ratio preservation.
      const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
      const rowTop = Math.floor(idx / cols) * ROW_HEIGHT;
      let target = rowTop - saved.ratio * el.clientHeight;
      // Edge clamping: ensure item stays on screen
      const itemY = rowTop - target;
      if (itemY < 0) target = rowTop;
      else if (itemY > el.clientHeight - ROW_HEIGHT)
        target = rowTop - el.clientHeight + ROW_HEIGHT;
      const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target));
      virtualizer.scrollToOffset(clamped);
    } else {
      // No saved ratio (edge case) — fall back to start alignment
      const rowIdx = Math.floor(idx / columns);
      virtualizer.scrollToIndex(rowIdx, { align: "start" });
    }
  }, [sortAroundFocusGeneration, findImageIndex, virtualizer, columns]);

  // -------------------------------------------------------------------------
  // Preserve focused item's viewport position across density switches.
  //
  // Mount: if a focus exists (from the other density), scroll so the
  // focused row appears at the same relative viewport position it had
  // before the switch. Falls back to center if no ratio was saved.
  //
  // Unmount: save the focused row's viewport ratio so the next density
  // can restore it.
  //
  // useLayoutEffect is synchronous before paint — no visible jump.
  // -------------------------------------------------------------------------

  // Mount: restore scroll position for focused image
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const id = focusedImageId;
    if (!id) return;

    const saved = consumeFocusRatio();
    // Prefer the saved localIndex (immune to imagePositions eviction)
    const idx = saved != null ? saved.localIndex : findImageIndex(id);
    if (idx < 0) return;

    const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
    const rowTop = Math.floor(idx / cols) * ROW_HEIGHT;

    if (saved != null) {
      const targetScroll = rowTop - saved.ratio * el.clientHeight;
      const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetScroll));
      virtualizer.scrollToOffset(clamped);
    } else {
      const rowIdx = Math.floor(idx / cols);
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
      const { focusedImageId: fid, imagePositions, bufferOffset } = useSearchStore.getState();
      if (!fid) return;
      const globalIdx = imagePositions.get(fid) ?? -1;
      if (globalIdx < 0) return;
      const localIdx = globalIdx - bufferOffset;
      if (localIdx < 0) return;
      const c = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
      const fRowTop = Math.floor(localIdx / c) * ROW_HEIGHT;
      saveFocusRatio((fRowTop - el.scrollTop) / el.clientHeight, localIdx);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard navigation — delegated to shared hook
  // -------------------------------------------------------------------------

  useListNavigation({
    columnsPerRow: columns,
    virtualizer,
    scrollRef: parentRef,
    rowHeight: ROW_HEIGHT,
    headerHeight: 0, // grid has no header inside the scroll container
    focusedImageId,
    setFocusedImageId,
    virtualizerCount,
    getImage,
    findImageIndex,
    resultsLength: results.length,
    total,
    loadMore,
    onEnter: handleCellDoubleClick,
    imageParam: searchParams.image,
    flatIndexToRow: (idx) => Math.floor(idx / columns),
    bufferOffset,
    seek,
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const virtualItems = virtualizer.getVirtualItems();

  // A.2: Memoize the column index array. Without this, Array.from allocates a
  // new array on every virtual row during every render pass — at 6 cols × 15
  // rows × 60fps that's ~5,400 short-lived GC-able arrays per second.
  const columnIndices = useMemo(
    () => Array.from({ length: columns }, (_, i) => i),
    [columns],
  );

  return (
    <div
      ref={parentRef}
      role="region"
      aria-label="Image results grid"
      className="flex-1 min-w-0 overflow-auto hide-scrollbar pt-1"
    >
      <div
        style={{ height: virtualizer.getTotalSize() }}
        className="relative w-full"
      >
        {virtualItems.map((virtualRow) => {
          const startIdx = virtualRow.index * columns;
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 right-0 flex"
              style={{
                top: virtualRow.start,
                height: ROW_HEIGHT,
                gap: CELL_GAP,
                padding: `0 ${CELL_GAP}px`,
              }}
            >
              {columnIndices.map((colIdx) => {
                const imageIdx = startIdx + colIdx;
                if (imageIdx >= virtualizerCount) return null;
                const image = getImage(imageIdx);
                // Positional key: TanStack Virtual uses positional rendering
                // (row N at top: N * estimateSize). Content-based keys
                // (image.id) cause visible reordering during seeks/searches
                // because React reuses component instances from old virtual
                // positions, fighting the virtualizer's layout. Positional
                // keys match the virtualizer's model. (A.4 tried content
                // keys for -14% domChurn on extends, but the visual
                // reordering on seeks was a worse regression — reverted.)
                return (
                  <GridCell
                    key={imageIdx}
                    image={image}
                    isFocused={!!image && image.id === focusedImageId}
                    cellWidth={cellWidth}
                    onCellClick={handleCellClick}
                    onCellDoubleClick={handleCellDoubleClick}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

