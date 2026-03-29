/**
 * Sort-context label for the scrubber tooltip.
 *
 * Given the current orderBy and an image, returns a human-readable label
 * for the primary sort value. For date sorts: a formatted date.
 * For keyword sorts: the field value (from pre-fetched distribution when
 * available, falling back to nearest buffer edge). Returns null if no
 * meaningful label.
 */

import type { Image } from "@/types/image";
import type { KeywordDistribution } from "@/dal/types";
import { format } from "date-fns";

/**
 * Maps orderBy sort keys to image field accessors and display formatters.
 *
 * The key is the sort field name as it appears in the first part of the
 * orderBy URL param (after stripping the "-" prefix for desc).
 */
const SORT_LABEL_MAP: Record<
  string,
  {
    accessor: (img: Image) => string | undefined;
    type: "date" | "keyword";
    /** Optional display formatter for keyword values (applied before truncation). */
    format?: (v: string) => string;
  }
> = {
  uploadTime: {
    accessor: (img) => img.uploadTime,
    type: "date",
  },
  taken: {
    accessor: (img) => img.metadata?.dateTaken,
    type: "date",
  },
  lastModified: {
    accessor: (img) => img.lastModified,
    type: "date",
  },
  credit: {
    accessor: (img) => img.metadata?.credit,
    type: "keyword",
  },
  source: {
    accessor: (img) => img.metadata?.source,
    type: "keyword",
  },
  uploadedBy: {
    accessor: (img) => img.uploadedBy,
    type: "keyword",
  },
  category: {
    accessor: (img) => img.usageRights?.category,
    type: "keyword",
  },
  mimeType: {
    accessor: (img) => img.source?.mimeType,
    type: "keyword",
    format: (v) => v.replace("image/", ""),
  },
  imageType: {
    accessor: (img) => img.metadata?.imageType,
    type: "keyword",
  },
  width: {
    accessor: (img) => {
      const w = (img.source?.orientedDimensions ?? img.source?.dimensions)?.width;
      return w != null ? `${w.toLocaleString()}px` : undefined;
    },
    type: "keyword",
  },
  height: {
    accessor: (img) => {
      const h = (img.source?.orientedDimensions ?? img.source?.dimensions)?.height;
      return h != null ? `${h.toLocaleString()}px` : undefined;
    },
    type: "keyword",
  },
};

/** Aliases are no longer needed — all keys in SORT_LABEL_MAP are now short form. */
const SORT_KEY_ALIASES: Record<string, string> = {};

/** Format + truncate a keyword value for tooltip display. */
function formatKeywordLabel(value: string, format?: (v: string) => string): string {
  const formatted = format ? format(value) : value;
  return formatted.length > 30 ? formatted.slice(0, 27) + "…" : formatted;
}

/**
 * Fixed-width month span — prevents tooltip width jitter when dragging
 * across month boundaries. The inline-block reserves the widest month's
 * space; text-align:center keeps narrower months visually balanced.
 * 2.05em fits any 3-letter abbreviation in Open Sans at text-xs.
 */
const MONTH_SPAN_STYLE = 'display:inline-block;width:2.05em;text-align:center';

function formatSortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = format(d, "d");
    const month = format(d, "MMM");
    const year = format(d, "yyyy");
    return `${day} <span style="${MONTH_SPAN_STYLE}">${month}</span> ${year}`;
  } catch {
    return dateStr;
  }
}

/** The default sort when orderBy is undefined (matches buildSortClause fallback). */
const DEFAULT_ORDER_BY = "-uploadTime";

/** Resolve orderBy to the primary sort field mapping. */
function resolveSortMapping(orderBy: string | undefined) {
  const effective = orderBy || DEFAULT_ORDER_BY;
  const primary = effective.split(",")[0].trim();
  const bare = primary.startsWith("-") ? primary.slice(1) : primary;
  const field = SORT_KEY_ALIASES[bare] ?? bare;
  return SORT_LABEL_MAP[field] ?? null;
}

/**
 * Get a contextual label from an image for the given orderBy.
 * Returns null if no label available (e.g. script sort, empty value).
 */
export function getSortContextLabel(
  orderBy: string | undefined,
  image: Image,
): string | null {
  const mapping = resolveSortMapping(orderBy);
  if (!mapping) return null;

  const value = mapping.accessor(image);
  if (!value) return null;

  if (mapping.type === "date") {
    return formatSortDate(value);
  }

  // Keyword: format + truncate
  return formatKeywordLabel(value, mapping.format);
}

/**
 * Short sort key → ES field path mapping. Mirrors buildSortClause aliases
 * in es-adapter.ts. We duplicate this small map here to avoid importing
 * from the DAL (sort-context is a pure utility, DAL is an implementation).
 *
 * Only keyword-sortable fields are listed — date sorts don't need this
 * (they use buffer interpolation, not composite agg distribution).
 * `filename` excluded — too high cardinality, values not useful as context.
 */
