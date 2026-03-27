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
import { FacetFilters, AggTiming } from "@/components/FacetFilters";
import { ImageMetadata } from "@/components/ImageMetadata";
import { useSearchStore } from "@/stores/search-store";
import { useSearch } from "@tanstack/react-router";

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
  const results = useSearchStore((s) => s.results);

  const image = focusedImageId
    ? results[imagePositions.get(focusedImageId) ?? -1] ?? null
    : null;

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

