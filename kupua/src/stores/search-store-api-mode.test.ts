/**
 * The search store driven through the real ApiDataSource and request mapper, against a stand-in
 * media-api that answers each endpoint from MockDataSource. The Scala tests own the endpoints'
 * semantics; this suite proves the client wiring keeps the store's browsing contracts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchStore } from "./search-store";
import { useSelectionStore, _resetMetadataCache, _resetHydrationToastShown } from "./selection-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { ApiDataSource, DEVELOPMENT_FALLBACK_METHODS } from "@/dal/api-data-source";
import { ElasticsearchDataSource } from "@/dal/es-adapter";
import { useEnrichmentStore } from "./enrichment-store";
import { buildSearchKey, getRetainedSortValues } from "@/lib/image-offset-cache";
import { getScrollGeometry, registerScrollGeometry } from "@/lib/scroll-geometry-ref";
import { parseSortField } from "@/dal/adapters/elasticsearch/sort-builders";
import type { ImageDataSource, SearchParams, SortValues } from "@/dal/types";

vi.mock("@/dal/es-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/dal/es-config")>(),
  IS_LOCAL_ES: false,
}));

type Body = Record<string, unknown>;
type Call = { path: string; body: Body; signal?: AbortSignal | null };
type Route = (body: Body) => Promise<unknown> | unknown;

const state = () => useSearchStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
// Extends are suppressed for up to 2s after a search or seek.
const waitPastCooldown = () => new Promise((r) => setTimeout(r, 2100));

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor(${label}) timed out`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const refusal = (status: number, errorKey = "fixture") => new Response(JSON.stringify({ errorKey }), { status });

function toParams(body: Body): SearchParams {
  return {
    orderBy: body.orderBy as string | undefined,
    nonFree: body.free ? undefined : "true",
    ids: body.ids as string | undefined,
    length: body.length as number | undefined,
  };
}

function directionOf(body: Body, field: string): "asc" | "desc" {
  const clause = (body.sort as Record<string, unknown>[]).find((c) => parseSortField(c).field === field);
  return clause ? parseSortField(clause).direction : "asc";
}

/** Answers every ordered-read endpoint from the corpus; `routes` override individual paths. */
function standInMediaApi(corpus: MockDataSource, routes: Record<string, Route> = {}) {
  const calls: Call[] = [];
  const images = (hits: unknown[]) => hits.map((data) => ({ data }));
  const defaults: Record<string, Route> = {
    "/images/search-after": async (b) => {
      const r = await corpus.searchAfter(toParams(b), (b.sortValues as SortValues | undefined) ?? null, null, undefined, b.reverse as boolean, b.seekToEnd as boolean);
      return { data: images(r.hits), total: b.countAll ? r.total : 0, sortValues: r.sortValues };
    },
    "/images/window": async (b) => {
      if ((b.offset as number) >= 10_000) return refusal(422, "invalid-uri-parameters");
      const r = await corpus.searchAfter({ ...toParams(b), offset: b.offset as number }, null);
      return { data: images(r.hits), offset: b.offset, ...(b.countAll ? { total: r.total } : {}), sortValues: r.sortValues, rawHitCount: r.hits.length };
    },
    "/images/rank": async (b) => ({ rank: await corpus.countBefore(toParams(b), b.sortValues as SortValues) }),
    "/images/mget": async (b) => ({ data: images(await corpus.getByIds(b.ids as string[])) }),
    "/images/count": async () => ({
      total: (await corpus.countWithTickers()).count,
      tickerCounts: { "GNM-owned": { value: 7, searchClause: "is:GNM-owned", backgroundColour: "#005689" } },
    }),
    "/images/aggregations": async (b) => ({
      fields: Object.fromEntries((b.fields as Array<{ field: string }>).map(({ field }) => [field, {
        buckets: field === "usagesPlatform" ? [{ key: "digital", count: 9 }]
          : field === "usagesStatus" ? [{ key: "published", count: 4 }]
          : [{ key: `${field}-top`, count: 3 }],
      }])),
      isFilterCounts: Object.fromEntries(((b.isFilters as string[] | undefined) ?? []).map((name) => [name, name === "deleted" ? 0 : 11])),
    }),
    "/images/keys": async (b) => {
      const size = b.size as number;
      const r = await corpus.searchAfter({ ...toParams(b), length: size }, (b.sortValues as SortValues | undefined) ?? null);
      return {
        keys: r.hits.map((h, i) => ({ id: h.id, sortValues: r.sortValues[i] })),
        after: r.hits.length < size ? null : r.sortValues[r.sortValues.length - 1],
      };
    },
    "/images/sort-profile": async (b) => {
      const field = b.field as string;
      const p = toParams(b);
      switch (b.operation) {
        case "scalar-anchor":
          return { value: await corpus.estimateSortValue(p, field, b.percentile as number, undefined, b.scope as Array<{ field: string; value: string }> | undefined) };
        case "keyword-page": {
          const dist = await corpus.getKeywordDistribution(p, field, directionOf(b, field));
          const buckets = dist?.buckets ?? [];
          const start = b.after === undefined ? 0 : buckets.findIndex((x) => x.key === String(b.after)) + 1;
          const page = buckets.slice(start, start + (b.size as number)).map(({ key, count }) => ({ key, count }));
          return { buckets: page, after: page.length ? page[page.length - 1].key : null, ...(b.includeCoveredCount ? { coveredCount: dist?.coveredCount ?? 0 } : {}) };
        }
        case "date-stats": {
          const dist = await corpus.getDateDistribution(p, field, directionOf(b, field), undefined, b.missingField as string | undefined);
          const times = (dist?.buckets ?? []).map((x) => Date.parse(x.key));
          return times.length
            ? { valueCount: dist!.coveredCount, min: Math.min(...times), max: Math.max(...times) }
            : { valueCount: 0, min: null, max: null };
        }
        case "date-buckets": {
          const dist = await corpus.getDateDistribution(p, field, directionOf(b, field), undefined, b.missingField as string | undefined);
          const buckets = dist?.buckets ?? [];
          return { buckets, positionKind: dist?.bucketPositionKind ?? "exact-rank", evidenceCount: buckets.reduce((n, x) => n + x.count, 0) };
        }
        default:
          return refusal(400);
      }
    },
  };
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    init.signal?.throwIfAborted();
    const path = url.replace(/^\/api/, "");
    const body = JSON.parse(init.body as string) as Body;
    calls.push({ path, body, signal: init.signal });
    const out = await (routes[path] ?? defaults[path])?.(body);
    init.signal?.throwIfAborted();
    if (out === undefined) return refusal(404);
    return out instanceof Response ? out : new Response(JSON.stringify(out));
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const MIGRATED = [
  "searchRange", "openPit", "closePit", "searchAfter", "countBefore", "estimateSortValue", "findKeywordSortValue",
  "getKeywordDistribution", "getDateDistribution", "fetchPositionIndex", "getIdRange", "getById", "count", "countWithTickers",
  "getAggregations", "getByIds",
];

/** The development fallback: unmigrated reads answer from a mock; a migrated read reaching it fails loudly. */
function developmentFallback(corpus: MockDataSource, rescues: string[]): ImageDataSource {
  return new Proxy(corpus, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && MIGRATED.includes(prop)) {
        return () => { rescues.push(prop); throw new Error(`development fallback used for ${prop}`); };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

let corpus: MockDataSource;
let calls: Call[];
let rescues: string[];

function useApiMode(total: number, options: { orderBy?: string; sparse?: boolean; skewed?: boolean; routes?: Record<string, Route> } = {}) {
  corpus = new MockDataSource(
    total,
    options.sparse ? [{ field: "lastModified", ratio: 0.2 }] : undefined,
    options.skewed ? { skewedCredits: true } : undefined,
  );
  rescues = [];
  calls = standInMediaApi(corpus, options.routes);
  useSearchStore.setState({
    dataSource: new ApiDataSource(developmentFallback(corpus, rescues)),
    results: [], bufferOffset: 0, total: 0, loading: false, error: null, imagePositions: new Map(),
    startCursor: null, endCursor: null, pitId: null, focusedImageId: null, sortAroundFocusStatus: null,
    sortAroundFocusGeneration: 0, sortDistribution: null, _sortDistCacheKey: null, nullZoneDistribution: null,
    _nullZoneDistCacheKey: null, positionMap: null, positionMapLoading: false,
    _extendForwardInFlight: false, _extendBackwardInFlight: false, _lastPrependCount: 0, _prependGeneration: 0,
    _seekGeneration: 0, _seekTargetLocalIndex: -1,
    params: { query: undefined, offset: 0, length: 200, orderBy: options.orderBy ?? "-uploadTime", nonFree: "true" },
  });
}

/** The buffer holds exactly the corpus's images at its global coordinates. */
async function expectCoherentBuffer() {
  const { results, bufferOffset, params } = state();
  expect(results.length).toBeGreaterThan(0);
  const expected = await corpus.searchAfter({ orderBy: params.orderBy, nonFree: "true", offset: bufferOffset, length: results.length }, null);
  expect(results.map((r) => r?.id)).toEqual(expected.hits.map((h) => h.id));
  for (const [i, image] of results.entries()) {
    if (image) expect(state().imagePositions.get(image.id)).toBe(bufferOffset + i);
  }
}

const paths = () => calls.map((c) => c.path);
const bodiesFor = (path: string) => calls.filter((c) => c.path === path).map((c) => c.body);

describe.each(["direct-ES", "media-api"] as const)("KUP-034 %s centred prefix", (mode) => {
  const originalGeometry = getScrollGeometry();

  afterEach(() => {
    state().abortExtends();
    registerScrollGeometry(originalGeometry);
  });

  async function setup(offset: number, orderBy = "-lastModified") {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    useApiMode(70_000, { orderBy, sparse: true });
    registerScrollGeometry({ rowHeight: 100, columns: 3 });
    useEnrichmentStore.getState().setEnrichment(new Map());
    const params = state().params;
    const target = await corpus.searchAfter({ ...params, offset, length: 1 }, null);
    const initial = await corpus.searchAfter({ ...params, offset: 1002, length: 200 }, null);
    const requests: Array<{ length: number; reverse: boolean; lookup: boolean }> = [];
    const transport: { beforeRank?: () => Promise<void>; beforePage?: () => Promise<void> } = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      init.signal?.throwIfAborted();
      if (url.endsWith("/rank") || url.endsWith("/_count")) {
        await transport.beforeRank?.();
        init.signal?.throwIfAborted();
        return new Response(JSON.stringify(mode === "media-api" ? { rank: offset } : { count: offset }));
      }
      const cursor = mode === "media-api" ? body.sortValues : body.search_after;
      const length = (mode === "media-api" ? body.length : body.size) as number;
      const reverse = mode === "media-api" ? body.reverse === true
        : parseSortField((body.sort as Body[])[0]).direction !== (orderBy.startsWith("-") ? "desc" : "asc");
      const lookup = !cursor;
      requests.push({ length, reverse, lookup });
      if (!lookup) await transport.beforePage?.();
      init.signal?.throwIfAborted();
      let page = target;
      if (cursor && reverse) {
        const count = Math.min(offset, length);
        page = count > 0
          ? await corpus.searchAfter({ ...params, offset: offset - count, length: count }, null)
          : { ...target, hits: [], sortValues: [] };
        if (count < length) {
          const nulls = await corpus.searchAfter({ ...params, offset: 70_000 - (length - count), length: length - count }, null);
          page = { ...page, hits: [...nulls.hits, ...page.hits], sortValues: [...nulls.sortValues, ...page.sortValues] };
        }
      } else if (cursor) {
        page = await corpus.searchAfter({ ...params, length }, target.sortValues[0]);
      }
      if (mode === "media-api") {
        return new Response(JSON.stringify({ data: page.hits.map(image => ({ data: { ...image, valid: true } })), sortValues: page.sortValues }));
      }
      const hits = page.hits.map((image, index) => ({ _id: image.id, _source: image, sort: page.sortValues[index] }));
      return new Response(JSON.stringify({ hits: { hits: reverse ? hits.reverse() : hits } }));
    }));
    useSearchStore.setState({
      dataSource: mode === "direct-ES" ? new ElasticsearchDataSource() : state().dataSource,
      total: 70_000, results: initial.hits, bufferOffset: 1002,
      imagePositions: new Map(initial.hits.map((image, index) => [image.id, 1002 + index])),
      startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)!,
      focusedImageId: null, _focusedImageKnownOffset: null,
    });
    return { target, initial, requests, transport, params };
  }

  async function expectLanding(offset: number, targetId: string) {
    const expectedStart = Math.ceil(Math.max(0, offset - 100) / 3) * 3;
    const expected = await corpus.searchAfter({ ...state().params, offset: expectedStart, length: offset - expectedStart + 101 }, null);
    expect(state().bufferOffset).toBe(expectedStart);
    expect(state().results.map(image => image?.id)).toEqual(expected.hits.map(image => image.id));
    expect(state().imagePositions.get(targetId)).toBe(offset);
    expect(state()._focusedImageKnownOffset).toBe(offset);
    expect(state().total).toBe(70_000);
    expect(state().startCursor).toEqual(expected.sortValues[0]);
    expect(state().endCursor).toEqual(expected.sortValues.at(-1));
    for (const [index, image] of expected.hits.entries()) {
      expect(state().imagePositions.get(image.id)).toBe(expectedStart + index);
      expect(getRetainedSortValues(image.id, buildSearchKey(state().params))).toEqual(expected.sortValues[index]);
      if (mode === "media-api") expect(useEnrichmentStore.getState().data.get(image.id)?.valid).toBe(true);
    }
  }

  it.each(["lastModified", "-lastModified"].flatMap(orderBy => [0, 5, 99, 100, 500].map(offset => ({ orderBy, offset }))))(
    "restores exact ordered IDs at $offset under $orderBy without reading beyond the prefix", async ({ offset, orderBy }) => {
      const { target, requests } = await setup(offset, orderBy);
      await state().restoreAroundCursor(target.hits[0].id, target.sortValues[0], 999, true);
      await expectLanding(offset, target.hits[0].id);
      expect(state()._seekTargetLocalIndex).toBe(offset - state().bufferOffset);
      expect(requests.filter(request => request.reverse)).toEqual(offset === 0 ? [] : [{ length: Math.min(100, offset), reverse: true, lookup: false }]);
      expect(requests).toHaveLength(offset === 0 ? 2 : 3);
    },
  );

  it.each([0, 5, 500].flatMap(offset => [null, 5].map(hint => ({ offset, hint }))))(
    "keeps rank and pages parallel with provisional hint $hint and exact offset $offset", async ({ offset, hint }) => {
      const { target, initial, requests, transport } = await setup(offset);
      let release!: () => void;
      transport.beforeRank = () => new Promise<void>(resolve => { release = resolve; });
      useSearchStore.setState({ focusedImageId: target.hits[0].id, _focusedImageKnownOffset: hint });
      const pending = state().seekToFocused();
      try {
        await waitFor(() => requests.filter(request => !request.lookup).length === 2, "parallel neighbour requests");
        expect(state().results).toBe(initial.hits);
      } finally {
        release();
        await pending;
      }
      await expectLanding(offset, target.hits[0].id);
      expect(requests.filter(request => request.reverse)).toEqual([{ length: 100, reverse: true, lookup: false }]);
    },
  );

  it("does not publish an aborted near-top restore or its enrichment", async () => {
    const { target, initial, requests, transport } = await setup(5);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    transport.beforePage = () => held;
    const pending = state().restoreAroundCursor(target.hits[0].id, target.sortValues[0], 5, true);
    await waitFor(() => requests.filter(request => !request.lookup).length === 2, "held restore pages");
    state().abortExtends();
    release();
    await pending;
    expect(state().results).toBe(initial.hits);
    expect(state().bufferOffset).toBe(1002);
    expect(useEnrichmentStore.getState().data.size).toBe(0);
  });
});

