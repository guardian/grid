/**
 * ApiDataSource — Kupua's ordered image reads through media-api (VITE_USE_MEDIA_API=true).
 *
 * Pages, ranks, sort profiles, position maps, range walks, counts and aggregations use media-api's
 * POST endpoints; standalone images use GET /images/:id.
 * Walk loops and their caps stay here; each call is one bounded server read. No PIT is opened.
 * Migrated reads never fall back to Elasticsearch. Reads not yet migrated use the development
 * fallback listed in DEVELOPMENT_FALLBACK_METHODS, which shrinks to empty as the build proceeds.
 */

import type {
  AggregationRequest,
  AggregationsResult,
  CountWithTickersResult,
  FilterAggRequest,
  ImageDataSource,
  IdRangeResult,
  ImageByIdResult,
  SearchAfterResult,
  SearchParams,
  SearchResult,
  SortDistBucket,
  SortDistribution,
  SortValues,
  TickerCountResult,
  UsageFilterAggRequest,
} from "./types";
import type { PositionMap } from "./position-map";
import { POSITION_MAP_CHUNK_SIZE } from "./position-map";
import { buildSortClause } from "./adapters/elasticsearch/sort-builders";
import { chooseDateHistogramInterval, sortValuesStrictlyAfter } from "./es-adapter";
import { apiGetImage, apiImageWindow, apiSearchAfter, buildReadBody, postImageRead, SearchAfterApiError } from "./grid-api-search-adapter";
import { MAX_RESULT_WINDOW, RANGE_CHUNK_SIZE } from "@/constants/tuning";

/** media-api's window refuses start offsets at or above this; deeper positions use cursor reads. */
export const API_WINDOW_OFFSET_LIMIT = 10_000;

/** Reads still served by the development fallback until later build units migrate them. */
export const DEVELOPMENT_FALLBACK_METHODS = [
  "getByIds", "searchByAi",
] as const;

type KeywordPage = { buckets: Array<{ key: string | number; count: number }>; after: string | number | null; coveredCount?: number };
type KeyPage = { keys: Array<{ id: string; sortValues: SortValues }>; after: SortValues | null };
type DateStats = { valueCount: number; min: number | null; max: number | null; coveredCount?: number };
type DateBuckets = { buckets: SortDistBucket[]; positionKind: "exact-rank" | "approximate-evidence"; evidenceCount: number };
type CountResponse = { total: number; tickerCounts: Record<string, TickerCountResult> };
type AggregationsResponse = {
  fields: Record<string, { buckets: Array<{ key: string; count: number }> }>;
  isFilterCounts: Record<string, number>;
};

/** Grid's per-image copies of the nested usage values, so plain terms count images rather than usages. */
const USAGE_ROLLUP_FIELDS: Record<UsageFilterAggRequest["subField"], string> = {
  platform: "usagesPlatform",
  status: "usagesStatus",
};
const USAGE_ROLLUP_SIZE = 20;
const DEFAULT_AGGREGATION_SIZE = 10;

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

// Refusals, incomplete reads and an unreachable media-api are quiet absence for optional data.
function warnIfUnexpected(label: string, error: unknown, signal?: AbortSignal): void {
  if (isCancellation(error, signal) || error instanceof SearchAfterApiError) return;
  console.warn(label, error);
}

function yieldToMain(): Promise<void> {
  return typeof scheduler !== "undefined" && scheduler.yield
    ? scheduler.yield()
    : new Promise((resolve) => setTimeout(resolve, 0));
}

export class ApiDataSource implements ImageDataSource {
  readonly offsetReadLimit = API_WINDOW_OFFSET_LIMIT;
  searchByAi?: ImageDataSource["searchByAi"];

  constructor(private readonly developmentFallback: ImageDataSource) {
    if (developmentFallback.searchByAi) this.searchByAi = developmentFallback.searchByAi.bind(developmentFallback);
  }

