/**
 * Search route — the main search page at `/search`.
 *
 * URL search params are validated with Zod and synced to the Zustand search store.
 * The URL is the source of truth: changing the URL triggers a search,
 * and user interactions (typing, selecting filters) update the URL.
 *
 * When `image` is present in the URL, the image detail overlay is shown
 * on top of the search results. The list view (table or grid) stays mounted
 * (hidden) so scroll position, virtualizer state, and search context are
 * all preserved. Browser back removes `image` and the view is exactly
 * where you left it.
 *
 * Per-tab session-persisted density switches between grid and table. Both share
 * the same data layer (`useDataWindow`), focus, and URL-managed search context.
 */

import { createRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { BrowsingContext, useBrowsingContext, useBrowsingSearch, uploadBatchMembership, UPLOAD_BROWSING_ENABLED } from "@/lib/browsing-context";
import { returnToBrowsing } from "@/lib/browsing-navigation";
import { useUrlSearchSync } from "@/hooks/useUrlSearchSync";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";
import { rootRoute } from "./__root";
import { searchParamsSchema } from "@/lib/search-params-schema";
import { SearchBar } from "@/components/SearchBar";
import { StatusBar } from "@/components/StatusBar";
import { SearchFilters } from "@/components/SearchFilters";
import { ImageTable } from "@/components/ImageTable";
import { ImageGrid } from "@/components/ImageGrid";
import { JustifiedGrid } from "@/components/JustifiedGrid";
import { MeasuredGrid, useMeasuredPrototype } from "@/components/MeasuredGrid";
import { RESIDENT_PREVIEW_ENABLED, SAMPLED_PREVIEW_ENABLED, RESIDENT_PREVIEW_LIMIT } from "@/lib/resident-preview";
import { ImageDetail } from "@/components/ImageDetail";
import { PanelLayout, AccordionSection } from "@/components/PanelLayout";
import { Scrubber } from "@/components/Scrubber";
import { FacetFilters, AggCircuitBreaker } from "@/components/FacetFilters";
import { CollectionTree } from "@/components/CollectionTree";
import { useCollectionStore } from "@/stores/collection-store";
import { ImageMetadata } from "@/components/ImageMetadata";
import { MultiImageMetadata } from "@/components/MultiImageMetadata";
import { UsagesSection, MultiUsagesSummary } from "@/components/UsagesSection";
import { FullscreenPreview } from "@/components/FullscreenPreview";
import { getDisplayEnd, useSearchStore } from "@/stores/search-store";
import { useSelectionStore, useSelectionMetadataRevision } from "@/stores/selection-store";
import { usePanelStore } from "@/stores/panel-store";
import { useEffectiveFocusMode, useUiPrefsStore } from "@/stores/ui-prefs-store";
import { useZoomStore } from "@/stores/zoom-store";
import { imageFullscreenElement } from "@/lib/app-fullscreen";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useVisibleRange } from "@/hooks/useDataWindow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { interpolateNullZoneSortLabel, resolveKeywordSortInfo, resolveDateSortInfo, computeTrackTicksWithNullZone } from "@/lib/sort-context";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { initGridApi } from "@/lib/grid-api-instance";
import type { Image } from "@/types/image";
import { attachedEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { isImageMetadataCurrent, resolveImageOverlay } from "@/lib/image-read-freshness";
import type { LabelEditContext } from "@/lib/label-operation";
import { LabelOperationReceipts } from "@/components/LabelEditor";
import { useIsCompact } from "@/hooks/useShell";
import { UploadEntry } from "@/components/UploadActivity";
import { SettingsMenu } from "@/components/SettingsMenu";

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: zodSearchValidator(searchParamsSchema),
  component: () => <BrowsingContext value={{ path: "/search" }}><SearchPage /></BrowsingContext>,
});

export const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/upload",
  validateSearch: zodSearchValidator(searchParamsSchema.pick({ orderBy: true, image: true, crop: true, cropping: true }).extend({ batch: z.string().optional() })),
  component: UploadPage,
});

