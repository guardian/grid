/**
 * Sort-context label for the scrubber tooltip and track ticks.
 *
 * Given the current orderBy and an image, returns a human-readable label
 * for the primary sort value. For date sorts: a formatted date using the
 * pre-fetched date histogram distribution. For keyword sorts: the field
 * value from the pre-fetched keyword distribution. Both use O(log n)
 * binary search — zero network during drag.
 *
 * When no distribution is loaded yet, falls back to buffer interpolation
 * (exact for in-buffer positions, linear extrapolation for outside — the
 * latter is inaccurate for non-uniform distributions but self-corrects
 * once the distribution loads).
 */

import type { Image } from "@/types/image";
import type { SortDistribution } from "@/dal/types";
import { format } from "date-fns";
import { FIELD_REGISTRY } from "@/lib/field-registry";

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
      return w != null ? `${w}` : undefined;
    },
    type: "keyword",
    format: (v) => `${Number(v).toLocaleString()}px`,
  },
  height: {
    accessor: (img) => {
      const h = (img.source?.orientedDimensions ?? img.source?.dimensions)?.height;
      return h != null ? `${h}` : undefined;
    },
    type: "keyword",
    format: (v) => `${Number(v).toLocaleString()}px`,
  },
};

/** Aliases are no longer needed — all keys in SORT_LABEL_MAP are now short form. */
const SORT_KEY_ALIASES: Record<string, string> = {};

/**
 * Look up the human-readable display name for a sort key from the field registry.
 * Returns a lowercase label suitable for "No {label}" boundary tick phrases.
 * Some fields have short overrides because the registry label reads awkwardly
 * (e.g. "No last modified" → "No modified", "No taken on" → "No date taken").
 */
const NULL_ZONE_LABEL_OVERRIDES: Record<string, string> = {
  lastModified: "modified",
  taken: "date taken",
};

function getSortFieldDisplayName(sortKey: string): string {
  if (NULL_ZONE_LABEL_OVERRIDES[sortKey]) return NULL_ZONE_LABEL_OVERRIDES[sortKey];
  const field = FIELD_REGISTRY.find((f) => f.sortKey === sortKey);
  return field ? field.label.toLowerCase() : sortKey;
}

/**
 * Resolve the primary sort key from orderBy (strip "-", take first part).
 * Returns the bare key (e.g. "lastModified") or null if unresolvable.
 */
export function resolvePrimarySortKey(orderBy: string | undefined): string | null {
  const effective = orderBy || DEFAULT_ORDER_BY;
  const primary = effective.split(",")[0].trim();
  const bare = primary.startsWith("-") ? primary.slice(1) : primary;
  return (SORT_KEY_ALIASES[bare] ?? bare) || null;
}

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

/**
 * Fixed-width time span — prevents tooltip width jitter across time values.
 * All HH:MM values are 5 chars; the span reserves exactly that width.
 * Monospace-like alignment via tabular-nums.
 */
const TIME_SPAN_STYLE = 'display:inline-block;width:3.1em;text-align:right;font-variant-numeric:tabular-nums';

/**
 * Fixed-width day span — prevents jitter between 1-digit and 2-digit days.
 * 1.2em fits "31" comfortably; text-align:right keeps single digits flush.
 */
const DAY_SPAN_STYLE = 'display:inline-block;width:1.2em;text-align:right';

// ---------------------------------------------------------------------------
// Adaptive date granularity
//
// Two simple rules:
//
// 1. **Always show year.** It's 4 characters and never hurts orientation.
//    The only exception: total result set spans < 28 days → year is
//    dropped and time is shown instead. You're within a single month,
//    the year is obvious from context, and you need the space for time.
//
// 2. **Show time (H:mm) whenever the total result set spans < 28 days.**
//    If the set spans months or years, hours race uselessly during scrub
//    and provide zero orientation value. Time only matters when you're
//    exploring a narrow window (a day, a week) where hours differentiate
//    positions. The decision is based solely on totalSpanMs (not localSpanMs)
//    to prevent format twitching when local density varies at distribution
//    edges.
//
// 3. **Drop day when each viewport covers > 28 days** (optional, rare).
//    This only happens with very large sets over many years where each
//    pixel of scrubber movement covers a month. Day is noise at that
//    scale — show Mon yyyy only.
//
// | Total span    | Local span   | Format           | Example            |
// |---------------|--------------|------------------|--------------------|
// | any           | > 28 days    | Mon yyyy         | Mar 2024           |
// | ≥ 28 days     | ≤ 28 days    | d Mon yyyy       | 14 Mar 2024        |
// | < 28 days     | any          | d Mon H:mm       | 14 Mar 15:42       |
//
// Width stability: each component uses a fixed-width <span>. Format
// level changes rarely during a single drag (driven by smooth density
// curves). When they do, right-aligned tooltip pushes the change to the
// less-visible left edge.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = 28 * MS_PER_DAY;

