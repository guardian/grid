/**
 * Ephemeral cache for the last-known offset (index in search results) of
 * an image.  Used to restore prev/next navigation after a page reload when
 * the image isn't in the first page of results.
 *
 * Stores a search-params fingerprint alongside the offset so we only use
 * the cached value when the current query/sort/filters match.  If the
 * search context has changed (different query, different tab), the cached
 * offset is ignored and we fall back to standalone mode.
 *
 * Uses sessionStorage so it's per-tab and clears on tab close.
 * If sessionStorage is unavailable (private browsing restrictions),
 * falls back silently — worst case is standalone mode (image shows,
 * no prev/next), which is the current behaviour anyway.
 */

const PREFIX = "kupua:imgOffset:";

/**
 * Build a stable fingerprint from URL search params for cache keying.
 * Strips display-only keys (image, density) and sorts the rest so
 * key order doesn't affect the fingerprint.
 */
export function buildSearchKey(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== "image" && k !== "density" && v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

export function storeImageOffset(imageId: string, offset: number, searchKey: string): void {
  try {
    sessionStorage.setItem(PREFIX + imageId, JSON.stringify({ offset, searchKey }));
  } catch {
    // sessionStorage full or blocked — ignore
  }
}

export function getImageOffset(imageId: string, searchKey: string): number | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + imageId);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (parsed.searchKey !== searchKey) return null; // query changed — stale
    const n = parsed.offset;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}



