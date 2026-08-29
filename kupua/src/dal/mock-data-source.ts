/**
 * Mock ImageDataSource for testing.
 *
 * Generates predictable synthetic images:
 * - ID: `img-{globalIndex}` (0-based)
 * - uploadTime: linearly spaced dates from 2020-01-01 to 2026-01-01
 * - metadata.credit: cycles through ["Getty", "Reuters", "AP", "EPA", "PA"]
 *
 * Supports search (with from/size), searchAfter (with cursor), countBefore,
 * and getById. Other methods return empty/noop.
 *
 * The `totalImages` parameter controls how many images exist in the dataset.
 *
 * **Sparse mode:** Pass `sparseFields` to simulate fields where most images
 * have null/missing values (e.g. `lastModified` — only ~20% of real images
 * have this field). When configured, `makeImage` assigns the field only to
 * images at indices where `index % Math.floor(1/ratio) === 0`.
 */

import type { Image } from "@/types/image";
import type {
  ImageDataSource,
  SearchParams,
  SearchResult,
  SearchAfterResult,
  SortValues,
  AggregationResult,
  AggregationRequest,
  AggregationsResult,
  FilterAggRequest,
  UsageFilterAggRequest,
  SortDistribution,
  SortDistBucket,
  IdRangeResult,
  CountWithTickersResult,
} from "./types";
import type { PositionMap } from "./position-map";
import { buildSortClause, parseSortField } from "./adapters/elasticsearch/sort-builders";
import { detectNullZoneCursor, remapNullZoneSortValues } from "./null-zone";

// ---------------------------------------------------------------------------
// Synthetic data generation
// ---------------------------------------------------------------------------

const CREDITS = ["Getty", "Reuters", "AP", "EPA", "PA"];

/**
 * Opt-in skewed credit distribution — mirrors the real PA/AAP shape (a
 * handful of huge buckets instead of an even split), so a mock corpus can
 * exercise within-bucket drift/refinement. Repeats every 100 images.
 * `AAP` alone is 45% of the corpus — deliberately far larger than
 * PAGE_SIZE (200), or there is no drift to test.
 */
const SKEWED_CREDITS: readonly string[] = ["AAP", "Getty", "Reuters", "AP", "EPA", "PA", "Alamy", "Rex"];
const SKEWED_THRESHOLDS = [45, 65, 80, 88, 93, 97, 99, 100]; // cumulative %, sums to 100

function skewedCreditForIndex(index: number): string {
  const pos = index % 100;
  for (let i = 0; i < SKEWED_THRESHOLDS.length; i++) {
    if (pos < SKEWED_THRESHOLDS[i]) return SKEWED_CREDITS[i];
  }
  return SKEWED_CREDITS[SKEWED_CREDITS.length - 1];
}

const BASE_DATE = new Date("2020-01-01T00:00:00Z").getTime();
const END_DATE = new Date("2026-01-01T00:00:00Z").getTime();

/**
 * Configuration for a sparse field — the field will only be present on
 * `ratio` fraction of generated images (e.g. 0.2 = 20% have the field).
 */
interface SparseFieldConfig {
  /** Dot-path of the field (e.g. "lastModified"). */
  field: string;
  /** Fraction of images that have this field (0–1). Default: 0.2. */
  ratio: number;
}

function makeImage(
  index: number,
  total: number,
  sparseFields?: SparseFieldConfig[],
  skewedCredits?: boolean,
): Image {
  // Spread dates linearly across the total range
  const fraction = total > 1 ? index / (total - 1) : 0;
  const uploadTime = new Date(BASE_DATE + fraction * (END_DATE - BASE_DATE)).toISOString();
  const credit = skewedCredits ? skewedCreditForIndex(index) : CREDITS[index % CREDITS.length];

  // By default, lastModified = uploadTime (all images have it)
  let lastModified: string | undefined = uploadTime;

  // Apply sparse field overrides
  if (sparseFields) {
    for (const sf of sparseFields) {
      if (sf.field === "lastModified") {
        const step = Math.max(1, Math.floor(1 / sf.ratio));
        if (index % step !== 0) {
          lastModified = undefined;
        }
      }
    }
  }

  return {
    id: `img-${index}`,
    uploadTime,
    uploadedBy: `user-${index % 10}`,
    ...(lastModified !== undefined ? { lastModified } : {}),
    source: {
      mimeType: "image/jpeg",
      dimensions: { width: 4000, height: 3000 },
    },
    metadata: {
      credit,
      description: `Test image ${index}`,
    },
  } as Image;
}

