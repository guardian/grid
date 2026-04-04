/**
 * ES sort clause builders — pure functions that translate kupua's
 * `orderBy` URL parameter into Elasticsearch sort clauses.
 *
 * Extracted from es-adapter.ts for DAL boundary clarity.
 * These are ES-specific — a Grid API adapter wouldn't need them
 * (the API accepts orderBy strings directly).
 */

import { gridConfig } from "@/lib/grid-config";

/**
 * Build the ES sort clause from an orderBy string.
 *
 * Two automatic suffixes are always appended after the user's sort fields:
 *
 * 1. **`{ uploadTime: dir }`** — universal fallback sort. When the
 *    primary sort field has null/missing values (e.g. `lastModified` —
 *    most images are never modified), ES places those docs at the end
 *    (default `missing: "_last"`). Among the null docs, only subsequent
 *    sort fields differentiate order. Without this fallback, the null
 *    zone would be sorted by `id` alone — a hex hash, effectively random
 *    and meaningless. With it, null-value docs are ordered by upload time,
 *    which is always present and meaningful.
 *
 *    Direction: for date primary sorts (uploadTime, dateTaken, lastModified),
 *    the fallback inherits the primary sort direction — temporal continuity
 *    so the null zone doesn't reverse the scrolling direction. For
 *    keyword/numeric sorts, always desc (newest first within tied groups).
 *    Skipped when uploadTime is already in the user's sort chain.
 *
 * 2. **`{ id: "asc" }`** — deterministic tiebreaker, required for
 *    `search_after` pagination. `id` is unique, so every document has
 *    a unique sort tuple.
 *
 * Exported so the store can inspect the sort clause for countBefore queries.
 */
export function buildSortClause(orderBy?: string): Record<string, unknown>[] {
  if (!orderBy) return [{ uploadTime: "desc" }, { id: "asc" }];

  // Short sort aliases (from dropdown / URL) → ES field paths.
  // The URL only ever contains the short alias; the full ES path is
  // resolved here at query time. See field-registry.ts sortKey values.
  const aliases: Record<string, string> = {
    taken: "metadata.dateTaken",
    credit: "metadata.credit",
    source: "metadata.source",
    imageType: "metadata.imageType",
    category: "usageRights.category",
    mimeType: "source.mimeType",
    width: "source.dimensions.width",
    height: "source.dimensions.height",
    // Config-driven alias fields (e.g. editStatus → fileMetadata.iptc.Edit Status)
    ...Object.fromEntries(
      gridConfig.fieldAliases.map((a) => [a.alias, a.elasticsearchPath]),
    ),
  };

  // Expand aliases in comma-separated parts
  const parts = orderBy.split(",").flatMap((part) => {
    const trimmed = part.trim();
    const neg = trimmed.startsWith("-");
    const bare = neg ? trimmed.slice(1) : trimmed;
    const prefix = neg ? "-" : "";

    if (aliases[bare]) {
      // Expand alias, preserving negation on each sub-part
      return aliases[bare].split(",").map((sub) => {
        const subNeg = sub.startsWith("-");
        const subBare = subNeg ? sub.slice(1) : sub;
        // XOR: if outer is negated, flip inner direction
        const finalNeg = neg !== subNeg;
        return finalNeg ? `-${subBare}` : subBare;
      });
    }

    return [`${prefix}${bare}`];
  });

  const clauses = parts.map((part) => {
    const desc = part.startsWith("-");
    const key = desc ? part.slice(1) : part;
    const order = desc ? "desc" : "asc";

    return { [key]: order };
  });

  // Collect field names already in the user's sort chain for dedup checks
  const fieldSet = new Set(clauses.map((c) => Object.keys(c)[0]));

  // Append uploadTime fallback — skip if already in the chain.
  //
  // Direction logic: for date primary sorts, the uploadTime fallback
  // inherits the primary sort direction so the null zone continues the
  // same temporal flow. E.g. `-lastModified` (newest modified first) →
  // null zone gets `uploadTime desc` (newest uploaded first) — scrolling
  // continues forward in "recency". `taken` (oldest taken first) → null
  // zone gets `uploadTime asc` (oldest uploaded first) — scrolling
  // continues forward in chronological time.
  //
  // For keyword/numeric sorts (credit, width, etc.), always desc (newest
  // first) — within a tied keyword group, "most recent" is the most
  // useful default. The primary sort direction (A→Z vs Z→A) is about
  // the keyword, not about time.
  //
  // Edge case: multi-sort like `-lastModified,taken` — the fallback
  // inherits from the PRIMARY sort direction (desc), because the largest
  // null zone is the primary field's. We discussed inheriting from the
  // last/secondary sort instead, but it adds complexity for a rare edge
  // case (docs missing both primary AND secondary sort fields).
  if (!fieldSet.has("uploadTime")) {
    const DATE_SORT_FIELDS = new Set([
      "uploadTime", "metadata.dateTaken", "lastModified",
    ]);
    const primaryField = clauses[0] ? Object.keys(clauses[0])[0] : null;
    const primaryDir = clauses[0] && primaryField
      ? (clauses[0][primaryField] as string)
      : "desc";
    const isDateSort = primaryField != null && DATE_SORT_FIELDS.has(primaryField);
    const fallbackDir = isDateSort ? primaryDir : "desc";
    clauses.push({ uploadTime: fallbackDir });
  }

  // Append id tiebreaker — skip if already the last field.
  if (!fieldSet.has("id")) {
    clauses.push({ id: "asc" });
  }

  return clauses;
}

/**
 * Reverse a sort clause — flip every asc↔desc. Used for backward
 * `search_after` pagination: flip sort, use `startCursor`, reverse
 * the returned hits.
 */
export function reverseSortClause(
  sort: Record<string, unknown>[],
): Record<string, unknown>[] {
  return sort.map((clause) => {
    const key = Object.keys(clause)[0];
    if (!key) return clause;
    const val = clause[key];
    const dir = typeof val === "string" ? val : "asc";
    return { [key]: dir === "desc" ? "asc" : "desc" };
  });
}

/**
 * Extract field name and direction from a single sort clause.
 * Handles regular field sorts ({field: "desc"}).
 */
export function parseSortField(clause: Record<string, unknown>): {
  field: string | null;
  direction: "asc" | "desc";
} {
  const key = Object.keys(clause)[0];
  if (!key) return { field: null, direction: "asc" };

  const val = clause[key];
  const direction: "asc" | "desc" =
    typeof val === "string" ? (val as "asc" | "desc") : "asc";

  return { field: key, direction };
}

