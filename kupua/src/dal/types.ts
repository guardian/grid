/**
 * Data Access Layer — abstract interface.
 *
 * Phase 1-2: implemented by ElasticsearchDataSource (direct ES queries via Vite proxy)
 * Phase 3: implemented by GridApiDataSource (Grid media-api with auth)
 *
 * UI code depends only on this interface, never on the concrete implementation.
 */

import type { Image } from "@/types/image";

export interface SearchParams {
  // --- Params that appear in kahuna's URL (search.results state) ---

  /** Free-text / CQL query — named 'query' to match kahuna URL param */
  query?: string;
  /** Comma-separated image IDs (from Share button) */
  ids?: string;
  /** Upload time range — ISO date strings */
  since?: string;
  until?: string;
  /** When "true", include paid/non-free images (default is free only) */
  nonFree?: string;
  /** Pay type filter: free | maybe-free | pay | all */
  payType?: string;
  /** Filter by uploader email */
  uploadedBy?: string;
  /** Sort order: -uploadTime (newest), uploadTime (oldest), -taken, taken, dateAddedToCollection */
  orderBy?: string;
  /** Enable AI/semantic search */
  useAISearch?: string;
  /** Which date field the date range applies to */
  dateField?: string;
  /** Date taken range — ISO date strings */
  takenSince?: string;
  takenUntil?: string;
  /** Last modified range — ISO date strings */
  modifiedSince?: string;
  modifiedUntil?: string;
  /** Has acquired syndication rights */
  hasRightsAcquired?: string;
  /** Has crops/exports */
  hasCrops?: string;
  /** Syndication status filter */
  syndicationStatus?: string;
  /** Is persisted (archived or has usages) */
  persisted?: string;

  // --- Pinboard integration params (passed through, not used by Grid directly) ---
  expandPinboard?: string;
  pinboardId?: string;
  pinboardItemId?: string;

  // --- Pagination (not in URL, managed internally) ---
  offset?: number;
  length?: number;
  /** Whether to return total count for all result subsets */
  countAll?: boolean;
}

export interface SearchResult {
  hits: Image[];
  total: number;
}

export interface AggregationBucket {
  key: string;
  count: number;
}

export interface AggregationResult {
  buckets: AggregationBucket[];
  total: number;
}

export interface ImageDataSource {
  /** Full-text search with filters, pagination, and sorting. */
  search(params: SearchParams): Promise<SearchResult>;

  /**
   * Search without cancelling in-flight requests.
   * Used by loadRange — range loads are additive and shouldn't abort
   * each other or other searches. Falls back to search() if not implemented.
   */
  searchRange(params: SearchParams): Promise<SearchResult>;

  /** Count documents matching params (lightweight — no hits returned). */
  count(params: SearchParams): Promise<number>;

  /** Fetch a single image by ID. Returns undefined if not found. */
  getById(id: string): Promise<Image | undefined>;

  /** Get terms aggregation for a field (for filter dropdowns). */
  getAggregation(
    field: string,
    query?: string,
    size?: number
  ): Promise<AggregationResult>;
}

