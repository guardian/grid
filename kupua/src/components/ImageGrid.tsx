import { ResultLibraryBadge, type InlineLibrary } from "./ResultLibraryBadge";
import { useResultLibrary } from "@/hooks/useResultLibrary";
import { startResultImageDrag } from "@/lib/result-image-drag";
import { useDetailsBodyClick } from "@/hooks/useDetailsBodyClick";
/**
 * ImageGrid — thumbnail grid density.
 *
 * An alternative rendering of the same result set as ImageTable. Consumes
 * `useDataWindow()` for data, focus, and gap detection — shares the exact
 * same data layer, no duplication.
 *
 * Fixed grid: responsive equal-size cells, with columns derived from container
 * width. Justified density supplies a resident or windowed layout factory instead.
 * Both virtualise rows with TanStack Virtual and share interaction/return owners.
 * Justified renders image-only cells; the fixed grid retains metadata.
 */

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useBrowsingContext, useBrowsingSearch } from "@/lib/browsing-context";
import { useVirtualizer } from "@tanstack/react-virtual";
import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";
import { useDataWindow, getViewportAnchorId } from "@/hooks/useDataWindow";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useReturnFromDetail } from "@/hooks/useReturnFromDetail";
import { useScrollEffects, type ScrollGeometry } from "@/hooks/useScrollEffects";
import { useMeasuredLayout, type MeasuredCells } from "@/hooks/useMeasuredLayout";
import { composeUploadLayout, fixedUploadLayout, getUploadStickyInset, type SectionLayout } from "@/lib/upload-section-layout";
import { UploadPageChrome, UploadSectionHeading } from "./UploadSections";
import { useUploadLayoutStore } from "@/stores/upload-layout-store";
import { measuredLayoutRowKey } from "@/lib/windowed-measured-layout";
import { imageRatio, type ImageLayout } from "@/lib/justified-layout";
import type { LayoutWindow } from "@/lib/windowed-justified-layout";
import { getFixedRowCount, getItemColumn, getItemLayoutRow, getLayoutRow, type WindowGeometry } from "@/lib/scroll-geometry-ref";
import { RESIDENT_PREVIEW_ENABLED } from "@/lib/resident-preview";
import { getTerminalDirection, useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useCollectionStore, buildColourMap } from "@/stores/collection-store";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";
import { storeImageOffset, buildSearchKey, extractSortValues, getRetainedSortValues } from "@/lib/image-offset-cache";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { pushNavigate, enterFullscreenPreview } from "@/lib/orchestration/search";
import { beginTraceInteraction } from "@/lib/perceived-trace";
import { interpretClick, type Modifier } from "@/lib/interpretClick";
import { dispatchClickEffects, type AddRangeEffect } from "@/lib/dispatchClickEffects";
import { useTouchSelection } from "@/hooks/useTouchSelection";
import { isCompactNow } from "@/hooks/useShell";
import { GRID_CLASSIC, GRID_DATE_LINE_HEIGHT, gridOffsetRange, gridRowHeight, gridSpec, justifiedOffsetRange, justifiedRowScale, pinchStep } from "@/lib/results-zoom";
import { useZoomStore } from "@/stores/zoom-store";
import { createJustifiedZoomTransition, type JustifiedZoomTransition } from "@/lib/justified-zoom-transition";
import { bindJustifiedZoomGestures } from "@/lib/justified-zoom-gestures";
import { Tickbox } from "@/components/Tickbox";
import { ResultPillStrip } from "./ResultPillStrip";
import { useMetadataSearch } from "@/components/metadata-primitives";
import { CostBadge, buildCostTooltip } from "@/components/CostBadge";
import { SyndicationBadge } from "@/components/SyndicationBadge";
import { useEnrichedImage } from "@/hooks/useEnrichedImage";
import { resultsGeometryIdentity } from "@/lib/result-geometry";
import { isImagePotentiallyGraphic } from "@/lib/graphic-image-blur";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import { getGridDatePresentation } from "@/lib/format-grid-date";
import { chooseReflowAnchor } from "@/lib/layout-anchor-policy";
import {
  resolveAnchorVirtIndex,
  isFocusEligibleForLayoutAnchor,
  captureAnchorAtIndex,
  computeFallbackAnchor,
  restoreAnchorScrollTop,
  placeAnchor,
  type CapturedAnchor,
} from "@/lib/grid-scroll-anchor";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import type { Image } from "@/types/image";
import {
  GRID_ROW_HEIGHT as ROW_HEIGHT,
  GRID_CELL_GAP as CELL_GAP,
} from "@/constants/layout";

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

function buildDescriptionTooltip(image: Image): string {
  const desc = image.metadata?.description || image.metadata?.title || "";
  const by = image.metadata?.byline || "[none]";
  const credit = image.metadata?.credit || "[none]";
  return `${desc}\n      By: ${by}\nCredit: ${credit}`;
}


// ---------------------------------------------------------------------------
// Image borders — thick border on thumbnail for categorised images.
// Reusable: map usageRights.category → border colour. Add new categories here.
// ---------------------------------------------------------------------------


import { getImageBorderColour } from "@/lib/image-borders";

// ---------------------------------------------------------------------------
// GridCell — memoised individual cell
// ---------------------------------------------------------------------------

const ThumbnailLoadingContext = createContext<"eager" | "lazy">("lazy");

function GridThumbnail(props: Omit<ImgHTMLAttributes<HTMLImageElement>, "loading">) {
  const loading = useContext(ThumbnailLoadingContext);
  const thumbnailRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = thumbnailRef.current;
    return () => {
      if (image && !image.isConnected && !image.complete) {
        image.removeAttribute("src");
      }
    };
  }, []);
  return <img {...props} ref={thumbnailRef} loading={loading} />;
}

function GraphicRevealButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [revealed, setRevealed] = useState(false);
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const surface = button?.parentElement;
    const preventNativeHold = (event: TouchEvent) => event.preventDefault();
    button?.addEventListener("touchstart", preventNativeHold, { passive: false });
    surface?.toggleAttribute("data-revealed", revealed);
    const conceal = () => setRevealed(false);
    if (revealed) {
      document.addEventListener("scroll", conceal, true);
      document.addEventListener("visibilitychange", conceal);
      window.addEventListener("blur", conceal);
    }
    return () => {
      button?.removeEventListener("touchstart", preventNativeHold);
      surface?.removeAttribute("data-revealed");
      document.removeEventListener("scroll", conceal, true);
      document.removeEventListener("visibilitychange", conceal);
      window.removeEventListener("blur", conceal);
    };
  }, [revealed]);
  const stopActivation = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return <button
    ref={buttonRef}
    type="button"
    data-graphic-reveal
    aria-label="Hold to reveal image"
    aria-description="Potentially graphic image"
    aria-pressed={revealed}
    title="Hold to reveal image"
    className="absolute bottom-1 right-1 z-20 size-11 max-w-[calc(100%_-_8px)] max-h-[calc(100%_-_8px)] flex items-center justify-center rounded-full bg-black/70 text-white select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-grid-accent"
    onPointerDown={event => {
      if (event.button !== 0) return;
      stopActivation(event);
      if (event.pointerType !== "mouse") event.currentTarget.parentElement?.setAttribute("data-touch-reveal", "");
      event.currentTarget.setPointerCapture(event.pointerId);
      setRevealed(true);
    }}
    onPointerUp={event => {
      stopActivation(event);
      setRevealed(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => setRevealed(false)}
    onLostPointerCapture={() => setRevealed(false)}
    onBlur={() => setRevealed(false)}
    onKeyDown={event => {
      if (event.key !== " " && event.key !== "Enter") return;
      stopActivation(event);
      setRevealed(true);
    }}
    onKeyUp={event => {
      if (event.key !== " " && event.key !== "Enter") return;
      stopActivation(event);
      setRevealed(false);
    }}
    onClick={stopActivation}
    onDoubleClick={stopActivation}
    onContextMenu={stopActivation}
  >
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </button>;
}

interface GridCellProps {
  openOnly?: boolean;
  image: Image | undefined;
  terminal?: boolean;
  isFocused: boolean;
  inlineLibrary: InlineLibrary;
  cellWidth: number;
  imageOnlyHeight?: number;
  /** Image-only cell plus a single date line below it. */
  dateLineOnly?: boolean;
  /** Grid zoom: thumbnail block and whole-cell heights (metadata levels). */
  thumbHeight?: number;
  cellHeight?: number;
  dateOrderBy?: string;
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
  onDragStart?: (image: Image, e: React.DragEvent) => void;
  /** Whether graphic-image blur is enabled (from ui-prefs-store, read once at container level). */
  blurGraphicImages: boolean;
}

// Vendored Guardian cost config no longer needed — deriveImage handles cost computation.

const GridCell = memo(function GridCell({
  inlineLibrary,
  openOnly,
  image,
  terminal,
  isFocused,
  cellWidth,
  imageOnlyHeight,
  dateLineOnly = false,
  thumbHeight = 190,
  cellHeight = ROW_HEIGHT - CELL_GAP,
  dateOrderBy,
  animationClass,
  onCellClick,
  onCellDoubleClick,
  onTickClick,
  onLabelSearch,
  collectionColours,
  draggable,
  onDragStart,
  blurGraphicImages,
}: GridCellProps) {
  // Enrichment — each cell merges its own overlay so only this cell
  // re-renders when its enrichment data changes.
  const enriched = useEnrichedImage(imageOnlyHeight === undefined ? image : undefined);
  const handleTickBound = useCallback(
    (e: React.MouseEvent) => { if (image) onTickClick(image.id, e); },
    [image?.id, onTickClick],
  );

  if (!image) {
    // Placeholder skeleton — no Tickbox because there is no image identity.
    return (
      <div
        className={terminal ? "shrink-0" : "shrink-0 bg-grid-cell/30 rounded"}
        aria-hidden={terminal || undefined}
        data-loading-placeholder={!terminal || undefined}
        style={{ width: cellWidth, height: imageOnlyHeight ?? cellHeight }}
      />
    );
  }

  if (image.__availability) return (
    <div data-grid-cell data-cell-id={image.id} data-image-id={image.id} data-unavailable={image.__availability}
      className="shrink-0 flex items-center justify-center bg-grid-cell rounded text-sm text-grid-text-muted"
      style={{ width: openOnly ? "100%" : cellWidth, height: imageOnlyHeight !== undefined && dateLineOnly ? imageOnlyHeight + GRID_DATE_LINE_HEIGHT : imageOnlyHeight ?? cellHeight }}>
      {image.__availability === "deleted" ? "Image deleted" : "Image unavailable"}
    </div>
  );

  const thumbUrl = thumbnailsEnabled ? getThumbnailUrl(image) : undefined;
  const descTooltip = buildDescriptionTooltip(image);
  const dates = imageOnlyHeight === undefined || dateLineOnly ? getGridDatePresentation(image, dateOrderBy) : undefined;
  const description = image.metadata?.description || image.metadata?.title || "";

  // Cost: from deriveImage (ES baseline + API overlay merged)
  const cost = enriched?.cost;
  // Image border — thick coloured border on the thumbnail itself (not the cell).
  const imageBorderColor = getImageBorderColour(enriched ?? image);
  // Graphic blur — computed client-side from image data (XMP + keyword scan).
  // Works in both modes: direct-ES reads fileMetadata.xmp; media-api reads aliases.
  const isPotentiallyGraphic = isImagePotentiallyGraphic(image, blurGraphicImages);
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
      data-grid-cell={openOnly ? undefined : ""}
      data-cell-id={image.id}
      data-image-id={openOnly ? undefined : image.id}
      role={openOnly ? "button" : undefined}
      tabIndex={openOnly ? 0 : undefined}
      aria-label={openOnly ? "Open image" : undefined}
      onKeyDown={openOnly ? event => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault(); event.stopPropagation(); onCellDoubleClick(image.id);
        }
      } : undefined}
      className={`shrink-0 relative flex flex-col bg-grid-cell rounded overflow-hidden cursor-pointer transition-shadow ${
        isFocused
          ? "ring-2 ring-grid-accent shadow-lg bg-grid-hover/40"
          : "hover:bg-grid-hover/15"
      } ${animationClass ?? ""}`}
      style={{ width: openOnly ? "100%" : cellWidth, height: imageOnlyHeight !== undefined && dateLineOnly ? imageOnlyHeight + GRID_DATE_LINE_HEIGHT : imageOnlyHeight ?? cellHeight }}
      draggable={draggable}
      onClick={(e) => onCellClick(image.id, e)}
      onDoubleClick={() => onCellDoubleClick(image.id)}
      onDragStart={draggable ? (e) => onDragStart?.(image, e) : undefined}
    >
      {/* Selection tickbox — hidden by CSS, shown on hover or in Selection Mode */}
      {!openOnly && <Tickbox imageId={image.id} onTickClick={handleTickBound} />}
      {/* Thumbnail area — 190px block, flex-centred so img element hugs actual
           image content (border wraps the visible image, not the container). */}
      <div
        className={`relative overflow-hidden flex items-center justify-center group${isPotentiallyGraphic ? " graphic-preview" : ""}`}
        onPointerEnter={isPotentiallyGraphic ? event => {
          if (event.pointerType === "mouse") event.currentTarget.removeAttribute("data-touch-reveal");
        } : undefined}
        style={{ height: imageOnlyHeight ?? thumbHeight }}
        title={descTooltip}
      >
        {thumbUrl ? (
          <GridThumbnail
            key={animationClass ? image.id : undefined}
            src={thumbUrl}
            alt={imageOnlyHeight !== undefined ? description : ""}
            className={`${imageOnlyHeight !== undefined ? "w-full h-full object-contain text-transparent" : "max-w-full object-contain"} pointer-events-none${isPotentiallyGraphic ? " graphic-thumbnail blur-lg group-hover:blur-none" : ""}`}
            style={imageOnlyHeight === undefined
              ? {
                  maxHeight: thumbHeight - 4,
                  // Explicit width so thumbs upscale with the cell instead of stopping at natural size.
                  width: `min(100%, calc(${thumbHeight - 4 - (imageBorderColor ? 20 : 0)}px * var(--loaded-thumbnail-ratio, ${imageRatio(image)}) + ${imageBorderColor ? 20 : 0}px))`,
                  ...(imageBorderColor ? { border: `10px solid ${imageBorderColor}` } : {}),
                }
              : undefined}
            onLoad={(e) => {
              const thumbnail = e.currentTarget;
              if (thumbnail.naturalWidth > 0 && thumbnail.naturalHeight > 0) {
                thumbnail.style.setProperty("--loaded-thumbnail-ratio", String(thumbnail.naturalWidth / thumbnail.naturalHeight));
              }
              thumbnail.style.removeProperty("display");
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-grid-text-dim text-sm">No thumbnail</span>
          </div>
        )}

        {/* Graphic image blur label — fades on hover (Kahuna behaviour: hover to reveal, re-blurs on leave) */}
        {isPotentiallyGraphic && (
          <div
            className="graphic-warning absolute inset-0 flex flex-col items-center justify-center pb-4 bg-black/30 pointer-events-none z-10 group-hover:opacity-0"
          >
            {cellWidth >= 160 && (imageOnlyHeight ?? thumbHeight) >= 120 && <span className="text-white text-xs font-semibold text-center px-2">
              Potentially graphic
              <span className="block mt-1 text-[10px] font-normal text-white/80">Hold to reveal</span>
            </span>}
          </div>
        )}
        {isPotentiallyGraphic && <GraphicRevealButton key={image.id} />}

        {/* Icon row — bottom-right overlay (syndication, archiver, print/digital) */}
      </div>

      {dateLineOnly && dates && (
        <div className="px-2 text-2xs leading-[22px] text-grid-text-dim truncate select-none">
          {dates.dateLine}
        </div>
      )}

      {imageOnlyHeight === undefined && <>
      {/* Labels + collection badges — accent-blue pills below image, above description (matches Kahuna).
           Fixed height (h-6) reserved even when empty so descriptions align across cells. */}
      <ResultPillStrip image={image} enriched={enriched} colours={collectionColours} onSearch={onLabelSearch} />

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
          title={dates?.dateTooltip}
        >
          {dates?.dateLine}
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
          {persisted && enriched && <ResultLibraryBadge image={enriched} editable={inlineLibrary} />}
        </div>
      </div>
      </>}
    </div>
  );
});