const KEYWORD_SORT_ES_FIELDS: Record<string, string> = {
  credit: "metadata.credit",
  source: "metadata.source",
  uploadedBy: "uploadedBy",
  category: "usageRights.category",
  mimeType: "source.mimeType",
  imageType: "metadata.imageType",
};

/**
 * Resolve the current orderBy to keyword sort info (ES field path + direction).
 * Returns null if the sort is not a keyword sort that supports distribution lookup.
 * Used by the store to decide whether to fetch a keyword distribution.
 */
export function resolveKeywordSortInfo(
  orderBy: string | undefined,
): { field: string; direction: "asc" | "desc" } | null {
  const effective = orderBy || DEFAULT_ORDER_BY;
  const primary = effective.split(",")[0].trim();
  const desc = primary.startsWith("-");
  const bare = desc ? primary.slice(1) : primary;
  const esField = KEYWORD_SORT_ES_FIELDS[bare];
  if (!esField) return null;
  return { field: esField, direction: desc ? "desc" : "asc" };
}

/**
 * Binary search a KeywordDistribution for the value at a global position.
 * O(log n) where n = number of unique values. Returns null if position
 * is outside the distribution's covered range (e.g. null-value docs at the tail).
 */
export function lookupKeywordDistribution(
  dist: KeywordDistribution,
  globalPosition: number,
  format?: (v: string) => string,
): string | null {
  const { buckets } = dist;
  if (buckets.length === 0) return null;
  // Position beyond covered range — null-valued docs at the tail
  if (globalPosition >= dist.coveredCount) return null;
  if (globalPosition < 0) return null;

  // Binary search: find the last bucket where startPosition <= globalPosition
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (buckets[mid].startPosition <= globalPosition) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return formatKeywordLabel(buckets[lo].key, format);
}

/**
 * Interpolate a sort label for a global position that may be outside the buffer.
 *
 * For date sorts: linearly interpolates between the first and last buffer
 * entries' date values based on position ratio within the full result set.
 * This gives a meaningful "14 Mar 2024" even when the scrubber is dragged
 * far from the loaded buffer.
 *
 * For keyword sorts: uses the pre-fetched keyword distribution if available
 * (O(log n) binary search — no network). Falls back to nearest buffer edge
 * if no distribution is available yet.
 *
 * @param orderBy — current orderBy string
 * @param globalPosition — the position in the full result set (0-based)
 * @param total — total results in the result set
 * @param bufferOffset — global offset of buffer[0]
 * @param results — the loaded buffer
 * @param keywordDist — optional pre-fetched keyword distribution
 */
export function interpolateSortLabel(
  orderBy: string | undefined,
  globalPosition: number,
  total: number,
  bufferOffset: number,
  results: (Image | undefined)[],
  keywordDist?: KeywordDistribution | null,
): string | null {
  if (!results.length || total <= 0) return null;

  const mapping = resolveSortMapping(orderBy);
  if (!mapping) return null;

  // If position is inside the buffer, return exact value
  const localIdx = globalPosition - bufferOffset;
  if (localIdx >= 0 && localIdx < results.length) {
    const img = results[localIdx];
    if (!img) return null;
    const val = mapping.accessor(img);
    if (!val) return null;
    return mapping.type === "date" ? formatSortDate(val) : formatKeywordLabel(val, mapping.format);
  }

  // --- Outside buffer: interpolate/extrapolate ---

  // Keyword sort with pre-fetched distribution — binary search, no network
  if (mapping.type === "keyword" && keywordDist) {
    return lookupKeywordDistribution(keywordDist, globalPosition, mapping.format);
  }

  // Find the first and last non-undefined images in the buffer
  let firstImg: Image | undefined;
  let lastImg: Image | undefined;
  for (let i = 0; i < results.length; i++) {
    if (results[i]) { firstImg = results[i]; break; }
  }
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i]) { lastImg = results[i]; break; }
  }
  if (!firstImg || !lastImg) return null;

  const firstVal = mapping.accessor(firstImg);
  const lastVal = mapping.accessor(lastImg);

  if (mapping.type === "date" && firstVal && lastVal) {
    // Interpolate date: compute a date between the extremes of the full
    // result set, using the buffer's dates as anchor points.
    const firstTime = new Date(firstVal).getTime();
    const lastTime = new Date(lastVal).getTime();
    if (isNaN(firstTime) || isNaN(lastTime)) return null;

    // The buffer covers positions [bufferOffset, bufferOffset + len - 1].
    // Extrapolate linearly: what date would position globalPosition have?
    const bufferLen = results.length;
    if (bufferLen <= 1) return formatSortDate(firstVal);

    // Rate of change: ms per position within the buffer
    const msPerPos = (lastTime - firstTime) / (bufferLen - 1);
    // Extrapolate from the buffer's start
    const estimatedTime = firstTime + msPerPos * (globalPosition - bufferOffset);
    return formatSortDate(new Date(estimatedTime).toISOString());
  }

  // Keyword: return nearest edge value
  if (localIdx < 0) {
    return firstVal ? formatKeywordLabel(firstVal, mapping.format) : null;
  }
  return lastVal ? formatKeywordLabel(lastVal, mapping.format) : null;
}




