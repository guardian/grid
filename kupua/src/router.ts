/**
 * Router setup — assembles the route tree and creates the router instance.
 */

import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";
import { searchRoute } from "./routes/search";
import { imageRoute } from "./routes/image";
import { URL_PARAM_PRIORITY } from "./lib/search-params-schema";

const routeTree = rootRoute.addChildren([indexRoute, searchRoute, imageRoute]);

/**
 * Custom search-param serialisation for plain key=value URLs.
 *
 * Why custom?
 * 1. TanStack Router's default uses JSON.stringify, so the string "true"
 *    becomes `"true"` → URL-encoded as `%22true%22`.  Grid/kahuna expects
 *    bare `nonFree=true`.
 * 2. The built-in `parseSearchWith` helper delegates to `qss.decode` which
 *    calls `toValue` and converts `"true"` → boolean `true`.  Our Zod
 *    schema expects strings, so the boolean silently falls through
 *    `.catch(undefined)` and the value is lost — the checkbox gets stuck.
 *
 * The functions below use URLSearchParams directly, keeping every value as
 * a plain string and stripping stale JSON-style double-quote wrapping
 * (from old bookmarked URLs that went through the default serialiser).
 */

function plainParseSearch(searchStr: string): Record<string, string> {
  if (searchStr.startsWith("?")) searchStr = searchStr.substring(1);
  const result: Record<string, string> = {};
  const params = new URLSearchParams(searchStr);
  for (const [key, raw] of params.entries()) {
    // Strip stale JSON-style wrapping quotes (e.g. %22true%22 → true)
    const value =
      raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1)
        : raw;
    result[key] = value;
  }
  return result;
}

function plainStringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  // Insert priority keys first (e.g. image, nonFree) to match Grid URL style
  for (const key of URL_PARAM_PRIORITY) {
    const value = search[key];
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  // Then the rest in natural order
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    if (params.has(key)) continue; // already added as priority
    params.set(key, String(value));
  }
  const str = params
    .toString()
    // Colons are safe in query strings (RFC 3986 §3.4) — keep them readable
    .replaceAll("%3A", ":")
    // Use %20 instead of + for spaces — more readable in browser URL bars
    .replaceAll("+", "%20");
  return str ? `?${str}` : "";
}

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


