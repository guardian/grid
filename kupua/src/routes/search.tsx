/**
 * Search route — the main search page at `/search`.
 *
 * URL search params are validated with Zod and synced to the Zustand search store.
 * The URL is the source of truth: changing the URL triggers a search,
 * and user interactions (typing, selecting filters) update the URL.
 */

import { createRoute } from "@tanstack/react-router";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";
import { rootRoute } from "./__root";
import { searchParamsSchema } from "@/lib/search-params-schema";
import { SearchBar } from "@/components/SearchBar";
import { StatusBar } from "@/components/StatusBar";
import { ImageTable } from "@/components/ImageTable";

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: zodSearchValidator(searchParamsSchema),
  component: SearchPage,
});

function SearchPage() {
  return (
    <>
      <SearchBar />
      <StatusBar />
      <ImageTable />
    </>
  );
}

