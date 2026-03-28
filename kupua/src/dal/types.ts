/**
 * Data Access Layer — abstract interface.
 *
 * Phase 1-2: implemented by ElasticsearchDataSource (direct ES queries via Vite proxy)
 * Phase 3: implemented by GridApiDataSource (Grid media-api with auth)
 *
 * UI code depends only on this interface, never on the concrete implementation.
 */

import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Sort values — opaque cursor for search_after pagination
// ---------------------------------------------------------------------------

/**
 * Sort values returned by ES for each hit — used as a cursor for `search_after`.
 * The array matches the sort clause structure (e.g. [uploadTime, id] for
 * two-field sort, or [uploadTime, id, _shard_doc] when PIT is active).
 *
 * Treat as opaque — store and pass back to ES, never parse.
 */
export type SortValues = (string | number | null)[];

/**
 * A single image together with its ES sort values.
 * Used for cursor management — the first and last entries in a buffer
 * provide the cursors for backward and forward pagination.
 */
export interface BufferEntry {
  image: Image;
  sort: SortValues;
}

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
  /** ES query time in milliseconds (from the `took` field in ES response). */
  took?: number;
  /**
   * Per-hit sort values from ES — parallel array to `hits`.
   * Present when the search included a sort clause (always, in practice).
   * Used for `search_after` cursor management.
   */
  sortValues?: SortValues[];
}

/**
 * Result of a `searchAfter` call — same as SearchResult but always includes
 * sort values and the PIT ID that was used (may have been updated by ES).
 */
export interface SearchAfterResult {
  hits: Image[];
  total: number;
  took?: number;
  /** Per-hit sort values — always present. */
  sortValues: SortValues[];
  /** The PIT ID returned by ES (may differ from the one sent if ES refreshed it). */
  pitId?: string;
}

export interface AggregationBucket {
  key: string;
  count: number;
}

export interface AggregationResult {
  buckets: AggregationBucket[];
  total: number;
}

/** Request for a single field aggregation within a batch. */
export interface AggregationRequest {
  /** ES field path (e.g. "metadata.credit", "usageRights.category"). */
  field: string;
  /** Max number of buckets to return. Default: 10. */
  size?: number;
}

/** Result of a batched aggregation — keyed by field path, with timing. */
export interface AggregationsResult {
  /** Per-field aggregation results, keyed by ES field path. */
  fields: Record<string, AggregationResult>;
  /** ES query time in milliseconds. */
  took?: number;
}

export interface ImageDataSource {
  /** Full-text search with filters, pagination, and sorting. */
  search(params: SearchParams): Promise<SearchResult>;

  /**
   * Search without cancelling in-flight requests.
   * Used by loadRange — range loads are additive and shouldn't abort
   * each other or other searches. Accepts an optional AbortSignal so the
   * store can cancel all in-flight ranges when a new search starts
   * (generation-based abort).
   */
  searchRange(params: SearchParams, signal?: AbortSignal): Promise<SearchResult>;

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

  /**
   * Batched terms aggregations — multiple fields in a single ES request.
   * Used by facet filters. Returns keyed by field path.
   * The query is derived from SearchParams (same filters as the main search).
   */
  getAggregations(
    params: SearchParams,
    fields: AggregationRequest[],
    signal?: AbortSignal,
  ): Promise<AggregationsResult>;

  // ---------------------------------------------------------------------------
  // search_after + PIT methods (added for windowed scroll)
  // ---------------------------------------------------------------------------

  /**
   * Open a Point In Time snapshot for consistent pagination.
   * Returns the PIT ID. The caller is responsible for closing it.
   * @param keepAlive — PIT keepalive duration (default: "5m").
   */
  openPit(keepAlive?: string): Promise<string>;

  /**
   * Close a PIT. Fire-and-forget — errors are logged but not thrown.
   */
  closePit(pitId: string): Promise<void>;

  /**
   * Fetch a page using search_after cursor.
   * If pitId is provided, uses PIT for consistency (requests go to /_search
   * without index prefix — PIT already binds to the index).
   *
   * @param params — search params (query, filters, sort).
   * @param searchAfterValues — sort values from the last hit of the previous page.
   *   Pass null for the first page.
   * @param pitId — optional PIT ID for consistent pagination.
   * @param signal — optional AbortSignal for cancellation.
   * @param reverse — if true, reverses the sort clause and reverses the
   *   returned hits/sortValues. Used for backward `search_after` pagination.
   */
  searchAfter(
    params: SearchParams,
    searchAfterValues: SortValues | null,
    pitId?: string | null,
    signal?: AbortSignal,
    reverse?: boolean,
  ): Promise<SearchAfterResult>;

  /**
   * Count documents before a given sort position.
   * Used for sort-around-focus ("where is image X now?").
   *
   * Returns the number of documents that sort before the given values,
   * which equals the 0-based global offset of the document at that position.
   *
   * @param params — search params (query, filters — same as current search).
   * @param sortValues — the target document's sort values.
   * @param sortClause — the sort clause in use (needed to build the range query).
   */
  countBefore(
    params: SearchParams,
    sortValues: SortValues,
    sortClause: Record<string, unknown>[],
    signal?: AbortSignal,
  ): Promise<number>;

  /**
   * Estimate the sort field value at a given percentile of the result set.
   * Used for deep seek (>100k) — maps a global position to an approximate
   * sort value for use with search_after.
   *
   * @param params — search params (query, filters — same as current search).
   * @param field — the primary sort field (e.g. "uploadTime").
   * @param percentile — the target percentile (0–100).
   * @param signal — optional AbortSignal for cancellation.
   * @returns The estimated field value at that percentile, or null if unavailable.
   */
  estimateSortValue(
    params: SearchParams,
    field: string,
    percentile: number,
    signal?: AbortSignal,
  ): Promise<number | null>;
}

