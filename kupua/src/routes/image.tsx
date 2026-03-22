/**
 * Image route — redirects `/images/:imageId` to `/search?image=:imageId`.
 *
 * The image detail view is now an overlay within the search route (not a
 * separate page). This redirect preserves backward compatibility with
 * existing bookmarks and kahuna's URL schema.
 */

import { createRoute, redirect } from "@tanstack/react-router";
import { rootRoute } from "./__root";

export const imageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/images/$imageId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/search",
      search: { nonFree: "true", image: params.imageId },
    });
  },
});

