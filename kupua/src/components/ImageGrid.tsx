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
  useRef,
  useState,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useSearchStore } from "@/stores/search-store";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";
import type { Image } from "@/types/image";
import { URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";
import { saveFocusRatio, consumeFocusRatio } from "@/lib/density-focus";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Minimum cell width in pixels — columns = floor(containerWidth / MIN_CELL_WIDTH). */
const MIN_CELL_WIDTH = 280;

/** Fixed row height (thumbnail area + metadata). Matches kahuna's 303px. */
const ROW_HEIGHT = 303;

/** Gap between cells in pixels. */
const CELL_GAP = 4;

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
        className="shrink-0 bg-grid-panel/30 rounded"
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
      className={`shrink-0 flex flex-col bg-grid-panel rounded overflow-hidden cursor-pointer transition-shadow ${
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
            className="block max-w-full max-h-[186px] mx-auto object-contain"
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
    results, total, virtualizerCount, loadMore,
    focusedImageId, setFocusedImageId,
    reportVisibleRange, getImage, findImageIndex,
  } = useDataWindow();
  const searchParams = useSearch({ from: "/search" });
  const parentRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // -------------------------------------------------------------------------
  // Responsive column count + cell width via ResizeObserver
  // -------------------------------------------------------------------------

  const [columns, setColumns] = useState(4);
  const [cellWidth, setCellWidth] = useState(MIN_CELL_WIDTH);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const update = (width: number) => {
      const cols = Math.max(1, Math.floor(width / MIN_CELL_WIDTH));
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
  }, []);

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
      navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: imageId }),
      });
    },
    [navigate, setFocusedImageId],
  );

  // -------------------------------------------------------------------------
  // Scroll handler: report visible range for gap detection + loadMore
  // -------------------------------------------------------------------------

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length > 0) {
      const firstRowIdx = virtualItems[0].index;
      const lastRowIdx = virtualItems[virtualItems.length - 1].index;
      // Convert row indices to flat image indices
      reportVisibleRange(firstRowIdx * columns, (lastRowIdx + 1) * columns - 1);
    }

    // Fallback loadMore near bottom
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (scrollBottom < 500 && results.length < total) {
      loadMore();
    }
  }, [virtualizer, reportVisibleRange, columns, results.length, total, loadMore]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // -------------------------------------------------------------------------
  // Scroll reset on search param change
  // -------------------------------------------------------------------------

  const prevSearchParamsRef = useRef(searchParams);
  useEffect(() => {
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

    el.scrollTop = 0;
    virtualizer.scrollToOffset(0);
  }, [searchParams, virtualizer]);

  // -------------------------------------------------------------------------
  // Ref for focused image — declared early so return-from-detail and
  // keyboard nav effects can both access it.
  // -------------------------------------------------------------------------

  const focusedImageIdRef = useRef(focusedImageId);
  focusedImageIdRef.current = focusedImageId;

  // -------------------------------------------------------------------------
  // Return-from-detail focus: scroll to focused image when image param clears.
  // Scroll position is preserved natively (grid stays fully laid out while
  // hidden — opacity:0, not display:none). Only scroll if the user navigated
  // to a different image via prev/next in image detail.
  // -------------------------------------------------------------------------

  const prevImageParam = useRef(searchParams.image);
  useEffect(() => {
    const wasViewing = prevImageParam.current;
    prevImageParam.current = searchParams.image;

    if (!wasViewing || searchParams.image) return;

    const previousFocus = focusedImageIdRef.current;
    setFocusedImageId(wasViewing);

    // Only scroll if the user navigated to a different image in detail.
    // If they viewed the same image, the grid's scroll position is intact.
    if (wasViewing !== previousFocus) {
      const idx = findImageIndex(wasViewing);
      if (idx >= 0) {
        const rowIdx = Math.floor(idx / columns);
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(rowIdx, { align: "center" });
        });
      }
    }
  }, [searchParams.image, findImageIndex, virtualizer, setFocusedImageId, columns]);

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

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const id = focusedImageId;
    if (!id) return;

    const idx = findImageIndex(id);
    if (idx < 0) return;

    const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
    const rowTop = Math.floor(idx / cols) * ROW_HEIGHT;

    const ratio = consumeFocusRatio();
    if (ratio != null) {
      // Restore: place focused row at the same relative viewport position
      const targetScroll = rowTop - ratio * el.clientHeight;
      const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetScroll));
      virtualizer.scrollToOffset(clamped);
    } else {
      // No saved ratio (first load, not a density switch) — center
      const rowIdx = Math.floor(idx / cols);
      virtualizer.scrollToIndex(rowIdx, { align: "center" });
    }

    return () => {
      // Save viewport ratio on unmount for the next density to consume
      const el = parentRef.current;
      if (!el) return;
      const { focusedImageId: fid, imagePositions } = useSearchStore.getState();
      if (!fid) return;
      const fIdx = imagePositions.get(fid) ?? -1;
      if (fIdx < 0) return;
      const c = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
      const fRowTop = Math.floor(fIdx / c) * ROW_HEIGHT;
      saveFocusRatio((fRowTop - el.scrollTop) / el.clientHeight);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: scroll to persisted focus on density switch
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
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      role="region"
      aria-label="Image results grid"
      className="flex-1 min-w-0 overflow-auto pt-1"
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
              {Array.from({ length: columns }, (_, colIdx) => {
                const imageIdx = startIdx + colIdx;
                if (imageIdx >= virtualizerCount) return null;
                const image = getImage(imageIdx);
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