/**
 * Format a date string with adaptive granularity.
 *
 * @param dateStr — ISO date string to format
 * @param totalSpanMs — time span of the full result set (ms)
 * @param localSpanMs — time span of one viewport at this position (ms)
 */
function formatSortDateAdaptive(
  dateStr: string,
  totalSpanMs: number,
  localSpanMs: number,
): string {
  try {
    const d = new Date(dateStr);
    const day = `<span style="${DAY_SPAN_STYLE}">${format(d, "d")}</span>`;
    const monthAbbr = format(d, "MMM");
    const month = `<span style="${MONTH_SPAN_STYLE}">${monthAbbr}</span>`;
    const year = format(d, "yyyy");
    const time = `<span style="${TIME_SPAN_STYLE}">${format(d, "H:mm")}</span>`;

    const absTotal = Math.abs(totalSpanMs);
    const absLocal = Math.abs(localSpanMs);

    // Rule 3: drop day when scrubbing so fast each viewport covers > 1 month
    if (absLocal > MS_PER_MONTH) {
      return `${month} ${year}`;
    }

    // Rule 2: show time when the entire result set spans < 28 days.
    // Decision based solely on totalSpanMs — NOT localSpanMs — to prevent
    // format twitching when local density varies at distribution edges.
    if (absTotal < MS_PER_MONTH) {
      return `${day} ${monthAbbr} ${time}`;
    }

    // Default: day + month + year
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Default date format (day + month + year) — used by getSortContextLabel
 * which doesn't have visibleCount context for adaptive granularity.
 */
function formatSortDate(dateStr: string): string {
  // Pass spans that produce the default "d Mon yyyy" format:
  // totalSpan ≥ 28 days (no time), localSpan ≤ 28 days (shows day)
  return formatSortDateAdaptive(dateStr, 2 * MS_PER_MONTH, 2 * MS_PER_DAY);
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
 * Short sort key → ES field path for keyword-sortable fields.
 * Used to decide whether to fetch keyword distribution.
 */
const KEYWORD_SORT_ES_FIELDS: Record<string, string> = {
  credit: "metadata.credit",
  source: "metadata.source",
  uploadedBy: "uploadedBy",
  category: "usageRights.category",
  mimeType: "source.mimeType",
  imageType: "metadata.imageType",
  width: "source.dimensions.width",
  height: "source.dimensions.height",
};

/**
 * Short sort key → ES field path for date-sortable fields.
 * Used to decide whether to fetch date histogram distribution.
 */
const DATE_SORT_ES_FIELDS: Record<string, string> = {
  uploadTime: "uploadTime",
  taken: "metadata.dateTaken",
  lastModified: "lastModified",
};

/**
 * Resolve the current orderBy to keyword sort info (ES field path + direction).
 * Returns null if the sort is not a keyword sort that supports distribution lookup.
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
 * Resolve the current orderBy to date sort info (ES field path + direction).
 * Returns null if the sort is not a date sort that supports distribution lookup.
 */
export function resolveDateSortInfo(
  orderBy: string | undefined,
): { field: string; direction: "asc" | "desc" } | null {
  const effective = orderBy || DEFAULT_ORDER_BY;
  const primary = effective.split(",")[0].trim();
  const desc = primary.startsWith("-");
  const bare = desc ? primary.slice(1) : primary;
  const esField = DATE_SORT_ES_FIELDS[bare];
  if (!esField) return null;
  return { field: esField, direction: desc ? "desc" : "asc" };
}

/**
 * Binary search a SortDistribution for the bucket at a global position.
 * O(log n) where n = number of buckets. Returns the bucket key (keyword
 * value or ISO date string), or null if position is outside the covered range.
 */
export function lookupSortDistribution(
  dist: SortDistribution,
  globalPosition: number,
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

  // --- Debug instrumentation (DEV only) ---
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    const bucket = buckets[lo];
    (window as any).__sort_context_debug__ = {
      ts: Date.now(),
      inputPosition: globalPosition,
      coveredCount: dist.coveredCount,
      totalBuckets: buckets.length,
      bucketIndex: lo,
      bucketKey: bucket.key,
      bucketStartPosition: bucket.startPosition,
      bucketCount: bucket.count,
      bucketEndPosition: bucket.startPosition + bucket.count - 1,
      firstBucketKey: buckets[0].key,
      lastBucketKey: buckets[buckets.length - 1].key,
    };
  }

  return buckets[lo].key;
}

/**
 * Interpolate a sort label for a global position that may be outside the buffer.
 *
 * For keyword sorts: uses the pre-fetched distribution if available
 * (O(log n) binary search — no network). Falls back to nearest buffer edge.
 *
 * For date sorts: uses the pre-fetched date histogram distribution if available
 * (O(log n) binary search — no network). Falls back to linear buffer
 * extrapolation (inaccurate for non-uniform distributions but harmless —
 * self-corrects after seeking or once the distribution loads).
 *
 * Uses adaptive granularity when `visibleCount` is provided.
 *
 * @param orderBy — current orderBy string
 * @param globalPosition — the position in the full result set (0-based)
 * @param total — total results in the result set
 * @param bufferOffset — global offset of buffer[0]
 * @param results — the loaded buffer
 * @param sortDist — optional pre-fetched sort distribution (keyword or date)
 * @param visibleCount — optional number of items visible in the viewport.
 */
export function interpolateSortLabel(
  orderBy: string | undefined,
  globalPosition: number,
  total: number,
  bufferOffset: number,
  results: (Image | undefined)[],
  sortDist?: SortDistribution | null,
  visibleCount?: number,
): string | null {
  if (!results.length || total <= 0) return null;

  const mapping = resolveSortMapping(orderBy);
  if (!mapping) return null;

  // --- Keyword sorts ---

  if (mapping.type === "keyword") {
    // Inside buffer: exact value
    const localIdx = globalPosition - bufferOffset;
    if (localIdx >= 0 && localIdx < results.length) {
      const img = results[localIdx];
      if (!img) return null;
      const val = mapping.accessor(img);
      if (!val) return null;
      return formatKeywordLabel(val, mapping.format);
    }
    // Outside buffer: distribution or nearest edge
    if (sortDist) {
      const key = lookupSortDistribution(sortDist, globalPosition);
      return key ? formatKeywordLabel(key, mapping.format) : null;
    }
    const edge = findBufferEdges(results, mapping);
    if (!edge) return null;
    return localIdx < 0
      ? (edge.firstVal ? formatKeywordLabel(edge.firstVal, mapping.format) : null)
      : (edge.lastVal ? formatKeywordLabel(edge.lastVal, mapping.format) : null);
  }

  // --- Date sorts ---

  // Distribution available → use it (accurate for all positions)
  if (sortDist) {
    const isoDate = lookupSortDistribution(sortDist, globalPosition);
    if (isoDate) {
      // Compute granularity spans from distribution
      const totalSpanMs = computeDistributionSpanMs(sortDist);
      const localSpanMs = visibleCount
        ? computeLocalSpanFromDist(sortDist, globalPosition, visibleCount)
        : 2 * MS_PER_DAY;
      return formatSortDateAdaptive(isoDate, totalSpanMs, localSpanMs);
    }
  }

  // Fallback: linear buffer extrapolation (inaccurate outside buffer)
  const estimatedDate = estimateDateAtPosition(
    globalPosition, bufferOffset, results, mapping,
  );
  if (!estimatedDate) return null;

  if (visibleCount == null || visibleCount <= 0) {
    return formatSortDateAdaptive(
      estimatedDate.toISOString(), 2 * MS_PER_MONTH, 2 * MS_PER_DAY,
    );
  }

  const dateAtStart = estimateDateAtPosition(0, bufferOffset, results, mapping);
  const dateAtEnd = estimateDateAtPosition(
    Math.max(0, total - 1), bufferOffset, results, mapping,
  );
  const totalSpanMs = dateAtStart && dateAtEnd
    ? dateAtEnd.getTime() - dateAtStart.getTime()
    : 2 * MS_PER_MONTH;

  const lookaheadPos = Math.min(globalPosition + visibleCount, total - 1);
  const lookaheadDate = estimateDateAtPosition(
    lookaheadPos, bufferOffset, results, mapping,
  );
  const localSpanMs = lookaheadDate
    ? lookaheadDate.getTime() - estimatedDate.getTime()
    : 2 * MS_PER_DAY;

  return formatSortDateAdaptive(estimatedDate.toISOString(), totalSpanMs, localSpanMs);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compute total time span from first to last bucket in a date distribution. */
function computeDistributionSpanMs(dist: SortDistribution): number {
  if (dist.buckets.length < 2) return 2 * MS_PER_MONTH;
  const first = new Date(dist.buckets[0].key).getTime();
  const last = new Date(dist.buckets[dist.buckets.length - 1].key).getTime();
  return Math.abs(last - first) || 2 * MS_PER_MONTH;
}

/**
 * Compute the time span of one viewport (visibleCount items) at a given
 * position, using the distribution for accurate density-aware estimation.
 * Binary-searches for the bucket at position and position+visibleCount,
 * then returns the time delta between their keys.
 */
function computeLocalSpanFromDist(
  dist: SortDistribution,
  globalPosition: number,
  visibleCount: number,
): number {
  const endPos = Math.min(globalPosition + visibleCount, dist.coveredCount - 1);
  const startKey = lookupSortDistribution(dist, globalPosition);
  const endKey = lookupSortDistribution(dist, endPos);
  if (!startKey || !endKey) return 2 * MS_PER_DAY;
  const delta = Math.abs(new Date(endKey).getTime() - new Date(startKey).getTime());
  return delta || 2 * MS_PER_DAY;
}

/** Buffer edge values for keyword fallback. */
function findBufferEdges(
  results: (Image | undefined)[],
  mapping: { accessor: (img: Image) => string | undefined },
): { firstVal: string | undefined; lastVal: string | undefined } | null {
  let firstImg: Image | undefined;
  let lastImg: Image | undefined;
  for (let i = 0; i < results.length; i++) {
    if (results[i]) { firstImg = results[i]; break; }
  }
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i]) { lastImg = results[i]; break; }
  }
  if (!firstImg || !lastImg) return null;
  return { firstVal: mapping.accessor(firstImg), lastVal: mapping.accessor(lastImg) };
}

