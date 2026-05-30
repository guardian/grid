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
import { useSelectionStore } from "@/stores/selection-store";
import { useCollectionStore, buildColourMap } from "@/stores/collection-store";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";
import { storeImageOffset, buildSearchKey, extractSortValues } from "@/lib/image-offset-cache";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { pushNavigate, enterFullscreenPreview } from "@/lib/orchestration/search";
import { trace } from "@/lib/perceived-trace";
import { interpretClick, type Modifier } from "@/lib/interpretClick";
import { dispatchClickEffects, type AddRangeEffect } from "@/lib/dispatchClickEffects";
import { handleLongPressStart } from "@/lib/handleLongPressStart";
import { useLongPress } from "@/hooks/useLongPress";
import { Tickbox } from "@/components/Tickbox";
import { PILL_ACCENT, PILL_BASE } from "@/components/SearchPill";
import { useMetadataSearch } from "@/components/metadata-primitives";
import { CostBadge, buildCostTooltip } from "@/components/CostBadge";
import { SyndicationBadge } from "@/components/SyndicationBadge";
import { useEnrichedImage } from "@/hooks/useEnrichedImage";
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
// Pointer type detection -- coarse = touch device.
//
// Computed once at module load (CSR-only, no SSR). Used to:
//   1. Gate draggable on desktop only (draggable + long-press conflict on mobile
//      -- Android Chrome intercepts the long-press as a drag start and fires
//      pointercancel, killing the selection gesture).
//   2. Avoid setting the `draggable` attribute on ~50 cells on mobile where it
//      provides no benefit and has a marginal hit-testing overhead.
// Deviation documented in exploration/docs/deviations.md.
// ---------------------------------------------------------------------------
const IS_COARSE_POINTER =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

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

/** Convert raw persisted reason keys to human-readable past-participle phrases (Kahuna parity). */
const PERSIST_REASON_LABELS: Record<string, string> = {
  exports: "cropped",
  usages: "used",
  "persistence-identifier": "from Picdar",
  "photographer-category": "categorised as photographer",
  "illustrator-category": "categorised as illustrator",
  "commissioned-agency": "categorised as agency commissioned",
  "persisted-collection": "added to a persisted collection",
  photoshoot: "added to a photoshoot",
  leases: "leased",
};

function humanisePersistedReasons(reasons: string[]): string {
  const labels = reasons.map((r) => PERSIST_REASON_LABELS[r] ?? r);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1];
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
  if (primary === "dateAddedToCollection") {
    // ES sorts by max actionData.date across all memberships — mirror that here.
    const dates = image.collections
      ?.map((c) => c.actionData?.date)
      .filter((d): d is string => !!d)
      .sort();
    return `Added: ${formatDate(dates?.at(-1))}`;
  }
  return `Uploaded: ${formatDate(image.uploadTime)}`;
}

// ---------------------------------------------------------------------------
// Image borders — thick border on thumbnail for categorised images.
// Reusable: map usageRights.category → border colour. Add new categories here.
// ---------------------------------------------------------------------------


import { getImageBorderColour } from "@/lib/image-borders";

// ---------------------------------------------------------------------------
// GridCell — memoised individual cell
// ---------------------------------------------------------------------------

interface GridCellProps {
  image: Image | undefined;
  isFocused: boolean;
  cellWidth: number;
  dateLine?: string;
  animationClass?: string;
  onCellClick: (imageId: string, e: React.MouseEvent) => void;
  onCellDoubleClick: (imageId: string) => void;
  onTickClick: (imageId: string, e: React.MouseEvent) => void;
  /** Label pill click → search. StopPropagation handled inside GridCell. */
  onLabelSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
  /** pathId → cssColour from collection store tree. Undefined when store not yet loaded. */
  collectionColours?: Record<string, string>;
  /** Desktop only: set by ImageGrid when IS_COARSE_POINTER is false. */
  draggable?: boolean;
  /** Desktop only: dragstart handler passed from ImageGrid. */
  onDragStart?: (imageId: string, e: React.DragEvent) => void;
}

// Vendored Guardian cost config no longer needed — deriveImage handles cost computation.

