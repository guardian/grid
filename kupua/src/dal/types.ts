/**
 * Data Access Layer — abstract interface.
 *
 * Phase 1-2: implemented by ElasticsearchDataSource (direct ES queries via Vite proxy)
 * Phase 3: implemented by GridApiDataSource (Grid media-api with auth)
 *
 * UI code depends only on this interface, never on the concrete implementation.
 */

import type { Image } from "@/types/image";
import type { PositionMap } from "./position-map";

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
  /** The PIT ID returned by ES (may differ from the one sent if ES refreshed it).
   *  Explicit `null` means the PIT expired and was not renewed (audit #21). */
  pitId?: string | null;
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

/**
 * Sort field distribution — all unique values (or time buckets) with
 * cumulative position ranges. Used by the scrubber to map any global
 * position to a sort value via binary search (no network during drag).
 *
 * Works for both keyword sorts (composite agg → one bucket per unique value)
 * and date sorts (date_histogram agg → one bucket per time interval).
 */
export interface SortDistribution {
  /** Buckets in sort order, with cumulative start positions. */
  buckets: SortDistBucket[];
  /** Total docs covered by the distribution (may be < total if nulls exist). */
  coveredCount: number;
}

export interface SortDistBucket {
  /** The bucket key — keyword value (e.g. "Getty") or ISO date string (e.g. "2024-03-01T00:00:00.000Z"). */
  key: string;
  /** Number of docs in this bucket. */
  count: number;
  /** Cumulative start position (0-based) — first doc in this bucket. */
  startPosition: number;
}

export interface ImageDataSource {
  /** Full-text search with filters, pagination, and sorting. */
  search(params: SearchParams): Promise<SearchResult>;

  /**
   * Search without cancelling in-flight requests.
   * Range loads are additive and shouldn't abort each other or other
   * searches. Accepts an optional AbortSignal so the caller can cancel.
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
   * @param noSource — if true, sets _source: false (only sort values returned).
   * @param missingFirst — if true (typically with reverse), sets `missing: "_first"`
   *   on the primary sort field. Needed when seeking to the end of a keyword-sorted
   *   result set where null-value docs sit at the tail — without this, ES default
   *   `missing: "_last"` puts nulls last in BOTH asc and desc, so a naive reverse
   *   search returns high-value docs instead of the true last docs.
   */
  searchAfter(
    params: SearchParams,
    searchAfterValues: SortValues | null,
    pitId?: string | null,
    signal?: AbortSignal,
    reverse?: boolean,
    noSource?: boolean,
    missingFirst?: boolean,
    /** Override the sort clause (instead of deriving from params.orderBy). */
    sortOverride?: Record<string, unknown>[],
    /** Extra ES filter clause appended to the query (e.g. must_not:exists). */
    extraFilter?: Record<string, unknown>,
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

  /**
   * Find the keyword sort value at a given global position using composite
   * aggregation. Used for deep seek on keyword-sorted fields where
   * percentile estimation is unavailable.
   *
   * Walks through unique values of the sort field via composite aggregation,
   * accumulating doc_counts until the cumulative count reaches the target
   * position. Returns the keyword value at that position (for use as a
   * search_after cursor anchor).
   *
   * @param params — search params (query, filters — same as current search).
   * @param field — the primary sort field (e.g. "metadata.credit").
   * @param targetPosition — the 0-based global position to seek to.
   * @param direction — sort direction ("asc" or "desc").
   * @param signal — optional AbortSignal for cancellation.
   * @returns The keyword value at the target position, or null if not found.
   */
  findKeywordSortValue?(
    params: SearchParams,
    field: string,
    targetPosition: number,
    direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<string | null>;

  /**
   * Fetch the complete keyword distribution for a sort field — all unique
   * values with doc counts, in sort order. Used by the scrubber tooltip to
   * look up the keyword value at any global position via binary search.
   *
   * Uses composite aggregation to page through all unique values. Capped at
   * MAX_PAGES to avoid runaway requests on very high cardinality fields.
   *
   * @param params — search params (query, filters — same as current search).
   * @param field — the ES field path (e.g. "metadata.credit").
   * @param direction — sort direction ("asc" or "desc").
   * @param signal — optional AbortSignal for cancellation.
   */
  getKeywordDistribution?(
    params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<SortDistribution | null>;

  /**
   * Fetch a date histogram distribution for a date sort field.
   * Returns time-interval buckets with doc counts in sort order, plus
   * cumulative start positions for O(log n) position→date lookup.
   *
   * Uses ES `date_histogram` aggregation — single request, ~10–30ms on 1M+
   * docs. Bucket interval adapts to the time span (month for multi-year,
   * day for sub-year, hour for sub-week).
   *
   * @param params — search params (query, filters — same as current search).
   * @param field — the ES date field (e.g. "uploadTime").
   * @param direction — sort direction ("asc" or "desc").
   * @param signal — optional AbortSignal for cancellation.
   */
  getDateDistribution?(
    params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    signal?: AbortSignal,
    extraFilter?: Record<string, unknown>,
  ): Promise<SortDistribution | null>;

  /**
   * Fetch a lightweight position index for all results — `[id, sortValues]`
   * per document, fetched with `_source: false` in chunked `search_after`
   * calls. Used by the scrubber to map any global position to exact sort
   * values for O(1) seek.
   *
   * Opens and closes its own dedicated PIT (decoupled from the main search
   * PIT lifecycle). Yields between chunks to avoid blocking the main thread.
   *
   * @param params — search params (query, filters — same as current search).
   * @param signal — AbortSignal for cancellation. Aborted fetches discard
   *   partial results and return `null`.
   * @returns The complete position map, or `null` if aborted or failed.
   */
  fetchPositionIndex?(
    params: SearchParams,
    signal: AbortSignal,
  ): Promise<PositionMap | null>;
}