  getByIds(...a: Parameters<ImageDataSource["getByIds"]>) { return this.developmentFallback.getByIds(...a); }

  async getAggregations(
    params: SearchParams,
    fields: AggregationRequest[],
    signal?: AbortSignal,
    isFilters?: FilterAggRequest[],
    usageFilters?: UsageFilterAggRequest[],
  ): Promise<AggregationsResult> {
    const t0 = Date.now();
    const sizes = new Map<string, number>();
    const request = (field: string, size: number) => sizes.set(field, Math.max(sizes.get(field) ?? 0, size));
    for (const { field, size } of fields) request(field, size ?? DEFAULT_AGGREGATION_SIZE);
    for (const { subField } of usageFilters ?? []) request(USAGE_ROLLUP_FIELDS[subField], USAGE_ROLLUP_SIZE);
    const isValues = [...new Set((isFilters ?? []).map((f) => f.isFilter))];

    const body = buildReadBody(params);
    delete body.sort;
    const json = await postImageRead("/images/aggregations", {
      ...body,
      fields: [...sizes].map(([field, size]) => ({ field, size })),
      ...(isValues.length > 0 ? { isFilters: isValues } : {}),
    }, signal) as AggregationsResponse;

    const bucketsOf = (field: string) => json.fields[field]?.buckets ?? [];
    return {
      fields: Object.fromEntries(fields.map(({ field }) => [field, { buckets: bucketsOf(field) }])),
      ...(isFilters?.length
        ? { filters: Object.fromEntries(isFilters.map(({ name, isFilter }) => [name, json.isFilterCounts[isFilter] ?? 0])) }
        : {}),
      ...(usageFilters?.length
        ? {
            usageFilters: Object.fromEntries(usageFilters.map(({ name, subField, value }) => [
              name, bucketsOf(USAGE_ROLLUP_FIELDS[subField]).find((b) => b.key === value)?.count ?? 0,
            ])),
          }
        : {}),
      fetchDuration: Date.now() - t0,
    };
  }

  async count(params: SearchParams): Promise<number> {
    return (await this.countWithTickers(params)).count;
  }

  async countWithTickers(params: SearchParams): Promise<CountWithTickersResult> {
    const body = buildReadBody(params);
    delete body.sort;
    const json = await postImageRead("/images/count", body) as CountResponse;
    const tickerCounts: Record<string, TickerCountResult> = {};
    for (const [name, { value, subCounts }] of Object.entries(json.tickerCounts)) {
      tickerCounts[name] = subCounts ? { value, subCounts } : { value };
    }
    return { count: json.total, tickerCounts };
  }

  async openPit(_keepAlive?: string): Promise<string | null> {
    return null;
  }

  async closePit(_pitId: string): Promise<void> {}

  getById(id: string, signal?: AbortSignal): Promise<ImageByIdResult | undefined> {
    return apiGetImage(id, signal);
  }