const GridCell = memo(function GridCell({
  image,
  isFocused,
  cellWidth,
  dateLine,
  animationClass,
  onCellClick,
  onCellDoubleClick,
  onTickClick,
  onLabelSearch,
  collectionColours,
  draggable,
  onDragStart,
}: GridCellProps) {
  // Enrichment — each cell merges its own overlay so only this cell
  // re-renders when its enrichment data changes.
  const enriched = useEnrichedImage(image);
  const [graphicRevealed, setGraphicRevealed] = useState(false);
  const handleTickBound = useCallback(
    (e: React.MouseEvent) => { if (image) onTickClick(image.id, e); },
    [image?.id, onTickClick],
  );

  if (!image) {
    // Placeholder skeleton — no Tickbox (disabled prop renders null)
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
  const labels = image.userMetadata?.labels;

  // Cost: from deriveImage (ES baseline + API overlay merged)
  const cost = enriched?.cost;
  // Image border — thick coloured border on the thumbnail itself (not the cell).
  const imageBorderColor = getImageBorderColour(enriched ?? image);
  // Graphic blur — only from enrichment (isPotentiallyGraphic is a search-hit-only field)
  const isPotentiallyGraphic = enriched?.isPotentiallyGraphic;
  // Usages for print/digital icons — enrichment preferred, ES fallback via enrichedUsages
  type AnyUsage = { platform: string; dateAdded?: string };
  const usages: AnyUsage[] | undefined = enriched?.enrichedUsages ?? image.usages;
  // Persisted (archiver status) — API only
  const persisted = enriched?.persisted;
  // Syndication status — computed by deriveImage from ES data (SY-2)
  const syndicationStatus = enriched?.syndicationStatus;

  // Print/digital usage icons derived from usages list
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const hasPrintUsage = usages?.some((u) => u.platform === "print");
  const hasPrintRecentUsage = usages?.some(
    (u) => u.platform === "print" && u.dateAdded && new Date(u.dateAdded).getTime() > sevenDaysAgo,
  );
  const hasDigitalUsage = usages?.some((u) => u.platform === "digital");
  const hasDigitalRecentUsage = usages?.some(
    (u) => u.platform === "digital" && u.dateAdded && new Date(u.dateAdded).getTime() > sevenDaysAgo,
  );

  return (
    <div
      data-grid-cell
      data-cell-id={image.id}
      data-image-id={image.id}
      className={`shrink-0 relative flex flex-col bg-grid-cell rounded overflow-hidden cursor-pointer transition-shadow ${
        isFocused
          ? "ring-2 ring-grid-accent shadow-lg bg-grid-hover/40"
          : "hover:bg-grid-hover/15"
      } ${animationClass ?? ""}`}
      style={{ width: cellWidth, height: ROW_HEIGHT - CELL_GAP }}
      draggable={draggable}
      onClick={(e) => onCellClick(image.id, e)}
      onDoubleClick={() => onCellDoubleClick(image.id)}
      onDragStart={draggable ? (e) => onDragStart?.(image.id, e) : undefined}
    >
      {/* Selection tickbox — hidden by CSS, shown on hover or in Selection Mode */}
      <Tickbox imageId={image.id} onTickClick={handleTickBound} />
      {/* Thumbnail area — 190px block, flex-centred so img element hugs actual
           image content (border wraps the visible image, not the container). */}
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{ height: 190 }}
        title={descTooltip}
      >
        {thumbUrl ? (
          <img
            key={animationClass ? image.id : undefined}
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="max-w-full max-h-[186px] pointer-events-none"
            style={imageBorderColor ? { border: `10px solid ${imageBorderColor}` } : undefined}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-grid-text-dim text-sm">No thumbnail</span>
          </div>
        )}

        {/* Graphic image blur overlay — click to reveal (Kahuna row 5) */}
        {isPotentiallyGraphic && !graphicRevealed && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md bg-black/40 cursor-pointer z-10"
            onClick={(e) => { e.stopPropagation(); setGraphicRevealed(true); }}
            title="This image may contain graphic content. Click to reveal."
          >
            <span className="text-white text-xs font-semibold text-center px-2">
              Potentially graphic
            </span>
            <span className="text-white/70 text-2xs mt-1">Click to reveal</span>
          </div>
        )}

        {/* Icon row — bottom-right overlay (syndication, archiver, print/digital) */}
      </div>

      {/* Labels + collection badges — accent-blue pills below image, above description (matches Kahuna).
           Fixed height (h-6) reserved even when empty so descriptions align across cells. */}
      <div className="flex flex-nowrap gap-1 px-2 pt-1 overflow-hidden h-6 select-none">
        {labels && labels.length > 0 && labels.map((l) => (
          <button
            key={l}
            type="button"
            className={PILL_ACCENT + " shrink-0 max-w-full truncate"}
            title={l}
            onClick={(e) => {
              e.stopPropagation();
              onLabelSearch("label", l, e);
            }}
          >
            {l}
          </button>
        ))}
        {image.collections?.filter(c => c.pathId).map((col) => {
          const name = col.path?.at(-1) ?? col.pathId!.split("/").at(-1);
          const tooltip = col.path ? col.path.join(" \u25B8 ") : col.pathId!;
          const colour = collectionColours?.[col.pathId!] ?? "#555"; // #555 = Kahuna fallback
          return (
            <button
              key={col.pathId}
              type="button"
              className={PILL_BASE + " shrink-0 max-w-full truncate hover:brightness-125"}
              style={{ backgroundColor: colour, color: "#fff" }}
              title={tooltip}
              onClick={(e) => {
                e.stopPropagation();
                onLabelSearch("collection", col.pathId!, e);
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* Metadata — same background as cell, no separate strip */}
      <div className="px-2 py-1 space-y-0.5 shrink-0 select-none">
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

      {/* Bottom icon bar — pinned to cell bottom; status icons left, cost badge right */}
      <div className="mt-auto flex items-center justify-between px-1 py-0.5 select-none" style={{ minHeight: 20 }}>
        <div className="flex items-center gap-0.5">
          {/* Print usage icon (row 13) — local_library Material icon (filled) */}
          {hasPrintUsage && (
            <span className={hasPrintRecentUsage ? "text-[#DD0000]" : "text-grid-text-dim"} title={`Print usage${hasPrintRecentUsage ? " (recent)" : ""}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
                <path d="M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55zM12 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z" />
              </svg>
            </span>
          )}
          {/* Digital usage icon (row 14) — phonelink Material icon */}
          {hasDigitalUsage && (
            <span className={hasDigitalRecentUsage ? "text-[#DD0000]" : "text-grid-text-dim"} title={`Digital usage${hasDigitalRecentUsage ? " (recent)" : ""}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
                <path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {/* Syndication icon (row 11) — monetization_on Material icon. Immediate left of cost (Kahuna parity). */}
          <SyndicationBadge status={syndicationStatus} />
          {/* Cost badge (Kahuna rows 1–4; free hidden per Kahuna) */}
          {cost && cost !== "free" && (
            <CostBadge
              variant={enriched?.noRights ? "no-rights" : cost}
              size="sm"
              leased={enriched?.leasesSummary?.hasActiveAllowLease}
              tooltip={buildCostTooltip(
                enriched?.noRights ? "no-rights" : cost,
                enriched?.leasesSummary?.hasActiveAllowLease,
                enriched?.usageRights?.restrictions,
              )}
            />
          )}
          {/* Archiver / persisted icon (row 12) — custom "kept in library" padlock, extreme right */}
          {persisted?.value && (
            <span className="text-grid-text-dim" title={`Kept in Library because the image has been ${humanisePersistedReasons(persisted.reasons)}.`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="currentColor" width={14} height={14}>
                <path d="M113.8 98.7v15.1H14.1V14.2h42.7V0H14.2C6.4 0 0 6.4 0 14.2v99.6c0 7.8 6.4 14.2 14.2 14.2h99.6c7.8 0 14.2-6.4 14.2-14.2V98.7h-14.2z" />
                <path d="M67.7 88.6H118c4.6 0 8.4-3.8 8.4-8.4V38.3c0-4.6-3.8-8.4-8.4-8.4h-4.2v-8.4c0-11.5-9.4-20.9-21-20.9s-21 9.4-21 20.9v8.4h-4.2c-4.6 0-8.4 3.8-8.4 8.4v41.9c.1 4.6 3.9 8.4 8.5 8.4zM92.8 70C86.9 70 82 65.2 82 59.2c0-5.9 4.9-10.8 10.8-10.8s10.8 4.9 10.8 10.8c0 6-4.8 10.8-10.8 10.8zM79.9 21.5c0-7.2 5.8-13 13-13s13 5.8 13 13v8.4h-26v-8.4z" />
              </svg>
            </span>
          )}
        </div>
      </div>

    </div>
  );
});

// ---------------------------------------------------------------------------
// ImageGrid — main component
// ---------------------------------------------------------------------------

export interface ImageGridProps {
  /** S3a: range-select handler from useRangeSelection, mounted in search.tsx. */
  handleRange?: (effect: AddRangeEffect) => void;
}

export function ImageGrid({ handleRange }: ImageGridProps = {}) {
  const {
    results, total, bufferOffset, virtualizerCount, loadMore, seek,
    focusedImageId, setFocusedImageId,
    reportVisibleRange, getImage, findImageIndex,
    twoTier,
  } = useDataWindow();
  const searchParams = useSearch({ from: "/search" });
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
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
        isTable: false,
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
  // Selection mode — subscribe once at container level.
  // Per-cell components do NOT subscribe to this (would cause 1000+ re-renders
  // on mode flip). CSS handles tickbox visibility via data-selection-mode.
  // -------------------------------------------------------------------------

  const inSelectionMode = useSelectionStore((s) => s.selectedIds.size > 0);

  // -------------------------------------------------------------------------
  // Long-press gestures (S5 -- coarse pointer / touch selection)
  //
  // useLongPress fires onLongPressStart after LONG_PRESS_MS without movement.
  // Long-press on a new cell commits toggle+anchor (mode entry).
  // Long-press on a different cell while in selection mode dispatches an
  // add-range effect (same anchor-intent path as desktop shift-click).
  // -------------------------------------------------------------------------

  // Desktop drag-to-collection. Only wired on fine-pointer devices (see IS_COARSE_POINTER).
  // Single-image drag sets minimal payload; multi-image drag (selection mode) packages
  // all selected IDs. Full Kahuna MIME types (vnd.mediaservice.image+json etc.) are a
  // TODO -- requires the image's API URI which is not in the ES result yet.
  const handleDragStart = useCallback((imageId: string, e: React.DragEvent) => {
    const selState = useSelectionStore.getState();
    const inMode = selState.selectedIds.size > 0 && selState.selectedIds.has(imageId);
    const ids = inMode ? Array.from(selState.selectedIds) : [imageId];
    e.dataTransfer.effectAllowed = "copy";
    // text/plain: consumed by plain-text drop targets
    e.dataTransfer.setData("text/plain", ids.join(","));
    // Minimal Grid image payload -- TODO: extend to full Kahuna MIME types
    e.dataTransfer.setData(
      "application/vnd.mediaservice.images+json",
      JSON.stringify(ids.map((id) => ({ data: { id } }))),
    );
  }, []);

  // Label + collection pill click → search.
  const handleLabelSearch = useMetadataSearch();

  // Collection badge colours: pathId → cssColour, derived from the tree once at load.
  // Colour lives on the collection service node, not on the image ES document.
  const collectionTree = useCollectionStore(s => s.tree);
  const collectionColours = useMemo(
    () => collectionTree ? buildColourMap(collectionTree) : undefined,
    [collectionTree],
  );

  useLongPress({
    containerRef: parentRef,
    onLongPressStart: (cellId) =>
      handleLongPressStart({
        cellId,
        handleRange,
        findImageIndex,
        getImage,
        orderBy: searchParamsRef.current.orderBy,
      }),
  });

  // -------------------------------------------------------------------------
  // Click handlers (match table: single=focus, double=open detail)
  // -------------------------------------------------------------------------

  /** Navigate to image detail overlay (shared by single-click in phantom, double-click in explicit). */
  const enterDetail = useCallback(
    (imageId: string) => {
      trace("open-detail", "t_0", { imageId });
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
      pushNavigate(navigate, {
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: imageId }),
      });
    },
    [navigate, setFocusedImageId, findImageIndex, getImage, searchParams, bufferOffset, twoTier],
  );

  /**
   * Build an interpretClick context for a given image ID and modifier.
   * Reads search + selection store imperatively so the callback is stable.
   */
  const buildClickContext = useCallback(
    (imageId: string, modifier: Modifier) => {
      const selState = useSelectionStore.getState();
      const searchState = useSearchStore.getState();
      const idx = findImageIndex(imageId);
      const image = idx >= 0 ? getImage(idx) : undefined;
      const anchorId = selState.anchorId;
      const anchorGlobalIndex = anchorId
        ? (searchState.imagePositions.get(anchorId) ?? undefined)
        : undefined;
      const anchorSortValues = (() => {
        if (!anchorId) return null;
        const anchorImg = selState.metadataCache.get(anchorId);
        return anchorImg
          ? extractSortValues(anchorImg, searchParamsRef.current.orderBy)
          : null;
      })();
      return {
        targetId: imageId,
        modifier,
        inSelectionMode: selState.selectedIds.size > 0,
        anchorId,
        targetGlobalIndex: searchState.imagePositions.get(imageId),
        anchorGlobalIndex,
        targetSortValues: image
          ? extractSortValues(image, searchParamsRef.current.orderBy)
          : null,
        anchorSortValues,
      };
    },
    [findImageIndex, getImage],
  );

  const handleCellClick = useCallback(
    (imageId: string, e: React.MouseEvent) => {
      if (e.altKey) return; // alt-click: no-op in grid
      const inMode = useSelectionStore.getState().selectedIds.size > 0;
      if (e.shiftKey && !inMode) return; // shift outside selection mode: no-op in grid

      // Click-to-toggle: clicking the already-focused image clears focus.
      // Only in explicit mode (phantom has no focus ring — click opens detail).
      // Not in selection mode (click should toggle selection there, not focus).
      if (
        !e.shiftKey &&
        !inMode &&
        getEffectiveFocusMode() !== "phantom" &&
        imageId === useSearchStore.getState().focusedImageId
      ) {
        setFocusedImageId(null);
        return;
      }

      const modifier: Modifier =
        e.metaKey || e.ctrlKey ? "meta-or-ctrl" : e.shiftKey ? "shift" : "none";
      const effects = interpretClick({
        ...buildClickContext(imageId, modifier),
        kind: "image-body",
      });

      dispatchClickEffects(effects, { setFocusedImageId, enterDetail, handleRange });
    },
    [buildClickContext, setFocusedImageId, enterDetail, handleRange],
  );

  const handleTickClick = useCallback(
    (imageId: string, e: React.MouseEvent) => {
      const modifier: Modifier =
        e.metaKey || e.ctrlKey ? "meta-or-ctrl" : e.shiftKey ? "shift" : "none";
      const effects = interpretClick({
        ...buildClickContext(imageId, modifier),
        kind: "tick",
      });
      dispatchClickEffects(effects, { setFocusedImageId, enterDetail, handleRange });
    },
    [buildClickContext, setFocusedImageId, enterDetail, handleRange],
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

  // Middle-click on a cell → focus that image + enter fullscreen preview.
  // Uses mouseup (not auxclick) because auxclick doesn't carry transient
  // user activation in Firefox — requestFullscreen() fails silently.
  // Event delegation on the scroll container; find nearest [data-image-id].
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onMiddleUp = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const cell = (e.target as HTMLElement).closest("[data-image-id]");
      if (!cell) return;
      const id = cell.getAttribute("data-image-id");
      if (!id) return;
      e.preventDefault();
      setFocusedImageId(id);
      // requestAnimationFrame so the store update propagates to FullscreenPreview
      // (it reads focusedImageId to resolve the image to display).
      requestAnimationFrame(() => enterFullscreenPreview());
    };
    const onMiddleDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      // Only suppress Firefox autoscroll when clicking on a cell — gap clicks
      // should let Firefox start its autoscroll indicator normally.
      if ((e.target as Element).closest("[data-image-id]")) e.preventDefault();
    };
    el.addEventListener("mouseup", onMiddleUp);
    el.addEventListener("mousedown", onMiddleDown);
    return () => {
      el.removeEventListener("mouseup", onMiddleUp);
      el.removeEventListener("mousedown", onMiddleDown);
    };
  }, [setFocusedImageId]);

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
  // Animation state: arriving images + phantom focus pulse
  // -------------------------------------------------------------------------

  const arrivingImageIds = useSearchStore((s) => s._arrivingImageIds);
  const phantomPulseImageId = useSearchStore((s) => s._phantomPulseImageId);

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
      className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden hide-scrollbar pt-1 overscroll-y-contain"
      data-selection-mode={inSelectionMode ? "true" : undefined}
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
                // ── Animation: arriving images + phantom focus pulse ──
                const animClass = image
                  ? arrivingImageIds.has(image.id)
                    ? "anim-arriving"
                    : (phantomPulseImageId && image.id === phantomPulseImageId)
                      ? "anim-focus-here-unfocused"
                      : undefined
                  : undefined;

                return (
                  <GridCell
                    key={imageIdx}
                    image={image}
                    isFocused={!!image && image.id === focusedImageId && getEffectiveFocusMode() === "explicit" && !inSelectionMode}
                    cellWidth={cellWidth}
                    dateLine={image ? getCellDateLine(image, searchParams.orderBy) : undefined}
                    animationClass={animClass}
                    onCellClick={handleCellClick}
                    onCellDoubleClick={handleCellDoubleClick}
                    onTickClick={handleTickClick}
                    onLabelSearch={handleLabelSearch}
                    collectionColours={collectionColours}
                    draggable={IS_COARSE_POINTER ? undefined : true}
                    onDragStart={IS_COARSE_POINTER ? undefined : handleDragStart}
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

