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
 * Always appends `{ id: "asc" }` as a tiebreaker — required for
 * deterministic `search_after` pagination. Uses the `id` keyword field
 * (not `_id` which requires fielddata to be enabled in ES 8.x).
 * Since `id` is unique, every document has a unique sort tuple.
 *
 * Exported so the store can inspect the sort clause for countBefore queries.
 */
export function buildSortClause(orderBy?: string): Record<string, unknown>[] {
  if (!orderBy) return [{ uploadTime: "desc" }, { id: "asc" }];

  // Short sort aliases (from dropdown / URL) → ES field paths.
  // The URL only ever contains the short alias; the full ES path is
  // resolved here at query time. See field-registry.ts sortKey values.
  const aliases: Record<string, string> = {
    taken: "metadata.dateTaken,-uploadTime",
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

  // Append tiebreaker — skip if 'id' is already the last sort field
  // (shouldn't happen in practice, but defensive).
  const lastClause = clauses[clauses.length - 1];
  if (!lastClause || !("id" in lastClause)) {
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