/**
 * Compute sort values for an image given the current sort clause.
 * Reads the sort clause to determine which fields to extract.
 */
function sortValuesForImage(
  image: Image,
  sortClause?: Record<string, unknown>[],
): SortValues {
  if (!sortClause) {
    // Default sort: [uploadTime desc, id asc]
    return [new Date(image.uploadTime).getTime(), image.id];
  }

  const values: SortValues = [];
  for (const clause of sortClause) {
    const { field } = parseSortField(clause);
    if (!field) {
      values.push(null);
      continue;
    }
    if (field === "uploadTime") {
      values.push(new Date(image.uploadTime).getTime());
    } else if (field === "id") {
      values.push(image.id);
    } else if (field === "lastModified") {
      const imgAny = image as unknown as Record<string, unknown>;
      values.push(
        imgAny.lastModified
          ? new Date(imgAny.lastModified as string).getTime()
          : null,
      );
    } else if (field === "metadata.credit") {
      values.push(image.metadata?.credit ?? null);
    } else {
      values.push(null);
    }
  }
  return values;
}

/**
 * Field-level comparison for countBefore's tuple walk — mirrors ES semantics:
 * missing values always sort last, regardless of direction.
 * Returns -1 if `imgVal` sorts before `cursorVal`, 1 if after, 0 if tied.
 */
function compareSortValue(
  imgVal: string | number | null,
  cursorVal: string | number | null,
  direction: "asc" | "desc",
): number {
  if (imgVal == null && cursorVal == null) return 0;
  if (imgVal == null) return 1; // missing sorts last → img is "after" cursor
  if (cursorVal == null) return -1; // any real value sorts before a null cursor
  const raw =
    typeof imgVal === "string" && typeof cursorVal === "string"
      ? imgVal.localeCompare(cursorVal)
      : (imgVal as number) - (cursorVal as number);
  if (raw === 0) return 0;
  const before = direction === "desc" ? raw > 0 : raw < 0;
  return before ? -1 : 1;
}

/**
 * Lexicographic comparison of two sort-value tuples across the whole sort
 * clause — the mock analogue of es-adapter's countBefore `should` clauses.
 * Field 0 decides unless tied, then field 1, etc. Does NOT resolve either
 * tuple back to a real document first, so a synthetic/sentinel cursor
 * compares exactly as it would against a live cluster (keyword-sorts
 * workplan §9.0.2) — this is what makes the sentinel bug reproducible.
 */
