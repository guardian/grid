/**
 * Elasticsearch Data Access Layer implementation.
 *
 * Queries ES via the Vite dev server proxy.
 * Connection config (base URL, index, safeguards) comes from es-config.ts.
 *
 * Safeguards (see kupua/exploration/docs/infra-safeguards.md):
 *   1. _source includes — only needed fields returned from responses
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
  IdRangeResult,
  TickerCountResult,
  CountWithTickersResult,
} from "./types";
import { parseCql } from "./adapters/elasticsearch/cql";
import type { PositionMap } from "./position-map";
import { POSITION_MAP_CHUNK_SIZE } from "./position-map";
import { MAX_RESULT_WINDOW, RANGE_CHUNK_SIZE } from "@/constants/tuning";
import guardianConfig from "@/lib/cost/guardian-config.json";
import type { GuardianCostConfig } from "@/lib/cost/types";
import { gridConfig } from "@/lib/grid-config";
import { devLog } from "@/lib/dev-log";
import {
  buildSortClause,
  reverseSortClause,
  parseSortField,
} from "./adapters/elasticsearch/sort-builders";
import { detectNullZoneCursor, remapNullZoneSortValues } from "./null-zone";
import {
  ES_BASE,
  ES_INDEX,
  SOURCE_EXCLUDES,
  SOURCE_INCLUDES,
  ALLOWED_ES_PATHS,
  ALLOWED_ES_METHODS,
  IS_LOCAL_ES,
  KNN_FIELD,
} from "./es-config";
import { getEmbedding } from "@/lib/bedrock-proxy-client";
import { MATCH_FIELDS } from "./adapters/elasticsearch/cql";

// ---------------------------------------------------------------------------
// Sentinel sanitiser — ES Long.MAX/MIN_VALUE → null
// ---------------------------------------------------------------------------
// ES uses Long.MAX_VALUE / Long.MIN_VALUE as internal sort sentinels for
// missing fields.  These can't survive a round-trip through search_after:
//   • Long.MAX_VALUE → JS float64 rounds to 9223372036854776000
//     (exceeds Long range → 400 "failed to parse date field")
//   • Long.MIN_VALUE → ES strips sign, tries Long.MAX_VALUE+1 → overflow → 400
//   • null → NPE in ES 8.x search_after (500)
// Sanitising to null at the adapter boundary lets the store's
// detectNullZoneCursor handle null-zone cursors correctly.
const ES_SENTINEL_ABS = 9.2e18; // well above any real epoch-millis (~4e12)
function sanitizeSortValues(sv: SortValues): SortValues {
  let changed = false;
  for (const v of sv) {
    if (typeof v === "number" && Math.abs(v) >= ES_SENTINEL_ABS) {
      changed = true;
      break;
    }
  }
  if (!changed) return sv;
  return sv.map((v) =>
    typeof v === "number" && Math.abs(v) >= ES_SENTINEL_ABS ? null : v,
  ) as SortValues;
}

// ---------------------------------------------------------------------------
// Sort-value comparison — used by getIdRange to detect toCursor overshoot
// ---------------------------------------------------------------------------

/**
 * Returns true if `hitSv` sorts STRICTLY AFTER `cursor` given `sortClause`.
 *
 * Null handling: ES default is `missing: "_last"` regardless of direction.
 * `buildSortClause` uses `missing: "_last"` explicitly for dateAddedToCollection
 * (matching the default), so null always sorts last for all our sort clauses.
 * Note: other code paths in this file (e.g. the two-phase null-zone seek
 * around line 1300) DO set `missing` direction-dependently — if a sort clause
 * built that way is ever fed into this helper, the null branch below will
 * need to become direction-aware.
 */
function sortValuesStrictlyAfter(
  hitSv: SortValues,
  cursor: SortValues,
  sortClause: Record<string, unknown>[],
): boolean {
  for (let i = 0; i < sortClause.length && i < hitSv.length && i < cursor.length; i++) {
    const { direction } = parseSortField(sortClause[i]);
    const h = hitSv[i];
    const c = cursor[i];

    if (h === c || (h == null && c == null)) continue;

    // null sorts last (ES missing: "_last" default) — direction-independent
    if (h == null) return true;
    if (c == null) return false;

    const cmp =
      typeof h === "string" && typeof c === "string"
        ? h.localeCompare(c)
        : (h as number) - (c as number);

    if (cmp === 0) continue;
    if (direction === "desc") return cmp < 0;
    return cmp > 0;
  }
  return false;
}

/**
 * Build the ES "free" filter — mirrors Grid's SearchFilters.freeFilter.
 *
 * freeFilter = freeSupplierFilter OR freeUsageRightsFilter
 *
 * freeUsageRightsFilter: category ∈ categories where defaultCost is Free or Conditional
 * freeSupplierFilter: (supplier ∈ freeSuppliers with exclusions, NOT in excluded collections)
 *                  OR (supplier ∈ freeSuppliers without exclusions)
 *
 * Source: media-api/app/lib/elasticsearch/SearchFilters.scala:26–47
 */
function buildFreeFilter(config: GuardianCostConfig): Record<string, unknown> {
  // Branch 1: categories with defaultCost of free or conditional
  const freeCategories = Object.entries(config.categoryDefaultCost)
    .filter(([, cost]) => cost === "free" || cost === "conditional")
    .map(([cat]) => cat);
  const categoryFilter = { terms: { "usageRights.category": freeCategories } };

  // Branch 2: free suppliers
  const suppliersWithExcl = config.freeSuppliers.filter(
    (s) => config.suppliersCollectionExcl[s]?.length,
  );
  const suppliersNoExcl = config.freeSuppliers.filter(
    (s) => !config.suppliersCollectionExcl[s]?.length,
  );

  const supplierFilters: Record<string, unknown>[] = [];

  // Suppliers with exclusions: must match supplier AND must NOT match excluded collection
  for (const supplier of suppliersWithExcl) {
    supplierFilters.push({
      bool: {
        must: { term: { "usageRights.supplier": supplier } },
        must_not: {
          terms: {
            "usageRights.suppliersCollection":
              config.suppliersCollectionExcl[supplier],
          },
        },
      },
    });
  }

  // Suppliers without exclusions: simple terms match
  if (suppliersNoExcl.length > 0) {
    supplierFilters.push({
      terms: { "usageRights.supplier": suppliersNoExcl },
    });
  }

  // Combine: category OR supplier(s)
  const should: Record<string, unknown>[] = [categoryFilter, ...supplierFilters];
  return { bool: { should, minimum_should_match: 1 } };
}

