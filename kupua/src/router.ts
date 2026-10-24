/**
 * Router setup — assembles the route tree and creates the router instance.
 */

import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";
import { searchRoute } from "./routes/search";
import { imageRoute } from "./routes/image";
import { plainParseSearch, plainStringifySearch } from "./lib/plain-search-serializer";

const routeTree = rootRoute.addChildren([indexRoute, searchRoute, imageRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: false,
  parseSearch: plainParseSearch,
  stringifySearch: plainStringifySearch,
});

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}


