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
import { useSearchStore } from "@/stores/search-store";
import { useVisibleRange } from "@/hooks/useDataWindow";
import { useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { interpolateSortLabel } from "@/lib/sort-context";

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
  // Uses interpolation for positions outside the buffer — linearly extrapolates
  // dates from the buffer's anchor points, giving meaningful labels during drag.
  const orderBy = useSearchStore((s) => s.params.orderBy);
  const results = useSearchStore((s) => s.results);
  const getSortLabel = useCallback(
    (globalPosition: number): string | null => {
      const store = useSearchStore.getState();
      return interpolateSortLabel(
        store.params.orderBy,
        globalPosition,
        store.total,
        store.bufferOffset,
        store.results,
      );
    },
    // Depend on orderBy so the callback is fresh when sort changes.
    // results dependency ensures we get updated data after extends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderBy, results],
  );

  const scrubberElement = (
    <Scrubber
      total={total}
      currentPosition={currentPosition}
      visibleCount={visibleCount}
      bufferLength={bufferLength}
      loading={loading}
      onSeek={seek}
      getSortLabel={getSortLabel}
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

