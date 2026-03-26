/**
 * Elasticsearch Data Access Layer implementation.
 *
 * Queries ES via the Vite dev server proxy.
 * Connection config (base URL, index, safeguards) comes from es-config.ts.
 *
 * Safeguards (see kupua/exploration/docs/infra-safeguards.md):
 *   1. _source excludes — heavy fields stripped from responses
 *   2. Request coalescing — in-flight searches cancelled when a new one starts
 *   3. Write protection — only _search / _count allowed on non-local ES
 */

import type { Image } from "@/types/image";
import type {
  ImageDataSource,
  SearchParams,
  SearchResult,
  AggregationResult,
  AggregationRequest,
  AggregationsResult,
} from "./types";
import { parseCql } from "@/lib/cql";
import {
  ES_BASE,
  ES_INDEX,
  SOURCE_EXCLUDES,
  SOURCE_INCLUDES,
  ALLOWED_ES_PATHS,
  IS_LOCAL_ES,
} from "./es-config";

function buildSortClause(orderBy?: string): Record<string, string>[] {
  if (!orderBy) return [{ uploadTime: "desc" }];

  // Grid's short sort aliases (from dropdown / URL) → ES fields.
  // Only match standalone words, not substrings (e.g. "taken" but not "dateTaken").
  const aliases: Record<string, string> = {
    taken: "metadata.dateTaken,-uploadTime",
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

  return parts.map((part) => {
    if (part.startsWith("-")) {
      return { [part.slice(1)]: "desc" };
    }
    return { [part]: "asc" };
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
          hits: Array<{ _id: string; _source: Image }>;
        };
      };

      return {
        hits: result.hits.hits.map((hit) => hit._source),
        total: result.hits.total.value,
        took: result.took,
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
}

