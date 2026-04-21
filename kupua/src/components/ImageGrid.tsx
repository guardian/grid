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
import { useScrollEffects } from "@/hooks/useScrollEffects";
import { useSearchStore } from "@/stores/search-store";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";
import { storeImageOffset, buildSearchKey, extractSortValues } from "@/lib/image-offset-cache";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import type { Image } from "@/types/image";
import {
  GRID_ROW_HEIGHT as ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH as MIN_CELL_WIDTH,
  GRID_CELL_GAP as CELL_GAP,
} from "@/constants/layout";
import {
  SCROLL_MODE_THRESHOLD,
  POSITION_MAP_THRESHOLD,
} from "@/constants/tuning";

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

/**
 * Pick the date label + value to show on the grid cell based on the primary
 * sort field. Matches kahuna behaviour: when sorting by date taken, show
 * "Taken: …"; when sorting by last modified, show "Modified: …"; otherwise
 * default to "Uploaded: …".
 */
function getCellDateLine(image: Image, orderBy: string | undefined): string {
  const primary = (orderBy ?? "-uploadTime").split(",")[0].replace(/^-/, "");
  if (primary === "taken") {
    return `Taken: ${formatDate(image.metadata?.dateTaken)}`;
  }
  if (primary === "lastModified") {
    return `Modified: ${formatDate(image.lastModified)}`;
  }
  return `Uploaded: ${formatDate(image.uploadTime)}`;
}

// ---------------------------------------------------------------------------
// GridCell — memoised individual cell
// ---------------------------------------------------------------------------

interface GridCellProps {
  image: Image | undefined;
  isFocused: boolean;
  cellWidth: number;
  dateLine?: string;
  onCellClick: (imageId: string, e: React.MouseEvent) => void;
  onCellDoubleClick: (imageId: string) => void;
}

const GridCell = memo(function GridCell({
  image,
  isFocused,
  cellWidth,
  dateLine,
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

  return (
    <div
      data-grid-cell
      data-image-id={image.id}
      className={`shrink-0 flex flex-col bg-grid-cell rounded overflow-hidden cursor-pointer transition-shadow ${
        isFocused
          ? "ring-2 ring-grid-accent shadow-lg bg-grid-hover/40"
          : "hover:bg-grid-hover/15"
      }`}
      style={{ width: cellWidth, height: ROW_HEIGHT - CELL_GAP }}
      onClick={(e) => onCellClick(image.id, e)}
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
          {dateLine}
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
    twoTier,
  } = useDataWindow();
  const searchParams = useSearch({ from: "/search" });
  const parentRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
      const { imagePositions, bufferOffset, total } = useSearchStore.getState();
      // Derive twoTier from current store state — NOT from the hook scope,
      // which is stale inside the ResizeObserver closure (useEffect deps=[]).
      const isTwoTier = POSITION_MAP_THRESHOLD > 0
        && total > SCROLL_MODE_THRESHOLD
        && total <= POSITION_MAP_THRESHOLD;
      const globalIdx = imagePositions.get(fid);
      if (globalIdx != null && globalIdx >= 0) {
        // In two-tier mode, the virtualizer uses global indices directly.
        // In normal mode, use buffer-local indices.
        const virtIdx = isTwoTier ? globalIdx : globalIdx - bufferOffset;
        if (virtIdx >= 0) {
          const rowTop = Math.floor(virtIdx / cols) * ROW_HEIGHT;
          const ratio = (rowTop - el.scrollTop) / el.clientHeight;
          return { imageIndex: virtIdx, viewportRatio: ratio };
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

  // -------------------------------------------------------------------------
  // Shared scroll effects (scroll container registration, scroll handler,
  // scroll compensation, seek, search-params reset, density/sort focus, etc.)
  // -------------------------------------------------------------------------

  useScrollEffects({
    virtualizer,
    parentRef,
    geometry: useMemo(
      () => ({
        rowHeight: ROW_HEIGHT,
        columns,
        headerOffset: 0,
        preserveScrollLeftOnSort: false,
        minCellWidth: MIN_CELL_WIDTH,
      }),
      [columns],
    ),
    reportVisibleRange,
    resultsLength: results.length,
    total,
    bufferOffset,
    loadMore,
    focusedImageId,
    findImageIndex,
    twoTier,
  });

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

  /** Navigate to image detail overlay (shared by single-click in phantom, double-click in explicit). */
  const enterDetail = useCallback(
    (imageId: string) => {
      setFocusedImageId(imageId);
      const idx = findImageIndex(imageId);
      if (idx >= 0) {
        const img = getImage(idx);
        const cursor = img ? extractSortValues(img, searchParams.orderBy) : null;
        // In two-tier mode, idx from findImageIndex is already global.
        // In normal mode, add bufferOffset to get global position.
        const globalOffset = twoTier ? idx : bufferOffset + idx;
        storeImageOffset(imageId, globalOffset, buildSearchKey(searchParams), cursor);
      }
      navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: imageId }),
      });
    },
    [navigate, setFocusedImageId, findImageIndex, getImage, searchParams, bufferOffset, twoTier],
  );

  const handleCellClick = useCallback(
    (imageId: string, e: React.MouseEvent) => {
      // Shift/Alt+click are click-to-search gestures — never enter detail.
      if (e.shiftKey || e.altKey) return;
      if (getEffectiveFocusMode() === "phantom") {
        // Phantom mode: single-click enters detail directly (like Kahuna).
        enterDetail(imageId);
        return;
      }
      setFocusedImageId(imageId);
    },
    [setFocusedImageId, enterDetail],
  );

  /** Clear focus when clicking the grid background (gaps between cells). */
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (getEffectiveFocusMode() === "phantom") return;
      // If the click originated inside a cell, the cell's own onClick already
      // handled it. We only clear focus for clicks on the background — the
      // scroll container, the sizer div, or the row flex containers (gaps).
      const target = e.target as HTMLElement;
      if (target.closest("[data-grid-cell]")) return;
      setFocusedImageId(null);
    },
    [setFocusedImageId],
  );

  const handleCellDoubleClick = enterDetail;

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
      className="flex-1 min-w-0 overflow-auto hide-scrollbar pt-1 overscroll-y-contain"
      onClick={handleBackgroundClick}
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
                    isFocused={!!image && image.id === focusedImageId && getEffectiveFocusMode() === "explicit"}
                    cellWidth={cellWidth}
                    dateLine={image ? getCellDateLine(image, searchParams.orderBy) : undefined}
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

