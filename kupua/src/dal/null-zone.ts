/**
 * Null-zone cursor helpers — shared by search-store (seek, extend,
 * buffer-around-image) and getIdRange (range selection walk).
 *
 * Moved here from search-store.ts so the DAL can use them without
 * an upward dependency on the store layer.
 */

import type { SortValues } from "./types";
import { buildSortClause, parseSortField } from "./adapters/elasticsearch/sort-builders";

// ---------------------------------------------------------------------------
// Null-zone cursor detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a cursor lives in the "null zone" (primary sort field value
 * is `null`). When it does, ES cannot accept the cursor directly — it rejects
 * `null` in `search_after` with a 500. Instead, callers must narrow the query
 * to docs missing the primary field, override the sort to the fallback sort
 * (uploadTime + id), and strip the null from the cursor.
 *
 * Returns `null` if the cursor is not in the null zone (no override needed).
 */
export interface NullZoneOverride {
  /** Stripped cursor without the null primary value — matches sortOverride shape. */
  strippedCursor: SortValues;
  /** Override sort: [uploadTime desc, id asc]. */
  sortOverride: Record<string, unknown>[];
  /** Extra filter: must_not { exists { field: primaryField } }. */
  extraFilter: Record<string, unknown>;
  /** The primary field name (for remapping response sort values). */
  primaryField: string;
  /** The full sort clause (for remapping). */
  sortClause: Record<string, unknown>[];
}

export function detectNullZoneCursor(
  cursor: SortValues,
  orderBy: string | undefined,
): NullZoneOverride | null {
  const sortClause = buildSortClause(orderBy);
  if (sortClause.length === 0) return null;

  const { field: primaryField } = parseSortField(sortClause[0]);
  if (!primaryField) return null;

  // Check if the primary field's position in the cursor is null.
  // The cursor structure mirrors the sort clause: [primary, uploadTime, id].
  if (cursor.length === 0 || cursor[0] !== null) return null;

  // Derive the uploadTime fallback direction from the sort clause.
  // buildSortClause already computed the correct direction: date primary sorts
  // inherit the primary direction (e.g. `taken` asc → uploadTime asc),
  // keyword/numeric sorts get desc. We read it from the clause directly
  // instead of hardcoding, so the null-zone override matches the real sort.
  let uploadTimeDir: "asc" | "desc" = "desc";
  for (const clause of sortClause) {
    const { field, direction } = parseSortField(clause);
    if (field === "uploadTime") {
      uploadTimeDir = direction;
      break;
    }
  }

  // Strip the null value(s) from the cursor — keep only the non-primary fields.
  // The cursor is [null, uploadTimeValue, idValue] → [uploadTimeValue, idValue].
  const strippedCursor: SortValues = [];
  for (let i = 0; i < sortClause.length; i++) {
    const { field } = parseSortField(sortClause[i]);
    if (field === primaryField) continue; // skip null primary
    if (i < cursor.length) {
      strippedCursor.push(cursor[i]);
    }
  }

  return {
    strippedCursor,
    sortOverride: [
      { uploadTime: uploadTimeDir },
      { id: "asc" },
    ],
    extraFilter: {
      bool: { must_not: { exists: { field: primaryField } } },
    },
    primaryField,
    sortClause,
  };
}

// ---------------------------------------------------------------------------
// Null-zone sort value remapping
// ---------------------------------------------------------------------------

/**
 * Remap sort values from null-zone shape [uploadTime, id] back to the full
 * sort clause shape [null, uploadTime, id]. Without this, cursors stored in
 * the buffer (startCursor/endCursor) would have the wrong length and break
 * subsequent extend calls.
 */
export function remapNullZoneSortValues(
  sortValues: SortValues[],
  sortClause: Record<string, unknown>[],
  primaryField: string,
): SortValues[] {
  return sortValues.map((sv) => {
    const remapped: SortValues = [];
    let svIdx = 0;
    for (const clause of sortClause) {
      const { field } = parseSortField(clause);
      if (field === primaryField) {
        remapped.push(null);
      } else if (svIdx < sv.length) {
        remapped.push(sv[svIdx++]);
      } else {
        remapped.push(null);
      }
    }
    return remapped;
  });
}
