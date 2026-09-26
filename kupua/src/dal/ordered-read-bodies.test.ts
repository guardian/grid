/**
 * Golden request bodies: the exact JSON the real mapper sends for representative ordered reads.
 * The files live in media-api's test resources, where ElasticSearchTest replays them against
 * Elasticsearch, so the Scala tests exercise what this client actually sends.
 * A mismatch here means the wire contract changed: review it, then update with `vitest -u`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiDataSource } from "./api-data-source";
import type { ImageDataSource, SearchParams, SortValues } from "./types";

const GOLDEN_DIR = "../../../media-api/test/resources/ordered-read-bodies";
const DAY = 86_400_000;
const T = 1_700_000_000_000;

type Body = Record<string, unknown>;

function captureBodies(): Body[] {
  const bodies: Body[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Body;
    bodies.push({ path: url.replace(/^\/api/, ""), body });
    const response = url.endsWith("/rank") ? { rank: 0 }
      : url.endsWith("/count") ? { total: 0, tickerCounts: {} }
      : url.endsWith("/aggregations") ? { fields: {}, isFilterCounts: {} }
      : url.endsWith("/keys") ? { keys: [], after: null }
      : url.endsWith("/mget") ? { data: [] }
      : url.endsWith("/sort-profile") ? (
        body.operation === "date-stats" ? { valueCount: 2, min: T, max: T + 30 * DAY }
        : body.operation === "keyword-page" ? { buckets: [], after: null }
        : body.operation === "date-buckets" ? { buckets: [{ key: "2023-11-14T00:00:00.000Z", count: 2, startPosition: 0 }], positionKind: "exact-rank", evidenceCount: 2 }
        : { value: null })
      : { data: [], total: 0, sortValues: [], offset: 0, rawHitCount: 0 };
    return new Response(JSON.stringify(response));
  }));
  return bodies;
}

const ds = new ApiDataSource({} as ImageDataSource);
const base = (orderBy?: string): SearchParams => ({ orderBy, nonFree: "true", until: "2030-01-01T00:00:00.000Z", length: 200 });
const signal = () => new AbortController().signal;

const cases: Array<{ name: string; read: () => Promise<unknown> }> = [
  { name: "search-after-first-page", read: () => ds.searchAfter({ ...base(), trackTotalHits: true }, null, null) },
  { name: "search-after-cursor-taken", read: () => ds.searchAfter(base("-taken"), [T, T, "fixture-id"] as SortValues, null) },
  { name: "search-after-backward-null-zone-taken", read: () => ds.searchAfter(base("-taken"), [null, T, "fixture-id"], null, undefined, true) },
  { name: "search-after-end-taken", read: () => ds.searchAfter(base("-taken"), null, null, undefined, true, true) },
  { name: "search-after-ids-lookup-last-used", read: () => ds.searchAfter({ ...base("-usagesDateAdded"), ids: "fixture-id", length: 1 }, null, null) },
  { name: "window-shallow-credit", read: () => ds.searchAfter({ ...base("credit"), offset: 3 }, null, null) },
  { name: "rank-last-used", read: () => ds.countBefore(base("-usagesDateAdded"), [T, T, "fixture-id"]) },
  { name: "rank-null-zone-taken", read: () => ds.countBefore(base("-taken"), [null, T, "fixture-id"]) },
  { name: "rank-collection-added", read: () => ds.countBefore(base("-dateAddedToCollection"), [T, T, "fixture-id"]) },
  { name: "sort-profile-scalar-anchor-scoped-credit", read: () => ds.estimateSortValue(base("-credit"), "uploadTime", 37.5, undefined, [{ field: "metadata.credit", value: "Fixture" }]) },
  { name: "sort-profile-keyword-page-credit", read: () => ds.getKeywordDistribution(base("credit"), "metadata.credit", "asc") },
  { name: "sort-profile-date-null-zone-taken", read: () => ds.getDateDistribution(base("-taken"), "uploadTime", "desc", undefined, "metadata.dateTaken") },
  { name: "sort-profile-date-last-used", read: () => ds.getDateDistribution(base("-usagesDateAdded"), "usages.dateAdded", "desc") },
  { name: "keys-map-first-page-last-used", read: () => ds.fetchPositionIndex(base("-usagesDateAdded"), signal()) },
  { name: "keys-range-null-zone-taken", read: () => ds.getIdRange(base("-taken"), [null, T, "fixture-id"], [null, 0, "fixture-id"]) },
  { name: "count-tickers", read: () => ds.countWithTickers(base()) },
  { name: "count-poll-since", read: () => ds.countWithTickers({ ...base(), since: "2020-01-01T03:00:00.000Z", offset: 0, length: 0 }) },
  {
    name: "aggregations-facets",
    read: () => ds.getAggregations(base(), [{ field: "metadata.credit", size: 10 }, { field: "usageRights.category", size: 10 }], undefined,
      [{ name: "deleted", isFilter: "deleted" }, { name: "under-quota", isFilter: "under-quota" }],
      [{ name: "digital", subField: "platform", value: "digital" }, { name: "published", subField: "status", value: "published" }]),
  },
  { name: "aggregations-collections", read: () => ds.getAggregations({}, [{ field: "collections.pathId", size: 6000 }]) },
  { name: "mget-selection", read: () => ds.getByIds(["fixture-id", "missing-id"]) },
];

afterEach(() => vi.unstubAllGlobals());

describe("ordered-read golden request bodies", () => {
  it.each(cases)("$name", async ({ name, read }) => {
    const bodies = captureBodies();
    await read();
    await expect(`${JSON.stringify(bodies, null, 2)}\n`).toMatchFileSnapshot(`${GOLDEN_DIR}/${name}.json`);
  });
});