/**
 * Estimate the Date at a global position using the buffer's date anchors.
 * For positions inside the buffer: returns the exact date from the image.
 * For positions outside: linearly extrapolates from the buffer edges.
 *
 * ⚠️  LINEAR EXTRAPOLATION IS INACCURATE for non-uniform distributions.
 * Real-world upload times are heavily skewed — recent images are dense,
 * old images are sparse. A buffer covering 2 days of recent uploads will
 * extrapolate a slope of ~minutes/position, wildly underestimating the
 * time span to position 1M+. E.g., "2010" label may appear where "Jul
 * 2022" actually is. This affects:
 *   - Tooltip hover-preview dates during drag (self-corrects after seek)
 *   - computeTrackTicks() — currently disabled for seek mode (search.tsx)
 * Proper fix: date histogram aggregation from ES (see ideation Theme 2a).
 * Returns null if the buffer has no usable date data.
 */
function estimateDateAtPosition(
  globalPosition: number,
  bufferOffset: number,
  results: (Image | undefined)[],
  mapping: { accessor: (img: Image) => string | undefined },
): Date | null {
  // Inside buffer: exact value
  const localIdx = globalPosition - bufferOffset;
  if (localIdx >= 0 && localIdx < results.length) {
    const img = results[localIdx];
    if (!img) return null;
    const val = mapping.accessor(img);
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  // Outside buffer: interpolate from edges
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
  if (!firstVal || !lastVal) return null;

  const firstTime = new Date(firstVal).getTime();
  const lastTime = new Date(lastVal).getTime();
  if (isNaN(firstTime) || isNaN(lastTime)) return null;

  const bufferLen = results.length;
  if (bufferLen <= 1) return new Date(firstTime);

  const msPerPos = (lastTime - firstTime) / (bufferLen - 1);
  const estimatedTime = firstTime + msPerPos * (globalPosition - bufferOffset);
  return new Date(estimatedTime);
}

// ---------------------------------------------------------------------------
// Track tick marks — month/year boundary positions for scrubber orientation
// ---------------------------------------------------------------------------

export interface TrackTick {
  /** Global position (0-based) of this boundary in the result set. */
  position: number;
  /** 'major' boundaries are more prominent than 'minor'. What constitutes
   *  major vs minor depends on the adaptive resolution and span length:
   *  - Month resolution, short span (< 15 years): major = every January,
   *    minor = other months. Every year gets a label.
   *  - Month resolution, long span (≥ 15 years): major = decade/half-decade
   *    January (2020, 2025…), minor = everything else. All Januaries carry
   *    a year label; Scrubber decimation controls which are visible.
   *  - Day resolution: major = month boundary, minor = day
   *  - Hour resolution: major = 6-hour mark (00/06/12/18), minor = other hours */
  type: "minor" | "major";
  /** Optional human-readable label for this boundary. Assigned to major
   *  ticks and labelled minor ticks. Shown on hover to orient the user
   *  without requiring tooltip interaction.
   *  - Month resolution, short span: major = "2024", minor = "Mar", "Apr", …
   *  - Month resolution, long span: major = "2020", "2025", minor = "2022";
   *    all Januaries carry year label; non-January months have month abbr.
   *  - Day resolution: major = "Mar", "Apr", …, minor (no label)
   *  - Hour resolution: major = "00:00"/"06:00"/…, midnight = "14 Mar";
   *    minor = "09:00", "10:00", … */
  label?: string;
  /** Optional override colour for the tick line + label text.
   *  Used by the null-zone boundary tick to visually separate zones. */
  color?: string;
  /** True only for the null-zone boundary tick — gets special rendering
   *  (vertical label, force-visible). Regular null-zone ticks are false. */
  boundary?: boolean;
}

/**
 * Compute date boundary positions for scrubber track tick marks.
 *
 * When a SortDistribution is provided (date histogram from ES), uses its
 * buckets directly as ticks. The distribution's adaptive interval (month /
 * day / hour) and cumulative positions give density-correct spacing — e.g.
 * a recent-skewed 15-year set gets month ticks spread across the top 90%
 * of the track (where the data is) and a cluster at the bottom (old data).
 * The Scrubber's label decimation then shows labels only where there's
 * enough pixel space.
 *
 * Without a distribution, falls back to time-span-based generation with
 * linear buffer extrapolation (only accurate in scroll mode).
 *
 * Returns an empty array for keyword sorts, script sorts, or when no
 * usable date data is available.
 */
export function computeTrackTicks(
  orderBy: string | undefined,
  total: number,
  bufferOffset: number,
  results: (Image | undefined)[],
  sortDist?: SortDistribution | null,
): TrackTick[] {
  if (total <= 0) return [];

  const mapping = resolveSortMapping(orderBy);
  if (!mapping || mapping.type !== "date") return [];

  const MONTH_ABBRS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // -----------------------------------------------------------------------
  // Distribution mode: use histogram buckets directly as ticks.
  // Each bucket key is an ISO date (e.g. "2024-03-01T00:00:00.000Z"),
  // each startPosition is the accurate cumulative doc count.
  // -----------------------------------------------------------------------

  if (sortDist && sortDist.buckets.length >= 2) {
    const ticks: TrackTick[] = [];

    // Detect the histogram interval from the first two bucket keys
    const d0 = new Date(sortDist.buckets[0].key);
    const d1 = new Date(sortDist.buckets[1].key);
    const intervalMs = Math.abs(d1.getTime() - d0.getTime());
    const isMonthly = intervalMs > 20 * MS_PER_DAY; // ~28–31 days
    const isDaily = !isMonthly && intervalMs > 12 * 3600_000; // ~24h
    const isHourly = !isMonthly && !isDaily && intervalMs >= 3600_000; // 1h
    // Otherwise: sub-hour (30m, 10m, 5m, etc.)
    const intervalMinutes = !isMonthly && !isDaily && !isHourly
      ? Math.round(intervalMs / 60_000)
      : 0;

    // For monthly buckets: compute span in years to decide label density.
    // Short spans (< ~15 years): every January gets a year label and major
    // status — individual years are the primary orientation landmarks.
    // Long spans (≥ 15 years): decade/half-decade hierarchy prevents
    // overcrowding — only yr%5==0 gets a label, only yr%10==0 is major.
    const dFirst = new Date(sortDist.buckets[0].key);
    const dLast = new Date(sortDist.buckets[sortDist.buckets.length - 1].key);
    const spanYears = Math.abs(dLast.getFullYear() - dFirst.getFullYear());
    const shortSpan = spanYears < 15;

    for (const bucket of sortDist.buckets) {
      const pos = bucket.startPosition;
      if (pos < 0 || pos >= total) continue;

      const d = new Date(bucket.key);

      if (isMonthly) {
        // Monthly buckets: Jan = major (year label), other months = minor (month abbr).
        // Label/major strategy adapts to span length — see shortSpan above.
        const isJan = d.getMonth() === 0;
        const yr = d.getFullYear();
        if (shortSpan) {
          // Short span: every January is major with a year label.
          // Non-January months are minor with month abbreviation.
          ticks.push({
            position: pos,
            type: isJan ? "major" : "minor",
            label: isJan ? `${yr}` : MONTH_ABBRS[d.getMonth()],
          });
        } else {
          // Long span: half-decade hierarchy — label only at yr%5, major at yr%5.
          // All January ticks still carry a year label so the Scrubber's
          // label-decimation can show them when there's enough pixel space
          // (e.g. an isolated year in the middle of the track).
          const isHalfDecade = yr % 5 === 0;
          ticks.push({
            position: pos,
            type: isJan && isHalfDecade ? "major" : "minor",
            label: isJan
              ? `${yr}`
              : MONTH_ABBRS[d.getMonth()],
          });
        }
      } else if (isDaily) {
        // Daily buckets: 1st of month = major (month label), others = minor (day number).
        // The Scrubber's label decimation controls how many day labels are visible
        // based on available pixel space — sparse months show most days, dense months
        // show fewer. Week boundaries (Mondays) could be promoted to major but that
        // adds complexity for marginal value — day numbers alone orient well enough.
        const isMajor = d.getDate() === 1;
        ticks.push({
          position: pos,
          type: isMajor ? "major" : "minor",
          label: isMajor ? MONTH_ABBRS[d.getMonth()] : `${d.getDate()}`,
        });
      } else if (isHourly) {
        // Hourly buckets: 6-hour marks = major, midnight = day+month label
        const h = d.getHours();
        const isMajor = h % 6 === 0;
        const label = h === 0
          ? `${d.getDate()} ${MONTH_ABBRS[d.getMonth()]}`
          : `${String(h).padStart(2, "0")}:00`;
        ticks.push({ position: pos, type: isMajor ? "major" : "minor", label });
      } else {
        // Sub-hour buckets (30m, 10m, 5m): full hours = major, others = minor.
        // Midnight gets day+month label; other hours get HH:00; sub-hour
        // buckets get HH:MM. Label decimation in the Scrubber hides labels
        // that are too close together.
        const h = d.getHours();
        const m = d.getMinutes();
        const isMajor = m === 0;
        let label: string;
        if (h === 0 && m === 0) {
          label = `${d.getDate()} ${MONTH_ABBRS[d.getMonth()]}`;
        } else {
          label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
        ticks.push({ position: pos, type: isMajor ? "major" : "minor", label });
      }
    }

    return ticks;
  }

  // -----------------------------------------------------------------------
  // Buffer fallback: linear extrapolation (accurate only in scroll mode).
  // -----------------------------------------------------------------------

  if (results.length === 0) return [];

  const dateAtStart = estimateDateAtPosition(0, bufferOffset, results, mapping);
  const dateAtEnd = estimateDateAtPosition(
    Math.max(0, total - 1), bufferOffset, results, mapping,
  );
  if (!dateAtStart || !dateAtEnd) return [];

  const startMs = dateAtStart.getTime();
  const endMs = dateAtEnd.getTime();
  if (startMs === endMs) return [];

  const msPerPos = (endMs - startMs) / Math.max(1, total - 1);
  if (msPerPos === 0) return [];

  const earlierMs = Math.min(startMs, endMs);
  const laterMs = Math.max(startMs, endMs);
  const spanMs = laterMs - earlierMs;
  if (spanMs <= 0) return [];
  const earlier = new Date(earlierMs);
  const ticks: TrackTick[] = [];

  const toPosition = (ms: number): number | null => {
    const pos = Math.round((ms - startMs) / msPerPos);
    return pos >= 0 && pos < total ? pos : null;
  };

  if (spanMs > 2 * 365 * MS_PER_DAY) {
    const later = new Date(laterMs);
    const fallbackSpanYears = later.getFullYear() - earlier.getFullYear();
    const fbShortSpan = fallbackSpanYears < 15;
    let cursor = new Date(earlier.getFullYear() + 1, 0, 1);
    while (cursor.getTime() <= laterMs) {
      const pos = toPosition(cursor.getTime());
      if (pos != null) {
        const yr = cursor.getFullYear();
        if (fbShortSpan) {
          // Short span: every year is major with a label
          ticks.push({ position: pos, type: "major", label: `${yr}` });
        } else {
          // Long span: decade hierarchy
          const isDecade = yr % 10 === 0;
          const isHalfDecade = yr % 5 === 0;
          ticks.push({
            position: pos,
            type: isDecade ? "major" : "minor",
            label: isHalfDecade ? `${yr}` : undefined,
          });
        }
      }
      cursor = new Date(cursor.getFullYear() + 1, 0, 1);
    }
  } else if (spanMs > 2 * MS_PER_MONTH) {
    let cursor = new Date(earlier.getFullYear(), earlier.getMonth() + 1, 1);
    while (cursor.getTime() <= laterMs) {
      const pos = toPosition(cursor.getTime());
      if (pos != null) {
        const isMajor = cursor.getMonth() === 0;
        ticks.push({
          position: pos,
          type: isMajor ? "major" : "minor",
          label: isMajor ? `${cursor.getFullYear()}` : MONTH_ABBRS[cursor.getMonth()],
        });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  } else if (spanMs > MS_PER_DAY) {
    let cursor = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate() + 1);
    while (cursor.getTime() <= laterMs) {
      const pos = toPosition(cursor.getTime());
      if (pos != null) {
        const isMajor = cursor.getDate() === 1;
        ticks.push({
          position: pos,
          type: isMajor ? "major" : "minor",
          label: isMajor ? MONTH_ABBRS[cursor.getMonth()] : undefined,
        });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
  } else if (spanMs > 3 * 3600_000) {
    // > 3 hours: hourly ticks (major every 6h, midnight = day label)
    const startHour = Math.ceil(earlier.getHours());
    let cursor = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate(), startHour);
    if (cursor.getTime() <= earlierMs) {
      cursor = new Date(cursor.getTime() + 3600_000);
    }
    while (cursor.getTime() <= laterMs) {
      const pos = toPosition(cursor.getTime());
      if (pos != null) {
        const h = cursor.getHours();
        const isMajor = h % 6 === 0;
        const label = h === 0
          ? `${cursor.getDate()} ${MONTH_ABBRS[cursor.getMonth()]}`
          : `${String(h).padStart(2, "0")}:00`;
        ticks.push({ position: pos, type: isMajor ? "major" : "minor", label });
      }
      cursor = new Date(cursor.getTime() + 3600_000);
    }
  } else {
    // ≤ 3 hours: 5-minute ticks (major on full hours, minor every 5m)
    const subHourIntervalMs = 300_000; // 5m
    // Round start up to the next 5-minute boundary
    const startMs_ = Math.ceil(earlierMs / subHourIntervalMs) * subHourIntervalMs;
    let cursor = new Date(startMs_);
    if (cursor.getTime() <= earlierMs) {
      cursor = new Date(cursor.getTime() + subHourIntervalMs);
    }
    while (cursor.getTime() <= laterMs) {
      const pos = toPosition(cursor.getTime());
      if (pos != null) {
        const h = cursor.getHours();
        const m = cursor.getMinutes();
        const isMajor = m === 0;
        let label: string;
        if (h === 0 && m === 0) {
          label = `${cursor.getDate()} ${MONTH_ABBRS[cursor.getMonth()]}`;
        } else {
          label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
        ticks.push({ position: pos, type: isMajor ? "major" : "minor", label });
      }
      cursor = new Date(cursor.getTime() + subHourIntervalMs);
    }
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// Null-zone aware label + tick generation
// ---------------------------------------------------------------------------

/**
 * Interpolate a sort label for any position, with null-zone awareness.
 *
 * For positions in the covered zone (primary field has a value), delegates
 * to `interpolateSortLabel` as before.
 *
 * For positions in the null zone (primary field missing), uses the
 * `nullZoneDist` (uploadTime distribution) to produce a label like:
 *   "<i>Not modified</i><br>Uploaded: 14 Mar 2024"
 * The italic first line follows the kahuna pattern for missing/mixed fields.
 * The second line shows the uploadTime-based date — the actual sort order
 * within the null zone.
 *
 * Returns null only when no data is available at all (no distribution, no buffer).
 */
export function interpolateNullZoneSortLabel(
  orderBy: string | undefined,
  globalPosition: number,
  total: number,
  bufferOffset: number,
  results: (Image | undefined)[],
  sortDist: SortDistribution | null | undefined,
  nullZoneDist: SortDistribution | null | undefined,
  visibleCount?: number,
): string | null {
  // No null zone, or position is in the covered zone → standard label
  const coveredCount = sortDist?.coveredCount ?? total;
  const inNullZone = !!nullZoneDist && globalPosition >= coveredCount;

  // Debug instrumentation (DEV only)
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    (window as any).__null_zone_debug__ = {
      ts: Date.now(),
      globalPosition,
      total,
      coveredCount,
      nullZoneSize: total - coveredCount,
      hasNullZoneDist: !!nullZoneDist,
      inNullZone,
      nullZoneLocalPos: inNullZone ? globalPosition - coveredCount : null,
      nullZoneBuckets: nullZoneDist?.buckets.length ?? 0,
      nullZoneCoveredCount: nullZoneDist?.coveredCount ?? 0,
    };
  }

  if (!inNullZone) {
    return interpolateSortLabel(
      orderBy, globalPosition, total, bufferOffset, results, sortDist, visibleCount,
    );
  }

  // --- Null-zone position: use uploadTime distribution ---

  // Map global position into the null-zone distribution's local space.
  // The null zone starts at `coveredCount` in global space, but the
  // nullZoneDist starts at position 0.
  const nullZoneLocalPos = globalPosition - coveredCount;

  const isoDate = lookupSortDistribution(nullZoneDist, nullZoneLocalPos);
  if (!isoDate) {
    // Distribution loaded but no bucket at this position — return null
    // (tooltip will show only "X of Y", boundary tick on the track provides context)
    return null;
  }

  // Format the uploadTime date with adaptive granularity.
  // Use the distribution's total span for overall context, but DON'T use
  // computeLocalSpanFromDist for the local span — the scaled null-zone
  // distribution has compressed positions that make density estimates
  // unreliable, causing the day to randomly disappear (absLocal > MS_PER_MONTH
  // triggers "drop day" rule). A safe default of 2 * MS_PER_DAY always shows day.
  const totalSpanMs = computeDistributionSpanMs(nullZoneDist);
  const localSpanMs = 2 * MS_PER_DAY;
  const dateLabel = formatSortDateAdaptive(isoDate, totalSpanMs, localSpanMs);

  return `<i><span style="opacity:0.7">Uploaded:</span> ${dateLabel}</i>`;
}

/**
 * Compute track ticks that include null-zone ticks from a secondary
 * (uploadTime) distribution, plus a boundary marker.
 *
 * Returns the combined tick array: covered-zone ticks from `sortDist`,
 * a boundary tick at `coveredCount`, and null-zone ticks from `nullZoneDist`
 * (positions offset by `coveredCount`).
 */
export function computeTrackTicksWithNullZone(
  orderBy: string | undefined,
  total: number,
  bufferOffset: number,
  results: (Image | undefined)[],
  sortDist: SortDistribution | null | undefined,
  nullZoneDist: SortDistribution | null | undefined,
): TrackTick[] {
  // Start with covered-zone ticks (existing logic)
  const coveredTicks = computeTrackTicks(orderBy, total, bufferOffset, results, sortDist);

  const coveredCount = sortDist?.coveredCount;
  if (coveredCount == null || coveredCount <= 0 || coveredCount >= total) {
    // No null zone — return covered ticks as-is
    return coveredTicks;
  }

  // --- Boundary tick ---
  const sortKey = resolvePrimarySortKey(orderBy);
  const fieldName = sortKey ? getSortFieldDisplayName(sortKey) : "value";
  const boundaryTick: TrackTick = {
    position: coveredCount,
    type: "major",
    label: `No ${fieldName}`,
    color: "rgba(255, 140, 140, 0.9)",
    boundary: true,
  };

  if (!nullZoneDist || nullZoneDist.buckets.length < 2) {
    // No null-zone distribution yet — just add the boundary marker
    return [...coveredTicks, boundaryTick];
  }

  // --- Null-zone ticks from uploadTime distribution ---
  // Reuse computeTrackTicks by passing the nullZoneDist as if it were the
  // primary distribution, then offset all positions by coveredCount.
  const nullZoneTicks = computeTrackTicks(
    "-uploadTime",  // uploadTime is what the null zone is sorted by
    nullZoneDist.coveredCount,  // total for the null zone sub-range
    0,     // buffer offset irrelevant — distribution mode doesn't use buffer
    [],    // buffer irrelevant — distribution mode
    nullZoneDist,
  );

  // Offset null-zone tick positions into global space and colour them red
  const NULL_ZONE_TICK_COLOR = "rgba(255, 140, 140, 0.55)";
  const offsetTicks = nullZoneTicks.map((tick) => ({
    ...tick,
    position: tick.position + coveredCount,
    color: NULL_ZONE_TICK_COLOR,
  }));

  return [...coveredTicks, boundaryTick, ...offsetTicks];
}
