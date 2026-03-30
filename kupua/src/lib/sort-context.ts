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
//    The only exception: total result set spans < 28 days AND local
//    viewport density is sub-day → year is dropped (you're within a
//    single month, the year is obvious from context, and you need the
//    space for time).
//
// 2. **Show time (H:mm) only when the total result set spans < 28 days.**
//    If the set spans months or years, hours race uselessly during scrub
//    and provide zero orientation value. Time only matters when you're
//    exploring a narrow window (a day, a week) where hours differentiate
//    positions.
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
// | < 28 days     | > 1 day      | d Mon yyyy       | 14 Mar 2024        |
// | < 28 days     | ≤ 1 day      | d Mon, H:mm      | 14 Mar, 15:42      |
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

    // Rule 2: show time only when the entire result set spans < 28 days
    // Comma inside the month span so it hugs the text, not the padding.
    if (absTotal < MS_PER_MONTH && absLocal <= MS_PER_DAY) {
      return `${day} ${monthAbbr}, ${time}`;
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
    // Otherwise: hourly

    // For monthly buckets: compute span in years to decide label density.
    // Short spans (< ~15 years): every January gets a year label and major
    // status — individual years are the primary orientation landmarks.
    // Long spans (≥ 15 years): decade/half-decade hierarchy prevents
    // overcrowding — only yr%5==0 gets a label, only yr%10==0 is major.
    const dFirst = new Date(sortDist.buckets[0].key);
    const dLast = new Date(sortDist.buckets[sortDist.buckets.length - 1].key);
    const spanYears = Math.abs(dLast.getUTCFullYear() - dFirst.getUTCFullYear());
    const shortSpan = spanYears < 15;

    for (const bucket of sortDist.buckets) {
      const pos = bucket.startPosition;
      if (pos < 0 || pos >= total) continue;

      const d = new Date(bucket.key);

      if (isMonthly) {
        // Monthly buckets: Jan = major (year label), other months = minor (month abbr).
        // Label/major strategy adapts to span length — see shortSpan above.
        const isJan = d.getUTCMonth() === 0;
        const yr = d.getUTCFullYear();
        if (shortSpan) {
          // Short span: every January is major with a year label.
          // Non-January months are minor with month abbreviation.
          ticks.push({
            position: pos,
            type: isJan ? "major" : "minor",
            label: isJan ? `${yr}` : MONTH_ABBRS[d.getUTCMonth()],
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
              : MONTH_ABBRS[d.getUTCMonth()],
          });
        }
      } else if (isDaily) {
        // Daily buckets: 1st of month = major (month label), others = minor
        const isMajor = d.getUTCDate() === 1;
        ticks.push({
          position: pos,
          type: isMajor ? "major" : "minor",
          label: isMajor ? MONTH_ABBRS[d.getUTCMonth()] : undefined,
        });
      } else {
        // Hourly buckets: 6-hour marks = major, midnight = day+month label
        const h = d.getUTCHours();
        const isMajor = h % 6 === 0;
        const label = h === 0
          ? `${d.getUTCDate()} ${MONTH_ABBRS[d.getUTCMonth()]}`
          : `${String(h).padStart(2, "0")}:00`;
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
  } else {
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
  }

  return ticks;
}




