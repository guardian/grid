/**
 * Sort-context label for the scrubber tooltip.
 *
 * Given the current orderBy and an image, returns a human-readable label
 * for the primary sort value. For date sorts: a formatted date.
 * For keyword sorts: the field value. Returns null if no meaningful label.
 */

import type { Image } from "@/types/image";
import { format } from "date-fns";

/**
 * Maps orderBy sort keys to image field accessors and display formatters.
 *
 * The key is the sort field name as it appears in the first part of the
 * orderBy URL param (after stripping the "-" prefix for desc).
 */
const SORT_LABEL_MAP: Record<
  string,
  { accessor: (img: Image) => string | undefined; type: "date" | "keyword" }
> = {
  uploadTime: {
    accessor: (img) => img.uploadTime,
    type: "date",
  },
  "metadata.dateTaken": {
    accessor: (img) => img.metadata?.dateTaken,
    type: "date",
  },
  lastModified: {
    accessor: (img) => img.lastModified,
    type: "date",
  },
  "metadata.credit": {
    accessor: (img) => img.metadata?.credit,
    type: "keyword",
  },
  "metadata.source": {
    accessor: (img) => img.metadata?.source,
    type: "keyword",
  },
  uploadedBy: {
    accessor: (img) => img.uploadedBy,
    type: "keyword",
  },
  "usageRights.category": {
    accessor: (img) => img.usageRights?.category,
    type: "keyword",
  },
  "source.mimeType": {
    accessor: (img) => img.source?.mimeType,
    type: "keyword",
  },
  "metadata.imageType": {
    accessor: (img) => img.metadata?.imageType,
    type: "keyword",
  },
};

/** Aliases: sort key name → expanded field name for lookup. */
const SORT_KEY_ALIASES: Record<string, string> = {
  taken: "metadata.dateTaken",
};

function formatSortDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "d MMM yyyy");
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

  // Keyword: truncate long values
  return value.length > 30 ? value.slice(0, 27) + "…" : value;
}

/**
 * Interpolate a sort label for a global position that may be outside the buffer.
 *
 * For date sorts: linearly interpolates between the first and last buffer
 * entries' date values based on position ratio within the full result set.
 * This gives a meaningful "14 Mar 2024" even when the scrubber is dragged
 * far from the loaded buffer.
 *
 * For keyword sorts: returns the value from the nearest buffer edge
 * (no interpolation possible for text — shows what's near).
 *
 * @param orderBy — current orderBy string
 * @param globalPosition — the position in the full result set (0-based)
 * @param total — total results in the result set
 * @param bufferOffset — global offset of buffer[0]
 * @param results — the loaded buffer
 */
export function interpolateSortLabel(
  orderBy: string | undefined,
  globalPosition: number,
  total: number,
  bufferOffset: number,
  results: (Image | undefined)[],
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
    return mapping.type === "date" ? formatSortDate(val) : (val.length > 30 ? val.slice(0, 27) + "…" : val);
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
    return firstVal ? (firstVal.length > 30 ? firstVal.slice(0, 27) + "…" : firstVal) : null;
  }
  return lastVal ? (lastVal.length > 30 ? lastVal.slice(0, 27) + "…" : lastVal) : null;
}