describe.each(["direct-ES", "media-api"] as const)("KUP-033 %s backward boundary", (mode) => {
  const originalGeometry = getScrollGeometry();

  afterEach(() => {
    state().abortExtends();
    vi.useRealTimers();
    registerScrollGeometry(originalGeometry);
  });

  async function setup(orderBy: string, offset: number, ratio = 0.2, length = 200, columns = 1) {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    useApiMode(120_000, { orderBy, sparse: true });
    if (ratio !== 0.2) corpus = new MockDataSource(120_000, [{ field: "lastModified", ratio }]);
    if (ratio === 0) delete (await corpus.getByIds(["img-0"]))[0].lastModified;
    registerScrollGeometry({ rowHeight: 100, columns });
    useEnrichmentStore.getState().setEnrichment(new Map());
    const boundary = 120_000 * ratio;
    const params = state().params;
    if (ratio > 0 && ratio < 1) {
      const tied = await corpus.searchAfter({ ...params, length: 3 }, null);
      for (const image of tied.hits) {
        image.lastModified = orderBy.startsWith("-") ? "1900-01-01T00:00:00Z" : "2100-01-01T00:00:00Z";
        image.uploadTime = "2026-01-01T00:00:00Z";
      }
    }
    const initial = await corpus.searchAfter({ ...params, offset, length }, null);
    const fetchCount = Math.min(200, offset);
    const firstPage = await corpus.searchAfter({ ...params, length: fetchCount }, initial.sortValues[0], null, undefined, true);
    const remaining = fetchCount - firstPage.hits.length;
    const valuedPage = await corpus.searchAfter({ ...params, offset: boundary - remaining, length: remaining }, null);

    const requests: Body[] = [];
    const transport: { beforeReply?: (number: number, signal: AbortSignal | null | undefined) => Promise<void>; failBoundary?: boolean } = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      requests.push(body);
      expect(requests.length).toBeLessThanOrEqual(2);
      await transport.beforeReply?.(requests.length, init.signal);
      if (requests.length === 2 && transport.failBoundary) return refusal(503);
      const page = requests.length === 1 ? firstPage : valuedPage;
      if (mode === "media-api") {
        return new Response(JSON.stringify({ data: page.hits.map((image) => ({ data: { ...image, valid: true } })), sortValues: page.sortValues }));
      }
      const hits = page.hits.map((image, index) => ({
        _id: image.id, _source: image,
        sort: requests.length === 1 && initial.sortValues[0][0] === null ? page.sortValues[index].slice(1) : page.sortValues[index],
      })).reverse();
      return new Response(JSON.stringify({ hits: { hits } }));
    }));
    useSearchStore.setState({
      dataSource: mode === "direct-ES" ? new ElasticsearchDataSource() : state().dataSource,
      results: initial.hits, bufferOffset: offset, total: 120_000,
      startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)!,
      imagePositions: new Map(initial.hits.map((image, index) => [image.id, offset + index])),
      focusedImageId: initial.hits[50].id,
    });
    vi.useFakeTimers();
    state().abortExtends();
    vi.setSystemTime(Date.now() + 10_000);
    return { initial, firstPage, valuedPage, requests, transport, fetchCount, remaining, params };
  }

  async function expectBuffer(offset: number, length: number) {
    const expected = await corpus.searchAfter({ ...state().params, offset, length }, null);
    expect(state().error).toBeNull();
    expect(state().bufferOffset).toBe(offset);
    expect(state().results.map((image) => image?.id)).toEqual(expected.hits.map((image) => image.id));
    expect(new Set(state().results.map((image) => image?.id)).size).toBe(length);
    expect(state().startCursor).toEqual(expected.sortValues[0]);
    expect(state().endCursor).toEqual(expected.sortValues.at(-1));
    expect(await corpus.countBefore(state().params, state().startCursor!)).toBe(offset);
    for (const [index, image] of state().results.entries()) {
      expect(image).toBeDefined();
      expect(state().imagePositions.get(image!.id)).toBe(offset + index);
    }
    return expected;
  }

  it.each(["lastModified", "-lastModified"].flatMap((orderBy) => [0, 40, 200, 400].map((distance) => ({ orderBy, distance }))))(
    "preserves exact order and tied tuples at null distance $distance under $orderBy", async ({ orderBy, distance }) => {
    const offset = 24_000 + distance;
    const { initial, firstPage, valuedPage, requests, remaining, params } = await setup(orderBy, offset);
    expect(firstPage.hits).toHaveLength(Math.min(200, distance));
    expect(firstPage.sortValues.every((tuple) => tuple[0] === null)).toBe(true);

    await state().extendBackward();

    await expectBuffer(offset - 200, 400);
    expect(state().focusedImageId).toBe(initial.hits[50].id);
    expect(state()._lastPrependCount).toBe(200);
    expect(state()._prependGeneration).toBe(1);
    expect(state()._extendBackwardInFlight).toBe(false);
    expect(requests).toHaveLength(remaining ? 2 : 1);
    for (const page of [valuedPage, firstPage]) {
      for (const [index, image] of page.hits.entries()) {
        expect(getRetainedSortValues(image.id, buildSearchKey(params))).toEqual(page.sortValues[index]);
        if (mode === "media-api") expect(useEnrichmentStore.getState().data.get(image.id)?.valid).toBe(true);
      }
    }
    if (mode === "media-api") {
      expect(requests[0]).toMatchObject({ sortValues: initial.sortValues[0], reverse: true, length: 200, countAll: false });
    } else {
      expect(requests[0]).toMatchObject({ search_after: initial.sortValues[0].slice(1), size: 200, track_total_hits: false });
      expect(JSON.stringify(requests[0].query)).toContain('"must_not"');
    }
    if (remaining) {
      expect(valuedPage.sortValues.slice(-3).map((tuple) => tuple.slice(0, 2))).toEqual(
        Array.from({ length: 3 }, () => valuedPage.sortValues.at(-1)!.slice(0, 2)),
      );
      if (mode === "media-api") {
        expect(requests[1]).toMatchObject({ reverse: true, seekToEnd: false, length: remaining, countAll: false });
        expect(requests[1]).not.toHaveProperty("sortValues");
      } else {
        expect(requests[1]).toMatchObject({ size: remaining, track_total_hits: false });
        expect(requests[1]).not.toHaveProperty("search_after");
        expect(requests[1]).not.toHaveProperty("from");
        const primary = (requests[1].sort as Body[])[0].lastModified;
        expect(primary).toBe(orderBy.startsWith("-") ? "asc" : "desc");
      }
    }
  });

  it.each([0, 1].flatMap((ratio) => [50, 500].map((offset) => ({ ratio, offset }))))(
    "keeps all-null/no-null ratio $ratio at offset $offset to one read", async ({ ratio, offset }) => {
    const { requests, fetchCount } = await setup("-lastModified", offset, ratio);
    await state().extendBackward();
    await expectBuffer(offset - fetchCount, 200 + fetchCount);
    expect(requests).toHaveLength(1);
  });

  it("keeps full-buffer eviction, column alignment and focus coherent across the boundary", async () => {
    const { initial } = await setup("-lastModified", 24_040, 0.2, 1000, 3);
    await state().extendBackward();
    const expected = await expectBuffer(23_841, 1000);
    expect(state().focusedImageId).toBe(initial.hits[50].id);
    expect(state()._lastPrependCount).toBe(199);
    for (const image of initial.hits.slice(-199)) expect(state().imagePositions.has(image.id)).toBe(false);
    expect(state().endCursor).toEqual(expected.sortValues.at(-1));
  });

  it.each(["lastModified", "-lastModified"])("keeps forward valued-to-null crossing under %s to one read", async (orderBy) => {
    const { initial, params } = await setup(orderBy, 23_800);
    const nextPage = await corpus.searchAfter({ ...params, length: 200 }, initial.sortValues.at(-1)!, null, undefined, false);
    expect(initial.sortValues.at(-1)![0]).not.toBeNull();
    expect(nextPage.sortValues.every((tuple) => tuple[0] === null)).toBe(true);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Body;
      if (mode === "media-api") {
        expect(body).toMatchObject({ sortValues: initial.sortValues.at(-1), reverse: false, countAll: false, length: 200 });
        return new Response(JSON.stringify({ data: nextPage.hits.map((data) => ({ data })), sortValues: nextPage.sortValues }));
      }
      expect(body).toMatchObject({ search_after: initial.sortValues.at(-1), size: 200, track_total_hits: false });
      return new Response(JSON.stringify({ hits: { hits: nextPage.hits.map((image, index) => ({
        _id: image.id, _source: image, sort: nextPage.sortValues[index],
      })) } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await state().extendForward();

    await expectBuffer(23_800, 400);
    expect(state().focusedImageId).toBe(initial.hits[50].id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a mixed corpus's valued-zone reverse page to one read", async () => {
    const { requests } = await setup("-lastModified", 23_500);
    await state().extendBackward();
    await expectBuffer(23_300, 400);
    expect(requests).toHaveLength(1);
  });

  it.each([1, 2])("cancels request %s without publishing either part of the prepend", async (requestNumber) => {
    const { initial, transport, requests } = await setup("-lastModified", 24_040);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let capturedSignal: AbortSignal | null | undefined;
    transport.beforeReply = async (number, signal) => {
      if (number !== requestNumber) return;
      capturedSignal = signal;
      entered();
      await held;
    };
    const pending = state().extendBackward();
    await started;
    state().abortExtends();
    release();
    await pending;
    expect(capturedSignal?.aborted).toBe(true);
    expect(requests).toHaveLength(requestNumber);
    expect(state().results).toBe(initial.hits);
    expect(state().bufferOffset).toBe(24_040);
    expect(state()._prependGeneration).toBe(0);
    expect(state()._extendBackwardInFlight).toBe(false);
    expect(useEnrichmentStore.getState().data.size).toBe(0);
  });

  it("keeps the original buffer when the boundary read fails", async () => {
    const { initial, transport, requests } = await setup("-lastModified", 24_040);
    transport.failBoundary = true;
    await state().extendBackward();
    expect(requests).toHaveLength(2);
    expect(state().results).toBe(initial.hits);
    expect(state().bufferOffset).toBe(24_040);
    expect(state().error).not.toBeNull();
    expect(state()._prependGeneration).toBe(0);
    expect(state()._extendBackwardInFlight).toBe(false);
    expect(useEnrichmentStore.getState().data.size).toBe(0);
  });
});

beforeEach(() => {
  rescues = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(rescues).toEqual([]);
});

describe("API mode: routing and counting", () => {
  it("keeps the migrated-method list complementary to the development fallback", () => {
    expect([...MIGRATED, ...DEVELOPMENT_FALLBACK_METHODS].sort()).toHaveLength(17);
    expect(MIGRATED.some((m) => (DEVELOPMENT_FALLBACK_METHODS as readonly string[]).includes(m))).toBe(false);
  });

  it("opens no PIT, counts the first page exactly and nothing else", async () => {
    useApiMode(120_000);
    await state().search();
    await waitPastCooldown();
    await state().extendForward();
    await state().seek(119_999);
    await flush();

    expect(state().error).toBeNull();
    expect(state().total).toBe(120_000);
    expect(state().pitId).toBeNull();
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("Failed to open PIT"), expect.anything());
    const counted = calls.filter((c) => c.body.countAll === true);
    expect(counted).toHaveLength(1);
    expect(counted[0]).toMatchObject({ path: "/images/search-after", body: { reverse: false } });
    expect(calls.every((c) => !("pitId" in c.body))).toBe(true);
  });

  it("publishes the first page's tickers from media-api's count, without a sort", async () => {
    useApiMode(120_000);
    await state().search();

    expect(state().tickerCounts).toEqual({ "GNM-owned": { value: 7 } });
    expect(bodiesFor("/images/count")).toHaveLength(1);
    expect(bodiesFor("/images/count")[0]).not.toHaveProperty("sort");
  });

  it("shows no tickers, and no error, when the count is incomplete", async () => {
    useApiMode(120_000, { routes: { "/images/count": () => refusal(503, "count-incomplete") } });
    await state().search();

    expect(state().error).toBeNull();
    expect(state().total).toBe(120_000);
    expect(state().tickerCounts).toBeNull();
  });
});

describe("API mode: browsing the seek tier", () => {
  it("pages forward and backward with coherent coordinates", async () => {
    useApiMode(120_000);
    await state().search();
    await state().seek(60_000);
    await flush();
    const landed = state().bufferOffset;
    await waitPastCooldown();
    await state().extendForward();
    await state().extendBackward();
    await flush();

    expect(state().error).toBeNull();
    expect(state().bufferOffset).toBeLessThan(landed);
    await expectCoherentBuffer();
    expect(bodiesFor("/images/search-after").some((b) => b.reverse === true && b.sortValues)).toBe(true);
  });

  it("lands a deep seek through a scalar anchor and a rank, never an offset past the window", async () => {
    useApiMode(120_000);
    await state().search();
    await state().seek(60_000);
    await flush();

    expect(state().error).toBeNull();
    expect(Math.abs(state().bufferOffset + state()._seekTargetLocalIndex - 60_000)).toBeLessThan(200);
    await expectCoherentBuffer();
    expect(bodiesFor("/images/sort-profile").map((b) => b.operation)).toContain("scalar-anchor");
    expect(paths()).toContain("/images/rank");
    expect(bodiesFor("/images/window").every((b) => (b.offset as number) < 10_000)).toBe(true);
  });

  it("uses the window for a shallow seek", async () => {
    useApiMode(120_000);
    await state().search();
    await state().seek(5_000);
    await flush();

    expect(bodiesFor("/images/window").map((b) => b.offset)).toEqual([4_900]);
    await expectCoherentBuffer();
  });

  it("reaches the true end with End", async () => {
    useApiMode(120_000);
    await state().search();
    await state().seek(119_999);
    await flush();

    expect(state().results[state().results.length - 1]?.id).toBe("img-119999");
    expect(bodiesFor("/images/search-after").some((b) => b.reverse && b.seekToEnd && !b.sortValues)).toBe(true);
    await expectCoherentBuffer();
  });

  it("lands an estimate-less deep seek at the window limit with its actual position", async () => {
    useApiMode(120_000);
    corpus.estimateSortValue = (async () => null) as typeof corpus.estimateSortValue;
    await state().search();
    await state().seek(50_000);
    await flush();

    expect(state().error).toBeNull();
    expect(bodiesFor("/images/window").map((b) => b.offset)).toEqual([9_800]);
    await expectCoherentBuffer();
  });
});

describe("API mode: position maps and the null tail", () => {
  it("builds the indexed-tier map from key pages and seeks through it", async () => {
    useApiMode(20_000);
    await state().search();
    await waitFor(() => state().positionMap !== null, "position map");

    const map = state().positionMap!;
    expect(map.length).toBe(20_000);
    expect(map.ids.slice(0, 3)).toEqual(["img-0", "img-1", "img-2"]);
    expect(bodiesFor("/images/keys").map((b) => b.size)).toEqual([10_000, 10_000, 10_000]);

    await state().seek(15_000);
    await flush();
    expect(state().error).toBeNull();
    await expectCoherentBuffer();
  });

  it("maps and browses into the null tail of a sparse sort", async () => {
    useApiMode(5_000, { orderBy: "-lastModified", sparse: true });
    await state().search();
    await waitFor(() => state().positionMap !== null, "position map");

    const map = state().positionMap!;
    expect(map.length).toBe(5_000);
    expect(map.sortValues[999][0]).not.toBeNull();
    expect(map.sortValues[1_000][0]).toBeNull();

    await state().seek(4_500);
    await waitPastCooldown();
    await state().extendForward();
    await flush();
    expect(state().error).toBeNull();
    await expectCoherentBuffer();
    expect(bodiesFor("/images/search-after").some((b) => (b.sortValues as SortValues | undefined)?.[0] === null)).toBe(true);
  });

  it("keeps browsing usable when the map read is incomplete", async () => {
    useApiMode(20_000, { routes: { "/images/keys": () => refusal(503, "keys-incomplete") } });
    await state().search();
    await waitFor(() => !state().positionMapLoading && paths().includes("/images/keys"), "map attempt");

    expect(state().positionMap).toBeNull();
    expect(state().error).toBeNull();
    await state().seek(15_000);
    await flush();
    expect(state().error).toBeNull();
    await expectCoherentBuffer();
  });

  it("cancels an in-flight map read when a new search starts", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    useApiMode(20_000, { routes: { "/images/keys": async () => { await held; return { keys: [], after: null }; } } });
    await state().search();
    await waitFor(() => paths().includes("/images/keys"), "map started");
    const firstMapRead = calls.find((c) => c.path === "/images/keys")!;

    await state().search();
    release();
    await flush();
    expect(firstMapRead.signal?.aborted).toBe(true);
  });
});