// Computed once at module load — inputs are static vendored JSON (guardian-config.json).
// Config changes require a full redeploy, so per-request recomputation is wasteful (audit F-02).
const FREE_FILTER = buildFreeFilter(guardianConfig as GuardianCostConfig);

// ---------------------------------------------------------------------------
// Syndication status filter builder
// ---------------------------------------------------------------------------
// Ports media-api's SyndicationFilter.scala to a client-side ES query builder.
// Five statuses, each producing a composite bool query against stored ES fields.
//
// Key design decisions:
// - "review" uses a date-range on leases.leases.endDate to detect expired
//   deny-syndication leases (option b). The Scala uses a Painless runtime field
//   (hasActiveDenySyndicationLease) as an additional correctness layer; we cannot
//   deploy Painless from the FE. Since MediaLeaseController enforces at most 1
//   deny-syndication lease per image, the de-correlation risk (plain object, not
//   nested) is negligible in practice. (See deviations.md, 07-syndication-and-leases.md §4.2)
// - leases.leases is a plain (non-nested) object field — plain term clauses work.
//   (Verified against PROD, 07-syndication-and-leases.md §3.2)
// - "review" syndicatableCategory + syndicationStartDate come from gridConfig.
// - useRuntimeFieldsToFixSyndicationReviewQueueQuery → skipped (FE can't deploy Painless).
// ---------------------------------------------------------------------------

/**
 * Build a composite ES filter for a `syndicationStatus` URL param value.
 * Returns null for unknown status values (caller should ignore/skip the filter).
 *
 * Mirrors: media-api/app/lib/elasticsearch/SyndicationFilter.scala#statusFilter
 *
 * @param syndicationStartDate - PROD-only upload-time cutoff (ISO string or null).
 *   Defaults to gridConfig.syndicationStartDate. Overridable for unit testing.
 *
 * Exported for unit testing only. Use via `buildQuery` → params.syndicationStatus.
 */
