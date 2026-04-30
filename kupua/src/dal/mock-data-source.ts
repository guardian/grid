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
  SortDistribution,
} from "./types";
import type { PositionMap } from "./position-map";
import { buildSortClause, parseSortField } from "./adapters/elasticsearch/sort-builders";

// ---------------------------------------------------------------------------
// Synthetic data generation
// ---------------------------------------------------------------------------

const CREDITS = ["Getty", "Reuters", "AP", "EPA", "PA"];

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
): Image {
  // Spread dates linearly across the total range
  const fraction = total > 1 ? index / (total - 1) : 0;
  const uploadTime = new Date(BASE_DATE + fraction * (END_DATE - BASE_DATE)).toISOString();
  const credit = CREDITS[index % CREDITS.length];

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

export class MockDataSource implements ImageDataSource {
  readonly totalImages: number;
  readonly sparseFields?: SparseFieldConfig[];
  private _images: Map<number, Image> = new Map();

  /** IDs to treat as "removed" — searchAfter with ids= won't find them. */
  removedIds: Set<string> = new Set();

  /** Track how many ES requests this mock has served (for load testing). */
  requestCount = 0;

  constructor(totalImages = 10_000, sparseFields?: SparseFieldConfig[]) {
    this.totalImages = totalImages;
    this.sparseFields = sparseFields;
  }

  /** Get or create the image at a given index. */
  private getImageAt(index: number): Image | undefined {
    if (index < 0 || index >= this.totalImages) return undefined;
    let img = this._images.get(index);
    if (!img) {
      img = makeImage(index, this.totalImages, this.sparseFields);
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

    // For non-default sorts with sparse fields, we need to sort properly
    const needsCustomSort = !isDefaultSort && this.sparseFields?.length;
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
    _noSource?: boolean,
    _missingFirst?: boolean,
    _sortOverride?: Record<string, unknown>[],
    _extraFilter?: Record<string, unknown>,
  ): Promise<SearchAfterResult> {
    this.requestCount++;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const length = params.length ?? 20;
    const sortClause = _sortOverride ?? buildSortClause(params.orderBy);
    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";
    const needsCustomSort = (!isDefaultSort || _sortOverride) && this.sparseFields?.length;

    // When extraFilter is provided (null-zone queries), use filtered+sorted indices.
    // This simulates ES's `must_not: { exists: { field } }` narrowing.
    const sortedIndices = _extraFilter && needsCustomSort
      ? this.getFilteredSortedIndices(sortClause, _extraFilter)
      : needsCustomSort
        ? this.getSortedIndices(sortClause)
        : null;

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
      return this._filterRemoved({ hits, total: this.totalImages, sortValues: sortVals });
    }

    // If from/size (no cursor), return from offset
    if (!searchAfterValues) {
      const offset = params.offset ?? 0;
      const hits: Image[] = [];
      const sortVals: SortValues[] = [];
      for (let i = 0; i < length && offset + i < effectiveTotal; i++) {
        const idx = sortedIndices ? sortedIndices[offset + i] : offset + i;
        const img = this.getImageAt(idx)!;
        hits.push(img);
        sortVals.push(sortValuesForImage(img, sortClause));
      }
      return this._filterRemoved({ hits, total: this.totalImages, sortValues: sortVals });
    }

    // search_after with cursor — find the position of the cursor.
    // For filtered queries, the cursor ID may be "" (estimated cursor from
    // null-zone seek). In that case, use timestamp-based position estimation.
    const cursorId = searchAfterValues[searchAfterValues.length - 1] as string;

    let cursorSortedPos: number;

    if (cursorId === "" && searchAfterValues.length >= 1) {
      // Estimated cursor (no ID) — find position by timestamp.
      // The first element of searchAfterValues is the uploadTime estimate.
      const targetTs = searchAfterValues[0] as number;
      if (sortedIndices) {
        // Binary-ish search: find the position where uploadTime crosses targetTs
        cursorSortedPos = -1; // will be set below
        for (let i = 0; i < sortedIndices.length; i++) {
          const img = this.getImageAt(sortedIndices[i])!;
          const ts = new Date(img.uploadTime).getTime();
          // For desc sort, find last position where ts >= targetTs
          // For asc sort, find last position where ts <= targetTs
          const uploadDir = sortClause[0] && Object.values(sortClause[0])[0];
          if (uploadDir === "desc" ? ts >= targetTs : ts <= targetTs) {
            cursorSortedPos = i;
          } else {
            break;
          }
        }
        if (cursorSortedPos < 0) cursorSortedPos = 0;
      } else {
        // No custom sort — estimate by timestamp fraction
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

    return this._filterRemoved({ hits, total: this.totalImages, sortValues: sortVals });
  }

  async countBefore(
    params: SearchParams,
    sortValues: SortValues,
    sortClause: Record<string, unknown>[],
    signal?: AbortSignal,
  ): Promise<number> {
    this.requestCount++;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";
    const needsCustomSort = !isDefaultSort && this.sparseFields?.length;

    if (!needsCustomSort) {
      // Simple path: use the id to find the index (original behaviour)
      const id = sortValues[sortValues.length - 1] as string;
      const [, idx] = this.findById(id);
      return idx >= 0 ? idx : 0;
    }

    // Sort-aware path: find the target's position in the sorted order
    const sortedIndices = this.getSortedIndices(sortClause);
    const id = sortValues[sortValues.length - 1] as string;
    const [, origIdx] = this.findById(id);
    if (origIdx < 0) return 0;

    const sortedPos = sortedIndices.indexOf(origIdx);
    return sortedPos >= 0 ? sortedPos : 0;
  }

  async estimateSortValue(
    _params: SearchParams,
    _field: string,
    percentile: number,
  ): Promise<number | null> {
    this.requestCount++;
    // Linear interpolation of timestamp range
    const fraction = percentile / 100;
    return BASE_DATE + fraction * (END_DATE - BASE_DATE);
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
    _extraFilter?: Record<string, unknown>,
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

  async getKeywordDistribution(): Promise<SortDistribution | null> {
    return null;
  }

  async fetchPositionIndex(
    params: SearchParams,
    signal: AbortSignal,
  ): Promise<PositionMap | null> {
    this.requestCount++;
    if (signal.aborted) return null;

    const sortClause = buildSortClause(params.orderBy);
    const isDefaultSort = !params.orderBy || params.orderBy === "-uploadTime";
    const needsCustomSort = !isDefaultSort && this.sparseFields?.length;

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
}

