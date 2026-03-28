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
} from "./types";

// ---------------------------------------------------------------------------
// Synthetic data generation
// ---------------------------------------------------------------------------

const CREDITS = ["Getty", "Reuters", "AP", "EPA", "PA"];

const BASE_DATE = new Date("2020-01-01T00:00:00Z").getTime();
const END_DATE = new Date("2026-01-01T00:00:00Z").getTime();

function makeImage(index: number, total: number): Image {
  // Spread dates linearly across the total range
  const fraction = total > 1 ? index / (total - 1) : 0;
  const uploadTime = new Date(BASE_DATE + fraction * (END_DATE - BASE_DATE)).toISOString();
  const credit = CREDITS[index % CREDITS.length];

  return {
    id: `img-${index}`,
    uploadTime,
    uploadedBy: `user-${index % 10}`,
    lastModified: uploadTime,
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
 * For simplicity, we only support the default sort (uploadTime desc + id asc).
 */
function sortValuesForImage(image: Image): SortValues {
  return [new Date(image.uploadTime).getTime(), image.id];
}

// ---------------------------------------------------------------------------
// Mock data source
// ---------------------------------------------------------------------------

export class MockDataSource implements ImageDataSource {
  readonly totalImages: number;
  private _images: Map<number, Image> = new Map();

  /** Track how many ES requests this mock has served (for load testing). */
  requestCount = 0;

  constructor(totalImages = 10_000) {
    this.totalImages = totalImages;
  }

  /** Get or create the image at a given index. */
  private getImageAt(index: number): Image | undefined {
    if (index < 0 || index >= this.totalImages) return undefined;
    let img = this._images.get(index);
    if (!img) {
      img = makeImage(index, this.totalImages);
      this._images.set(index, img);
    }
    return img;
  }

  /** Find an image by ID. Returns [image, globalIndex] or [undefined, -1]. */
  private findById(id: string): [Image | undefined, number] {
    // IDs are "img-{index}" so we can extract the index directly
    const match = id.match(/^img-(\d+)$/);
    if (!match) return [undefined, -1];
    const idx = parseInt(match[1], 10);
    const img = this.getImageAt(idx);
    return img ? [img, idx] : [undefined, -1];
  }

  // --- ImageDataSource interface ---

  async search(params: SearchParams): Promise<SearchResult> {
    this.requestCount++;
    const offset = params.offset ?? 0;
    const length = params.length ?? 20;
    const hits: Image[] = [];
    const sortValues: SortValues[] = [];

    for (let i = 0; i < length && offset + i < this.totalImages; i++) {
      const img = this.getImageAt(offset + i)!;
      hits.push(img);
      sortValues.push(sortValuesForImage(img));
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
  ): Promise<SearchAfterResult> {
    this.requestCount++;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const length = params.length ?? 20;

    // If params.ids is set, filter to those IDs
    if (params.ids) {
      const idList = params.ids.split(",").map((s) => s.trim());
      const hits: Image[] = [];
      const sortVals: SortValues[] = [];
      for (const id of idList) {
        const [img] = this.findById(id);
        if (img) {
          hits.push(img);
          sortVals.push(sortValuesForImage(img));
        }
      }
      return { hits, total: this.totalImages, sortValues: sortVals };
    }

    // If from/size (no cursor), return from offset
    if (!searchAfterValues) {
      const offset = params.offset ?? 0;
      const hits: Image[] = [];
      const sortVals: SortValues[] = [];
      for (let i = 0; i < length && offset + i < this.totalImages; i++) {
        const img = this.getImageAt(offset + i)!;
        hits.push(img);
        sortVals.push(sortValuesForImage(img));
      }
      return { hits, total: this.totalImages, sortValues: sortVals };
    }

    // search_after with cursor — find the position of the cursor
    // The cursor is [uploadTime, id]. We find the image by ID.
    const cursorId = searchAfterValues[searchAfterValues.length - 1] as string;
    const [, cursorIndex] = this.findById(cursorId);
    if (cursorIndex < 0) {
      // If cursor ID not found, try to find by timestamp (for estimated cursors)
      // Just return empty
      return { hits: [], total: this.totalImages, sortValues: [] };
    }

    let hits: Image[];
    let sortVals: SortValues[];

    if (reverse) {
      // Backward: items BEFORE the cursor
      const startIdx = Math.max(0, cursorIndex - length);
      const endIdx = cursorIndex; // exclusive
      hits = [];
      sortVals = [];
      for (let i = startIdx; i < endIdx; i++) {
        const img = this.getImageAt(i)!;
        hits.push(img);
        sortVals.push(sortValuesForImage(img));
      }
    } else {
      // Forward: items AFTER the cursor
      const startIdx = cursorIndex + 1;
      hits = [];
      sortVals = [];
      for (let i = startIdx; i < startIdx + length && i < this.totalImages; i++) {
        const img = this.getImageAt(i)!;
        hits.push(img);
        sortVals.push(sortValuesForImage(img));
      }
    }

    return { hits, total: this.totalImages, sortValues: sortVals };
  }

  async countBefore(
    _params: SearchParams,
    sortValues: SortValues,
    _sortClause: Record<string, unknown>[],
    signal?: AbortSignal,
  ): Promise<number> {
    this.requestCount++;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // The sort values contain [timestamp, id]. Use the id to find the index.
    const id = sortValues[sortValues.length - 1] as string;
    const [, idx] = this.findById(id);
    return idx >= 0 ? idx : 0;
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
}