describe("API mode: finding and restoring an image", () => {
  it("finds a focused image's position with rank and centres the buffer on it", async () => {
    useApiMode(120_000);
    await state().search();
    await state().search("img-70000");
    await waitFor(() => state().focusedImageId === "img-70000" && !state().loading, "focus");

    expect(state().imagePositions.get("img-70000")).toBe(70_000);
    expect(bodiesFor("/images/search-after").some((b) => b.ids === "img-70000")).toBe(true);
    expect(paths()).toContain("/images/rank");
    await expectCoherentBuffer();
  });

  it("restores around a saved cursor at its exact rank", async () => {
    useApiMode(120_000);
    await state().search();
    const target = await corpus.searchAfter({ orderBy: "-uploadTime", nonFree: "true", ids: "img-80000", length: 1 }, null);
    await state().restoreAroundCursor("img-80000", target.sortValues[0], 80_000);
    await flush();

    expect(state().error).toBeNull();
    expect(state().imagePositions.get("img-80000")).toBe(80_000);
    await expectCoherentBuffer();
  });
});

describe("API mode: failures", () => {
  it("shows the error state when a core read is refused", async () => {
    useApiMode(120_000, { routes: { "/images/search-after": () => refusal(403, "forbidden") } });
    await state().search();
    await flush();

    expect(state().error).not.toBeNull();
    expect(state().results).toEqual([]);
  });

  it("leaves optional profile data quietly absent when profiles are refused", async () => {
    useApiMode(120_000, { orderBy: "-credit", skewed: true, routes: { "/images/sort-profile": () => refusal(403, "forbidden") } });
    await state().search();
    await state().fetchSortDistribution();
    await flush();

    expect(state().error).toBeNull();
    expect(state().sortDistribution).toBeNull();
    expect(state().results.length).toBeGreaterThan(0);
  });
});

