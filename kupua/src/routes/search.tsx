/**
 * Search route — the main search page at `/search`.
 *
 * URL search params are validated with Zod and synced to the Zustand search store.
 * The URL is the source of truth: changing the URL triggers a search,
 * and user interactions (typing, selecting filters) update the URL.
 *
 * When `image` is present in the URL, the image detail overlay is shown
 * on top of the search results. The table stays mounted (hidden) so scroll
 * position, virtualizer state, and search context are all preserved.
 * Browser back removes `image` and the table is exactly where you left it.
 */

import { createRoute } from "@tanstack/react-router";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";
import { rootRoute } from "./__root";
import { searchParamsSchema } from "@/lib/search-params-schema";
import { SearchBar } from "@/components/SearchBar";
import { StatusBar } from "@/components/StatusBar";
import { ImageTable } from "@/components/ImageTable";
import { ImageDetail } from "@/components/ImageDetail";
import { useSearch } from "@tanstack/react-router";

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: zodSearchValidator(searchParamsSchema),
  component: SearchPage,
});

function SearchPage() {
  const { image } = useSearch({ from: "/search" });
  const showImageDetail = !!image;

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
        <ImageTable />
      </div>

      {/* Image detail overlay — rendered when image is in URL */}
      {showImageDetail && <ImageDetail imageId={image} />}
    </>
  );
}

