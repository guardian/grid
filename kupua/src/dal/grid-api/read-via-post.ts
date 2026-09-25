/**
 * media-api POST routes that only read (the body carries the query). The Vite Grid API write guard
 * admits exactly these without VITE_GRID_API_WRITES_ENABLED. Dependency-free: vite.config.ts imports it.
 */
export const GRID_API_READ_VIA_POST = [
  "/images/search-after",
  "/images/window",
  "/images/rank",
  "/images/sort-profile",
  "/images/keys",
  "/images/count",
];

/** `url` is the request path below the /api proxy prefix. Exact paths only: a prefix would admit write routes such as `/images/:id/...`. */
export function isGridApiReadViaPost(method: string | undefined, url: string | undefined): boolean {
  const path = (url ?? "").split("?", 1)[0];
  return method === "POST" && GRID_API_READ_VIA_POST.includes(path);
}
