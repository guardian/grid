/**
 * Elasticsearch Data Access Layer implementation.
 *
 * Queries ES via the Vite dev server proxy.
 * Connection config (base URL, index, safeguards) comes from es-config.ts.
 *
 * Safeguards (see kupua/exploration/docs/infra-safeguards.md):
 *   1. _source excludes — heavy fields stripped from responses
 *   2. Request coalescing — in-flight searches cancelled when a new one starts
 *   3. Write protection — only _search / _count / _pit allowed on non-local ES
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
  SortDistBucket,
} from "./types";
import { parseCql } from "@/lib/cql";
import { gridConfig } from "@/lib/grid-config";
import {
  ES_BASE,
  ES_INDEX,
  SOURCE_EXCLUDES,
  SOURCE_INCLUDES,
  ALLOWED_ES_PATHS,
  IS_LOCAL_ES,
} from "./es-config";

/**
 * Build the ES sort clause from an orderBy string.
 *
 * Always appends `{ id: "asc" }` as a tiebreaker — required for
 * deterministic `search_after` pagination. Uses the `id` keyword field
 * (not `_id` which requires fielddata to be enabled in ES 8.x).
 * Since `id` is unique, every document has a unique sort tuple.
 *
 * Exported so the store can inspect the sort clause for countBefore queries.
 */
export function buildSortClause(orderBy?: string): Record<string, unknown>[] {
  if (!orderBy) return [{ uploadTime: "desc" }, { id: "asc" }];

  // Short sort aliases (from dropdown / URL) → ES field paths.
  // The URL only ever contains the short alias; the full ES path is
  // resolved here at query time. See field-registry.ts sortKey values.
  const aliases: Record<string, string> = {
    taken: "metadata.dateTaken,-uploadTime",
    credit: "metadata.credit",
    source: "metadata.source",
    imageType: "metadata.imageType",
    category: "usageRights.category",
    mimeType: "source.mimeType",
    width: "source.dimensions.width",
    height: "source.dimensions.height",
    // Config-driven alias fields (e.g. editStatus → fileMetadata.iptc.Edit Status)
    ...Object.fromEntries(
      gridConfig.fieldAliases.map((a) => [a.alias, a.elasticsearchPath]),
    ),
  };

  // Expand aliases in comma-separated parts
  const parts = orderBy.split(",").flatMap((part) => {
    const trimmed = part.trim();
    const neg = trimmed.startsWith("-");
    const bare = neg ? trimmed.slice(1) : trimmed;
    const prefix = neg ? "-" : "";

    if (aliases[bare]) {
      // Expand alias, preserving negation on each sub-part
      return aliases[bare].split(",").map((sub) => {
        const subNeg = sub.startsWith("-");
        const subBare = subNeg ? sub.slice(1) : sub;
        // XOR: if outer is negated, flip inner direction
        const finalNeg = neg !== subNeg;
        return finalNeg ? `-${subBare}` : subBare;
      });
    }

    return [`${prefix}${bare}`];
  });

  const clauses = parts.map((part) => {
    const desc = part.startsWith("-");
    const key = desc ? part.slice(1) : part;
    const order = desc ? "desc" : "asc";


    return { [key]: order };
  });

  // Append tiebreaker — skip if 'id' is already the last sort field
  // (shouldn't happen in practice, but defensive).
  const lastClause = clauses[clauses.length - 1];
  if (!lastClause || !("id" in lastClause)) {
    clauses.push({ id: "asc" });
  }

  return clauses;
}

/**
 * Reverse a sort clause — flip every asc↔desc. Used for backward
 * `search_after` pagination: flip sort, use `startCursor`, reverse
 * the returned hits.
 */
export function reverseSortClause(
  sort: Record<string, unknown>[],
): Record<string, unknown>[] {
  return sort.map((clause) => {
    const key = Object.keys(clause)[0];
    if (!key) return clause;
    const val = clause[key];
    const dir = typeof val === "string" ? val : "asc";
    return { [key]: dir === "desc" ? "asc" : "desc" };
  });
}