describe("API mode: range walks", () => {
  it("returns the same (from, to] ids as the corpus across the null tail", async () => {
    useApiMode(5_000, { orderBy: "-lastModified", sparse: true });
    const p = { orderBy: "-lastModified", nonFree: "true" };
    const page = await corpus.searchAfter({ ...p, offset: 900, length: 300 }, null);
    const from = page.sortValues[0];
    const to = page.sortValues[250];

    const viaApi = await state().dataSource.getIdRange(p, from, to);
    const direct = await corpus.getIdRange(p, from, to);
    expect(viaApi.ids).toEqual(direct.ids);
    expect(viaApi.ids).toHaveLength(250);
    expect(from[0]).not.toBeNull();
    expect(to[0]).toBeNull();
  });
});

describe("API mode: selection hydration", () => {
  const selection = () => useSelectionStore.getState();
  function selectInApiMode(ids: string[], routes?: Record<string, Route>) {
    useApiMode(500, { routes });
    _resetMetadataCache();
    _resetHydrationToastShown();
    useSelectionStore.setState({ dataSource: state().dataSource, selectedIds: new Set(ids), anchorId: ids[ids.length - 1] });
  }

  it("reads selected images through media-api and drops only the IDs a complete lookup did not find", async () => {
    selectInApiMode(["img-1", "img-2", "img-gone"]);
    await selection().hydrate();

    expect(paths()).toEqual(["/images/mget"]);
    expect(bodiesFor("/images/mget")[0]).toEqual({ ids: ["img-1", "img-2", "img-gone"] });
    expect([...selection().selectedIds]).toEqual(["img-1", "img-2"]);
    expect(selection().anchorId).toBe("img-2");
    expect(selection().metadataCache.get("img-1")?.id).toBe("img-1");
  });

  it("keeps the whole selection when the lookup is incomplete", async () => {
    selectInApiMode(["img-1", "img-gone"], { "/images/mget": () => refusal(503, "mget-incomplete") });
    await selection().hydrate();

    expect([...selection().selectedIds]).toEqual(["img-1", "img-gone"]);
    expect(selection().anchorId).toBe("img-gone");
    expect(selection().metadataCache.has("img-1")).toBe(false);
  });
});

