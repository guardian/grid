/**
 * Index route — redirects `/` to `/search`.
 *
 * Kahuna serves its search page at `/search?query=…`, and kupua matches
 * this URL schema (AGENTS.md Decision 6). The root path redirects so
 * existing bookmarks and the bare URL both work.
 */

import { createRoute, redirect } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/search", search: DEFAULT_SEARCH });
  },
});