function UploadPage() {
  const { batch } = uploadRoute.useSearch();
  const membership = uploadBatchMembership(state => batch ? state.batches.get(batch) : undefined);
  const imageScope = useMemo(() => (UPLOAD_BROWSING_ENABLED ? membership : undefined)
    ?? { key: `upload:${batch ?? "recent"}`, revision: 0, ids: [] }, [membership, batch]);
  return <BrowsingContext value={{ path: "/upload", imageScope }}><SearchPage /></BrowsingContext>;
}

function BrowsingSync() {
  useUrlSearchSync();
  return null;
}

function SearchPage() {
  const { image, batch } = useBrowsingSearch();
  const { path, imageScope } = useBrowsingContext();
  const upload = path === "/upload";
  const navigate = useNavigate();
  const engineScope = useSearchStore(state => state.params.imageScope);
  const admitted = engineScope?.key === imageScope?.key;
  const density = useUiPrefsStore((state) => state.density);
  const measuredPrototype = useMeasuredPrototype(state => import.meta.env.DEV && state.enabled);
  const collectionStatus = useCollectionStore((s) => s.status);
  // Mount range-selection handler once at the route level — passed to
  // ImageGrid and ImageTable so shift-click range works in both views.
  const handleRange = useRangeSelection();
  const showImageDetail = !!image && (!upload || !!imageScope?.ids.includes(image));
  const isGrid = density !== "table";

  // Results zoom: + bigger thumbnails, - smaller, 0 default (Alt+key in text fields).
  // Image detail and fullscreen preview own these keys for image zoom.
  const resultsZoomActive = () => !showImageDetail && !imageFullscreenElement();
  const zoomIn = () => { if (resultsZoomActive()) useZoomStore.getState().step(density, 1); };
  const zoomOut = () => { if (resultsZoomActive()) useZoomStore.getState().step(density, -1); };
  useKeyboardShortcut("=", zoomIn, resultsZoomActive);
  useKeyboardShortcut("+", zoomIn, resultsZoomActive);
  useKeyboardShortcut("-", zoomOut, resultsZoomActive);
  useKeyboardShortcut("0", () => { if (resultsZoomActive()) useZoomStore.getState().reset(density); }, resultsZoomActive);
  useKeyboardShortcut("/", () => {
    if (showImageDetail || imageFullscreenElement()) return;
    const input = document.querySelector("cql-input");
    if (input instanceof HTMLElement) input.focus();
  });

  // Keep document.title in sync with the search query
  useDocumentTitle();

  // Initialise Grid API service discovery once on mount (idempotent).
  // Fetches the HATEOAS root so intent-driven API calls (e.g. single-image
  // enrichment, action gating) can construct API URLs when they fire.
  useEffect(() => {
    void initGridApi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // S6 — Hydrate selection metadata on mount.
  // persist middleware rehydrates selectedIds synchronously; this effect
  // kicks the metadata fetch on first paint so the multi-image panel
  // shows reconciled values rather than all-dashes after a reload.
  useEffect(() => {
    if (!upload) void useSelectionStore.getState().hydrate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scrubber data — subscribed at this level so the scrubber re-renders
  // when the buffer moves without re-rendering the views.
  const total = useSearchStore((s) => s.total);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);
  const bufferLength = useSearchStore((s) => s.results.length);
  const loading = useSearchStore((s) => s.loading);
  const pendingPosition = useSearchStore((s) => s._browseNavigation?.targetOffset ?? null);
  const searchError = useSearchStore((s) => s.error);
  const searchParams = useSearchStore((s) => s.params);
  const seek = useSearchStore((s) => s.seek);
  const visibleRange = useVisibleRange();
  const leftPanelVisible = usePanelStore((s) => s.config.left.visible);
  const filtersExpanded = usePanelStore((s) => s.isSectionOpen("left-filters"));
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);
  const filtersActive = !upload && leftPanelVisible && filtersExpanded;
  const previousFiltersActiveRef = useRef(filtersActive);
  const previousSearchParamsRef = useRef(searchParams);
  const pendingAggregationModeRef = useRef<"debounced" | "immediate" | null>(
    filtersActive ? "debounced" : null,
  );

  // A hidden/collapsed → visible/expanded transition is an unambiguous
  // request for facets, so skip only the aggregation debounce. Query changes
  // while Filters remains active retain trailing-edge debounce protection.
  // Initial persisted-open state is also debounced.
  useEffect(() => {
    const wasActive = previousFiltersActiveRef.current;
    const contextChanged = previousSearchParamsRef.current !== searchParams;
    previousFiltersActiveRef.current = filtersActive;
    previousSearchParamsRef.current = searchParams;

    if (!filtersActive) {
      pendingAggregationModeRef.current = null;
      return;
    }

    if (!wasActive) {
      pendingAggregationModeRef.current = "immediate";
    } else if (contextChanged && pendingAggregationModeRef.current !== "immediate") {
      pendingAggregationModeRef.current = "debounced";
    }
    if (loading || searchError) return;

    const mode = pendingAggregationModeRef.current;
    if (!mode) return;
    pendingAggregationModeRef.current = null;
    void fetchAggregations(mode);
  }, [filtersActive, fetchAggregations, loading, searchError, searchParams]);

  // Two-tier is the coordinate-space decision, derived from total only.
  const twoTier = useSearchStore((s) => isTwoTierFromTotal(s.total));
  const displayEnd = useSearchStore(getDisplayEnd);

  const currentPosition = twoTier
    ? visibleRange.start           // two-tier: already global
    : bufferOffset + visibleRange.start;  // normal: convert buffer-local to global
  const visibleCount = Math.max(1, visibleRange.end - visibleRange.start + 1);

  // Sort-context label for the scrubber tooltip.
  // Uses the pre-fetched sort distribution (keyword or date) for accurate
  // position→value mapping via binary search (no network during drag).
  // Falls back to buffer interpolation before the distribution loads.
  // Null-zone aware: shows "Not [field]" + uploadTime date in the null zone.
  const orderBy = useSearchStore((s) => s.params.orderBy);
  const results = useSearchStore((s) => s.results);
  const sortDistribution = useSearchStore((s) => s.sortDistribution);
  const nullZoneDistribution = useSearchStore((s) => s.nullZoneDistribution);
  const getSortLabel = useCallback(
    (globalPosition: number): string | null => {
      const store = useSearchStore.getState();
      return interpolateNullZoneSortLabel(
        store.params.orderBy,
        globalPosition,
        store.total,
        store.bufferOffset,
        store.results,
        store.sortDistribution,
        store.nullZoneDistribution,
        visibleCount,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderBy, results, sortDistribution, nullZoneDistribution, visibleCount],
  );

  // Lazy fetch: trigger sort distribution on first scrubber interaction.
  // Fires for both keyword sorts (composite agg) and date sorts (date_histogram).
  const fetchSortDistribution = useSearchStore((s) => s.fetchSortDistribution);
  const fetchNullZoneDistribution = useSearchStore((s) => s.fetchNullZoneDistribution);
  const hasDistributableSort = !!resolveKeywordSortInfo(orderBy) || !!resolveDateSortInfo(orderBy);
  const onScrubberInteraction = useCallback(() => {
    if (hasDistributableSort) fetchSortDistribution();
  }, [hasDistributableSort, fetchSortDistribution]);

  // When the primary distribution arrives and reveals a null zone
  // (coveredCount < total), automatically fetch the null-zone (uploadTime)
  // distribution. This runs once per distribution load — no user interaction needed
  // beyond the initial scrubber touch that triggered fetchSortDistribution.
  useEffect(() => {
    if (sortDistribution && sortDistribution.coveredCount < total) {
      fetchNullZoneDistribution();
    }
  }, [sortDistribution, total, fetchNullZoneDistribution]);

  // Track tick marks — date boundary positions for scrubber orientation.
  // In scroll mode (all data in buffer): computed from buffer data (exact).
  // In seek mode: computed from the sort distribution when available (accurate).
  // Without distribution in seek mode: empty (linear extrapolation is unreliable).
  // Null-zone aware: includes boundary tick + uploadTime-based ticks in the null zone.
  const allDataInBuffer = total <= bufferLength;
  const ticksEnabled = allDataInBuffer || sortDistribution !== null;
  const tickResults = ticksEnabled && resolveDateSortInfo(orderBy) &&
    (sortDistribution?.buckets.length ?? 0) < 2 ? results : null;
  const tickBufferOffset = tickResults ? bufferOffset : 0;
  const trackTicks = useMemo(
    () => ticksEnabled
      ? computeTrackTicksWithNullZone(orderBy, total, tickBufferOffset, tickResults ?? [], sortDistribution, nullZoneDistribution)
      : [],
    [ticksEnabled, orderBy, total, tickBufferOffset, tickResults, sortDistribution, nullZoneDistribution],
  );

  const scrubberElement = (
    <Scrubber
      total={total}
      displayEnd={displayEnd}
      currentPosition={currentPosition}
      visibleCount={visibleCount}
      bufferLength={bufferLength}
      loading={loading}
      pendingPosition={pendingPosition}
      onSeek={(offset, interactionId) => seek(offset, "scrubber-seek", interactionId)}
      onBrowsePosition={(offset) => useSearchStore.getState().queueBrowsePosition(offset)}
      getSortLabel={getSortLabel}
      onFirstInteraction={hasDistributableSort ? onScrubberInteraction : undefined}
      trackTicks={trackTicks}
      twoTier={twoTier}
    />
  );

  // Ref to the grid/list container — passed to ImageDetail for dismiss animation.
  const gridContainerRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <BrowsingSync />
      {/* Search UI — always mounted, always laid out at full size.
          When image detail is showing, made invisible via opacity-0 +
          pointer-events-none. This preserves scroll position perfectly —
          display:none would reset scrollTop to 0. The absolute + inset-0
          keeps it in the same space as the image detail overlay. */}
      <div
        ref={gridContainerRef}
        className={
          showImageDetail
            ? "absolute inset-0 flex flex-col opacity-0 pointer-events-none"
            : "contents"
        }
        aria-hidden={showImageDetail || undefined}
        // Also blurs the search input if it holds focus when detail opens
        // via history restore (not a click) — otherwise its own keydown
        // trap silently swallows ImageDetail's Backspace/arrow shortcuts.
        inert={showImageDetail || undefined}
      >
        {upload ? <header className="flex items-center gap-3 border-b border-grid-separator px-3 py-2 text-grid-text">
          <h1 className="text-base font-medium">Upload</h1>
          {batch && <span className="min-w-0 flex-1 truncate text-sm text-grid-text-muted">{batch}</span>}
          {UPLOAD_BROWSING_ENABLED && <SearchFilters.Sort alwaysVisible />}
          {UPLOAD_BROWSING_ENABLED && <UploadEntry />}
          <SettingsMenu />
          <button type="button" className="ml-auto cursor-pointer text-sm underline" onClick={() => returnToBrowsing(navigate, "/search")}>Search</button>
        </header> : <SearchBar />}
        {RESIDENT_PREVIEW_ENABLED && <div className="px-3 py-1 text-xs bg-grid-cell text-grid-text-muted" role="note">
          {SAMPLED_PREVIEW_ENABLED
            ? `Sample fixture · up to ${RESIDENT_PREVIEW_LIMIT} images · search matching is simulated; reload resamples`
            : `Synthetic fixture · ${RESIDENT_PREVIEW_LIMIT} images · not live data; search matching is simulated`}
        </div>}
        {admitted && (!upload || UPLOAD_BROWSING_ENABLED) && <StatusBar />}
        <PanelLayout
          leftPanel={!upload &&
            <>
              {collectionStatus !== "absent" && (
                <AccordionSection sectionId="left-collections" title="Collections">
                  <CollectionTree />
                </AccordionSection>
              )}
              <AccordionSection sectionId="left-filters" title="Filters" headerRight={<AggCircuitBreaker />}>
                <FacetFilters />
              </AccordionSection>
            </>
          }
          rightPanel={!upload &&
            <>
              <AccordionSection sectionId="right-metadata" title="Details">
                <FocusedImageMetadata />
              </AccordionSection>
              <AccordionSection sectionId="right-usages" title="Usages">
                <FocusedUsages />
              </AccordionSection>
              {!showImageDetail && <CompactLabelActivity />}
            </>
          }
          scrubber={scrubberElement}
        >
          {!admitted ? <div role="status" className="p-6 text-grid-text-muted">Loading...</div>
            : upload && !UPLOAD_BROWSING_ENABLED ? <div role="status" className="p-6 text-grid-text-muted">Upload requires media-api mode.</div>
            : upload && imageScope?.ids.length === 0 ? <div role="status" className="p-6 text-grid-text-muted">
            <p>{imageScope.revision > 0 ? "This batch has no available images yet." : batch ? "This local batch is unavailable in this tab." : "Recent uploads are not connected yet."}</p>
            {batch && imageScope.revision === 0 && <button type="button" className="mt-3 cursor-pointer underline" onClick={() => navigate({ to: "/upload", search: {} })}>Recent uploads</button>}
          </div> : density === "justified" ? measuredPrototype && !upload ? <MeasuredGrid handleRange={handleRange} /> : <JustifiedGrid handleRange={handleRange} />
            : isGrid ? <ImageGrid handleRange={handleRange} /> : <ImageTable handleRange={handleRange} />}
        </PanelLayout>
      </div>

      {/* Fullscreen preview — always mounted (hidden until activated by `f` key).
          Uses the Fullscreen API for true edge-to-edge display. */}
      <FullscreenPreview />

      {/* Image detail overlay — rendered when image is in URL.
          Must be AFTER FullscreenPreview so its `f` shortcut wins the
          keyboard shortcut stack (most-recently-registered = top). */}
      {admitted && showImageDetail && (!upload || imageScope!.ids.includes(image)) && <ImageDetail imageId={image} gridContainerRef={gridContainerRef} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel-local image resolution and completed selection presentation. Buffer
// data wins for single images/usages; metadata summaries use cached images.
// ---------------------------------------------------------------------------

function useFocusedOrSelectedImage() {
  const focusedImageId = useSearchStore((s) => s.focusedImageId);
  const imagePositions = useSearchStore((s) => s.imagePositions);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);
  const results = useSearchStore((s) => s.results);
  const effectiveMode = useEffectiveFocusMode();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const metadataCache = useSelectionStore((s) => s.metadataCache);
  const reconciledView = useSelectionStore((s) => s.reconciledView);
  const pendingFetchIds = useSelectionStore((s) => s.pendingFetchIds);
  const isReconciling = useSelectionStore((s) => s.isReconciling);
  const metadataRevision = useSelectionMetadataRevision();
  const selectedCount = selectedIds.size;
  const presentation = useMemo(() => {
    const bufferedImage = (id: string): Image | null => {
      const globalIdx = imagePositions.get(id);
      if (globalIdx != null) {
        const localIdx = globalIdx - bufferOffset;
        if (localIdx >= 0 && localIdx < results.length) return results[localIdx] ?? null;
      }
      return null;
    };
    const metadataImages: Image[] = [];
    const usageImages: Image[] = [];
    let image: Image | null = null;
    if (selectedCount > 1) {
      for (const id of selectedIds) {
        const cached = metadataCache.get(id);
        if (cached) metadataImages.push(cached);
        const resolved = bufferedImage(id) ?? cached;
        if (resolved) usageImages.push(resolved);
      }
    } else {
      const singleSelectedId = selectedCount === 1 ? [...selectedIds][0] : null;
      const resolvedId = singleSelectedId ?? (effectiveMode === "phantom" ? null : focusedImageId);
      if (resolvedId) {
        const resident = bufferedImage(resolvedId);
        image = resident && isImageMetadataCurrent(resident) ? resident
          : (singleSelectedId ? metadataCache.get(singleSelectedId) ?? resident : resident);
      }
    }
    return { image, isMultiSelection: selectedCount > 1, metadataImages, usageImages, reconciledView, total: selectedCount };
  }, [selectedIds, selectedCount, metadataCache, metadataRevision, reconciledView, results, imagePositions, bufferOffset, effectiveMode, focusedImageId]);

  const incomplete = isReconciling || [...pendingFetchIds].some(id => selectedIds.has(id)) ||
    reconciledView === null || [...reconciledView.values()].some(field => field.kind === "pending" || field.kind === "dirty");
  const isPending = selectedCount > 1 ? incomplete : selectedCount === 1 && !presentation.image && incomplete;
  const [completed, setCompleted] = useState<typeof presentation | null>(null);
  const nextCompleted = isPending ? completed : selectedCount === 0 && !presentation.image ? null : presentation;
  if (nextCompleted !== completed) setCompleted(nextCompleted);
  return { ...(isPending && completed ? completed : presentation), isPending };
}

function CompactLabelActivity() {
  const compact = useIsCompact();
  const expanded = usePanelStore(state => state.config.right.visible);
  return compact && expanded ? <LabelOperationReceipts inline /> : null;
}

function currentPanelLabelEditing(): LabelEditContext {
  const selection = useSelectionStore.getState();
  const search = useSearchStore.getState();
  const overlays = useEnrichmentStore.getState().data;
  const targetIds = selection.selectedIds.size ? [...selection.selectedIds] : search.focusedImageId ? [search.focusedImageId] : [];
  const targets = new Map(targetIds.map(imageId => {
    const ordinal = search.imagePositions.get(imageId);
    const image = selection.metadataCache.get(imageId) ?? (ordinal === undefined ? undefined : search.results[ordinal - search.bufferOffset]);
    return [imageId, { resource: (image ? resolveImageOverlay(image, overlays.get(imageId), attachedEnrichment(image)) : overlays.get(imageId))?.resource,
      pending: selection.pendingFetchIds.has(imageId) || Boolean(image && !isImageMetadataCurrent(image, overlays.get(imageId), attachedEnrichment(image))) }];
  }));
  const pending = selection.selectedIds.size > 1 && (selection.isReconciling || !selection.reconciledView
    || [...selection.reconciledView.values()].some(field => field.kind === "pending" || field.kind === "dirty"));
  return { targetIds, targets, pending };
}

function FocusedImageMetadata() {
  const { image, isMultiSelection, metadataImages, reconciledView, total, isPending } = useFocusedOrSelectedImage();
  useEnrichmentStore(state => state.data);
  const labelEditing = currentPanelLabelEditing();
  labelEditing.pending ||= isPending;

  if (!isMultiSelection && image?.__availability) return (
    <div role="status" className="px-3 py-4 text-xs text-grid-text-muted">
      {image.__availability === "deleted" ? "Image deleted" : "Image unavailable"}
    </div>
  );

  if (isMultiSelection) {
    return (
      <div className="p-3" aria-busy={isPending}>
        <MultiImageMetadata images={metadataImages} reconciledView={reconciledView} total={total}
          labelEditing={labelEditing} resolveLabelEditing={currentPanelLabelEditing} />
      </div>
    );
  }

  if (!image) {
    return (
      <div className="px-3 py-4 text-xs text-grid-text-dim" aria-busy={isPending}>
        Focus an image to see its metadata.
      </div>
    );
  }

  return (
    <div className="p-3" aria-busy={isPending}>
      <ImageMetadata image={image} labelEditing={labelEditing} resolveLabelEditing={currentPanelLabelEditing} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FocusedUsages — right panel usages section for the focused/selected image.
// Uses the same panel-local image resolver as FocusedImageMetadata.
// Multi-selection: shows aggregate summary. Single/focused: shows UsagesSection.
// ---------------------------------------------------------------------------

function FocusedUsages() {
  const { image, isMultiSelection, usageImages, isPending } = useFocusedOrSelectedImage();

  if (isMultiSelection) {
    return <div aria-busy={isPending}><MultiUsagesSummary images={usageImages} /></div>;
  }

  if (!image) {
    return (
      <div className="px-3 py-4 text-xs text-grid-text-dim" aria-busy={isPending}>
        Focus an image to see its usages.
      </div>
    );
  }

  return <div aria-busy={isPending}><UsagesSection usages={image.usages} /></div>;
}