describe("API mode: facet aggregations", () => {
  it("publishes field, is: and usage counts from one media-api read", async () => {
    useApiMode(5_000);
    await state().search();
    await state().fetchAggregations("force");

    const bodies = bodiesFor("/images/aggregations");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].isFilters).toEqual(["deleted", "under-quota"]);
    const requested = (bodies[0].fields as Array<{ field: string }>).map((f) => f.field);
    expect(requested).toEqual(expect.arrayContaining(["usageRights.category", "metadata.credit", "usagesPlatform", "usagesStatus"]));
    expect(state().aggregations?.fields["metadata.credit"]?.buckets).toEqual([{ key: "metadata.credit-top", count: 3 }]);
    expect(state().aggregations?.fields).not.toHaveProperty("usagesPlatform");
    expect(state().isFilterCounts).toEqual({ deleted: 0, "under-quota": 11 });
    expect(state().usageFilterCounts).toEqual({ digital: 9, print: 0, syndication: 0, published: 4, pending: 0, removed: 0 });
    expect(state().aggLoading).toBe(false);
  });

  it("keeps the previous counts when the aggregation read is incomplete", async () => {
    useApiMode(5_000);
    await state().search();
    await state().fetchAggregations("force");
    const published = state().aggregations;
    calls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => refusal(503, "aggregations-incomplete")));

    await state().fetchAggregations("force");

    expect(state().aggregations).toBe(published);
    expect(state().aggLoading).toBe(false);
  });
});
