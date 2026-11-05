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
 * a plain string exactly as it appears in the URL — no reinterpretation.
 * (Previously this also stripped a leading/trailing `"` pair to clean up
 * stale bookmarks from before this serialiser existed, when TanStack's
 * default JSON-based codec wrapped every value in quotes. That heuristic
 * is unsound — a CQL query can legitimately start and end with `"`, e.g.
 * a single quoted phrase or a field key containing a reserved char — and
 * kupua has no such legacy bookmarks to support.)
 */

import { URL_PARAM_PRIORITY } from "./search-params-schema";

export function plainParseSearch(searchStr: string): Record<string, string> {
  if (searchStr.startsWith("?")) searchStr = searchStr.substring(1);
  const result: Record<string, string> = {};
  const params = new URLSearchParams(searchStr);
  for (const [key, raw] of params.entries()) {
    result[key] = raw;
  }
  return result;
}

export function plainStringifySearch(search: Record<string, unknown>): string {
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