export function buildSyndicationStatusFilter(
  status: string,
  syndicationStartDate: string | null = gridConfig.syndicationStartDate,
): Record<string, unknown> | null {
  // ---- shared building blocks (mirrors SyndicationFilter.scala private vals) ----

  const hasRightsAcquired = {
    term: { "syndicationRights.rights.acquired": true },
  };
  // noRightsAcquired: field absent OR field = false
  const noRightsAcquired = {
    bool: {
      should: [
        {
          bool: {
            must_not: { exists: { field: "syndicationRights.rights.acquired" } },
          },
        },
        { term: { "syndicationRights.rights.acquired": false } },
      ],
      minimum_should_match: 1,
    },
  };

  const hasAllowSyndicationLease = {
    term: { "leases.leases.access": "allow-syndication" },
  };
  const hasDenySyndicationLease = {
    term: { "leases.leases.access": "deny-syndication" },
  };
  const hasSyndicationUsage = { term: { usagesPlatform: "syndication" } };

  // leaseHasStarted: startDate absent OR startDate <= now
  const leaseHasStarted = {
    bool: {
      should: [
        {
          bool: {
            must_not: { exists: { field: "leases.leases.startDate" } },
          },
        },
        { range: { "leases.leases.startDate": { lte: "now" } } },
      ],
      minimum_should_match: 1,
    },
  };

  // syndicationRightsPublished: published absent OR published <= now
  const syndicationRightsPublished = {
    bool: {
      should: [
        {
          bool: {
            must_not: { exists: { field: "syndicationRights.published" } },
          },
        },
        { range: { "syndicationRights.published": { lte: "now" } } },
      ],
      minimum_should_match: 1,
    },
  };

  // denySyndicationLeaseNotExpired (endDate absent OR endDate >= now)
  // Used in "review" must_not to exclude images with an active deny-syndication lease.
  const denySyndicationLeaseNotExpired = {
    bool: {
      should: [
        {
          bool: {
            must_not: { exists: { field: "leases.leases.endDate" } },
          },
        },
        { range: { "leases.leases.endDate": { gte: "now" } } },
      ],
      minimum_should_match: 1,
    },
  };

  // Syndicatable category: staff/contract/commissioned photographer
  // (mirrors IsOwnedPhotograph in IsQueryFilter.scala)
  const syndicatableCategory = {
    terms: { "usageRights.category": gridConfig.syndicatableCategories },
  };

  // ---- status dispatch ----

  switch (status) {
    case "unsuitable":
      return noRightsAcquired;

    case "sent":
      // rights acquired AND allow-syndication lease AND syndication usage
      return {
        bool: {
          filter: [hasRightsAcquired, hasAllowSyndicationLease, hasSyndicationUsage],
        },
      };

    case "queued":
      // rights acquired AND no syndication usage AND allow-syndication lease
      // AND lease has started AND syndicationRights published
      return {
        bool: {
          filter: [
            hasRightsAcquired,
            hasAllowSyndicationLease,
            leaseHasStarted,
            syndicationRightsPublished,
          ],
          must_not: [hasSyndicationUsage],
        },
      };

    case "blocked":
      // rights acquired AND deny-syndication lease (existence only, no date check at query level)
      return {
        bool: {
          filter: [hasRightsAcquired, hasDenySyndicationLease],
        },
      };

    case "review": {
      // rights acquired AND syndicatable category
      // AND NOT allow-syndication
      // AND NOT active deny-syndication (exists + not expired)
      // Optionally: AND uploadTime >= syndicationStartDate (PROD only, when configured)
      const hasActiveDenySyndication = {
        bool: {
          filter: [hasDenySyndicationLease, denySyndicationLeaseNotExpired],
        },
      };
      const rightsAcquiredNoLease = {
        bool: {
          filter: [hasRightsAcquired, syndicatableCategory],
          must_not: [hasAllowSyndicationLease, hasActiveDenySyndication],
        },
      };

      if (syndicationStartDate) {
        return {
          bool: {
            filter: [
              { range: { uploadTime: { gte: syndicationStartDate } } },
              rightsAcquiredNoLease,
            ],
          },
        };
      }
      return rightsAcquiredNoLease;
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Ticker aggregation helpers — build filter aggs for _doSearch and
// countWithTickers. Module-level so they have no class dependency.
// ---------------------------------------------------------------------------

/**
 * Build the `aggs` block for ticker filter aggregations.
 * Returns null when gridConfig.tickerDefinitions is empty (no-op).
 *
 * Each entry is a named `filter` agg whose query is compiled from the
 * definition's `searchClause` via parseCql. Optional sub-agg (by supplier)
 * is appended when `subAggField` is set.
 *
 * Mirrors ElasticSearch.scala aggregationsNameToSearchClauseMap.
 */
function buildTickerAggs(): Record<string, unknown> | null {
  const defs = gridConfig.tickerDefinitions;
  if (defs.length === 0) return null;

  const aggs: Record<string, unknown> = {};
  for (const def of defs) {
    const parsed = parseCql(def.searchClause);
    if (parsed.must.length === 0) continue;
    // Wrap multi-clause must in a bool; single clause used directly.
    const filter =
      parsed.must.length === 1
        ? parsed.must[0]
        : { bool: { must: parsed.must } };

    const aggEntry: Record<string, unknown> = { filter };
    if (def.subAggField) {
      // Sub-aggregation by e.g. usageRights.supplier (top 9 + other).
      // Mirrors termsAgg(name = "byAgency") in ElasticSearch.scala.
      aggEntry.aggs = {
        byAgency: { terms: { field: def.subAggField, size: 9 } },
      };
    }
    aggs[def.name] = aggEntry;
  }
  return Object.keys(aggs).length > 0 ? aggs : null;
}

// Computed once at module load — ticker definitions are static runtime config.
// parseCql() on static CQL strings produces the same result every call (audit F-03).
const TICKER_AGGS: Record<string, unknown> | null = buildTickerAggs();

/**
 * Parse ES filter aggregation results into TickerCountResult map.
 * Keyed by ticker name (matching keys in buildTickerAggs output).
 */
function parseTickerAggs(
  aggregations: Record<string, unknown>,
): Record<string, TickerCountResult> {
  const result: Record<string, TickerCountResult> = {};
  for (const def of gridConfig.tickerDefinitions) {
    const agg = aggregations[def.name] as Record<string, unknown> | undefined;
    if (!agg) continue;
    const value = agg.doc_count as number;
    if (def.subAggField) {
      const byAgency = agg.byAgency as {
        buckets: Array<{ key: string; doc_count: number }>;
        sum_other_doc_count: number;
      } | undefined;
      if (byAgency && byAgency.buckets.length > 0) {
        const subCounts: Record<string, number> = {};
        for (const bucket of byAgency.buckets) {
          subCounts[bucket.key] = bucket.doc_count;
        }
        if (byAgency.sum_other_doc_count > 0) {
          subCounts["other"] = byAgency.sum_other_doc_count;
        }
        result[def.name] = { value, subCounts };
      } else {
        result[def.name] = { value };
      }
    } else {
      result[def.name] = { value };
    }
  }
  return result;
}


// ---------------------------------------------------------------------------

function buildQuery(params: SearchParams): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];
  const mustNot: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];

  const queryStr = params.query ?? "";

  // Parse CQL query string into structured ES clauses
  if (queryStr) {
    const cql = parseCql(queryStr);
    must.push(...cql.must);
    mustNot.push(...cql.mustNot);
  }

  // Suppress soft-deleted images by default — mirrors Kahuna's Parser.scala behaviour
  // (appends -is:deleted to every query string). Applied at query-assembly here rather
  // than as string injection so the user's raw CQL flows into parseCql unmodified.
  // Exception: query contains "is:deleted" — user opted in to see deleted images.
  // Note: Kahuna gates `is:deleted` results behind a per-user `canViewDeletedImages`
  // permission check (uploadedBy match). Kupua has no auth context — all authenticated
  // users can see all deleted images. See deviations.md §26.
  if (!queryStr.includes("is:deleted")) {
    mustNot.push({ exists: { field: "softDeletedMetadata" } });
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
  //
  // Mirrors Grid's SearchFilters.freeFilter = freeSupplierFilter OR freeUsageRightsFilter.
  // Derived from vendored guardian-config.json so it doesn't drift from the
  // cost calculator's config. See SearchFilters.scala:38–47.
  if (params.nonFree !== "true") {
    filter.push(FREE_FILTER);
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

  // Syndication status — composite query builder porting SyndicationFilter.scala (SY-3)
  if (params.syndicationStatus) {
    const syndicationFilter = buildSyndicationStatusFilter(params.syndicationStatus);
    if (syndicationFilter) {
      filter.push(syndicationFilter);
    }
  }

  // Persisted — dead code: persisted is computed by the Archiver service, not stored in ES _source.
  // Removed in SY-0. Leaving the `params.persisted` field in SearchParams for now (SY-3+ may reuse).

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

  private assertReadOnly(path: string, method: string = "POST"): void {
    if (IS_LOCAL_ES) return; // no restrictions on local docker ES

    // Strict path matching: path must equal an allowed prefix exactly,
    // or continue with ? or / — prevents accidental prefix collisions
    // (e.g. a hypothetical "_search_shards" matching "_search").
    const pathAllowed = ALLOWED_ES_PATHS.some(
      (p) => path === p || path.startsWith(p + "?") || path.startsWith(p + "/"),
    );
    if (!pathAllowed) {
      throw new Error(
        `[Safeguard] Blocked ES request to "${path}" — only read operations ` +
          `(${ALLOWED_ES_PATHS.join(", ")}) are allowed on non-local ES. ` +
          `See kupua/exploration/docs/infra-safeguards.md`,
      );
    }

    // Method allowlist: only GET, POST, DELETE permitted.
    // DELETE is further restricted to _pit paths (closing a PIT snapshot).
    const upperMethod = method.toUpperCase();
    if (!ALLOWED_ES_METHODS.has(upperMethod)) {
      throw new Error(
        `[Safeguard] Blocked ES method "${method}" — only ${[...ALLOWED_ES_METHODS].join(", ")} are allowed.`,
      );
    }
    if (upperMethod === "DELETE" && !path.startsWith("_pit")) {
      throw new Error(
        `[Safeguard] DELETE is only allowed on _pit paths, not "${path}".`,
      );
    }
  }

  private async esRequest(
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const method = body ? "POST" : "GET";
    this.assertReadOnly(path, method);

    const url = `${ES_BASE}/${ES_INDEX}/${path}`;
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!response.ok) {
      let detail = "";
      try { detail = (await response.text()).slice(0, 500); } catch { /* best-effort */ }
      throw new Error(
        `ES request failed: ${response.status} ${url}` + (detail ? `\n${detail}` : ""),
      );
    }

    // Yield after JSON.parse to break the long task — lets the browser paint
    // between parsing the (often 1-2MB) ES response and the virtualizer's
    // synchronous scroll handler. Without this, JSON.parse + downstream React
    // work fuse into a single >150ms LoAF. See rendering-perf-plan.md §Issue F.
    const data = await response.json();
    await (scheduler?.yield?.() ?? new Promise(r => setTimeout(r, 0)));
    return data;
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
    const resolvedMethod = method ?? (body ? "POST" : "GET");
    this.assertReadOnly(path, resolvedMethod);

    const url = `${ES_BASE}/${path}`;
    const response = await fetch(url, {
      method: resolvedMethod,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!response.ok) {
      let detail = "";
      try { detail = (await response.text()).slice(0, 500); } catch { /* best-effort */ }
      throw new Error(
        `ES request failed: ${response.status} ${url}` + (detail ? `\n${detail}` : ""),
      );
    }

    // Same yield as esRequest — see comment above.
    const data = await response.json();
    await (scheduler?.yield?.() ?? new Promise(r => setTimeout(r, 0)));
    return data;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    // Cancel any in-flight search — only the latest one matters
    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();
    const { signal } = this.searchAbortController;

    return this._doSearch(params, signal, /* includeTickers */ true);
  }

  /**
   * Search without using the shared abort controller.
   * Range loads are additive and shouldn't cancel each other or cancel
   * search. Accepts an optional signal so the caller can abort.
   */
  async searchRange(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {
    // No ticker aggs on range loads — they're additive page-fills that don't
    // need counts (adding aggs to them wastes work).
    return this._doSearch(params, signal, /* includeTickers */ false);
  }

  private async _doSearch(params: SearchParams, signal?: AbortSignal, includeTickers = false): Promise<SearchResult> {

    const body: Record<string, unknown> = {
      query: buildQuery(params),
      sort: buildSortClause(params.orderBy),
      from: params.offset ?? 0,
      size: params.length ?? 50,
      track_total_hits: true,
    };

    // Inject ticker filter aggregations when requested.
    // Only on initial searches (search()), not on range fills (searchRange()).
    const tickerAggs = includeTickers ? TICKER_AGGS : null;
    if (tickerAggs) {
      body.aggs = tickerAggs;
    }

    // _source filtering — whitelist fields to reduce response size
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
        aggregations?: Record<string, unknown>;
      };

      return {
        hits: result.hits.hits.map((hit) => hit._source),
        total: result.hits.total.value,
        took: result.took,
        sortValues: result.hits.hits.map((hit) =>
          sanitizeSortValues(hit.sort ?? []),
        ),
        ...(tickerAggs && result.aggregations
          ? { tickerCounts: parseTickerAggs(result.aggregations) }
          : {}),
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

  async countWithTickers(params: SearchParams): Promise<CountWithTickersResult> {
    // Use _search with size:0 instead of _count so we can attach filter aggs.
    // Cost vs _count: negligible — the since: window typically has 0–20 docs,
    // and running 2 filter aggs over that set is sub-millisecond.
    const tickerAggs = TICKER_AGGS;
    const body: Record<string, unknown> = {
      query: buildQuery(params),
      size: 0,
      track_total_hits: true,
      ...(tickerAggs ? { aggs: tickerAggs } : {}),
    };
    const result = (await this.esRequest("_search", body)) as {
      hits: { total: { value: number } };
      aggregations?: Record<string, unknown>;
    };
    return {
      count: result.hits.total.value,
      tickerCounts: tickerAggs && result.aggregations
        ? parseTickerAggs(result.aggregations)
        : {},
    };
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

  async getFilterAggregations(
    params: SearchParams,
    filters: import("./types").FilterAggRequest[],
    signal?: AbortSignal,
  ): Promise<Record<string, number>> {
    if (filters.length === 0) return {};
    const aggs: Record<string, unknown> = {};
    for (const { name, query } of filters) {
      aggs[name] = { filter: query };
    }
    const body = { size: 0, query: buildQuery(params), aggs };
    const result = (await this.esRequest("_search", body, signal)) as {
      aggregations: Record<string, { doc_count: number }>;
    };
    const out: Record<string, number> = {};
    for (const { name } of filters) {
      out[name] = result.aggregations[name]?.doc_count ?? 0;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // search_after + PIT methods
  // ---------------------------------------------------------------------------

  async openPit(keepAlive: string = "1m"): Promise<string> {
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
    } catch {
      // PIT close failures are benign — PITs auto-expire after their
      // keep_alive period. Silencing to avoid constant console noise.
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
    sortOverride?: Record<string, unknown>[],
    extraFilter?: Record<string, unknown>,
  ): Promise<SearchAfterResult> {
    const sortClause = sortOverride ?? buildSortClause(params.orderBy);
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

    const baseQuery = buildQuery(params);
    const query = extraFilter
      ? { bool: { must: [baseQuery], filter: [extraFilter] } }
      : baseQuery;

    const body: Record<string, unknown> = {
      query,
      sort: effectiveSort,
      size: params.length ?? 200,
      // Only request an exact count on the initial search() call (trackTotalHits: true).
      // All extend/seek/fill calls omit the flag — ES skips the full-index scan.
      track_total_hits: params.trackTotalHits === true,
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
      body.pit = { id: pitId, keep_alive: "1m" };
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

      // PIT-based queries include an implicit `_shard_doc` tiebreaker that
      // makes `hit.sort` arrays longer than the explicit sort clause. Strip
      // the extra values so cursors stored in the search store (endCursor,
      // startCursor) never contain PIT-specific values. Without this, a
      // subsequent extend after PIT expiry would send a search_after cursor
      // that's longer than the sort clause, causing ES to return 400.
      const sortLen = effectiveSort.length;
      return {
        hits: orderedHits.map((hit) => hit._source),
        // hits.total is absent when track_total_hits: false — safe default to 0.
        total: result.hits.total?.value ?? 0,
        took: result.took,
        sortValues: orderedHits.map((hit) =>
          sanitizeSortValues(
            hit.sort.length > sortLen ? hit.sort.slice(0, sortLen) : hit.sort,
          ),
        ),
        pitId: result.pit_id,
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { hits: [], total: 0, sortValues: [] };
      }
      // PIT 404/410 — the PIT expired or was closed by a concurrent search().
      // Retry without PIT using the index-prefixed path. This loses snapshot
      // isolation but is far better than failing the seek entirely.
      if (pitId && e instanceof Error && /40[04]|410/.test(e.message)) {
        // If the caller has already aborted (e.g. search() closed the PIT
        // and started a new search), don't retry — the result would corrupt
        // the buffer by prepending stale data after the fresh search lands.
        if (signal?.aborted) return { hits: [], total: 0, sortValues: [] };
        console.warn("[ES] searchAfter: PIT expired/closed, retrying without PIT");
        delete body.pit;
        // PIT-based queries include an implicit `_shard_doc` tiebreaker in
        // sort values, making `search_after` cursors longer than the explicit
        // sort clause. Without PIT, ES rejects the length mismatch with 400.
        // Trim the cursor to match the sort clause length.
        if (Array.isArray(body.search_after) && body.search_after.length > effectiveSort.length) {
          body.search_after = (body.search_after as SortValues).slice(0, effectiveSort.length);
        }
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
            total: fallbackResult.hits.total?.value ?? 0,
            took: fallbackResult.took,
            sortValues: orderedHits.map((hit) =>
              sanitizeSortValues(
                // Belt-and-braces: match the main return path's slice so stored
                // cursors never grow to length-(N+1) if this path ever evolves
                // to retain PIT. Currently a no-op (non-PIT ES returns length-N).
                hit.sort.length > effectiveSort.length
                  ? hit.sort.slice(0, effectiveSort.length)
                  : hit.sort,
              ),
            ),
            // Explicit null signals the store to clear its stale PIT (audit #21).
            // Without this, `result.pitId ?? state.pitId` preserves the expired
            // PIT, causing every subsequent extend to 404 and retry — a cascade.
            pitId: null,
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

  // ---------------------------------------------------------------------------
  // AI / KNN search
  // ---------------------------------------------------------------------------

  /**
   * Semantic KNN search using Bedrock embeddings, with optional hybrid blending.
   *
   * 1. Extracts the `aiQuery:"<text>"` chip from params.query.
   * 2. Fetches a 256-float embedding from the Bedrock proxy (/bedrock/embed).
   * 3. Builds the remaining CQL + URL params as a pre-filter.
   * 4. Depending on vecWeight:
   *    - 1.0 (default): pure KNN query with pre-filter
   *    - 0.0: pure BM25 multi_match on the AI text
   *    - between: hybrid — probe for maxBm25Score, then bool.should[multiMatch, knn]
   *
   * Returns a flat ≤200 result set where `total === hits.length` (the critical
   * invariant that prevents the store from opening PITs or triggering
   * scroll-mode fill or position-map fetch). See zz Archive/ai-search-workplan.md §9.2.
   */
  async searchByAi(params: SearchParams, signal?: AbortSignal): Promise<SearchAfterResult> {
    const aiText = params.aiQuery;

    // If no aiQuery param, fall back to a regular first-page search.
    // This is a defensive guard — the store should only call searchByAi
    // when the param is present, so this path should not be hit in practice.
    if (!aiText) {
      return this.searchAfter(params, null, null, signal);
    }

    // Parse vecWeight — default 1.0 (pure KNN, matches Kahuna default).
    const rawVec = parseFloat(params.vecWeight ?? "1");
    const vecWeight = Math.max(0, Math.min(1, Number.isNaN(rawVec) ? 1 : rawVec));

    // Fetch the embedding for the AI query text (skipped for pure BM25 path).
    // Throws on Bedrock error — propagates to search() catch block which
    // sets loading:false + error state. The store's error handling shows
    // a toast via the existing error display path.
    const embedding = vecWeight > 0 ? await getEmbedding(aiText, signal) : null;

    // Build the pre-filter from the CQL query + URL params.
    // buildQuery() returns { bool: { must, mustNot, filter } } which is
    // exactly the shape ES knn.filter accepts. See zz Archive/ai-search-workplan.md §3.1.
    const preFilter = buildQuery(params);

    const k = 200;
    let body: Record<string, unknown>;

    if (vecWeight === 1.0) {
      // Pure KNN — current behaviour, no BM25 signal.
      body = {
        knn: {
          field: KNN_FIELD,
          query_vector: embedding,
          k,
          num_candidates: Math.max(k * 2, 400),
          filter: preFilter,
        },
        size: k,
        track_total_hits: false,
      };
    } else if (vecWeight === 0) {
      // Pure BM25 via the AI path — no vector, just keyword matching on AI text.
      body = {
        query: {
          bool: {
            must: [{
              multi_match: {
                query: aiText,
                fields: MATCH_FIELDS,
                type: "best_fields" as const,
                operator: "and",
                fuzziness: "AUTO",
              },
            }],
            filter: [preFilter],
          },
        },
        size: k,
        track_total_hits: false,
      };
    } else {
      // Hybrid — probe for max BM25 score, then blend KNN + multi_match.
      const probeBody = {
        query: {
          multi_match: {
            query: aiText,
            fields: MATCH_FIELDS,
            type: "best_fields" as const,
            operator: "and",
            fuzziness: "AUTO",
          },
        },
        size: 0,
        track_total_hits: false,
      };
      const probeResult = (await this.esRequest("_search", probeBody, signal)) as {
        hits: { max_score: number | null };
      };
      const maxScore = probeResult.hits.max_score ?? 1.0;
      const scalingFactor = maxScore > 0 ? 1.0 / maxScore : 1.0;
      const lexicalWeight = 1 - vecWeight;
      const multiMatchBoost = (lexicalWeight / vecWeight) * scalingFactor;

      body = {
        query: {
          bool: {
            should: [
              {
                multi_match: {
                  query: aiText,
                  fields: MATCH_FIELDS,
                  type: "best_fields" as const,
                  operator: "and",
                  fuzziness: "AUTO",
                  boost: multiMatchBoost,
                },
              },
              {
                knn: {
                  field: KNN_FIELD,
                  query_vector: embedding,
                  num_candidates: Math.max(k * 2, 400),
                },
              },
            ],
            filter: [preFilter],
          },
        },
        size: k,
        track_total_hits: false,
      };
    }

    if (SOURCE_INCLUDES.length > 0 || SOURCE_EXCLUDES.length > 0) {
      body._source = {
        ...(SOURCE_INCLUDES.length > 0 ? { includes: SOURCE_INCLUDES } : {}),
        ...(SOURCE_EXCLUDES.length > 0 ? { excludes: SOURCE_EXCLUDES } : {}),
      };
    }

    const result = (await this.esRequest("_search", body, signal)) as {
      took?: number;
      hits: {
        total?: { value: number };
        hits: Array<{ _id: string; _source: Image; _score: number }>;
      };
    };

    const rawHits = result.hits.hits;
    // Attach __aiScore (kupua-internal; not from ES _source) for relevance sort in Phase 1c.
    const images: Image[] = rawHits.map((h) => ({
      ...h._source,
      __aiScore: h._score,
    }));

    // Synthetic sort values — descending score index + id tiebreaker.
    // Stored as cursors for store compatibility but never used for pagination
    // (total === hits.length prevents any extend/seek from firing).
    const sortValues: SortValues[] = images.map((img, i) => [k - i, img.id]);

    return {
      hits: images,
      total: images.length, // KEY invariant: no pagination triggered
      took: result.took,
      sortValues,
      pitId: null,
    };
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
    //
    // NULL HANDLING (missing: "_last"):
    // ES puts docs with missing values at the END of the sort (both asc
    // and desc). So for desc sort:
    //   - Non-null values come first (sorted descending)
    //   - Null values come last
    // A doc with null sorts AFTER all non-null docs. So "before" a null
    // doc means: all non-null docs (exists), plus null docs whose
    // subsequent sort values are "less". For equality on null fields,
    // we use must_not:exists (both are null → "equal").

    const baseQuery = buildQuery(params);
    const should: Record<string, unknown>[] = [];

    for (let i = 0; i < sortClause.length && i < sortValues.length; i++) {
      const clause = sortClause[i];
      const value = sortValues[i];

      // Extract field name and direction from the sort clause
      const { field, direction } = parseSortField(clause);
      if (!field) continue;

      // Build the equality conditions for all preceding fields
      const equalityConditions: Record<string, unknown>[] = [];
      for (let j = 0; j < i; j++) {
        const prevClause = sortClause[j];
        const prevValue = sortValues[j];
        const prev = parseSortField(prevClause);
        if (!prev.field) continue;

        if (prevValue == null) {
          // Previous field is null → "equal" means the other doc also has
          // null for this field → must_not exists
          equalityConditions.push({
            bool: { must_not: { exists: { field: prev.field } } },
          });
        } else {
          equalityConditions.push({
            range: { [prev.field]: { gte: prevValue, lte: prevValue } },
          });
        }
      }

      if (value == null) {
        // Current field is null. With missing: "_last", ALL docs that have
        // a value for this field sort before any null doc — regardless of
        // the sort direction. So "strictly before" = field exists.
        //
        // But only within the partition defined by preceding equalities.
        // E.g. for sort [lastModified desc, uploadTime desc, id asc]:
        //   Level 0 (lastModified=null): all docs with lastModified exists
        //   Level 1 (uploadTime=X, given lastModified=null): impossible —
        //     if we're at level 1, lastModified equality already narrowed
        //     to null docs, and uploadTime is non-null (value != null
        //     would be the next iteration).
        const existsCondition: Record<string, unknown> = {
          exists: { field },
        };

        if (equalityConditions.length === 0) {
          should.push(existsCondition);
        } else {
          should.push({
            bool: {
              must: [...equalityConditions, existsCondition],
            },
          });
        }
      } else {
        // Non-null value: standard range comparison
        // "Before" in desc order means >, in asc order means <
        const rangeOp = direction === "desc" ? "gt" : "lt";
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
          devLog(
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
            devLog(
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
          devLog(
            `[ES] findKeywordSortValue: no more pages at page ${page} ` +
            `(${Date.now() - startTime}ms, cumulative=${cumulative}, ` +
            `target=${targetPosition}). Returning lastKeywordValue.`,
          );
          return lastKeywordValue;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        console.warn("[ES] findKeywordSortValue failed:", e);
        return lastKeywordValue;
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

    devLog(
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
   *   > 2 years   → month buckets (~180 for 15 years)
   *   2d–730d     → day buckets
   *   25h–2d      → hour buckets (~48 for 2 days)
   *   12h–25h     → 30-minute buckets (~48 for 24 hours)
   *   3h–12h      → 10-minute buckets (~72 for 12 hours)
   *   < 3h        → 5-minute buckets (~36 for 3 hours)
   *
   * Returns buckets in sort order (asc or desc) with cumulative start
   * positions, matching the SortDistribution structure used by keyword sorts.
   */
  async getDateDistribution(
    params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    signal?: AbortSignal,
    extraFilter?: Record<string, unknown>,
  ): Promise<SortDistribution | null> {
    const startTime = Date.now();

    // First, get the min/max of the field to choose the right interval.
    // stats agg is very cheap on date fields (~5ms).
    const baseQuery = buildQuery(params);
    const query = extraFilter
      ? { bool: { must: [baseQuery], filter: [extraFilter] } }
      : baseQuery;
    const statsBody: Record<string, unknown> = {
      size: 0,
      query,
      aggs: { range: { stats: { field } } },
      track_total_hits: false,
    };

    let interval: string;
    let spanMs: number;
    let statsTimeMs: number;
    try {
      const statsResult = (await this.esRequest("_search", statsBody, signal)) as {
        aggregations?: { range?: { min: number; max: number; count: number } };
      };
      statsTimeMs = Date.now() - startTime;
      const stats = statsResult.aggregations?.range;
      if (!stats) return null;
      if (stats.count === 0) return { buckets: [], coveredCount: 0 };

      spanMs = Math.abs(stats.max - stats.min);
      const MS_PER_DAY = 86_400_000;
      if (spanMs > 2 * 365 * MS_PER_DAY) {
        interval = "month";          // ~180 buckets for 15 years
      } else if (spanMs > 2 * MS_PER_DAY) {
        interval = "day";            // ~60 buckets for 2 months
      } else if (spanMs > 25 * 3600_000) {
        interval = "hour";           // ~48 buckets for 2 days
      } else if (spanMs > 12 * 3600_000) {
        interval = "30m";            // ~48 buckets for 24 hours
      } else if (spanMs > 3 * 3600_000) {
        interval = "10m";            // ~72 buckets for 12 hours
      } else {
        interval = "5m";             // ~36 buckets for 3 hours
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.warn("[ES] getDateDistribution stats failed:", e);
      return null;
    }

    // Now fetch the histogram.
    // calendar_interval for month/day/hour (variable-length);
    // fixed_interval for sub-hour (30m, 10m, 5m — calendar_interval doesn't support these).
    const isCalendar = ["month", "day", "hour"].includes(interval);
    const histogramConfig: Record<string, unknown> = {
      field,
      min_doc_count: 1, // skip empty buckets
      order: { _key: direction },
    };
    if (isCalendar) {
      histogramConfig.calendar_interval = interval;
    } else {
      histogramConfig.fixed_interval = interval;
    }
    const body: Record<string, unknown> = {
      size: 0,
      query,
      aggs: {
        timeline: {
          date_histogram: histogramConfig,
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

      const histTimeMs = Date.now() - startTime - statsTimeMs;
      // Rough payload estimate: ~60 bytes per bucket (key_as_string + doc_count JSON)
      const payloadEstKB = Math.round(esBuckets.length * 60 / 1024);
      const spanDesc = spanMs > 86_400_000
        ? `${(spanMs / 86_400_000).toFixed(1)}d`
        : `${(spanMs / 3_600_000).toFixed(1)}h`;

      devLog(
        `[ES] getDateDistribution: ${field} ${direction} ${interval} — ` +
        `${buckets.length} buckets, ${cumulative} docs covered, ` +
        `span ${spanDesc}. Stats ${statsTimeMs}ms + hist ${histTimeMs}ms = ${Date.now() - startTime}ms total. ` +
        `~${payloadEstKB}KB payload.`,
      );

      return { buckets, coveredCount: cumulative };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.warn("[ES] getDateDistribution failed:", e);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Position map — lightweight full-index fetch (_source: false)
  // ---------------------------------------------------------------------------

  /**
   * Fetch a lightweight position index for all results.
   *
   * Opens a **dedicated PIT** (decoupled from the main search PIT lifecycle),
   * then walks the entire result set via `search_after` in 10k-doc chunks
   * with `_source: false` — only `_id` and `sort` values are returned.
   *
   * The dedicated PIT is closed when done (or on abort/error).
   *
   * Yields between chunks (`scheduler.yield()`) to avoid blocking the main
   * thread for >500ms (same pattern as `_fillBufferForScrollMode`).
   *
   * @returns Complete position map, or `null` if aborted/failed.
   */
  async fetchPositionIndex(
    params: SearchParams,
    signal: AbortSignal,
  ): Promise<PositionMap | null> {
    const startTime = Date.now();
    const bareSortClause = buildSortClause(params.orderBy);
    const sortLen = bareSortClause.length;
    const baseQuery = buildQuery(params);

    // --- Null-zone–safe two-phase fetch ---
    //
    // ES uses Long.MAX/MIN_VALUE as internal sort sentinels for missing
    // fields.  These can't survive a round-trip through search_after:
    //   • Long.MAX_VALUE → JS float64 rounds to 9223372036854776000
    //     (exceeds Long range → 400 "failed to parse date field")
    //   • Long.MIN_VALUE → ES strips the sign, tries to parse
    //     9223372036854775808 as Long → overflow → 400
    //   • null → NPE in ES 8.x search_after (500)
    //
    // The only safe strategy is to never encounter a sentinel in the cursor.
    // We split the fetch into two phases — docs WITH the primary field,
    // then docs WITHOUT it — so each phase has clean cursor values.
    // See: https://github.com/opensearch-project/OpenSearch/issues/XXXXX

    const { field: primaryField } =
      parseSortField(bareSortClause[0]);

    // Phase 1 sort: explicit `missing` (matches ES defaults, required so
    // ES doesn't reject null cursors if the field is unexpectedly absent).
    const phase1Sort = bareSortClause.map((clause) => {
      const { field, direction } = parseSortField(clause);
      if (!field) return clause;
      return {
        [field]: {
          order: direction,
          missing: direction === "asc" ? "_last" : "_first",
        },
      };
    });

    // Phase 2 sort: only the non-primary fields (uploadTime, id).
    // Null-zone docs have no primary value, so we sort by the fallback.
    const phase2BareSort = primaryField
      ? bareSortClause.filter(
          (c) => parseSortField(c).field !== primaryField,
        )
      : [];
    const phase2Sort = phase2BareSort.map((clause) => {
      const { field, direction } = parseSortField(clause);
      if (!field) return clause;
      return { [field]: { order: direction } };
    });
    const phase2SortLen = phase2BareSort.length;

    // Inject null at the primary-field position in stored sortValues for
    // null-zone docs, so `detectNullZoneCursor` handles seeks correctly.
    // E.g. [uploadTimeVal, idVal] → [null, uploadTimeVal, idVal].
    const injectNullPrimary = (sv: SortValues): SortValues => {
      const out: SortValues = [];
      let si = 0;
      for (const clause of bareSortClause) {
        const { field } = parseSortField(clause);
        if (field === primaryField) {
          out.push(null);
        } else if (si < sv.length) {
          out.push(sv[si++]);
        }
      }
      return out;
    };

    // Phase 1 query: base + exists filter (non-null docs only).
    // Phase 2 query: base + must_not-exists filter (null-zone docs only).
    const phase1Query = primaryField
      ? {
          bool: {
            must: [baseQuery],
            filter: [{ exists: { field: primaryField } }],
          },
        }
      : baseQuery;
    const phase2Query = primaryField
      ? {
          bool: {
            must: [baseQuery],
            filter: [
              { bool: { must_not: [{ exists: { field: primaryField } }] } },
            ],
          },
        }
      : null;

    // Open a dedicated PIT for this fetch — fully decoupled from main search.
    let pitId: string;
    try {
      pitId = await this.openPit("1m");
    } catch (e) {
      if (signal.aborted) return null;
      console.warn("[ES] fetchPositionIndex: failed to open PIT:", e);
      return null;
    }

    if (signal.aborted) {
      this.closePit(pitId);
      return null;
    }

    const ids: string[] = [];
    const sortValues: SortValues[] = [];

    // Reusable chunk-fetch loop shared by both phases.
    const fetchChunks = async (
      chunkQuery: Record<string, unknown>,
      chunkSort: Record<string, unknown>[],
      chunkSortLen: number,
      mapSv?: (sv: SortValues) => SortValues,
    ) => {
      let cursor: SortValues | null = null;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        const body: Record<string, unknown> = {
          query: chunkQuery,
          sort: chunkSort,
          // size must respect max_result_window on all pages —
          // search_after does NOT bypass the limit in ES 8.x.
          size: Math.min(POSITION_MAP_CHUNK_SIZE, MAX_RESULT_WINDOW),
          _source: false,
          track_total_hits: true,
          pit: { id: pitId, keep_alive: "1m" },
        };
        const requestedSize = body.size as number;

        if (cursor) {
          body.search_after = cursor;
        }

        const result = (await this.esRequestRaw("_search", body, signal)) as {
          took?: number;
          pit_id?: string;
          hits: {
            total: { value: number };
            hits: Array<{ _id: string; sort: SortValues }>;
          };
        };

        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        // Update PIT ID if ES refreshed it
        if (result.pit_id) {
          pitId = result.pit_id;
        }

        const hits = result.hits.hits;
        if (hits.length === 0) break;

        for (const hit of hits) {
          ids.push(hit._id);
          // Strip PIT's implicit _shard_doc tiebreaker from sort values.
          const raw =
            hit.sort.length > chunkSortLen
              ? hit.sort.slice(0, chunkSortLen)
              : hit.sort;
          sortValues.push(mapSv ? mapSv(raw) : raw);
        }

        cursor = hits[hits.length - 1].sort;

        devLog(
          `[ES] fetchPositionIndex: ` +
          `${ids.length} entries so far (${Date.now() - startTime}ms)`,
        );

        // Last chunk — fewer hits than requested means no more data
        if (hits.length < requestedSize) break;

        // Yield to main thread between chunks to avoid long-task jank
        await (scheduler?.yield?.() ?? new Promise<void>((r) => setTimeout(r, 0)));
      }
    };

    try {
      // Non-null docs first, null-zone docs last — matching ES default
      // `missing: "_last"` used by the main search (which omits explicit
      // `missing`, relying on the ES default for all directions).
      await fetchChunks(phase1Query, phase1Sort, sortLen);
      if (phase2Query) {
        await fetchChunks(
          phase2Query, phase2Sort, phase2SortLen, injectNullPrimary,
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.warn("[ES] fetchPositionIndex failed:", e);
      return null;
    } finally {
      // Always close the dedicated PIT — fire and forget
      this.closePit(pitId);
    }

    if (ids.length === 0) return null;

    devLog(
      `[ES] fetchPositionIndex: complete — ${ids.length} entries in ` +
      `${Date.now() - startTime}ms`,
    );

    return { length: ids.length, ids, sortValues };
  }

  // ---------------------------------------------------------------------------
  // Multi-selection methods (Phase S0)
  // ---------------------------------------------------------------------------

  async getByIds(ids: string[], signal?: AbortSignal): Promise<Image[]> {
    if (ids.length === 0) return [];
    if (signal?.aborted) return [];

    // Batch into 1,000-ID chunks and run ALL chunks in parallel.
    // Sequential at 5k IDs = 5 round trips × ~100ms = 500ms before
    // any results; parallel = single round-trip latency.
    const BATCH_SIZE = 1_000;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      chunks.push(ids.slice(i, i + BATCH_SIZE));
    }

    // Pass _source_includes as a URL query parameter rather than repeating
    // per-doc in the body. With 45 fields × 1000 docs the per-doc approach
    // pushes the body over nginx's 1MB default limit → 413.
    const mgetPath =
      SOURCE_INCLUDES.length > 0
        ? `_mget?_source_includes=${SOURCE_INCLUDES.map(encodeURIComponent).join(",")}`
        : "_mget";

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const body: Record<string, unknown> = {
          docs: chunk.map((id) => ({ _id: id })),
        };

        try {
          const result = (await this.esRequest(mgetPath, body, signal)) as {
            docs: Array<{
              _id: string;
              found: boolean;
              _source?: Image;
            }>;
          };
          return result.docs
            .filter((doc) => doc.found && doc._source != null)
            .map((doc) => doc._source!);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return [];
          throw e;
        }
      }),
    );

    return results.flat();
  }

  /**
   * Walk documents between two sort cursors and return their IDs.
   *
   * Architecture: Option C — delegates to this.searchAfter() which handles
   * sentinel sanitisation on all return paths. Detects null-zone crossings
   * via detectNullZoneCursor and switches to phase-2 automatically.
   * This eliminates the raw _search loop and _sortValuesStrictlyAfter helper.
   */
  async getIdRange(
    params: SearchParams,
    fromCursor: SortValues,
    toCursor: SortValues,
    signal?: AbortSignal,
  ): Promise<IdRangeResult> {
    const sortClause = buildSortClause(params.orderBy);
    const collectedIds: string[] = [];
    let cursor: SortValues = fromCursor;
    let walked = 0;
    let truncated = false;

    // Read dynamically (same pattern as findKeywordSortValue / BUCKET_SIZE)
    // so vi.stubEnv() works in tests without module re-import.
    const hardCap = Number(import.meta.env.VITE_RANGE_HARD_CAP ?? 5_000);
    const hardCapPlusOne = hardCap + 1;

    // The sort clause always ends with {id: "asc"} — the last sort value
    // for each hit IS the document ID. This lets us extract IDs from
    // sortValues without needing _source.
    const idIdx = sortClause.findIndex((c) => Object.keys(c)[0] === "id");

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal?.aborted) break;

      // Detect null-zone cursor — if the primary sort field is null in the
      // cursor, we must narrow the query and sort to the fallback fields.
      const nz = detectNullZoneCursor(cursor, params.orderBy);

      const result = await this.searchAfter(
        { ...params, length: RANGE_CHUNK_SIZE },
        nz ? nz.strippedCursor : cursor,
        null, // no PIT — getIdRange is a one-shot walk
        signal,
        false, // reverse
        true,  // noSource — only IDs needed
        false, // missingFirst
        nz?.sortOverride,
        nz?.extraFilter,
      );

      if (signal?.aborted) break;
      if (result.hits.length === 0) break;

      // Remap sort values from null-zone shape back to full sort clause shape
      let sortValues = result.sortValues;
      if (nz && sortValues.length > 0) {
        sortValues = remapNullZoneSortValues(sortValues, nz.sortClause, nz.primaryField);
      }

      // Process hits — check each against toCursor and extract ID from sort values
      for (let i = 0; i < sortValues.length; i++) {
        walked++;
        const sv = sortValues[i];

        // Stop as soon as a hit sorts strictly past toCursor
        if (sortValuesStrictlyAfter(sv, toCursor, sortClause)) {
          return { ids: collectedIds, truncated: false, walked };
        }

        const docId = sv[idIdx] as string;
        collectedIds.push(docId);

        if (collectedIds.length >= hardCapPlusOne) {
          truncated = true;
          return { ids: collectedIds.slice(0, hardCap), truncated, walked };
        }
      }

      // Update cursor for next page — use the last sort value (already sanitised)
      const lastSv = sortValues[sortValues.length - 1];
      if (!lastSv) break;
      cursor = lastSv;

      // Fewer hits than requested → last page... UNLESS the cursor just
      // crossed into the null zone. When `nz` was null (no null-zone filter
      // active) but the new cursor has a null primary field, the populated
      // zone is exhausted but null-zone docs may still be in range. The next
      // iteration will detect the null-zone cursor and issue a phase-2 query.
      if (result.hits.length < RANGE_CHUNK_SIZE) {
        const crossedIntoNullZone = !nz && detectNullZoneCursor(cursor, params.orderBy) != null;
        if (!crossedIntoNullZone) break;
      }
    }

    return { ids: collectedIds, truncated, walked };
  }
}


