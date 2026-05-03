/**
 * Ephemeral cache for the last-known position of an image in search results.
 * Used to restore the counter and prev/next navigation after a page reload
 * when the image isn't in the first page of results.
 *
 * Stores:
 *   - `offset` — global index in the result set (for the counter display).
 *   - `cursor` — the image's ES sort values (for precise `search_after`
 *     restoration at any depth — percentile-based seek can't guarantee the
 *     exact image ends up in the buffer).
 *   - `searchKey` — fingerprint of query/sort/filters so we only use the
 *     cached value when the current search context matches.
 *
 * Uses sessionStorage so it's per-tab and clears on tab close.
 * If sessionStorage is unavailable (private browsing restrictions),
 * falls back silently — worst case is standalone mode (image shows,
 * no prev/next), which is the current behaviour anyway.
 */

import type { Image } from "@/types/image";
import type { SortValues } from "@/dal";
import { buildSortClause, parseSortField, DATE_SORT_FIELDS } from "@/dal";

const PREFIX = "kupua:imgOffset:";

/**
 * Build a stable fingerprint from URL search params for cache keying.
 * Strips display-only keys (image, density) and sorts the rest so
 * key order doesn't affect the fingerprint.
 */
export function buildSearchKey(params: Record<string, unknown>): string {
  // Exclude display-only keys (image, density) and internal pagination
  // fields (offset, length, countAll) — they describe fetch mechanics,
  // not the search context. This ensures keys match regardless of
  // whether params come from the URL or from the store.
  const entries = Object.entries(params)
    .filter(([k, v]) =>
      k !== "image" && k !== "density" &&
      k !== "offset" && k !== "length" && k !== "countAll" &&
      v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

// ---------------------------------------------------------------------------
// Extract sort values from an in-memory image — zero ES calls.
// ---------------------------------------------------------------------------

/**
 * Read a nested field path (e.g. "source.dimensions.width") from an image.
 * Returns `null` if any segment is missing — the image might not have the
 * field, and that's fine (ES sorts missing values last).
 */
function readFieldPath(image: Image, path: string): string | number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = image;
  for (const segment of path.split(".")) {
    if (cursor == null || typeof cursor !== "object") return null;
    cursor = cursor[segment];
  }
  if (cursor == null) return null;
  if (typeof cursor === "string" || typeof cursor === "number") return cursor;
  return null;
}

/**
 * Build the sort values array that ES would return for this image under
 * the current sort clause. Pure field extraction — no network call.
 *
 * Returns `null` if any required sort field can't be read (defensive —
 * callers should fall back to offset-based restore).
 */
export function extractSortValues(
  image: Image,
  orderBy?: string,
): SortValues | null {
  const clauses = buildSortClause(orderBy);
  const values: SortValues = [];
  for (const clause of clauses) {
    const { field } = parseSortField(clause);
    if (!field) return null;
    // The `id` tiebreaker is always present on the Image type.
    if (field === "id") {
      values.push(image.id);
      continue;
    }
    const val = readFieldPath(image, field);
    if (val == null) {
      // Missing field — ES returns null in sort values. We can still use
      // this cursor for search_after (ES handles null sort values), but
      // countBefore may not produce a useful offset. Push null and let the
      // restore path decide whether to use it.
      values.push(null);
    } else if (typeof val === "string" && DATE_SORT_FIELDS.has(field)) {
      // ES returns date sort values as epoch-milliseconds (numbers).
      // _source stores them as ISO strings. Convert so the cursor format
      // matches what getIdRange sees from searchAfter responses.
      const ms = Date.parse(val);
      values.push(isNaN(ms) ? null : ms);
    } else {
      values.push(val);
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// Store / retrieve
// ---------------------------------------------------------------------------

interface CachedImagePosition {
  offset: number;
  cursor: SortValues | null;
}

export function storeImageOffset(
  imageId: string,
  offset: number,
  searchKey: string,
  cursor: SortValues | null,
): void {
  try {
    sessionStorage.setItem(
      PREFIX + imageId,
      JSON.stringify({ offset, searchKey, cursor }),
    );
  } catch {
    // sessionStorage full or blocked — ignore
  }
}

export function getImageOffset(
  imageId: string,
  searchKey: string,
): CachedImagePosition | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + imageId);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (parsed.searchKey !== searchKey) return null; // query changed — stale
    const n = parsed.offset;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    // cursor may be absent (old cache format) — that's fine, callers fall back
    const cursor: SortValues | null = Array.isArray(parsed.cursor)
      ? parsed.cursor
      : null;
    return { offset: n, cursor };
  } catch {
    return null;
  }
}