function compareSortTuples(
  imgTuple: SortValues,
  cursorTuple: SortValues,
  sortClause: Record<string, unknown>[],
): number {
  for (let i = 0; i < sortClause.length && i < cursorTuple.length; i++) {
    const { direction } = parseSortField(sortClause[i]);
    const cmp = compareSortValue(
      imgTuple[i] as string | number | null,
      cursorTuple[i] as string | number | null,
      (direction as "asc" | "desc") ?? "asc",
    );
    if (cmp !== 0) return cmp;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Filter helpers — extraFilter support for null-zone queries
// ---------------------------------------------------------------------------

/**
 * Extract the field name from a `{ bool: { must_not: { exists: { field } } } }`
 * filter. Returns null if the filter doesn't match this shape.
 */
function extractMustNotExistsField(
  filter: Record<string, unknown> | undefined,
): string | null {
  if (!filter) return null;
  const bool = filter.bool as Record<string, unknown> | undefined;
  if (!bool) return null;
  const mustNot = bool.must_not as Record<string, unknown> | undefined;
  if (!mustNot) return null;
  const exists = mustNot.exists as Record<string, unknown> | undefined;
  if (!exists) return null;
  return (exists.field as string) ?? null;
}

/**
 * Check if an image matches the extraFilter. Currently only supports
 * `must_not: { exists: { field } }` (field must be missing/null).
 */
function imageMatchesFilter(
  image: Image,
  filter: Record<string, unknown> | undefined,
): boolean {
  if (!filter) return true;
  const mustNotField = extractMustNotExistsField(filter);
  if (mustNotField) {
    const imgAny = image as unknown as Record<string, unknown>;
    if (mustNotField === "lastModified") return imgAny.lastModified == null;
    if (mustNotField === "metadata.dateTaken") return image.metadata?.dateTaken == null;
    // Generic fallback: check top-level field
    return imgAny[mustNotField] == null;
  }
  return true; // unsupported filter shape — pass through
}

// ---------------------------------------------------------------------------
// Mock data source
// ---------------------------------------------------------------------------

/** Opt-in behaviours for MockDataSource — see individual fields for details. */
export interface MockDataSourceOptions {
  /** Use the skewed (uneven) credit distribution instead of the default even cycle. */
  skewedCredits?: boolean;
  /** Cap getKeywordDistribution to this many buckets, simulating truncation
   *  at high cardinality (the real adapter caps at 5 pages / 50k values). */
  distributionCap?: number;
}

export class MockDataSource implements ImageDataSource {
  readonly totalImages: number;
  readonly sparseFields?: SparseFieldConfig[];
  private readonly skewedCredits?: boolean;
  private readonly distributionCap?: number;
  private _images: Map<number, Image> = new Map();

  /** IDs to treat as "removed" — searchAfter with ids= won't find them. */
  removedIds: Set<string> = new Set();

  /** Track how many ES requests this mock has served (for load testing). */
  requestCount = 0;

  constructor(totalImages = 10_000, sparseFields?: SparseFieldConfig[], options?: MockDataSourceOptions) {
    this.totalImages = totalImages;
    this.sparseFields = sparseFields;
    this.skewedCredits = options?.skewedCredits;
    this.distributionCap = options?.distributionCap;
  }

  /** True when a non-default sort needs the (expensive) full-corpus ordering — sparse fields or a skewed keyword distribution. */
  private get _hasCustomSortSource(): boolean {
    return !!(this.sparseFields?.length || this.skewedCredits);
  }

  /** Get or create the image at a given index. */
  private getImageAt(index: number): Image | undefined {
    if (index < 0 || index >= this.totalImages) return undefined;
    let img = this._images.get(index);
    if (!img) {
      img = makeImage(index, this.totalImages, this.sparseFields, this.skewedCredits);
      this._images.set(index, img);
    }
    return img;
  }

  /** Find an image by ID. Returns [image, globalIndex] or [undefined, -1]. */
  private findById(id: string): [Image | undefined, number] {
    if (this.removedIds.has(id)) return [undefined, -1];
    // IDs are "img-{index}" so we can extract the index directly
    const match = id.match(/^img-(\d+)$/);
    if (!match) return [undefined, -1];
    const idx = parseInt(match[1], 10);
    const img = this.getImageAt(idx);
    return img ? [img, idx] : [undefined, -1];
  }

  /** Post-filter search results to exclude removed IDs. */
  private _filterRemoved(result: SearchAfterResult): SearchAfterResult {
    if (this.removedIds.size === 0) return result;
    const filteredHits: Image[] = [];
    const filteredSortValues: SortValues[] = [];
    for (let i = 0; i < result.hits.length; i++) {
      if (!this.removedIds.has(result.hits[i].id)) {
        filteredHits.push(result.hits[i]);
        filteredSortValues.push(result.sortValues[i]);
      }
    }
    return {
      hits: filteredHits,
      total: result.total - this.removedIds.size,
      sortValues: filteredSortValues,
    };
  }

  /**
   * Resolve the global sorted order for a given sort clause.
   * For sparse fields, images with null values sort at the END
   * (matching ES `missing: "_last"`).
   *
   * Returns an array of original indices in sorted order.
   * This is expensive for large datasets, so only used when sorting by
   * a non-default field (for small test datasets).
   */
  private getSortedIndices(sortClause: Record<string, unknown>[]): number[] {
    const indices = Array.from({ length: this.totalImages }, (_, i) => i);
    const images = indices.map((i) => this.getImageAt(i)!);

    indices.sort((a, b) => {
      for (const clause of sortClause) {
        const { field, direction } = parseSortField(clause);
        if (!field) continue;

        const imgA = images[a];
        const imgB = images[b];
        const svA = sortValuesForImage(imgA, [clause])[0];
        const svB = sortValuesForImage(imgB, [clause])[0];

        // Null handling: nulls always sort last (missing: "_last")
        if (svA == null && svB == null) continue;
        if (svA == null) return 1;  // a is null → sorts after b
        if (svB == null) return -1; // b is null → sorts after a

        let cmp: number;
        if (typeof svA === "string" && typeof svB === "string") {
          cmp = svA.localeCompare(svB);
        } else {
          cmp = (svA as number) - (svB as number);
        }

        if (cmp !== 0) {
          return direction === "desc" ? -cmp : cmp;
        }
      }
      return 0;
    });

    return indices;
  }

  /**
   * Get sorted indices filtered by an extraFilter predicate.
   * Used for null-zone queries where `must_not: { exists: { field } }` narrows
   * the result set to only images missing a specific field.
   */
  private getFilteredSortedIndices(
    sortClause: Record<string, unknown>[],
    extraFilter: Record<string, unknown>,
  ): number[] {
    // Start from all indices, sort them, then filter
    const sorted = this.getSortedIndices(sortClause);
    return sorted.filter((idx) => {
      const img = this.getImageAt(idx)!;
      return imageMatchesFilter(img, extraFilter);
    });
  }

  // --- ImageDataSource interface ---

  async search(params: SearchParams): Promise<SearchResult> {
    this.requestCount++;
    const offset = params.offset ?? 0;
    const length = params.length ?? 20;
    const sortClause = buildSortClause(params.orderBy);
    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";

    // For non-default sorts with sparse fields or a skewed distribution, we need to sort properly
    const needsCustomSort = !isDefaultSort && this._hasCustomSortSource;
    const sortedIndices = needsCustomSort
      ? this.getSortedIndices(sortClause)
      : null;

    const hits: Image[] = [];
    const sortValues: SortValues[] = [];

    for (let i = 0; i < length && offset + i < this.totalImages; i++) {
      const idx = sortedIndices ? sortedIndices[offset + i] : offset + i;
      const img = this.getImageAt(idx)!;
      hits.push(img);
      sortValues.push(sortValuesForImage(img, sortClause));
    }

    return { hits, total: this.totalImages, sortValues };
  }

  async searchRange(params: SearchParams): Promise<SearchResult> {
    return this.search(params);
  }

  async count(): Promise<number> {
    this.requestCount++;
    return this.totalImages;
  }

  async countWithTickers(): Promise<CountWithTickersResult> {
    this.requestCount++;
    return { count: this.totalImages, tickerCounts: {} };
  }

  async getById(id: string): Promise<Image | undefined> {
    this.requestCount++;
    const [img] = this.findById(id);
    return img;
  }

  async getAggregation(): Promise<AggregationResult> {
    return { buckets: [], total: 0 };
  }

  async getAggregations(
    _params: SearchParams,
    _fields: AggregationRequest[],
    _signal?: AbortSignal,
    _isFilters?: FilterAggRequest[],
    _usageFilters?: UsageFilterAggRequest[],
  ): Promise<AggregationsResult> {
    return { fields: {} };
  }

  async openPit(): Promise<string> {
    return "mock-pit-id";
  }

  async closePit(): Promise<void> {}

  async searchAfter(
    params: SearchParams,
    searchAfterValues: SortValues | null,
    _pitId?: string | null,
    signal?: AbortSignal,
    reverse?: boolean,
    _seekToEnd?: boolean,
  ): Promise<SearchAfterResult> {
    this.requestCount++;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const length = params.length ?? 20;
    // Null-zone detection — same internal logic as es-adapter.
    const nz = searchAfterValues ? detectNullZoneCursor(searchAfterValues, params.orderBy) : null;
    const effectiveCursor = nz ? nz.strippedCursor : searchAfterValues;
    const sortClause = nz ? nz.sortOverride : buildSortClause(params.orderBy);
    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";
    const needsCustomSort = (!isDefaultSort || nz) && this._hasCustomSortSource;

    // When null-zone cursor is detected, use filtered+sorted indices.
    // This simulates ES's `must_not: { exists: { field } }` narrowing.
    const sortedIndices = nz && needsCustomSort
      ? this.getFilteredSortedIndices(sortClause, nz.extraFilter)
      : needsCustomSort
        ? this.getSortedIndices(sortClause)
        : null;

    const maybeRemap = (svs: SortValues[]): SortValues[] =>
      nz ? remapNullZoneSortValues(svs, nz.sortClause, nz.primaryField) : svs;

    const effectiveTotal = sortedIndices ? sortedIndices.length : this.totalImages;

    // If params.ids is set, filter to those IDs
    if (params.ids) {
      const idList = params.ids.split(",").map((s) => s.trim());
      const hits: Image[] = [];
      const sortVals: SortValues[] = [];
      for (const id of idList) {
        const [img] = this.findById(id);
        if (img) {
          hits.push(img);
          sortVals.push(sortValuesForImage(img, sortClause));
        }
      }
      return this._filterRemoved({ hits, total: this.totalImages, sortValues: maybeRemap(sortVals) });
    }

    // If from/size (no cursor), return from offset
    if (!effectiveCursor) {
      const offset = params.offset ?? 0;
      const hits: Image[] = [];
      const sortVals: SortValues[] = [];

      if (reverse) {
        // Reverse with no cursor = last N items (End-key seek path)
        const endPos = effectiveTotal;
        const startPos = Math.max(0, endPos - length);
        for (let pos = startPos; pos < endPos; pos++) {
          const idx = sortedIndices ? sortedIndices[pos] : pos;
          const img = this.getImageAt(idx)!;
          hits.push(img);
          sortVals.push(sortValuesForImage(img, sortClause));
        }
      } else {
        for (let i = 0; i < length && offset + i < effectiveTotal; i++) {
          const idx = sortedIndices ? sortedIndices[offset + i] : offset + i;
          const img = this.getImageAt(idx)!;
          hits.push(img);
          sortVals.push(sortValuesForImage(img, sortClause));
        }
      }

      return this._filterRemoved({ hits, total: this.totalImages, sortValues: maybeRemap(sortVals) });
    }

    // search_after with cursor — find the position of the cursor.
    // For filtered queries, the cursor ID may be "" (estimated cursor from
    // null-zone seek). In that case, use timestamp-based position estimation.
    const cursorId = effectiveCursor[effectiveCursor.length - 1] as string;

    let cursorSortedPos: number;

    if (cursorId === "" && effectiveCursor.length >= 1) {
      // Estimated cursor (no real id) — find position by general sort-tuple
      // comparison (see compareSortTuples), NOT by assuming the estimate
      // lives at cursor[0]. Handles both the original 2-element
      // [uploadTimeEstimate, ""] shape (numeric/date deep-seek, null-zone)
      // and a cursor with real leading values followed by one estimated
      // axis (e.g. a keyword-sort bucket's [creditValue, uploadTimeEst, ""]).
      if (sortedIndices) {
        cursorSortedPos = -1;
        for (let i = 0; i < sortedIndices.length; i++) {
          const img = this.getImageAt(sortedIndices[i])!;
          const imgTuple = sortValuesForImage(img, sortClause);
          if (compareSortTuples(imgTuple, effectiveCursor, sortClause) <= 0) {
            cursorSortedPos = i;
          } else {
            break;
          }
        }
        if (cursorSortedPos < 0) cursorSortedPos = 0;
      } else {
        // No custom sort — estimate by timestamp fraction
        const targetTs = effectiveCursor[0] as number;
        const fraction = (targetTs - BASE_DATE) / (END_DATE - BASE_DATE);
        cursorSortedPos = Math.floor(fraction * this.totalImages);
      }
    } else {
      const [, cursorOrigIndex] = this.findById(cursorId);

      if (sortedIndices) {
        cursorSortedPos = sortedIndices.indexOf(cursorOrigIndex);
        if (cursorSortedPos < 0) {
          return { hits: [], total: this.totalImages, sortValues: [] };
        }
      } else {
        if (cursorOrigIndex < 0) {
          return { hits: [], total: this.totalImages, sortValues: [] };
        }
        cursorSortedPos = cursorOrigIndex;
      }
    }

    let hits: Image[];
    let sortVals: SortValues[];

    if (reverse) {
      // Backward: items BEFORE the cursor in sorted order
      const startPos = Math.max(0, cursorSortedPos - length);
      const endPos = cursorSortedPos; // exclusive
      hits = [];
      sortVals = [];
      for (let pos = startPos; pos < endPos; pos++) {
        const idx = sortedIndices ? sortedIndices[pos] : pos;
        const img = this.getImageAt(idx)!;
        hits.push(img);
        sortVals.push(sortValuesForImage(img, sortClause));
      }
    } else {
      // Forward: items AFTER the cursor in sorted order
      const startPos = cursorSortedPos + 1;
      hits = [];
      sortVals = [];
      for (let pos = startPos; pos < startPos + length && pos < effectiveTotal; pos++) {
        const idx = sortedIndices ? sortedIndices[pos] : pos;
        const img = this.getImageAt(idx)!;
        hits.push(img);
        sortVals.push(sortValuesForImage(img, sortClause));
      }
    }

    return this._filterRemoved({ hits, total: this.totalImages, sortValues: maybeRemap(sortVals) });
  }

  async countBefore(
    params: SearchParams,
    sortValues: SortValues,
    signal?: AbortSignal,
  ): Promise<number> {
    this.requestCount++;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";

    if (isDefaultSort && !this.sparseFields?.length) {
      // Simple path: use the id to find the index (original behaviour) —
      // left untouched, relied on by the large default-sort test surface.
      const id = sortValues[sortValues.length - 1] as string;
      const [, idx] = this.findById(id);
      return idx >= 0 ? idx : 0;
    }

    // General path: true lexicographic sort-tuple comparison against the
    // given cursor (see compareSortTuples). Unlike the old "resolve the
    // cursor's id back to a real document" approach, this compares the
    // cursor's VALUES directly field-by-field, so a synthetic cursor
    // (e.g. a sentinel-anchored probe) behaves exactly like it would
    // against a live cluster.
    const sortClause = buildSortClause(params.orderBy);
    let count = 0;
    for (let i = 0; i < this.totalImages; i++) {
      const img = this.getImageAt(i)!;
      const imgTuple = sortValuesForImage(img, sortClause);
      if (compareSortTuples(imgTuple, sortValues, sortClause) < 0) count++;
    }
    return count;
  }

  /** Scope-match helper for estimateSortValue's `scope` parameter. */
  private _imageMatchesScope(img: Image, scope: { field: string; value: string }): boolean {
    if (scope.field === "metadata.credit") return img.metadata?.credit === scope.value;
    return false;
  }

  async estimateSortValue(
    _params: SearchParams,
    field: string,
    percentile: number,
    _signal?: AbortSignal,
    scope?: Array<{ field: string; value: string }>,
  ): Promise<number | null> {
    this.requestCount++;

    if (!scope || scope.length === 0) {
      // Unscoped — linear interpolation of the synthetic timestamp range.
      // Existing behaviour, relied on by the date/numeric deep-seek tests.
      // Mirrors the real ES adapter: a `percentiles` agg on a keyword field
      // (e.g. metadata.credit) fails there and returns null — the mock must
      // fail the same way, or the store never falls through to the keyword
      // branch this fix adds.
      if (field !== "uploadTime" && field !== "lastModified") return null;
      const fraction = percentile / 100;
      return BASE_DATE + fraction * (END_DATE - BASE_DATE);
    }

    // Scoped — restrict to docs matching every {field, value} pair, find
    // the TRUE value at the requested percentile within that subset, then
    // perturb it deterministically (never random — a flaky tolerance test
    // is worse than no test) by a bounded ~0.7% of the subset, matching
    // the ±2,133-on-321,741 (~0.66%) drift measured live against TEST.
    // Fractional on purpose: production code must round this before using
    // it as a cursor (see workplan §6 "hard constraint: fractional epochs").
    if (field !== "uploadTime") return null; // only uploadTime is scoped by this fix

    const times: number[] = [];
    for (let i = 0; i < this.totalImages; i++) {
      const img = this.getImageAt(i)!;
      if (scope.every((s) => this._imageMatchesScope(img, s))) {
        times.push(new Date(img.uploadTime).getTime());
      }
    }
    if (times.length === 0) return null;
    times.sort((a, b) => a - b);

    const clamped = Math.max(0, Math.min(100, percentile));
    const trueIdx = Math.min(times.length - 1, Math.floor((clamped / 100) * times.length));

    const driftSteps = Math.max(1, Math.round(times.length * 0.007));
    const driftIdx = Math.max(0, Math.min(times.length - 1, trueIdx + driftSteps));

    return times[driftIdx] + 0.5;
  }

  async findKeywordSortValue(
    _params: SearchParams,
    _field: string,
    targetPosition: number,
    _direction: "asc" | "desc",
  ): Promise<string | null> {
    this.requestCount++;
    // Mock: return a synthetic keyword value for the target position.
    // Real implementation uses composite aggregation.
    if (targetPosition >= this.totalImages) return null;
    return `keyword-${targetPosition}`;
  }

  async getDateDistribution(
    _params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    _signal?: AbortSignal,
    _missingField?: string,
  ): Promise<SortDistribution | null> {
    this.requestCount++;

    // Count how many images have this field
    let coveredCount = 0;
    for (let i = 0; i < this.totalImages; i++) {
      const img = this.getImageAt(i)!;
      const imgAny = img as unknown as Record<string, unknown>;
      const hasField =
        field === "lastModified"
          ? imgAny.lastModified != null
          : field === "uploadTime"
            ? true
            : field === "metadata.dateTaken"
              ? img.metadata?.dateTaken != null
              : false;
      if (hasField) coveredCount++;
    }

    // Simple distribution: one bucket covering all docs
    return {
      buckets: [
        {
          key: new Date(direction === "desc" ? END_DATE : BASE_DATE).toISOString(),
          count: coveredCount,
          startPosition: 0,
        },
      ],
      coveredCount,
    };
  }

  async getKeywordDistribution(
    _params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    _signal?: AbortSignal,
  ): Promise<SortDistribution | null> {
    this.requestCount++;
    if (field !== "metadata.credit") return null;

    const counts = new Map<string, number>();
    for (let i = 0; i < this.totalImages; i++) {
      const img = this.getImageAt(i)!;
      const credit = img.metadata?.credit;
      if (credit == null) continue;
      counts.set(credit, (counts.get(credit) ?? 0) + 1);
    }

    const keys = Array.from(counts.keys()).sort((a, b) =>
      direction === "desc" ? b.localeCompare(a) : a.localeCompare(b),
    );
    // Deliberately partial when distributionCap is set — simulates
    // truncation at high cardinality (real cap: 5 pages / 50k values),
    // so the store's composite-walk fallback branch is reachable in tests.
    const cappedKeys = this.distributionCap != null ? keys.slice(0, this.distributionCap) : keys;

    const buckets: SortDistBucket[] = [];
    let cumulative = 0;
    for (const key of cappedKeys) {
      const count = counts.get(key)!;
      buckets.push({ key, count, startPosition: cumulative });
      cumulative += count;
    }

    return { buckets, coveredCount: cumulative };
  }

  async fetchPositionIndex(
    params: SearchParams,
    signal: AbortSignal,
  ): Promise<PositionMap | null> {
    this.requestCount++;
    if (signal.aborted) return null;

    const sortClause = buildSortClause(params.orderBy);
    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";
    const needsCustomSort = !isDefaultSort && this._hasCustomSortSource;

    const sortedIndices = needsCustomSort
      ? this.getSortedIndices(sortClause)
      : null;

    const effectiveTotal = sortedIndices ? sortedIndices.length : this.totalImages;

    const ids: string[] = [];
    const sortValues: SortValues[] = [];

    for (let pos = 0; pos < effectiveTotal; pos++) {
      if (signal.aborted) return null;
      const idx = sortedIndices ? sortedIndices[pos] : pos;
      const img = this.getImageAt(idx)!;
      ids.push(img.id);
      sortValues.push(sortValuesForImage(img, sortClause));
    }

    return { length: ids.length, ids, sortValues };
  }

  async getByIds(ids: string[], signal?: AbortSignal): Promise<Image[]> {
    this.requestCount++;
    if (signal?.aborted) return [];
    const results: Image[] = [];
    for (const id of ids) {
      const [img] = this.findById(id);
      if (img) results.push(img);
    }
    return results;
  }

  async getIdRange(
    params: SearchParams,
    fromCursor: SortValues,
    toCursor: SortValues,
    signal?: AbortSignal,
  ): Promise<IdRangeResult> {
    this.requestCount++;
    if (signal?.aborted) return { ids: [], truncated: false, walked: 0 };

    const HARD_CAP = Number(import.meta.env.VITE_RANGE_HARD_CAP ?? 5_000);
    const sortClause = buildSortClause(params.orderBy);
    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";
    const needsCustomSort = !isDefaultSort && this._hasCustomSortSource;
    const sortedIndices = needsCustomSort
      ? this.getSortedIndices(sortClause)
      : null;
    const effectiveTotal = sortedIndices ? sortedIndices.length : this.totalImages;

    // Find the sorted position of fromCursor: find first image strictly after it
    const fromCursorId = fromCursor[fromCursor.length - 1] as string;
    const [, fromOrigIdx] = this.findById(fromCursorId);

    let startPos: number;
    if (fromOrigIdx < 0) {
      startPos = 0;
    } else if (sortedIndices) {
      const fromSortedPos = sortedIndices.indexOf(fromOrigIdx);
      startPos = fromSortedPos >= 0 ? fromSortedPos + 1 : 0;
    } else {
      startPos = fromOrigIdx + 1;
    }

    // Find the sorted position of toCursor (inclusive end)
    const toCursorId = toCursor[toCursor.length - 1] as string;
    const [, toOrigIdx] = this.findById(toCursorId);

    let endPos: number; // inclusive
    if (toOrigIdx < 0) {
      return { ids: [], truncated: false, walked: 0 };
    } else if (sortedIndices) {
      const toSortedPos = sortedIndices.indexOf(toOrigIdx);
      endPos = toSortedPos >= 0 ? toSortedPos : -1;
    } else {
      endPos = toOrigIdx;
    }

    if (endPos < startPos) return { ids: [], truncated: false, walked: 0 };

    const collectedIds: string[] = [];
    let walked = 0;
    let truncated = false;
    const hardCapPlusOne = HARD_CAP + 1;

    for (let pos = startPos; pos <= endPos && pos < effectiveTotal; pos++) {
      walked++;
      const idx = sortedIndices ? sortedIndices[pos] : pos;
      const img = this.getImageAt(idx)!;
      collectedIds.push(img.id);
      if (collectedIds.length >= hardCapPlusOne) {
        truncated = true;
        return { ids: collectedIds.slice(0, HARD_CAP), truncated, walked };
      }
    }

    return { ids: collectedIds, truncated, walked };
  }
}