function buildQuery(params: SearchParams): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];
  const mustNot: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];

  // Parse CQL query string into structured ES clauses
  if (params.query) {
    const cql = parseCql(params.query);
    must.push(...cql.must);
    mustNot.push(...cql.mustNot);
  }

  // IDs filter (comma-separated)
  if (params.ids) {
    const idList = params.ids.split(",").map((s) => s.trim());
    filter.push({ terms: { id: idList } });
  }

  // Upload time range
  if (params.since || params.until) {
    const range: Record<string, string> = {};
    if (params.since) range.gte = params.since;
    if (params.until) range.lte = params.until;
    filter.push({ range: { uploadTime: range } });
  }

  // Date taken range
  if (params.takenSince || params.takenUntil) {
    const range: Record<string, string> = {};
    if (params.takenSince) range.gte = params.takenSince;
    if (params.takenUntil) range.lte = params.takenUntil;
    filter.push({ range: { "metadata.dateTaken": range } });
  }

  // Last modified range
  if (params.modifiedSince || params.modifiedUntil) {
    const range: Record<string, string> = {};
    if (params.modifiedSince) range.gte = params.modifiedSince;
    if (params.modifiedUntil) range.lte = params.modifiedUntil;
    filter.push({ range: { lastModified: range } });
  }

  // Uploaded by
  if (params.uploadedBy) {
    filter.push({ term: { uploadedBy: params.uploadedBy } });
  }

  // Free-to-use filter: applied when nonFree is absent from URL (kahuna
  // convention).  nonFree=true in URL disables the filter to include paid
  // images.  Default app state has nonFree=true → checkbox unchecked → no
  // filter.  Checking "Free to use only" removes nonFree → filter applies.
  if (params.nonFree !== "true") {
    filter.push({
      terms: {
        "usageRights.category": [
          "commissioned-agency",
          "PR Image",
          "handout",
          "screengrab",
          "guardian-witness",
          "original-source",
          "social-media",
          "Bylines",
          "obituary",
          "staff-photographer",
          "contract-photographer",
          "commissioned-photographer",
          "pool",
          "crown-copyright",
          "staff-illustrator",
          "contract-illustrator",
          "commissioned-illustrator",
          "creative-commons",
          "composite",
          "public-domain",
          "programmes-organisation-owned",
        ],
      },
    });
  }

  // Has crops (kahuna calls them "crops", API calls them "exports")
  if (params.hasCrops === "true") {
    filter.push({ exists: { field: "exports" } });
  } else if (params.hasCrops === "false") {
    filter.push({ bool: { must_not: { exists: { field: "exports" } } } });
  }

  // Has rights acquired
  if (params.hasRightsAcquired === "true") {
    filter.push({
      term: { "syndicationRights.rights.acquired": true },
    });
  } else if (params.hasRightsAcquired === "false") {
    filter.push({
      bool: {
        must_not: {
          term: { "syndicationRights.rights.acquired": true },
        },
      },
    });
  }

  // Syndication status
  if (params.syndicationStatus) {
    filter.push({ term: { syndicationStatus: params.syndicationStatus } });
  }

  // Persisted
  if (params.persisted === "true") {
    filter.push({ term: { "persisted.value": true } });
  } else if (params.persisted === "false") {
    filter.push({
      bool: { must_not: { term: { "persisted.value": true } } },
    });
  }

  const query: Record<string, unknown> =
    must.length === 0 && mustNot.length === 0 && filter.length === 0
      ? { match_all: {} }
      : {
          bool: {
            ...(must.length > 0 ? { must } : {}),
            ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
            ...(filter.length > 0 ? { filter } : {}),
          },
        };

  return query;
}

export class ElasticsearchDataSource implements ImageDataSource {
  /**
   * AbortController for the current in-flight search request.
   * When a new search starts, the previous one is cancelled to prevent
   * stale results from overwriting fresher ones (request coalescing).
   */
  private searchAbortController: AbortController | null = null;

