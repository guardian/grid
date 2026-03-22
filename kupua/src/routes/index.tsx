/**
 * Index route — the main search page.
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
import { ImageTable } from "@/components/ImageTable";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: zodSearchValidator(searchParamsSchema),
  component: IndexPage,
});

function IndexPage() {
  return (
    <>
      <SearchBar />
      <ImageTable />
    </>
  );
}

