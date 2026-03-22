/**
 * Elasticsearch Data Access Layer implementation.
 *
 * Queries ES via the Vite dev server proxy: /es/* → localhost:9220/*
 * This keeps all requests local — no CORS, no auth, no production contact.
 */

import type { Image } from "@/types/image";
import type {
  ImageDataSource,
  SearchParams,
  SearchResult,
  AggregationResult,
} from "./types";
import { parseCql } from "@/lib/cql";

const ES_BASE = "/es";
const INDEX = "images";

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
  private async esRequest(
    path: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${ES_BASE}/${INDEX}/${path}`;
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`ES request failed: ${response.status} ${url}`);
    }

    return response.json();
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const body: Record<string, unknown> = {
      query: buildQuery(params),
      sort: buildSortClause(params.orderBy),
      from: params.offset ?? 0,
      size: params.length ?? 50,
      track_total_hits: true,
    };

    const result = (await this.esRequest("_search", body)) as {
      took: number;
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
}