  private assertReadOnly(path: string): void {
    if (IS_LOCAL_ES) return; // no restrictions on local docker ES
    const allowed = ALLOWED_ES_PATHS.some((p) => path.startsWith(p));
    if (!allowed) {
      throw new Error(
        `[Safeguard] Blocked ES request to "${path}" — only read operations ` +
          `(${ALLOWED_ES_PATHS.join(", ")}) are allowed on non-local ES. ` +
          `See kupua/exploration/docs/infra-safeguards.md`
      );
    }
  }

  private async esRequest(
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    this.assertReadOnly(path);

    const url = `${ES_BASE}/${ES_INDEX}/${path}`;
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!response.ok) {
      throw new Error(`ES request failed: ${response.status} ${url}`);
    }

    return response.json();
  }

  /**
   * Send a request to ES without the index prefix.
   * Used for PIT-based searches (PIT already binds to the index)
   * and PIT lifecycle operations (_pit open/close).
   *
   * @param method — HTTP method (GET, POST, DELETE).
   */
  private async esRequestRaw(
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
    method?: string,
  ): Promise<unknown> {
    this.assertReadOnly(path);

    const url = `${ES_BASE}/${path}`;
    const resolvedMethod = method ?? (body ? "POST" : "GET");
    const response = await fetch(url, {
      method: resolvedMethod,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!response.ok) {
      throw new Error(`ES request failed: ${response.status} ${url}`);
    }

    return response.json();
  }

  async search(params: SearchParams): Promise<SearchResult> {
    // Cancel any in-flight search — only the latest one matters
    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();
    const { signal } = this.searchAbortController;

    return this._doSearch(params, signal);
  }

  /**
   * Search without using the shared abort controller.
   * Used by loadRange — range loads are additive and shouldn't cancel
   * each other or cancel loadMore/search. Accepts an optional signal
   * so the store can abort all ranges from a previous search generation.
   */
  async searchRange(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {
    return this._doSearch(params, signal);
  }

  private async _doSearch(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {

    const body: Record<string, unknown> = {
      query: buildQuery(params),
      sort: buildSortClause(params.orderBy),
      from: params.offset ?? 0,
      size: params.length ?? 50,
      track_total_hits: true,
    };

    // _source filtering — exclude heavy fields to reduce response size
    if (SOURCE_EXCLUDES.length > 0 || SOURCE_INCLUDES.length > 0) {
      body._source = {
        ...(SOURCE_INCLUDES.length > 0
          ? { includes: SOURCE_INCLUDES }
          : {}),
        ...(SOURCE_EXCLUDES.length > 0
          ? { excludes: SOURCE_EXCLUDES }
          : {}),
      };
    }

    try {
      const result = (await this.esRequest("_search", body, signal)) as {
        took?: number;
        hits: {
          total: { value: number };
          hits: Array<{ _id: string; _source: Image; sort?: SortValues }>;
        };
      };

      return {
        hits: result.hits.hits.map((hit) => hit._source),
        total: result.hits.total.value,
        took: result.took,
        sortValues: result.hits.hits.map((hit) => hit.sort ?? []),
      };
    } catch (e) {
      // Don't treat aborted requests as errors — they're intentional
      if (e instanceof DOMException && e.name === "AbortError") {
        return { hits: [], total: 0 };
      }
      throw e;
    }
  }

  async count(params: SearchParams): Promise<number> {
    const body = { query: buildQuery(params) };
    const result = (await this.esRequest("_count", body)) as {
      count: number;
    };
    return result.count;
  }

  async getById(id: string): Promise<Image | undefined> {
    const body: Record<string, unknown> = {
      query: { terms: { id: [id] } },
      size: 1,
    };
    if (SOURCE_EXCLUDES.length > 0 || SOURCE_INCLUDES.length > 0) {
      body._source = {
        ...(SOURCE_INCLUDES.length > 0 ? { includes: SOURCE_INCLUDES } : {}),
        ...(SOURCE_EXCLUDES.length > 0 ? { excludes: SOURCE_EXCLUDES } : {}),
      };
    }
    const result = (await this.esRequest("_search", body)) as {
      hits: { hits: Array<{ _source: Image }> };
    };
    return result.hits.hits[0]?._source;
  }

  async getAggregation(
    field: string,
    query?: string,
    size: number = 50
  ): Promise<AggregationResult> {
    const body: Record<string, unknown> = {
      size: 0,
      query: query
        ? {
            multi_match: {
              query,
              fields: ["metadata.englishAnalysedCatchAll"],
            },
          }
        : { match_all: {} },
      aggs: {
        field_agg: {
          terms: { field, size },
        },
      },
    };

    const result = (await this.esRequest("_search", body)) as {
      aggregations: {
        field_agg: {
          buckets: Array<{ key: string; doc_count: number }>;
        };
      };
      hits: { total: { value: number } };
    };

    return {
      buckets: result.aggregations.field_agg.buckets.map((b) => ({
        key: b.key,
        count: b.doc_count,
      })),
      total: result.hits.total.value,
    };
  }

  async getAggregations(
    params: SearchParams,
    fields: AggregationRequest[],
    signal?: AbortSignal,
  ): Promise<AggregationsResult> {
    // Build named aggs — one terms agg per field, keyed by field path
    const aggs: Record<string, unknown> = {};
    for (const { field, size } of fields) {
      // Use a safe agg name: replace dots with underscores
      aggs[field] = { terms: { field, size: size ?? 10 } };
    }

    const body: Record<string, unknown> = {
      size: 0, // No hits — aggs only
      query: buildQuery(params),
      aggs,
    };

    const result = (await this.esRequest("_search", body, signal)) as {
      took?: number;
      aggregations: Record<
        string,
        { buckets: Array<{ key: string; doc_count: number }> }
      >;
      hits: { total: { value: number } };
    };

    const out: Record<string, AggregationResult> = {};
    for (const { field } of fields) {
      const agg = result.aggregations[field];
      out[field] = {
        buckets: agg
          ? agg.buckets.map((b) => ({ key: b.key, count: b.doc_count }))
          : [],
        total: result.hits.total.value,
      };
    }

    return { fields: out, took: result.took };
  }

  // ---------------------------------------------------------------------------
  // search_after + PIT methods
  // ---------------------------------------------------------------------------

  async openPit(keepAlive: string = "5m"): Promise<string> {
    const result = (await this.esRequest(
      `_pit?keep_alive=${keepAlive}`,
      {}, // POST requires a body (even empty)
    )) as { id: string };
    return result.id;
  }

  async closePit(pitId: string): Promise<void> {
    try {
      await this.esRequestRaw(
        "_pit",
        { id: pitId },
        undefined,
        "DELETE",
      );
    } catch (e) {
      // Fire-and-forget — PIT will expire on its own if close fails.
      // Log for debugging but don't propagate.
      console.warn("[ES] Failed to close PIT:", e);
    }
  }

  async searchAfter(
    params: SearchParams,
    searchAfterValues: SortValues | null,
    pitId?: string | null,
    signal?: AbortSignal,
    reverse?: boolean,
    noSource?: boolean,
    missingFirst?: boolean,
  ): Promise<SearchAfterResult> {
    const sortClause = buildSortClause(params.orderBy);
    let effectiveSort = reverse ? reverseSortClause(sortClause) : sortClause;

    // missingFirst: override the primary sort field to use missing: "_first".
    // Needed for reverse-seek-to-end on keyword fields with null values.
    if (missingFirst && effectiveSort.length > 0) {
      effectiveSort = effectiveSort.map((clause, idx) => {
        if (idx !== 0) return clause;
        const { field, direction } = parseSortField(clause);
        if (!field) return clause;
        return { [field]: { order: direction, missing: "_first" } };
      });
    }

    const body: Record<string, unknown> = {
      query: buildQuery(params),
      sort: effectiveSort,
      size: params.length ?? 200,
      track_total_hits: true,
    };

    // from/size offset — used when no cursor is provided (initial search, seek, backward extend).
    // When search_after is present, 'from' must be omitted (ES ignores it but warns).
    if (!searchAfterValues && params.offset) {
      body.from = params.offset;
    }

    // _source filtering — noSource: true omits all source fields (only sort values needed)
    if (noSource) {
      body._source = false;
    } else if (SOURCE_EXCLUDES.length > 0 || SOURCE_INCLUDES.length > 0) {
      body._source = {
        ...(SOURCE_INCLUDES.length > 0 ? { includes: SOURCE_INCLUDES } : {}),
        ...(SOURCE_EXCLUDES.length > 0 ? { excludes: SOURCE_EXCLUDES } : {}),
      };
    }

    // Cursor — omit for the first page
    if (searchAfterValues) {
      body.search_after = searchAfterValues;
    }

    // PIT — include for consistent pagination
    if (pitId) {
      body.pit = { id: pitId, keep_alive: "5m" };
    }

    try {
      // PIT-based searches go to /_search (no index prefix) — the PIT
      // already binds the request to the index.
      const fetcher = pitId
        ? this.esRequestRaw("_search", body, signal)
        : this.esRequest("_search", body, signal);

      const result = (await fetcher) as {
        took?: number;
        pit_id?: string;
        hits: {
          total: { value: number };
          hits: Array<{ _id: string; _source: Image; sort: SortValues }>;
        };
      };

      // When searching in reverse (for backward pagination), reverse the
      // hits and sort values so they're in the original sort order.
      const rawHits = result.hits.hits;
      const orderedHits = reverse ? [...rawHits].reverse() : rawHits;

      return {
        hits: orderedHits.map((hit) => hit._source),
        total: result.hits.total.value,
        took: result.took,
        sortValues: orderedHits.map((hit) => hit.sort),
        pitId: result.pit_id,
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { hits: [], total: 0, sortValues: [] };
      }
      // PIT 404/410 — the PIT expired or was closed by a concurrent search().
      // Retry without PIT using the index-prefixed path. This loses snapshot
      // isolation but is far better than failing the seek entirely.
      if (pitId && e instanceof Error && /40[04]/.test(e.message)) {
        console.warn("[ES] searchAfter: PIT expired/closed, retrying without PIT");
        delete body.pit;
        try {
          const fallbackResult = (await this.esRequest("_search", body, signal)) as {
            took?: number;
            hits: {
              total: { value: number };
              hits: Array<{ _id: string; _source: Image; sort: SortValues }>;
            };
          };
          const rawHits = fallbackResult.hits.hits;
          const orderedHits = reverse ? [...rawHits].reverse() : rawHits;
          return {
            hits: orderedHits.map((hit) => hit._source),
            total: fallbackResult.hits.total.value,
            took: fallbackResult.took,
            sortValues: orderedHits.map((hit) => hit.sort),
            // No pitId — caller should open a new one if needed
          };
        } catch (fallbackErr) {
          if (fallbackErr instanceof DOMException && fallbackErr.name === "AbortError") {
            return { hits: [], total: 0, sortValues: [] };
          }
          throw fallbackErr;
        }
      }
      throw e;
    }
  }

  async countBefore(
    params: SearchParams,
    sortValues: SortValues,
    sortClause: Record<string, unknown>[],
    signal?: AbortSignal,
  ): Promise<number> {
    // Build a query that counts all documents that sort *before* the
    // target document. For each sort field, a document sorts before if:
    //   - Its value on an earlier sort field is strictly "less" (in the
    //     field's sort direction), OR
    //   - All earlier fields are equal AND this field is strictly "less".
    //
    // For a sort clause [{uploadTime: "desc"}, {id: "asc"}] with values
    // [T, I], a document sorts before if:
    //   uploadTime > T  (desc → "before" means greater)
    //   OR (uploadTime == T AND id < I)  (asc → "before" means less)
    //
    // This generalises to N sort fields via nested should clauses.

    const baseQuery = buildQuery(params);
    const should: Record<string, unknown>[] = [];

    for (let i = 0; i < sortClause.length && i < sortValues.length; i++) {
      const clause = sortClause[i];
      const value = sortValues[i];

      // Extract field name and direction from the sort clause
      const { field, direction } = parseSortField(clause);
      if (!field || value == null) continue;

      // "Before" in desc order means >, in asc order means <
      const rangeOp = direction === "desc" ? "gt" : "lt";

      // Build the equality conditions for all preceding fields
      const equalityConditions: Record<string, unknown>[] = [];
      for (let j = 0; j < i; j++) {
        const prevClause = sortClause[j];
        const prevValue = sortValues[j];
        const prev = parseSortField(prevClause);
        if (!prev.field || prevValue == null) continue;


        equalityConditions.push({
          range: { [prev.field]: { gte: prevValue, lte: prevValue } },
        });
      }


      const rangeCondition = {
        range: { [field]: { [rangeOp]: value } },
      };

      if (equalityConditions.length === 0) {
        should.push(rangeCondition);
      } else {
        should.push({
          bool: {
            must: [...equalityConditions, rangeCondition],
          },
        });
      }
    }

    if (should.length === 0) {
      return 0;
    }

    const countQuery: Record<string, unknown> = {
      bool: {
        must: [baseQuery],
        filter: [
          {
            bool: {
              should,
              minimum_should_match: 1,
            },
          },
        ],
      },
    };

    const body = { query: countQuery };
    const result = (await this.esRequest("_count", body, signal)) as {
      count: number;
    };
    return result.count;
  }

  async estimateSortValue(
    params: SearchParams,
    field: string,
    percentile: number,
    signal?: AbortSignal,
  ): Promise<number | null> {
    const body: Record<string, unknown> = {
      size: 0, // No hits — agg only
      query: buildQuery(params),
      aggs: {
        pct: {
          percentiles: {
            field,
            percents: [percentile],
            // TDigest with higher compression for better accuracy at extremes
            tdigest: { compression: 200 },
          },
        },
      },
    };

    try {
      const result = (await this.esRequest("_search", body, signal)) as {
        aggregations?: {
          pct?: { values?: Record<string, number | null> };
        };
      };

      const values = result.aggregations?.pct?.values;
      if (!values) return null;

      // ES returns percentile keys as strings like "50.0"
      const key = Object.keys(values)[0];
      if (!key) return null;

      const val = values[key];
      return val != null && isFinite(val) ? val : null;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.warn("[ES] estimateSortValue failed:", e);
      return null;
    }
  }

  async findKeywordSortValue(
    params: SearchParams,
    field: string,
    targetPosition: number,
    direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<string | null> {
    // Walk through unique keyword values using composite aggregation.
    // Each page returns up to BUCKET_SIZE buckets with doc_counts.
    // Accumulate counts until we pass targetPosition.
    //
    // Performance: BUCKET_SIZE=10000 (ES allows up to 65536). At 10k
    // buckets per page, even 100k unique values only need 10 pages.
    // A time cap (TIME_CAP_MS) ensures we return the best-known value
    // if the walk is taking too long (e.g. SSH tunnel latency × many pages).
    const BUCKET_SIZE = Number(
      import.meta.env.VITE_KEYWORD_SEEK_BUCKET_SIZE ?? 10_000,
    );
    const MAX_PAGES = 50;
    const TIME_CAP_MS = 8_000;
    const startTime = Date.now();
    let cumulative = 0;
    let afterKey: Record<string, unknown> | undefined;
    // Track the last keyword value we've seen — if we hit the time cap,
    // this gives an approximate (but usable) seek position.
    let lastKeywordValue: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (signal?.aborted) return null;

      // Time cap: if we've been walking for too long, return the best
      // value we have so far. An approximate position is far better than
      // returning null (which falls back to a capped from/size at ~100k).
      if (page > 0 && Date.now() - startTime > TIME_CAP_MS) {
        console.warn(
          `[ES] findKeywordSortValue: time cap hit after ${page} pages ` +
          `(${Date.now() - startTime}ms). Returning approximate value at ` +
          `cumulative=${cumulative} (target=${targetPosition}).`,
        );
        return lastKeywordValue;
      }

      const composite: Record<string, unknown> = {
        sources: [
          { _sort_field: { terms: { field, order: direction } } },
        ],
        size: BUCKET_SIZE,
      };
      if (afterKey) {
        composite.after = afterKey;
      }

      const body: Record<string, unknown> = {
        size: 0,
        query: buildQuery(params),
        aggs: { pos: { composite } },
        track_total_hits: false,
      };

      try {
        const result = (await this.esRequest("_search", body, signal)) as {
          aggregations?: {
            pos?: {
              after_key?: Record<string, unknown>;
              buckets?: Array<{ key: Record<string, unknown>; doc_count: number }>;
            };
          };
        };

        const buckets = result.aggregations?.pos?.buckets;
        if (!buckets || buckets.length === 0) {
          // Composite returned no buckets. If we've accumulated some counts
          // but haven't reached the target, the remaining docs likely have
          // null/missing keyword values (composite skips nulls by default).
          // Return the last known value — search_after from there lands at
          // the boundary between valued and null docs, then countBefore
          // determines the exact offset.
          console.log(
            `[ES] findKeywordSortValue: exhausted (empty) at page ${page} ` +
            `(${Date.now() - startTime}ms, cumulative=${cumulative}, ` +
            `target=${targetPosition}). Returning lastKeywordValue.`,
          );
          return lastKeywordValue;
        }

        for (const bucket of buckets) {
          const nextCumulative = cumulative + bucket.doc_count;
          if (nextCumulative > targetPosition) {
            // Target position falls within this bucket.
            const value = String(bucket.key._sort_field);
            console.log(
              `[ES] findKeywordSortValue: found "${value}" at page ${page} ` +
              `(${Date.now() - startTime}ms, cumulative=${cumulative}, ` +
              `target=${targetPosition}).`,
            );
            return value;
          }
          cumulative = nextCumulative;
          lastKeywordValue = String(bucket.key._sort_field);
        }

        // Check if there are more pages
        afterKey = result.aggregations?.pos?.after_key;
        if (!afterKey || buckets.length < BUCKET_SIZE) {
          // No more pages. If cumulative < targetPosition, the remaining
          // docs have null/missing values for this keyword field (composite
          // agg skips nulls). Return the last keyword value — search_after
          // from there puts us at the valued→null boundary, close to target.
          console.log(
            `[ES] findKeywordSortValue: no more pages at page ${page} ` +
            `(${Date.now() - startTime}ms, cumulative=${cumulative}, ` +
            `target=${targetPosition}). Returning lastKeywordValue.`,
          );
          return lastKeywordValue;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        console.warn("[ES] findKeywordSortValue failed:", e);
        return null;
      }
    }

    // Exceeded MAX_PAGES — return approximate value if available
    console.warn(
      `[ES] findKeywordSortValue: exceeded ${MAX_PAGES} pages ` +
      `(${Date.now() - startTime}ms, cumulative=${cumulative}). ` +
      `Returning approximate value.`,
    );
    return lastKeywordValue;
  }

  /**
   * Fetch the complete keyword distribution for a sort field.
   * Returns all unique values with doc counts in sort order, plus cumulative
   * start positions for O(log n) position→value lookup.
   *
   * Capped at 5 composite pages (50k unique values). Fields with higher
   * cardinality return a partial distribution (still useful for the covered range).
   */
  async getKeywordDistribution(
    params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<SortDistribution | null> {
    const BUCKET_SIZE = 10_000;
    const MAX_PAGES = 5;
    const startTime = Date.now();
    const buckets: SortDistBucket[] = [];
    let cumulative = 0;
    let afterKey: Record<string, unknown> | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (signal?.aborted) return null;

      const composite: Record<string, unknown> = {
        sources: [
          { _sort_field: { terms: { field, order: direction } } },
        ],
        size: BUCKET_SIZE,
      };
      if (afterKey) {
        composite.after = afterKey;
      }

      const body: Record<string, unknown> = {
        size: 0,
        query: buildQuery(params),
        aggs: { dist: { composite } },
        track_total_hits: false,
      };

      try {
        const result = (await this.esRequest("_search", body, signal)) as {
          aggregations?: {
            dist?: {
              after_key?: Record<string, unknown>;
              buckets?: Array<{ key: Record<string, unknown>; doc_count: number }>;
            };
          };
        };

        const esBuckets = result.aggregations?.dist?.buckets;
        if (!esBuckets || esBuckets.length === 0) break;

        for (const b of esBuckets) {
          buckets.push({
            key: String(b.key._sort_field),
            count: b.doc_count,
            startPosition: cumulative,
          });
          cumulative += b.doc_count;
        }

        afterKey = result.aggregations?.dist?.after_key;
        if (!afterKey || esBuckets.length < BUCKET_SIZE) break; // last page
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        console.warn("[ES] getKeywordDistribution failed:", e);
        return null;
      }
    }

    if (buckets.length === 0) return null;

    console.log(
      `[ES] getKeywordDistribution: ${field} ${direction} — ` +
      `${buckets.length} unique values, ${cumulative} docs covered ` +
      `(${Date.now() - startTime}ms)`,
    );

    return { buckets, coveredCount: cumulative };
  }

  /**
   * Fetch a date histogram distribution for a date sort field.
   * Single ES request using `date_histogram` — one of ES's most optimised
   * aggregations (BKD tree interval counting, no per-doc evaluation).
   *
   * Interval adapts to the total time span:
   *   > 2 years  → month buckets (~180 for 15 years)
   *   2–60 days  → day buckets
   *   < 2 days   → hour buckets
   *
   * Returns buckets in sort order (asc or desc) with cumulative start
   * positions, matching the SortDistribution structure used by keyword sorts.
   */
  async getDateDistribution(
    params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<SortDistribution | null> {
    const startTime = Date.now();

    // First, get the min/max of the field to choose the right interval.
    // stats agg is very cheap on date fields (~5ms).
    const statsBody: Record<string, unknown> = {
      size: 0,
      query: buildQuery(params),
      aggs: { range: { stats: { field } } },
      track_total_hits: false,
    };

    let interval: string;
    try {
      const statsResult = (await this.esRequest("_search", statsBody, signal)) as {
        aggregations?: { range?: { min: number; max: number; count: number } };
      };
      const stats = statsResult.aggregations?.range;
      if (!stats || stats.count === 0) return null;

      const spanMs = Math.abs(stats.max - stats.min);
      const MS_PER_DAY = 86_400_000;
      if (spanMs > 2 * 365 * MS_PER_DAY) {
        interval = "month";
      } else if (spanMs > 2 * MS_PER_DAY) {
        interval = "day";
      } else {
        interval = "hour";
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.warn("[ES] getDateDistribution stats failed:", e);
      return null;
    }

    // Now fetch the histogram
    const body: Record<string, unknown> = {
      size: 0,
      query: buildQuery(params),
      aggs: {
        timeline: {
          date_histogram: {
            field,
            calendar_interval: interval,
            min_doc_count: 1, // skip empty buckets
            order: { _key: direction },
          },
        },
      },
      track_total_hits: false,
    };

    try {
      const result = (await this.esRequest("_search", body, signal)) as {
        aggregations?: {
          timeline?: {
            buckets?: Array<{ key_as_string: string; doc_count: number }>;
          };
        };
      };

      const esBuckets = result.aggregations?.timeline?.buckets;
      if (!esBuckets || esBuckets.length === 0) return null;

      const buckets: SortDistBucket[] = [];
      let cumulative = 0;
      for (const b of esBuckets) {
        buckets.push({
          key: b.key_as_string,
          count: b.doc_count,
          startPosition: cumulative,
        });
        cumulative += b.doc_count;
      }

      console.log(
        `[ES] getDateDistribution: ${field} ${direction} ${interval} — ` +
        `${buckets.length} buckets, ${cumulative} docs covered ` +
        `(${Date.now() - startTime}ms)`,
      );

      return { buckets, coveredCount: cumulative };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.warn("[ES] getDateDistribution failed:", e);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract field name and direction from a single sort clause.
 * Handles regular field sorts ({field: "desc"}).
 */
export function parseSortField(clause: Record<string, unknown>): {
  field: string | null;
  direction: "asc" | "desc";
} {
  const key = Object.keys(clause)[0];
  if (!key) return { field: null, direction: "asc" };

  const val = clause[key];
  const direction: "asc" | "desc" =
    typeof val === "string" ? (val as "asc" | "desc") : "asc";

  return { field: key, direction };
}

