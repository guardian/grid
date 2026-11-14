/**
 * Router setup — assembles the route tree and creates the router instance.
 */

import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";
import { searchRoute, uploadRoute } from "./routes/search";
import { imageCropRoute, imageRoute } from "./routes/image";
import { plainParseSearch, plainStringifySearch } from "./lib/plain-search-serializer";
import { discardCropDraftOutside } from "./lib/crop/crop-draft";
import { captureBrowsingDeparture } from "./lib/browsing-navigation";

const routeTree = rootRoute.addChildren([indexRoute, searchRoute, uploadRoute, imageRoute, imageCropRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: false,
  parseSearch: plainParseSearch,
  stringifySearch: plainStringifySearch,
});

router.subscribe("onBeforeNavigate", ({ fromLocation, toLocation }) => {
  if (fromLocation && fromLocation.pathname !== toLocation.pathname) captureBrowsingDeparture(fromLocation);
});
router.subscribe("onResolved", ({ toLocation }) => discardCropDraftOutside(toLocation.searchStr));

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}