  searchRange(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {
    return this.searchAfter(params, null, null, signal);
  }

  async searchAfter(
    params: SearchParams,
    searchAfterValues: SortValues | null,
    pitId?: string | null,
    signal?: AbortSignal,
    reverse?: boolean,
    seekToEnd?: boolean,
  ): Promise<SearchAfterResult> {
    const read = (pit: string | null | undefined) =>
      !searchAfterValues && !reverse && !seekToEnd && (params.offset ?? 0) > 0
        ? apiImageWindow(params, pit, signal)
        : apiSearchAfter(params, searchAfterValues, pit, signal, reverse, seekToEnd);
    try {
      return await read(pitId);
    } catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof SearchAfterApiError) || error.kind !== "pit-expired" || !pitId) throw error;
      const result = await read(null);
      return { ...result, pitId: null };
    }
  }

  async countBefore(params: SearchParams, sortValues: SortValues, signal?: AbortSignal): Promise<number> {
    const json = await postImageRead("/images/rank", { ...buildReadBody(params), sortValues }, signal) as { rank: number };
    return json.rank;
  }

  async estimateSortValue(
    params: SearchParams,
    field: string,
    percentile: number,
    signal?: AbortSignal,
    scope?: Array<{ field: string; value: string }>,
  ): Promise<number | null> {
    try {
      const json = await this.sortProfile<{ value: number | null }>(params, {
        operation: "scalar-anchor", field, percentile, ...(scope && scope.length > 0 ? { scope } : {}),
      }, signal);
      return json.value != null && Number.isFinite(json.value) ? json.value : null;
    } catch (e) {
      if (isCancellation(e, signal)) return null;
      warnIfUnexpected("[api] estimateSortValue failed:", e, signal);
      return null;
    }
  }

  async findKeywordSortValue(
    params: SearchParams,
    field: string,
    targetPosition: number,
    _direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<string | null> {
    // Same walk and caps as the direct-ES adapter; the server derives direction from the sort.
    const size = Number(import.meta.env.VITE_KEYWORD_SEEK_BUCKET_SIZE ?? 10_000);
    const MAX_PAGES = 50;
    const TIME_CAP_MS = 8_000;
    const startTime = Date.now();
    let cumulative = 0;
    let after: string | number | null = null;
    let lastKeywordValue: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (signal?.aborted) return null;
      if (page > 0 && Date.now() - startTime > TIME_CAP_MS) {
        console.warn(`[api] findKeywordSortValue: time cap hit after ${page} pages; returning an approximate value.`);
        return lastKeywordValue;
      }

      let result: KeywordPage;
      try {
        result = await this.keywordPage(params, field, after, size, false, signal);
      } catch (e) {
        if (isCancellation(e, signal)) return null;
        warnIfUnexpected("[api] findKeywordSortValue failed:", e, signal);
        return lastKeywordValue;
      }

      if (result.buckets.length === 0) return lastKeywordValue;
      for (const bucket of result.buckets) {
        const next = cumulative + bucket.count;
        if (next > targetPosition) return String(bucket.key);
        cumulative = next;
        lastKeywordValue = String(bucket.key);
      }
      if (result.after == null || result.buckets.length < size) return lastKeywordValue;
      after = result.after;
    }

    console.warn(`[api] findKeywordSortValue: exceeded ${MAX_PAGES} pages; returning an approximate value.`);
    return lastKeywordValue;
  }

  async getKeywordDistribution(
    params: SearchParams,
    field: string,
    _direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<SortDistribution | null> {
    const BUCKET_SIZE = 10_000;
    const MAX_PAGES = 5;
    const buckets: SortDistBucket[] = [];
    let cumulative = 0;
    let coveredCount: number | null = null;
    let complete = false;
    let after: string | number | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (signal?.aborted) return null;
      let result: KeywordPage;
      try {
        result = await this.keywordPage(params, field, after, BUCKET_SIZE, page === 0, signal);
      } catch (e) {
        warnIfUnexpected("[api] getKeywordDistribution failed:", e, signal);
        return null;
      }

      coveredCount ??= result.coveredCount ?? null;
      if (result.buckets.length === 0) {
        complete = true;
        break;
      }
      for (const bucket of result.buckets) {
        buckets.push({ key: String(bucket.key), count: bucket.count, startPosition: cumulative });
        cumulative += bucket.count;
      }
      if (result.after == null) {
        complete = true;
        break;
      }
      after = result.after;
    }

    return { buckets, coveredCount: coveredCount ?? cumulative, representedCount: cumulative, complete };
  }

  async getDateDistribution(
    params: SearchParams,
    field: string,
    _direction: "asc" | "desc",
    signal?: AbortSignal,
    missingField?: string,
  ): Promise<SortDistribution | null> {
    const request = { field, ...(missingField ? { missingField } : {}) };
    try {
      const stats = await this.sortProfile<DateStats>(params, { operation: "date-stats", ...request }, signal);
      const multiValued = stats.coveredCount !== undefined;
      if (stats.valueCount === 0 || stats.min == null || stats.max == null) {
        return {
          buckets: [],
          coveredCount: stats.coveredCount ?? 0,
          ...(multiValued ? { bucketPositionKind: "approximate-evidence" as const, evidenceCount: 0 } : {}),
        };
      }

      const interval = chooseDateHistogramInterval(Math.abs(stats.max - stats.min));
      const result = await this.sortProfile<DateBuckets>(params, { operation: "date-buckets", ...request, interval }, signal);
      if (result.buckets.length === 0) return null;

      const approximate = result.positionKind === "approximate-evidence";
      return {
        buckets: result.buckets,
        coveredCount: approximate ? stats.coveredCount ?? result.evidenceCount : result.evidenceCount,
        ...(approximate ? { bucketPositionKind: "approximate-evidence" as const, evidenceCount: result.evidenceCount } : {}),
      };
    } catch (e) {
      warnIfUnexpected("[api] getDateDistribution failed:", e, signal);
      return null;
    }
  }

  async fetchPositionIndex(params: SearchParams, signal: AbortSignal): Promise<PositionMap | null> {
    const size = Math.min(POSITION_MAP_CHUNK_SIZE, MAX_RESULT_WINDOW);
    const ids: string[] = [];
    const sortValues: SortValues[] = [];
    let after: SortValues | null = null;
    try {
      do {
        if (signal.aborted) return null;
        const page = await this.keyPage(params, after, size, signal);
        for (const key of page.keys) {
          ids.push(key.id);
          sortValues.push(key.sortValues);
        }
        after = page.after;
        if (after) await yieldToMain();
      } while (after);
    } catch (e) {
      warnIfUnexpected("[api] fetchPositionIndex failed:", e, signal);
      return null;
    }
    if (signal.aborted || ids.length === 0) return null;
    return { length: ids.length, ids, sortValues };
  }

  async getIdRange(
    params: SearchParams,
    fromCursor: SortValues,
    toCursor: SortValues,
    signal?: AbortSignal,
  ): Promise<IdRangeResult> {
    const sortClause = buildSortClause(params.orderBy);
    const hardCap = Number(import.meta.env.VITE_RANGE_HARD_CAP ?? 5_000);
    const ids: string[] = [];
    let walked = 0;
    let cursor: SortValues | null = fromCursor;

    while (cursor) {
      if (signal?.aborted) break;
      let page: KeyPage;
      try {
        page = await this.keyPage(params, cursor, RANGE_CHUNK_SIZE, signal);
      } catch (e) {
        if (isCancellation(e, signal)) break;
        throw e;
      }
      for (const key of page.keys) {
        walked++;
        if (sortValuesStrictlyAfter(key.sortValues, toCursor, sortClause)) return { ids, truncated: false, walked };
        ids.push(key.id);
        if (ids.length > hardCap) return { ids: ids.slice(0, hardCap), truncated: true, walked };
      }
      cursor = page.after;
    }
    return { ids, truncated: false, walked };
  }

  private sortProfile<T>(params: SearchParams, operation: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    return postImageRead("/images/sort-profile", { ...buildReadBody(params), ...operation }, signal) as Promise<T>;
  }

  private keywordPage(
    params: SearchParams,
    field: string,
    after: string | number | null,
    size: number,
    includeCoveredCount: boolean,
    signal?: AbortSignal,
  ): Promise<KeywordPage> {
    return this.sortProfile<KeywordPage>(params, {
      operation: "keyword-page", field, size,
      ...(after != null ? { after } : {}),
      ...(includeCoveredCount ? { includeCoveredCount } : {}),
    }, signal);
  }

  private keyPage(params: SearchParams, sortValues: SortValues | null, size: number, signal?: AbortSignal): Promise<KeyPage> {
    return postImageRead("/images/keys", {
      ...buildReadBody(params), ...(sortValues ? { sortValues } : {}), size,
    }, signal) as Promise<KeyPage>;
  }
}
