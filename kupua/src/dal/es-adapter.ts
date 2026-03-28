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
    filename: "uploadInfo.filename",
    mimeType: "source.mimeType",
    // Config-driven alias fields (e.g. editStatus → fileMetadata.iptc.Edit Status)
    ...Object.fromEntries(
      gridConfig.fieldAliases.map((a) => [a.alias, a.elasticsearchPath]),
    ),
  };

  /**
   * Script sort definitions — keyed by the sort key name as it appears
   * in the URL (e.g. "dimensions" → ?orderBy=-dimensions).
   * Each returns a Painless source string and the script type.
   * These are only evaluated by ES when the user actually sorts by
   * this field — zero cost when unused.
   */
  const scriptSorts: Record<string, { source: string; type: string }> = {
    dimensions: {
      source:
        "doc['source.dimensions.width'].value * (long)doc['source.dimensions.height'].value",
      type: "number",
    },
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

    // Script-based sorts — looked up by key name (e.g. "dimensions")
    const script = scriptSorts[key];
    if (script) {
      return {
        _script: {
          type: script.type,
          script: { lang: "painless", source: script.source },
          order,
        },
      };
    }

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
    if ("_script" in clause) {
      const scriptDef = { ...(clause._script as Record<string, unknown>) };
      scriptDef.order = scriptDef.order === "desc" ? "asc" : "desc";
      return { _script: scriptDef };
    }
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
  ): Promise<SearchAfterResult> {
    const sortClause = buildSortClause(params.orderBy);
    const effectiveSort = reverse ? reverseSortClause(sortClause) : sortClause;

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

    // _source filtering
    if (SOURCE_EXCLUDES.length > 0 || SOURCE_INCLUDES.length > 0) {
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

        // For script sorts, equality is impractical — skip
        if (prev.isScript) continue;

        equalityConditions.push({
          range: { [prev.field]: { gte: prevValue, lte: prevValue } },
        });
      }

      // Script sorts can't be used in range queries — skip this level
      if (field === "_script") continue;

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract field name, direction, and script flag from a single sort clause.
 * Handles both regular field sorts ({field: "desc"}) and script sorts
 * ({_script: {type, script, order}}).
 */
export function parseSortField(clause: Record<string, unknown>): {
  field: string | null;
  direction: "asc" | "desc";
  isScript: boolean;
} {
  if ("_script" in clause) {
    const scriptDef = clause._script as Record<string, unknown>;
    return {
      field: "_script",
      direction: (scriptDef.order as "asc" | "desc") ?? "asc",
      isScript: true,
    };
  }

  const key = Object.keys(clause)[0];
  if (!key) return { field: null, direction: "asc", isScript: false };

  const val = clause[key];
  const direction: "asc" | "desc" =
    typeof val === "string" ? (val as "asc" | "desc") : "asc";

  return { field: key, direction, isScript: false };
}

