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
 * The `density` param switches between grid (default) and table views. Both share
 * the same data layer (`useDataWindow`), focus, and search context.
 */

import { createRoute } from "@tanstack/react-router";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";
import { rootRoute } from "./__root";
import { searchParamsSchema } from "@/lib/search-params-schema";
import { SearchBar } from "@/components/SearchBar";
import { StatusBar } from "@/components/StatusBar";
import { ImageTable } from "@/components/ImageTable";
import { ImageGrid } from "@/components/ImageGrid";
import { ImageDetail } from "@/components/ImageDetail";
import { PanelLayout, AccordionSection } from "@/components/PanelLayout";
import { Scrubber } from "@/components/Scrubber";
import { FacetFilters, AggTiming } from "@/components/FacetFilters";
import { ImageMetadata } from "@/components/ImageMetadata";
import { FullscreenPreview } from "@/components/FullscreenPreview";
import { useSearchStore } from "@/stores/search-store";
import { useVisibleRange } from "@/hooks/useDataWindow";
import { useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { interpolateNullZoneSortLabel, resolveKeywordSortInfo, resolveDateSortInfo, computeTrackTicksWithNullZone } from "@/lib/sort-context";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: zodSearchValidator(searchParamsSchema),
  component: SearchPage,
});

function SearchPage() {
  const { image, density } = useSearch({ from: "/search" });
  const showImageDetail = !!image;
  const isGrid = density !== "table";

  // Keep document.title in sync with the search query
  useDocumentTitle();

  // Scrubber data — subscribed at this level so the scrubber re-renders
  // when the buffer moves without re-rendering the views.
  const total = useSearchStore((s) => s.total);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);
  const bufferLength = useSearchStore((s) => s.results.length);
  const loading = useSearchStore((s) => s.loading);
  const seek = useSearchStore((s) => s.seek);
  const visibleRange = useVisibleRange();

  const currentPosition = bufferOffset + visibleRange.start;
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
  const ticksCacheRef = useRef<{ key: string; ticks: ReturnType<typeof computeTrackTicksWithNullZone> }>({ key: "", ticks: [] });
  const nzDistBucketCount = nullZoneDistribution?.buckets.length ?? 0;
  const ticksCacheKey = allDataInBuffer
    ? `buffer:${orderBy ?? ""}:${total}`
    : sortDistribution
      ? `dist:${orderBy ?? ""}:${total}:${sortDistribution.buckets.length}:nz${nzDistBucketCount}`
      : "";
  if (ticksCacheKey && ticksCacheRef.current.key !== ticksCacheKey) {
    ticksCacheRef.current = {
      key: ticksCacheKey,
      ticks: computeTrackTicksWithNullZone(orderBy, total, bufferOffset, results, sortDistribution, nullZoneDistribution),
    };
  } else if (!ticksCacheKey) {
    ticksCacheRef.current = { key: "", ticks: [] };
  }
  const trackTicks = ticksCacheRef.current.ticks;

  const scrubberElement = (
    <Scrubber
      total={total}
      currentPosition={currentPosition}
      visibleCount={visibleCount}
      bufferLength={bufferLength}
      loading={loading}
      onSeek={seek}
      getSortLabel={getSortLabel}
      onFirstInteraction={hasDistributableSort ? onScrubberInteraction : undefined}
      trackTicks={trackTicks}
    />
  );

  return (
    <>
      {/* Search UI — always mounted, always laid out at full size.
          When image detail is showing, made invisible via opacity-0 +
          pointer-events-none. This preserves scroll position perfectly —
          display:none would reset scrollTop to 0. The absolute + inset-0
          keeps it in the same space as the image detail overlay. */}
      <div
        className={
          showImageDetail
            ? "absolute inset-0 flex flex-col opacity-0 pointer-events-none"
            : "contents"
        }
        aria-hidden={showImageDetail || undefined}
      >
        <SearchBar />
        <StatusBar />
        <PanelLayout
          leftPanel={
            <AccordionSection sectionId="left-filters" title="Filters" headerRight={<AggTiming />}>
              <FacetFilters />
            </AccordionSection>
          }
          rightPanel={
            <AccordionSection sectionId="right-metadata" title="Details">
              <FocusedImageMetadata />
            </AccordionSection>
          }
          scrubber={scrubberElement}
        >
          {isGrid ? <ImageGrid /> : <ImageTable />}
        </PanelLayout>
      </div>

      {/* Image detail overlay — rendered when image is in URL */}
      {showImageDetail && <ImageDetail imageId={image} />}

      {/* Fullscreen preview — always mounted (hidden until activated by `f` key).
          Uses the Fullscreen API for true edge-to-edge display. */}
      <FullscreenPreview />
    </>
  );
}

// ---------------------------------------------------------------------------
// FocusedImageMetadata — right panel content showing metadata for the
// focused image in grid/table views. Reads focusedImageId from the search
// store and resolves it to an Image via imagePositions + results.
// ---------------------------------------------------------------------------

function FocusedImageMetadata() {
  const focusedImageId = useSearchStore((s) => s.focusedImageId);
  const imagePositions = useSearchStore((s) => s.imagePositions);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);
  const results = useSearchStore((s) => s.results);

  const image = (() => {
    if (!focusedImageId) return null;
    const globalIdx = imagePositions.get(focusedImageId);
    if (globalIdx == null) return null;
    const localIdx = globalIdx - bufferOffset;
    if (localIdx < 0 || localIdx >= results.length) return null;
    return results[localIdx] ?? null;
  })();

  if (!image) {
    return (
      <div className="px-3 py-4 text-xs text-grid-text-dim">
        Focus an image to see its metadata.
      </div>
    );
  }

  return (
    <div className="p-3">
      <ImageMetadata image={image} />
    </div>
  );
}