// ---------------------------------------------------------------------------
// ImageGrid — main component
// ---------------------------------------------------------------------------

export interface ImageGridProps {
  /** S3a: range-select handler from useRangeSelection, mounted in search.tsx. */
  handleRange?: (effect: AddRangeEffect) => void;
  layoutFactory?: (images: readonly (Image | undefined)[], width: number, context: LayoutWindow,
    previous?: ImageLayout) => ImageLayout & { window?: WindowGeometry };
  onLayoutCommit?: (layout: ImageLayout) => void;
  initialWidth?: number;
  measuredCells?: MeasuredCells;
}

export function ImageGrid({ handleRange, layoutFactory, onLayoutCommit, initialWidth = 0, measuredCells }: ImageGridProps = {}) {
  const variableLayout = layoutFactory !== undefined || measuredCells !== undefined;
  const {
    results, total, displayEnd, bufferOffset, virtualizerCount: logicalItemCount, loadMore, seek,
    focusedImageId, setFocusedImageId,
    reportVisibleRange, getImage, findImageIndex,
    twoTier,
  } = useDataWindow(measuredCells ? "form" : layoutFactory ? "justified" : "grid");
  const searchParams = useBrowsingSearch();
  const { path } = useBrowsingContext();
  const library = useResultLibrary(path === "/search" && !layoutFactory && !measuredCells);
  const selectionEnabled = path === "/search";
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const parentRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // -------------------------------------------------------------------------
  // Responsive column count + cell width via ResizeObserver
  //
  // Scroll anchoring: when columns change (or any justified width changes),
  // including panel/window resize, we capture the anchor image's viewport
  // position BEFORE React re-renders, then restore it AFTER in a
  // useLayoutEffect. See captureAnchor()'s own doc comment below for the
  // anchor-preference details.
  // -------------------------------------------------------------------------

  const [columns, setColumns] = useState(4);
  const [cellWidth, setCellWidth] = useState<number>(GRID_CLASSIC.minCellWidth);
  const [containerWidth, setContainerWidth] = useState(initialWidth);
  const justifiedOffset = useZoomStore((s) => s.justifiedOffset);
  const [pinchOffset, setPinchOffset] = useState<number | null>(null);
  const pinchOffsetRef = useRef<number | null>(null);
  const zoomTransition = useRef<JustifiedZoomTransition | null>(null);
  const effectiveJustifiedOffset = pinchOffset ?? justifiedOffset;
  const storeGridOffset = useZoomStore((s) => s.gridOffset);
  const gridOffset = variableLayout ? 0 : storeGridOffset;
  const gridOffsetRef = useRef(gridOffset);
  gridOffsetRef.current = gridOffset;
  // Justified cells take their size from the layout; their fallbacks use the classic grid.
  const specFor = (offset: number, width: number) => (variableLayout ? GRID_CLASSIC : gridSpec(offset, width));
  const level = specFor(gridOffset, containerWidth ?? 0);
  const rowHeight = gridRowHeight(level, CELL_GAP);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  const widthRef = useRef(containerWidth);
  widthRef.current = containerWidth;
  const committedLayout = useRef<ImageLayout | undefined>(undefined);
  const layoutSearchKey = buildSearchKey(searchParams);
  const uploadSections = useSearchStore(state => state.uploadSections);
  const combined = searchParams.recentUploadScope?.combined === true;
  const uploadChrome = useUploadLayoutStore(state => state.chrome);
  const sectionWindow = combined ? { batch: uploadSections?.batch ?? 0, present: !!searchParams.batch } : undefined;
  const rowScale = justifiedRowScale(effectiveJustifiedOffset, containerWidth);
  const geometryIdentity = variableLayout ? resultsGeometryIdentity(results) : results;
  const { layout: measuredLayout, captureInput, retireInput } = useMeasuredLayout(parentRef, results, containerWidth,
    { bufferOffset, total: displayEnd, indexed: twoTier, searchKey: layoutSearchKey, uploadSections: sectionWindow, uploadChrome: combined ? uploadChrome : undefined }, measuredCells);
  const justifiedLayout = useMemo(() => {
    if (measuredLayout) return measuredLayout;
    if (combined) return composeUploadLayout(results, containerWidth,
      { bufferOffset, total: displayEnd, indexed: twoTier, searchKey: layoutSearchKey, rowScale, uploadChrome }, uploadSections?.batch ?? 0, !!searchParams.batch,
      (resident, context, previous) => layoutFactory ? layoutFactory(resident, containerWidth, context, previous)
        : fixedUploadLayout(context.indexed ? context.total : resident.length, containerWidth, columns, rowHeight, context.indexed ? 0 : context.bufferOffset),
      committedLayout.current as SectionLayout | undefined);
    if (!layoutFactory) return undefined;
    if (RESIDENT_PREVIEW_ENABLED && (bufferOffset !== 0 || twoTier || results.some(image => !image) ||
        (results.length > 0 && results.length !== total))) {
      throw new Error("Justified preview requires the complete resident fixture");
    }
    return layoutFactory(results, containerWidth, { bufferOffset, total: displayEnd, indexed: twoTier, searchKey: layoutSearchKey, rowScale },
      committedLayout.current);
  }, [layoutFactory, measuredLayout, geometryIdentity, bufferOffset, twoTier, total, displayEnd, containerWidth, layoutSearchKey, rowScale, combined, uploadSections?.batch, searchParams.batch, columns, rowHeight, uploadChrome]);
  useLayoutEffect(() => {
    committedLayout.current = justifiedLayout;
    if (justifiedLayout) onLayoutCommit?.(justifiedLayout);
  }, [justifiedLayout, onLayoutCommit]);
  const layoutRef = useRef(justifiedLayout);
  layoutRef.current = justifiedLayout;

  // Ref to track previous column count for change detection in ResizeObserver
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // Anchor state: captured in ResizeObserver, consumed in useLayoutEffect
  const anchorRef = useRef<CapturedAnchor | null>(null);
  const pinchAnchorRef = useRef<CapturedAnchor | null>(null);

  useLayoutEffect(() => {
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
    let height = el.clientHeight;

    const update = (width: number) => {
      const cols = Math.max(1, Math.floor(width / specFor(gridOffsetRef.current, width).minCellWidth));
      const prevCols = columnsRef.current;
      const prevHeight = height;
      height = el.clientHeight;

      // Capture anchor BEFORE setting state (before React re-renders)
      if ((variableLayout ? width !== widthRef.current : cols !== prevCols) && !isFirstUpdate) {
        const anchor = captureAnchor(el, prevCols, prevHeight);
        if (anchor) {
          anchorRef.current = anchor;
        }
      }
      isFirstUpdate = false;

      setContainerWidth(width);
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

  // Zoom changes (pinch, keys, menu): capture the anchor synchronously in the
  // store notification, before React re-renders with the new geometry.
  useEffect(() => useZoomStore.subscribe((next, prev) => {
    if (measuredCells) return;
    const el = parentRef.current;
    if (!el) return;
    if (variableLayout ? next.justifiedOffset === prev.justifiedOffset : next.gridOffset === prev.gridOffset) return;
    if (variableLayout && pinchOffsetRef.current === next.justifiedOffset) return;
    const anchor = captureAnchor(el, columnsRef.current);
    if (anchor) anchorRef.current = anchor;
    if (variableLayout) zoomTransition.current?.external(next.justifiedOffset, prev.justifiedOffset);
    if (!variableLayout) {
      const width = el.clientWidth;
      const cols = Math.max(1, Math.floor(width / gridSpec(next.gridOffset, width).minCellWidth));
      setColumns(cols);
      setCellWidth(Math.floor((width - CELL_GAP * (cols + 1)) / cols));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + stable setters
  }), [variableLayout]);

  // The valid zoom range depends on width (phone vs desktop ladders).
  useEffect(() => {
    if (!containerWidth || measuredCells) return;
    useZoomStore.getState().setRange(variableLayout ? "justified" : "grid",
      variableLayout ? justifiedOffsetRange(containerWidth) : gridOffsetRange(containerWidth));
  }, [variableLayout, containerWidth]);

  // Fixed Grid retains its existing threshold preview and release-time zoom.
  useEffect(() => {
    if (variableLayout) return;
    const el = parentRef.current;
    const sizer = el?.firstElementChild as HTMLElement | null;
    if (!el || !sizer) return;
    let startDist = 0;
    let factor = 1;
    let shownPreview = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const clearPinch = () => {
      startDist = 0;
      sizer.style.transition = "";
      sizer.style.transform = "";
      pinchAnchorRef.current = null;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        if (e.touches.length > 2) clearPinch();
        return;
      }
      startDist = dist(e.touches);
      factor = 1;
      shownPreview = 1;
      const r = el.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top + el.scrollTop;
      pinchAnchorRef.current = capturePinchAnchor(el, mx + r.left, my + r.top - el.scrollTop);
      sizer.style.transformOrigin = `${mx}px ${my}px`;
      sizer.style.transition = "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)";
    };
    // Passive: the container's touch-action: pan-y already stops native pinch-zoom.
    const onMove = (e: TouchEvent) => {
      if (!startDist || e.touches.length !== 2) return;
      factor = dist(e.touches) / startDist;
      // Preview the level the release will commit, not the raw finger spread.
      const w = el.clientWidth;
      const step = pinchStep(factor);
      const preview = gridSpec(gridOffsetRef.current + step, w).minCellWidth / gridSpec(gridOffsetRef.current, w).minCellWidth;
      if (preview === shownPreview) return;
      shownPreview = preview;
      sizer.style.transform = `scale(${preview})`;
    };
    const onEnd = (e: TouchEvent) => {
      if (!startDist || e.touches.length >= 2) return;
      startDist = 0;
      sizer.style.transition = "";
      sizer.style.transform = "";
      if (e.type !== "touchcancel") useZoomStore.getState().step("grid", pinchStep(factor));
      clearPinch();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    window.addEventListener("blur", clearPinch);
    document.addEventListener("visibilitychange", clearPinch);
    return () => {
      clearPinch();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("blur", clearPinch);
      document.removeEventListener("visibilitychange", clearPinch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + stable setters
  }, [variableLayout]);

  /**
   * Capture the anchor image and its viewport position.
   * Called from ResizeObserver when column count is about to change.
   *
   * Anchor preference: the active selection anchor, then eligible focus
   * (hidden focus must intersect the viewport), then the phantom viewport anchor
   * (nearest rendered image to usable viewport
   * centre, elected lazily). These are stable image identities resolved via
   * `imagePositions`. Recomputing a synthetic "first image of the centre
   * row" index from scrollTop/row arithmetic every resize (the old
   * phantom-focus behaviour) doesn't track one real image, so a full
   * open+close panel round trip doesn't cancel out — it compounds a
   * one-row-ish drift per cycle. See `@/lib/grid-scroll-anchor` and
   * `wandering-findings/W-2026-08-01-panel-toggle-progressive-shift.md`.
   */
  function captureAnchor(el: HTMLElement, cols: number, viewHeight = el.clientHeight): CapturedAnchor | null {
    if (pinchAnchorRef.current) return pinchAnchorRef.current;
    const { imagePositions, bufferOffset, total, results } = useSearchStore.getState();
    const { selectedIds, anchorId } = useSelectionStore.getState();
    const selectionAnchorId = selectionEnabled && selectedIds.size > 0 ? anchorId : null;
    // Derive twoTier from current store state — NOT from the hook scope,
    // which is stale inside the ResizeObserver closure (useEffect deps=[]).
    const isTwoTier = isTwoTierFromTotal(total);
    const itemOffset = variableLayout ? (isTwoTier ? 0 : bufferOffset) : committedFixedGeometry.current.itemOffset;
    const focusIndex = resolveAnchorVirtIndex(focusedImageIdRef.current, imagePositions, itemOffset, isTwoTier);
    const focusRow = focusIndex === null ? null : layoutRef.current?.getItemRow(focusIndex) ??
      getItemLayoutRow({ columns: cols, rowHeight: rowHeightRef.current, itemOffset }, focusIndex);
    const eligibleFocusIndex = focusRow && isFocusEligibleForLayoutAnchor(getEffectiveFocusMode(),
      focusRow, el.scrollTop, viewHeight) ? focusIndex : null;
    const virtIdx = chooseReflowAnchor({
      selection: resolveAnchorVirtIndex(selectionAnchorId, imagePositions, itemOffset, isTwoTier),
      focus: eligibleFocusIndex,
      viewport: () => resolveAnchorVirtIndex(getViewportAnchorId(), imagePositions, itemOffset, isTwoTier),
    });
    const imageId = virtIdx == null ? undefined : results[virtIdx + itemOffset - bufferOffset]?.id;
    const visible = (top: number, height: number) => top + height > el.scrollTop && top < el.scrollTop + viewHeight;
    if (layoutRef.current) {
      const row = virtIdx != null ? layoutRef.current.getItemRow(virtIdx)
        : layoutRef.current.rowAtOffset(el.scrollTop + el.clientHeight / 2);
      return row ? { imageIndex: virtIdx ?? row.firstItemIndex, imageId,
        viewportRatio: el.clientHeight > 0 ? (row.top - el.scrollTop) / el.clientHeight : 0,
        atStart: el.scrollTop === 0 && (isTwoTier || bufferOffset === 0),
        visible: visible(row.top, row.height) && !(row.anchorHeight !== undefined && row.top + row.anchorHeight < el.scrollTop) } : null;
    }
    if (virtIdx != null) {
      const anchor = captureAnchorAtIndex(virtIdx, cols, rowHeightRef.current, el.scrollTop, el.clientHeight, itemOffset);
      return { ...anchor, imageId, visible: visible(el.scrollTop + anchor.viewportRatio * el.clientHeight, rowHeightRef.current) };
    }

    // Last-resort fallback: no known anchor image yet (e.g. before the first
    // reportVisibleRange call).
    return computeFallbackAnchor(cols, rowHeightRef.current, el.scrollTop, el.clientHeight, itemOffset);
  }

  function capturePinchAnchor(el: HTMLElement, x: number, y: number): CapturedAnchor | null {
    if (!isCompactNow()) return null;
    const container = el.getBoundingClientRect();
    let nearest: CapturedAnchor | null = null;
    let distance = Infinity;
    for (const cell of el.querySelectorAll<HTMLElement>("[data-grid-cell][data-image-id]")) {
      const bounds = (cell.querySelector(":scope > div") ?? cell).getBoundingClientRect();
      if (!bounds.height || bounds.bottom <= container.top || bounds.top >= container.bottom) continue;
      const deltaX = Math.max(bounds.left - x, 0, x - bounds.right);
      const deltaY = Math.max(bounds.top - y, 0, y - bounds.bottom);
      const nextDistance = deltaX * deltaX + deltaY * deltaY;
      if (nextDistance >= distance) continue;
      const imageId = cell.dataset.imageId!;
      const index = findImageIndex(imageId);
      if (index < 0) continue;
      const geometry = committedFixedGeometry.current;
      const row = layoutRef.current?.getItemRow(index) ?? getItemLayoutRow(geometry, index);
      nearest = { imageId, imageIndex: variableLayout ? index : index + geometry.itemOffset,
        viewportRatio: (y - container.top) / el.clientHeight,
        point: { ratio: Math.max(0, Math.min(1, (y - bounds.top) / bounds.height)),
          inset: bounds.top - container.top + el.scrollTop - row.top } };
      distance = nextDistance;
    }
    return nearest;
  }

  // -------------------------------------------------------------------------
  // Derived layout values
  // -------------------------------------------------------------------------

  const fixedGeometry = useMemo(() => ({ rowHeight, columns,
    itemOffset: twoTier ? 0 : bufferOffset, itemCount: logicalItemCount,
    headerOffset: 0, preserveScrollLeftOnSort: false, minCellWidth: level.minCellWidth }),
  [rowHeight, level.minCellWidth, columns, twoTier, bufferOffset, logicalItemCount]);
  const committedFixedGeometry = useRef(fixedGeometry);
  useLayoutEffect(() => { committedFixedGeometry.current = fixedGeometry; }, [fixedGeometry]);
  const rowCount = justifiedLayout ? justifiedLayout.rowCount : getFixedRowCount(fixedGeometry, logicalItemCount);
  const measuredRowKey = useCallback((index: number) => {
    return measuredLayoutRowKey(measuredLayout!, index);
  }, [measuredLayout]);
  const measuredRange = useCallback((range: Range) => {
    const indices = defaultRangeExtractor(range);
    const id = document.activeElement?.closest<HTMLElement>("[data-measured-cell]")?.dataset.imageId;
    const index = id ? measuredLayout?.window.findItemIndex(id) : undefined;
    if (index !== undefined) {
      for (const adjacent of [index - 1, index, index + 1]) {
        if (!measuredLayout!.window.getItemId(adjacent)) continue;
        const row = measuredLayout!.getItemRow(adjacent).index;
        if (!indices.includes(row)) indices.push(row);
      }
    }
    return indices.sort((first, second) => first - second);
  }, [measuredLayout]);

  // -------------------------------------------------------------------------
  // Virtualizer — virtualises rows, not individual cells.
  // Fixed rows use columns; justified rows carry explicit item boundaries.
  // -------------------------------------------------------------------------

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: index => justifiedLayout?.getRow(index).height ?? rowHeight,
    ...(measuredLayout ? { getItemKey: measuredRowKey, rangeExtractor: measuredRange } : {}),
    overscan: 5,
  });

  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = variableLayout ? () => false : undefined;
  useLayoutEffect(() => {
    if (justifiedLayout) virtualizer.measure();
  }, [justifiedLayout, virtualizer]);
  // Grid zoom changes every row's height.
  useLayoutEffect(() => {
    if (!variableLayout) virtualizer.measure();
  }, [rowHeight, variableLayout, virtualizer]);

  // -------------------------------------------------------------------------
  // Shared scroll effects (scroll container registration, scroll handler,
  // scroll compensation, seek, search-params reset, density/sort focus, etc.)
  // -------------------------------------------------------------------------

  const scrollMeasuredRowToCenter = measuredLayout ? (index: number) => {
    const element = parentRef.current;
    if (!element) return;
    const row = measuredLayout.getRow(index);
    element.scrollTop = row.top + (row.anchorHeight ?? row.height) / 2 - element.clientHeight / 2;
  } : undefined;

  useScrollEffects({
    virtualizer,
    parentRef,
    geometry: useMemo<ScrollGeometry>(
      () => justifiedLayout ? { layout: justifiedLayout, spatial: measuredLayout?.spatial ?? justifiedLayout, window: justifiedLayout.window, headerOffset: 0, preserveScrollLeftOnSort: false }
        : fixedGeometry,
      [fixedGeometry, justifiedLayout],
    ),
    reportVisibleRange,
    resultsLength: results.length,
    total,
    bufferOffset,
    loadMore,
    focusedImageId,
    findImageIndex,
    twoTier,
    scrollRowToCenter: scrollMeasuredRowToCenter,
    onScrollIntent: measuredCells ? retireInput : undefined,
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

    const resolved = anchor.imageId ? findImageIndex(anchor.imageId) : undefined;
    if (resolved !== undefined && resolved < 0) return;
    if (!justifiedLayout) {
      // Zoom may have changed the extent before React re-renders the sizer.
      const sizer = el.firstElementChild as HTMLElement | null;
      if (sizer) sizer.style.height = `${rowCount * rowHeight}px`;
    }
    const pointIndex = resolved ?? (justifiedLayout ? anchor.imageIndex : anchor.imageIndex - fixedGeometry.itemOffset);
    const clamped = anchor.point
      ? placeAnchor(anchor, (justifiedLayout?.getItemRow(pointIndex) ?? getItemLayoutRow(fixedGeometry, pointIndex)).top,
        justifiedLayout?.getBox(pointIndex)?.height ?? level.thumbHeight, el.clientHeight, el.scrollHeight)
      : anchor.atStart ? 0 : justifiedLayout
      ? placeAnchor(anchor, justifiedLayout.getItemRow(resolved ?? anchor.imageIndex).top,
        justifiedLayout.getItemRow(resolved ?? anchor.imageIndex).anchorHeight ?? justifiedLayout.getItemRow(resolved ?? anchor.imageIndex).height,
        el.clientHeight, el.scrollHeight)
      : restoreAnchorScrollTop(resolved === undefined ? anchor
        : { ...anchor, imageIndex: resolved + fixedGeometry.itemOffset }, columns, rowHeight,
      el.clientHeight, el.scrollHeight, fixedGeometry.itemOffset);
    virtualizer.scrollToOffset(clamped);
  }, [columns, rowHeight, rowCount, justifiedLayout, virtualizer, fixedGeometry, findImageIndex, level.thumbHeight]);

  useEffect(() => {
    const el = parentRef.current;
    if (!variableLayout || measuredCells || !el || !containerWidth) return;
    let sourceAnchor: CapturedAnchor | null = null;
    const transition = createJustifiedZoomTransition({
      element: el,
      offset: () => useZoomStore.getState().justifiedOffset,
      range: () => useZoomStore.getState().ranges.justified,
      scale: offset => justifiedRowScale(offset, containerWidth),
      preview: offset => {
        const current = pinchOffsetRef.current;
        if (current === offset) return;
        if (current === null) sourceAnchor = captureAnchor(el, columnsRef.current);
        const committed = useZoomStore.getState().justifiedOffset;
        if ((current ?? committed) !== (offset ?? committed) && sourceAnchor) anchorRef.current = sourceAnchor;
        pinchOffsetRef.current = offset;
        setPinchOffset(offset);
        if (offset === null) sourceAnchor = null;
      },
      commit: offset => useZoomStore.getState().setOffset("justified", offset),
      pinnedImage: () => pinchAnchorRef.current?.imageId,
    });
    zoomTransition.current = transition;
    const unbindGestures = bindJustifiedZoomGestures(el, transition, {
      capture: (x, y) => { pinchAnchorRef.current = capturePinchAnchor(el, x, y); },
      clear: () => { pinchAnchorRef.current = null; },
    });
    return () => {
      unbindGestures();
      transition.dispose();
      if (zoomTransition.current === transition) zoomTransition.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry is read through refs; reinitialize on a new layout scope
  }, [variableLayout, containerWidth, layoutSearchKey]);

  useLayoutEffect(() => {
    if (variableLayout) zoomTransition.current?.layout(effectiveJustifiedOffset);
  });

  // -------------------------------------------------------------------------
  // Selection mode — subscribe once at container level.
  // Per-cell components do NOT subscribe to this (would cause 1000+ re-renders
  // on mode flip). CSS handles tickbox visibility via data-selection-mode.
  // -------------------------------------------------------------------------

  const inSelectionMode = useSelectionStore((s) => selectionEnabled && s.selectedIds.size > 0);
  const blurGraphicImages = useUiPrefsStore((s) => s.blurGraphicImages);

  // -------------------------------------------------------------------------
  // Long-press gestures (S5 -- coarse pointer / touch selection)
  //
  // useLongPress fires onLongPressStart after LONG_PRESS_MS without movement.
  // Long-press on a new cell commits toggle+anchor (mode entry).
  // Long-press on a different cell while in selection mode dispatches an
  // add-range effect (same anchor-intent path as desktop shift-click).
  // -------------------------------------------------------------------------

  const handleDragStart = useCallback((image: Image, e: React.DragEvent) => {
    startResultImageDrag(e.currentTarget, e.dataTransfer, image, selectionEnabled);
  }, [selectionEnabled]);

  // Label + collection pill click → search.
  const handleLabelSearch = useMetadataSearch();

  // Collection badge colours: pathId → cssColour, derived from the tree once at load.
  // Colour lives on the collection service node, not on the image ES document.
  const collectionTree = useCollectionStore(s => s.tree);
  const collectionColours = useMemo(
    () => collectionTree ? buildColourMap(collectionTree) : undefined,
    [collectionTree],
  );

  useTouchSelection({
    containerRef: parentRef, handleRange, findImageIndex, getImage,
    getOrderBy: () => searchParamsRef.current.orderBy,
  });

  // -------------------------------------------------------------------------
  // Click handlers (match table: single=focus, double=open detail)
  // -------------------------------------------------------------------------

  /** Navigate to image detail overlay (shared by single-click in phantom, double-click in explicit). */
  const enterDetail = useCallback(
    (imageId: string) => {
      const currentParams = searchParamsRef.current;
      beginTraceInteraction("open-detail", { imageId });
      setFocusedImageId(imageId);
      const idx = findImageIndex(imageId);
      if (idx >= 0) {
        const img = getImage(idx);
        const searchKey = buildSearchKey(currentParams);
        const cursor = img ? extractSortValues(img, currentParams.orderBy, searchKey) : null;
        // In two-tier mode, idx from findImageIndex is already global.
        // In normal mode, add bufferOffset to get global position.
        const globalOffset = twoTier ? idx : bufferOffset + idx;
        storeImageOffset(imageId, globalOffset, searchKey, cursor);
      }
      pushNavigate(navigate, {
        to: path,
        search: (prev: Record<string, unknown>) => ({ ...prev, image: imageId,
          ...(path === "/upload" ? { section: searchParamsRef.current.recentUploadScope?.batch?.ids.includes(imageId) ? "batch" : "other" } : {}) }),
        state: { _detailEntryImageId: imageId },
      });
    },
    [navigate, path, setFocusedImageId, findImageIndex, getImage, bufferOffset, twoTier],
  );

  /**
   * Build an interpretClick context for a given image ID and modifier.
   * Reads search + selection store imperatively so the callback is stable.
   */
  const buildClickContext = useCallback(
    (imageId: string, modifier: Modifier) => {
      const selState = useSelectionStore.getState();
      const searchState = useSearchStore.getState();
      const searchKey = buildSearchKey(searchParamsRef.current);
      const idx = findImageIndex(imageId);
      const image = idx >= 0 ? getImage(idx) : undefined;
      const anchorId = selState.anchorId;
      const anchorGlobalIndex = anchorId
        ? (searchState.imagePositions.get(anchorId) ?? undefined)
        : undefined;
      const anchorSortValues = (() => {
        if (!anchorId) return null;
        const anchorImg = selState.metadataCache.get(anchorId);
        return getRetainedSortValues(anchorId, searchKey) ?? (anchorImg
          ? extractSortValues(anchorImg, searchParamsRef.current.orderBy)
          : null);
      })();
      return {
        targetId: imageId,
        modifier: selectionEnabled ? modifier : "none" as const,
        inSelectionMode: selectionEnabled && selState.selectedIds.size > 0,
        anchorId,
        targetGlobalIndex: searchState.imagePositions.get(imageId),
        anchorGlobalIndex,
        targetSortValues: image
          ? extractSortValues(image, searchParamsRef.current.orderBy, searchKey)
          : null,
        anchorSortValues,
      };
    },
    [findImageIndex, getImage, selectionEnabled],
  );

  const handleCellClick = useCallback(
    (imageId: string, e: React.MouseEvent) => {
      if (e.altKey) return; // alt-click: no-op in grid
      const inMode = selectionEnabled && useSelectionStore.getState().selectedIds.size > 0;
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
    [buildClickContext, setFocusedImageId, enterDetail, handleRange, selectionEnabled],
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

  const { click: selectionBodyClick, open: handleCellDoubleClick } = useDetailsBodyClick(handleCellClick, enterDetail);

  // Middle-click on a cell → focus that image + enter fullscreen preview.
  // Uses mouseup (not auxclick) because auxclick doesn't carry transient
  // user activation in Firefox — requestFullscreen() fails silently.
  // Event delegation on the scroll container; find nearest [data-image-id].
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const previewTarget = (target: Element) => target.closest("[data-measured-cell]")
      ? target.closest('[data-cell-id][aria-label="Open image"]') : target.closest("[data-image-id]");
    const onMiddleUp = (e: MouseEvent) => {
      if ((e.target as Element).closest("[data-inline-library],[data-result-pill],[data-result-label-add]")) return;
      if (e.button !== 1 || (e.target as Element).closest("[data-form-content]")) return;
      const cell = previewTarget(e.target as Element);
      if (!cell) return;
      const id = cell.getAttribute("data-image-id") ?? cell.getAttribute("data-cell-id");
      if (!id) return;
      e.preventDefault();
      setFocusedImageId(id);
      // requestAnimationFrame so the store update propagates to FullscreenPreview
      // (it reads focusedImageId to resolve the image to display).
      requestAnimationFrame(() => enterFullscreenPreview());
    };
    const onMiddleDown = (e: MouseEvent) => {
      if (e.button !== 1 || (e.target as Element).closest("[data-form-content]")) return;
      // Only suppress Firefox autoscroll when clicking on a cell — gap clicks
      // should let Firefox start its autoscroll indicator normally.
      if (previewTarget(e.target as Element)) e.preventDefault();
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
    scrollRowToCenter: scrollMeasuredRowToCenter,
    imageParam: searchParams.image,
    setFocusedImageId,
    findImageIndex,
    virtualizer,
    flatIndexToRow: (idx) => justifiedLayout?.getItemRow(idx).index ?? getItemLayoutRow(fixedGeometry, idx).index,
  });

  // -------------------------------------------------------------------------
  // Keyboard navigation — delegated to shared hook
  // -------------------------------------------------------------------------

  useListNavigation({
    pageByImage: path === "/upload" && !!measuredCells,
    ...(justifiedLayout ? { spatial: measuredLayout?.spatial ?? justifiedLayout } : { columnsPerRow: columns, rowHeight, itemOffset: fixedGeometry.itemOffset }),
    virtualizer,
    scrollRef: parentRef,
    headerHeight: 0, // grid has no header inside the scroll container
    ...(combined ? { getStickyInset: (scrollTop = parentRef.current?.scrollTop ?? 0) => getUploadStickyInset(scrollTop,
      twoTier || bufferOffset === 0 ? uploadChrome.intro : 0, uploadChrome,
      (justifiedLayout as SectionLayout | undefined)?.headers.find(header => header.section === "other")?.top) } : {}),
    focusedImageId,
    setFocusedImageId,
    virtualizerCount: logicalItemCount,
    getImage,
    findImageIndex,
    resultsLength: results.length,
    total,
    loadMore,
    onEnter: handleCellDoubleClick,
    imageParam: searchParams.image,
    flatIndexToRow: (idx) => justifiedLayout?.getItemRow(idx).index ?? getItemLayoutRow(fixedGeometry, idx).index,
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
  const visibleRange = virtualizer.range;
  const terminalStart = getTerminalDirection(bufferOffset - 1) ? bufferOffset : null;
  const terminalEnd = getTerminalDirection(bufferOffset + results.length) ? bufferOffset + results.length : null;
  const firstVisible = visibleRange
    ? (justifiedLayout?.getRow(visibleRange.startIndex) ?? getLayoutRow(fixedGeometry, visibleRange.startIndex)).firstItemIndex + (twoTier ? 0 : bufferOffset) : -1;
  const lastVisible = visibleRange
    ? (justifiedLayout?.getRow(visibleRange.endIndex) ?? getLayoutRow(fixedGeometry, visibleRange.endIndex)).lastItemIndex + (twoTier ? 0 : bufferOffset) : -1;
  const terminalView = visibleRange && terminalStart !== null && lastVisible < terminalStart ? "start"
    : visibleRange && terminalEnd !== null && firstVisible >= terminalEnd ? "end" : null;

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
      {...library.events}
      data-label-editing={library.labelEditing || undefined}
      aria-label={measuredCells ? "Image results form" : variableLayout ? "Image results justified" : "Image results grid"}
      className={`${combined ? "@container/upload-results " : "pt-1 "}${measuredCells ? "form-results " : ""}flex-1 min-w-0 overflow-y-auto overflow-x-hidden hide-scrollbar overscroll-y-contain`}
      data-selection-mode={inSelectionMode ? "true" : undefined}
      style={{ ...(variableLayout ? { overflowAnchor: "none" as const } : {}), touchAction: measuredCells ? "auto" : "pan-y" }}
      onClick={handleBackgroundClick}
      onBeforeInputCapture={measuredCells ? captureInput : undefined}
    >
      {library.entry}
      <div
        style={{ height: justifiedLayout?.height ?? virtualizer.getTotalSize() }}
        className="relative w-full"
      >
        {virtualItems.map((virtualRow) => {
          const row = justifiedLayout?.getRow(virtualRow.index) ?? getLayoutRow(fixedGeometry, virtualRow.index);
          if (measuredLayout?.isEstimatedSpan(virtualRow.index)) return <div key={measuredRowKey(virtualRow.index)}
            data-loading-placeholder aria-hidden="true" className="absolute inset-x-0 bg-grid-cell/30"
            style={{ top: row.top, height: row.height }} />;
          const startIdx = row.firstItemIndex;
          const itemCount = Math.max(0, row.lastItemIndex - startIdx + 1);
          const indices = justifiedLayout ? Array.from({ length: itemCount }, (_, index) => index)
            : itemCount === columns ? columnIndices : columnIndices.slice(0, itemCount);
          const thumbnailLoading = visibleRange && virtualRow.index >= visibleRange.startIndex && virtualRow.index <= visibleRange.endIndex + 2
            ? "eager" : "lazy";
          return (
            <ThumbnailLoadingContext.Provider key={virtualRow.key} value={thumbnailLoading}>
              <div
                className="absolute left-0 right-0 flex"
                style={{
                  top: row?.top ?? virtualRow.start,
                  height: row?.height ?? rowHeight,
                  alignItems: measuredCells ? "flex-start" : undefined,
                  gap: variableLayout ? 4 : CELL_GAP,
                  padding: justifiedLayout ? `0 0 0 ${justifiedLayout?.getBox(startIdx)?.left ?? 0}px`
                    : `0 ${CELL_GAP}px 0 ${CELL_GAP + getItemColumn(fixedGeometry, startIdx) * (cellWidth + CELL_GAP)}px`,
                }}
              >
                {indices.map((colIdx) => {
                  const imageIdx = startIdx + colIdx;
                  if (imageIdx >= logicalItemCount) return null;
                  const image = getImage(imageIdx);
                  // Fixed-grid keys identify physical columns within the virtual row,
                  // including leading partial rows. Buffer-local indices can change
                  // columns on seek, moving a reused thumbnail's old painted bitmap
                  // before its replacement loads. Keep Justified's existing keys.
                  // ── Animation: arriving images + phantom focus pulse ──
                  const animClass = image
                    ? arrivingImageIds.has(image.id)
                      ? "anim-arriving"
                      : (phantomPulseImageId && image.id === phantomPulseImageId)
                        ? "anim-focus-here-unfocused"
                        : undefined
                    : undefined;

                  const thumbnail = (
                    <GridCell
                      inlineLibrary={image && library.pending?.has(image.id) ? "busy" : library.enabled}
                      key={measuredCells && image ? image.id : variableLayout ? imageIdx : getItemColumn(fixedGeometry, imageIdx)}
                      image={image}
                      openOnly={!!measuredCells}
                      terminal={!image && ((terminalStart !== null && imageIdx + (twoTier ? 0 : bufferOffset) < terminalStart)
                        || (terminalEnd !== null && imageIdx + (twoTier ? 0 : bufferOffset) >= terminalEnd))}
                      isFocused={!!image && image.id === focusedImageId && getEffectiveFocusMode() === "explicit" && !inSelectionMode}
                      cellWidth={justifiedLayout?.getBox(imageIdx)?.width ?? cellWidth}
                      imageOnlyHeight={measuredCells && image ? measuredCells.thumbnailHeight(image, containerWidth)
                        : layoutFactory ? justifiedLayout?.getBox(imageIdx)?.height
                        : level.meta ? undefined : level.thumbHeight}
                      thumbHeight={level.thumbHeight}
                      dateLineOnly={!variableLayout && level.dateOnly}
                      cellHeight={rowHeight - CELL_GAP}
                      dateOrderBy={variableLayout ? undefined : searchParams.orderBy}
                      animationClass={animClass}
                      onCellClick={measuredCells ? enterDetail : selectionBodyClick}
                      onCellDoubleClick={handleCellDoubleClick}
                      onTickClick={handleTickClick}
                      onLabelSearch={handleLabelSearch}
                      collectionColours={collectionColours}
                      draggable={IS_COARSE_POINTER ? undefined : true}
                      onDragStart={IS_COARSE_POINTER ? undefined : handleDragStart}
                      blurGraphicImages={blurGraphicImages}
                    />
                  );
                  return measuredCells && image ? <div key={image.id} data-grid-cell data-measured-cell data-image-id={image.id}
                    className={animClass === "anim-focus-here-unfocused" ? undefined : animClass} style={{ width: justifiedLayout?.getBox(imageIdx)?.width ?? cellWidth }}>
                    {measuredCells.render(image, thumbnail, enterDetail)}
                  </div> : thumbnail;
                })}
              </div>
            </ThumbnailLoadingContext.Provider>
          );
        })}
        {combined && <UploadPageChrome scrollRef={parentRef} showIntro={twoTier || bufferOffset === 0} />}
        {combined && (justifiedLayout as SectionLayout | undefined)?.headers?.map(header => <UploadSectionHeading key={header.section} {...header} scrollRef={parentRef} />)}
        {terminalView && <div role="status" className="absolute inset-x-0 text-center text-sm text-grid-text-muted pointer-events-none"
          style={{ top: (parentRef.current?.scrollTop ?? 0) + (parentRef.current?.clientHeight ?? 0) / 2 }}>
          {terminalView === "start" ? "Start of results" : "End of results"}
        </div>}
      </div>
    </div>
  );
}

