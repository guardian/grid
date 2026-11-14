/**
 * @vitest-environment jsdom
 *
 * The search store driven through the real ApiDataSource and request mapper, against a stand-in
 * media-api that answers each endpoint from MockDataSource. The Scala tests own the endpoints'
 * semantics; this suite proves the client wiring keeps the store's browsing contracts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useImageTraversal } from "@/hooks/useImageTraversal";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import { useSearchStore } from "./search-store";
import { useSelectionStore, _resetMetadataCache, _resetHydrationToastShown, _resetReconcileQueue } from "./selection-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { ApiDataSource } from "@/dal/api-data-source";
import { ElasticsearchDataSource } from "@/dal/es-adapter";
import { attachedEnrichment, useEnrichmentStore } from "./enrichment-store";
import { buildSearchKey, getRetainedSortValues, retainSortValues } from "@/lib/image-offset-cache";
import { getScrollGeometry, registerScrollGeometry } from "@/lib/scroll-geometry-ref";
import { registerScrollContainer } from "@/lib/scroll-container-ref";
import { parseSortField } from "@/dal/adapters/elasticsearch/sort-builders";
import type { SearchParams, SortValues } from "@/dal/types";
import { NEW_IMAGES_POLL_INTERVAL } from "@/constants/tuning";
import { deriveImage } from "@/lib/derive-enriched-image";
import { publishImage, publishImages, publishUnavailableImages } from "@/lib/image-publication";
import { createLabelOperation } from "@/lib/label-operation";
import { acceptImageRead, acceptImageOverlay, acceptObservedImages, admitLabelObservation, captureImageRead, getImageAvailability, isLabelAuthorityCurrent, protectsImageOmission, recordLabelOutcome, releaseLabelObservation, resetImageFreshnessForTests, stampImageRead } from "@/lib/image-read-freshness";

vi.mock("@/lib/image-prefetch", () => ({ prefetchNearbyImages: vi.fn() }));

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
const waitPastCooldown = async () => {
  vi.setSystemTime(Date.now() + 2100);
  await flush();
};

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor(${label}) timed out`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const refusal = (status: number, errorKey = "fixture") => new Response(JSON.stringify({ errorKey }), { status });
const FAILURE_KINDS = ["refused", "unavailable", "incomplete"] as const;
function failedRead(kind: typeof FAILURE_KINDS[number], endpoint: string): Response {
  if (kind === "unavailable") throw new TypeError("synthetic transport unavailable");
  return refusal(kind === "incomplete" ? 503 : 403, kind === "incomplete" ? `${endpoint}-incomplete` : "forbidden");
}

function toParams(body: Body): SearchParams {
  return {
    orderBy: body.orderBy as string | undefined,
    nonFree: body.free ? undefined : "true",
    ids: (body.ids as string[] | undefined)?.join(","),
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
    if (!url.startsWith("/api")) {
      rescues.push(url);
      throw new TypeError(`browser request outside media-api: ${url}`);
    }
    init.signal?.throwIfAborted();
    const [path, search = ""] = url.replace(/^\/api/, "").split("?");
    const body = init.body ? JSON.parse(init.body as string) as Body : Object.fromEntries(new URLSearchParams(search));
    calls.push({ path, body, signal: init.signal });
    const out = await (routes[path] ?? defaults[path])?.(body);
    init.signal?.throwIfAborted();
    if (out === undefined) return refusal(404);
    return out instanceof Response ? out : new Response(JSON.stringify(out));
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

let corpus: MockDataSource;
let calls: Call[];
/** Browser requests outside media-api (for example /es or /bedrock); every test expects none. */
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
    dataSource: new ApiDataSource(),
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

it.each([{ removedCount: 0, expired: false }, { removedCount: 1, expired: false }, { removedCount: 332, expired: false },
  { removedCount: 1, expired: true }])("Unit B continues active browsing after $removedCount distant filter exits (expired=$expired)", async ({ removedCount, expired }) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  useApiMode(2);
  const offset = 4_000_000;
  const total = 9_000_000;
  const firstTouched = offset - 650_000;
  const epoch = Date.parse("2026-11-01T00:00:00Z");
  const removed = new Set<number>();
  const [template] = await corpus.getByIds(["img-0"]);
  let generated = 0;
  const imageAt = (ordinal: number) => {
    generated++;
    return { ...template, id: `logical-${ordinal}`, uploadTime: new Date(epoch - ordinal * 1000).toISOString() };
  };
  const tupleAt = (ordinal: number): SortValues => [epoch - ordinal * 1000, `logical-${ordinal}`];
  const ordinalOf = (id: string) => Number(id.replace("logical-", ""));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let pageReads = 0;
  calls = standInMediaApi(corpus, {
    "/images/search-after": async body => {
      const ordinal = ordinalOf(String((body.sortValues as SortValues)[1]));
      const indices: number[] = [];
      let candidate = body.reverse ? ordinal - 1 : ordinal + 1;
      while (indices.length < Number(body.length) && candidate >= 0 && candidate < total) {
        if (!removed.has(candidate)) indices.push(candidate);
        candidate += body.reverse ? -1 : 1;
      }
      if (body.reverse) indices.reverse();
      const payload = { data: indices.map(ordinal => ({ data: imageAt(ordinal) })), total: 0, sortValues: indices.map(tupleAt) };
      if (pageReads++ === 0) await held;
      return payload;
    },
    "/images/mget": body => ({ data: (body.ids as string[]).map(id => ({ data: {
      ...imageAt(ordinalOf(id)), userMetadata: { data: {
        lastModified: "2026-11-07T00:00:00Z", metadata: { data: {} },
        archived: { data: false }, usageRights: {}, photoshoot: {}, labels: { data: [{ data: "reviewed" }] },
      } },
    } })) }),
  });
  const initial = Array.from({ length: 1000 }, (_, index) => imageAt(offset + index));
  const params = { ...state().params, query: "-label:reviewed" };
  retainSortValues(buildSearchKey(params), initial, initial.map((_, index) => tupleAt(offset + index)), true);
  state().abortExtends();
  useSearchStore.setState({ params, results: initial, total, bufferOffset: offset,
    imagePositions: new Map(initial.map((image, index) => [image.id, offset + index])),
    startCursor: tupleAt(offset), endCursor: tupleAt(offset + 999) });
  await waitPastCooldown();
  const view = renderHook(() => useDataWindow("grid"));
  const layout = {};
  let clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const report = async (start: number, end: number) => {
    clock += 100;
    await act(async () => view.result.current.reportVisibleRange(start, end, true,
      { scrollTop: start * 100, viewportHeight: 600, layout }));
  };
  const operations: ReturnType<typeof createLabelOperation>[] = [];
  try {
    await report(700, 740);
    expect(pageReads).toBe(0);
    await report(810, 850);
    expect(pageReads).toBe(1);
    expect(state()._extendForwardInFlight).toBe(true);
    const retained = state();
    if (expired) vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    for (let first = 0; first < removedCount; first += 200) {
      const ids = Array.from({ length: Math.min(200, removedCount - first) }, (_, index) => `logical-${firstTouched + first + index}`);
      const operation = createLabelOperation(async command => {
        if (!expired) removed.add(ordinalOf(command.imageId));
        return { outcome: expired ? "unknown" : "acknowledged" };
      }, {
        readImages: (ids, signal) => expired ? Promise.resolve([]) : state().dataSource.getByIds(ids, signal),
        publishImages: images => publishImages(images.map(image => ({ image, enrichment: attachedEnrichment(image) }))),
      });
      operations.push(operation);
      await act(async () => { await operation.confirm({ action: "add", label: "reviewed", targetIds: ids },
        new Map(ids.map(id => [id, { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/fixture" }] } }]))); });
      if (expired) {
        await act(async () => { await vi.advanceTimersByTimeAsync(10_001); });
        expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "unknown", observation: "deadline" });
        const expiredClock = Date.now();
        vi.useRealTimers();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(expiredClock);
        ids.forEach(id => removed.add(ordinalOf(id)));
        await act(async () => {
          const images = await state().dataSource.getByIds(ids);
          publishImages(images.map(image => ({ image, enrichment: attachedEnrichment(image) })));
        });
      }
      await flush();
      expect(operation.getSnapshot()?.blocked).toBeUndefined();
      expect(operation.getSnapshot()?.items.every(item => item.observation === (expired ? "deadline" : "observed"))).toBe(true);
    }
    expect(removed.size).toBe(removedCount);
    expect(state().results).toBe(retained.results);
    expect(state().imagePositions).toBe(retained.imagePositions);
    expect(calls[0].signal?.aborted).toBe(false);
    await act(async () => { release(); await waitFor(() => !state()._extendForwardInFlight, "held continuation"); });
    expect(state().bufferOffset).toBe(offset + 200);
    await report(950, 990);
    await act(async () => { await waitFor(() => !state()._extendForwardInFlight, "forward continuation"); });
    expect(state().bufferOffset).toBe(offset + 400);
    for (const original of initial.slice(400)) {
      expect(state().results.find(image => image?.id === original.id)).toBe(original);
      expect(state().imagePositions.get(original.id)).toBe(retained.imagePositions.get(original.id));
      expect(ordinalOf(original.id) - removedCount).toBe(retained.imagePositions.get(original.id)! - removedCount);
    }
    await report(10, 50);
    await act(async () => { await waitFor(() => !state()._extendBackwardInFlight, "reverse continuation"); });
    expect(state().bufferOffset).toBe(offset + 200);
    expect(state().startCursor).toEqual(tupleAt(offset + 200));
    expect(state().endCursor).toEqual(tupleAt(offset + 1199));
    expect(state().results).toHaveLength(1000);
    expect(state().imagePositions.size).toBe(1000);
    expect(state().total).toBe(total);
    expect(generated).toBe(1600 + removedCount);
    expect(bodiesFor("/images/search-after").map(body => body.sortValues)).toEqual([
      tupleAt(offset + 999), tupleAt(offset + 1199), tupleAt(offset + 400),
    ]);
    expect(paths().filter(path => path !== "/images/search-after")).toEqual(Array(Math.ceil(removedCount / 200)).fill("/images/mget"));
  } finally {
    release();
    operations.forEach(operation => operation.cancelObservation());
    view.unmount();
    state().abortExtends();
    vi.unstubAllEnvs();
  }
});

it("Unit B restores an identity despite a missing cursor and invalid numeric hint", async () => {
  useApiMode(120_000);
  await state().search();
  calls.length = 0;
  await state().restoreAroundCursor("img-80000", null, 5, true);
  expect(state().focusedImageId).toBe("img-80000");
  expect(state().imagePositions.get("img-80000")).toBe(80_000);
  expect(state().results[state()._seekTargetLocalIndex]?.id).toBe("img-80000");
  expect(paths()).not.toContain("/images/window");
  expect(bodiesFor("/images/rank")).toHaveLength(1);
});

it.each([1001, 65001])("Unit B retains the %s tier until a deliberate action publishes bounds and window together", async total => {
  let changed = false;
  let counted = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  useApiMode(total, { routes: { "/images/count": async () => {
    if (changed) { counted = true; await held; }
    return { total: total - Number(changed), tickerCounts: {} };
  } } });
  await state().search();
  const before = state();
  const operation = admitLabelObservation([`img-${total - 1}`]);
  if (typeof operation !== "number") throw new Error(operation);
  recordLabelOutcome(operation, `img-${total - 1}`, "unknown");
  releaseLabelObservation(operation);
  changed = true;
  expect(state().total).toBe(total);
  expect(state().results).toBe(before.results);
  expect(isTwoTierFromTotal(state().total)).toBe(isTwoTierFromTotal(total));
  const publications: ReturnType<typeof state>[] = [];
  const unsubscribe = useSearchStore.subscribe(next => { if (next.total !== total) publications.push(next); });
  const pending = state().seek(0);
  try {
    await flush();
    expect(counted).toBe(true);
    expect(state().total).toBe(total);
    expect(state().results).toBe(before.results);
    release();
    await pending;
    expect(state().total).toBe(total - 1);
    expect(state().results).not.toBe(before.results);
    expect(state().bufferOffset).toBe(0);
    expect(publications.length).toBeGreaterThan(0);
    expect(publications.every(next => next.results !== before.results && next._seekGeneration > before._seekGeneration)).toBe(true);
    expect(isTwoTierFromTotal(state().total)).toBe(isTwoTierFromTotal(total - 1));
  } finally { release(); await pending; unsubscribe(); }
});

it("Unit B lets newer near-buffer browsing retire an in-flight indexed refill", async () => {
  useApiMode(30_000);
  await state().search();
  await waitFor(() => state().positionMap !== null, "map");
  await state().seek(1000);
  state().abortExtends();
  await waitPastCooldown();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  calls = standInMediaApi(corpus, { "/images/search-after": async body => {
    const page = await corpus.searchAfter(toParams(body), body.sortValues as SortValues, null, undefined, body.reverse as boolean);
    await held;
    return { data: page.hits.map(data => ({ data })), sortValues: page.sortValues };
  } });
  const view = renderHook(() => useDataWindow("table"));
  const retained = state();
  let pending!: Promise<void>;
  await act(async () => { pending = state().seek(15_000, "seek", undefined, "refill"); await flush(); });
  try {
    expect(bodiesFor("/images/search-after")).toHaveLength(2);
    await act(async () => view.result.current.reportVisibleRange(1000, 1020, true));
    expect(calls.every(call => call.signal?.aborted)).toBe(true);
    await act(async () => { release(); await pending; });
    expect(state().results).toBe(retained.results);
    expect(state().imagePositions).toBe(retained.imagePositions);
    expect(state()._seekGeneration).toBe(retained._seekGeneration);
    expect(state().loading).toBe(false);
  } finally { release(); await pending; view.unmount(); state().abortExtends(); }
});

it("Unit B cancels superseded exact bounds at the transport without publishing old completion", async () => {
  useApiMode(120_000);
  await state().search();
  const operation = admitLabelObservation(["distant"]);
  if (typeof operation !== "number") throw new Error(operation);
  recordLabelOutcome(operation, "distant", "unknown");
  releaseLabelObservation(operation);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let counts = 0;
  calls = standInMediaApi(corpus, { "/images/count": async () => {
    if (counts++ === 0) { await held; return { total: 120_000 }; }
    return { total: 119_999 };
  } });
  const obsolete = state().seek(7000);
  try {
    await waitFor(() => counts === 1, "held bounds");
    await state().seek(500);
    const successor = state();
    expect(calls.find(call => call.path === "/images/count")?.signal?.aborted).toBe(true);
    expect(successor.total).toBe(119_999);
    expect(successor.imagePositions.get("img-500")).toBe(500);
    release();
    await obsolete;
    expect(state().results).toBe(successor.results);
    expect(state()._seekGeneration).toBe(successor._seekGeneration);
    expect(state().loading).toBe(false);
    expect(state().error).toBeNull();
  } finally { release(); await obsolete; }
});

it.each([1000, 65000])("Unit B continues from an uncertain retained end at the %i tier boundary", async (total) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  useApiMode(total + 1);
  const params = { ...state().params, query: "label:reviewed" };
  const offset = total - 1000;
  const initial = await corpus.searchAfter({ ...params, offset, length: 1000 }, null);
  const resident = initial.hits.map(image => ({ ...image, lastModified: "2026-11-01T00:00:00Z",
    userMetadata: { labels: ["reviewed"], lastModified: "2026-11-01T00:00:00Z" } }));
  const newlyMatchingId = `img-${total}`;
  let projected = false;
  calls = standInMediaApi(corpus, { "/images/search-after": async body => {
    const page = await corpus.searchAfter(toParams(body), body.sortValues as SortValues, null, undefined, body.reverse as boolean);
    const selected = page.hits.flatMap((image, index) => image.id === newlyMatchingId && !projected ? [] : [{ image, tuple: page.sortValues[index] }]);
    return { total: 0, sortValues: selected.map(hit => hit.tuple), data: selected.map(({ image }) => ({ data: {
      ...image, lastModified: "2026-11-07T00:00:00Z", userMetadata: { data: {
        lastModified: "2026-11-07T00:00:00Z", archived: { data: false }, metadata: { data: {} }, usageRights: {}, photoshoot: {},
        labels: { data: [{ data: "reviewed" }] },
      } },
    } })) };
  } });
  state().abortExtends();
  retainSortValues(buildSearchKey(params), resident, initial.sortValues, true);
  useSearchStore.setState({ params, results: resident, bufferOffset: offset, total,
    newCountSince: "2026-11-01T00:00:00Z", imagePositions: new Map(resident.map((image, index) => [image.id, index + offset])),
    startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)!, _terminalEnd: null });
  const operation = admitLabelObservation([newlyMatchingId]);
  if (typeof operation !== "number") throw new Error(operation);
  recordLabelOutcome(operation, newlyMatchingId, "unknown");
  releaseLabelObservation(operation);
  projected = true;
  const observed = await state().dataSource.searchAfter({ ...params, ids: newlyMatchingId, length: 1 }, null);
  expect(acceptObservedImages(observed.hits, operation)).toHaveLength(1);
  calls.length = 0;
  await waitPastCooldown();
  const onNavigate = vi.fn();
  const view = renderHook(() => useDataWindow("table"));
  const traversal = renderHook(() => useImageTraversal(`img-${total - 1}`, onNavigate));
  try {
    await act(async () => { traversal.result.current.goToNext(); await flush(); });
    expect(bodiesFor("/images/search-after")).toHaveLength(2);
    expect(bodiesFor("/images/search-after")[0]).toMatchObject({ q: "label:reviewed", until: "2026-11-01T00:00:00Z",
      sortValues: initial.sortValues.at(-1) });
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: newlyMatchingId }), total);
    expect(state().total).toBe(total);
    expect(state().results).toHaveLength(1000);
    expect(state().imagePositions.get(resident.at(-1)!.id)).toBe(total - 1);
    expect(state().results.at(-2)).toBe(resident.at(-1));
    expect(view.result.current.twoTier).toBe(total > 1000);
    expect(view.result.current.virtualizerCount).toBe(total > 1000 ? total + 1 : 1000);
    const endIndex = total > 1000 ? total : 999;
    expect(view.result.current.getImage(endIndex)?.id).toBe(newlyMatchingId);
    expect(state()._terminalEnd?.position).toBe(total + 1);
    traversal.unmount();
    await act(async () => { await state().extendBackward(); });
    expect(view.result.current.virtualizerCount).toBe(total > 1000 ? total + 1 : 1000);
    expect(view.result.current.twoTier).toBe(total > 1000);
    expect(state().results.at(0)?.id).toBe(`img-${Math.max(0, offset + 1 - 200)}`);
    expect(calls.every(call => call.path === "/images/search-after")).toBe(true);
    act(() => state().queueBrowsePosition(total));
    expect(state()._browseNavigation?.targetOffset).toBe(total);
    act(() => state().abortExtends());
    await act(async () => { await state().seek(total, "seek", undefined, "refill"); });
    expect(state().imagePositions.get(newlyMatchingId)).toBe(total);
    expect(view.result.current.twoTier).toBe(total > 1000);
    expect(calls.some(call => ["/images/count", "/images/rank", "/images/keys"].includes(call.path))).toBe(false);
  } finally { traversal.unmount(); view.unmount(); state().abortExtends(); }
});

it("Unit B reacquires a held rank after dispatch without losing its identity destination", async () => {
  useApiMode(120_000);
  await state().search();
  const target = await corpus.searchAfter({ ...state().params, ids: "img-5000", length: 1 }, null);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let ranks = 0;
  calls = standInMediaApi(corpus, { "/images/rank": async () => {
    if (ranks++ === 0) { await held; return { rank: 4999 }; }
    return { rank: 5000 };
  } });
  const pending = state().restoreAroundCursor("img-5000", target.sortValues[0], 4999, true);
  try {
    await waitFor(() => ranks === 1, "held rank");
    const operation = admitLabelObservation(["distant"]);
    if (typeof operation !== "number") throw new Error(operation);
    recordLabelOutcome(operation, "distant", "unknown");
    releaseLabelObservation(operation);
    release();
    await pending;
    expect(ranks).toBe(2);
    expect(state().focusedImageId).toBe("img-5000");
    expect(state().imagePositions.get("img-5000")).toBe(5000);
    expect(state().results[state()._seekTargetLocalIndex]?.id).toBe("img-5000");
    expect(state().loading).toBe(false);
  } finally { release(); await pending; }
});

it("Unit B reconciles a restoring identity that moves into its neighbour page after observation stops", async () => {
  useApiMode(2, { orderBy: "lastModified" });
  const [template] = await corpus.getByIds(["img-0"]);
  const epoch = Date.parse("2026-11-01T00:00:00Z");
  const before = Array.from({ length: 100 }, (_, index) => ({ id: `before-${index}`, time: epoch - 1000 + index }));
  const middle = { id: "middle", time: epoch + 100 };
  const after = Array.from({ length: 99 }, (_, index) => ({ id: `after-${index}`, time: epoch + 1000 + index }));
  let projected = false;
  const target = () => ({ id: "target", time: epoch + (projected ? 200 : 0) });
  const tuple = (image: { id: string; time: number }): SortValues => [image.time, epoch - 86_400_000, image.id];
  const payload = (images: { id: string; time: number }[]) => ({ total: 10_000, sortValues: images.map(tuple),
    data: images.map(image => ({ links: [], actions: [], data: { ...template, id: image.id,
      uploadTime: new Date(epoch - 86_400_000).toISOString(), lastModified: new Date(image.time).toISOString(),
      userMetadata: { data: { lastModified: new Date(image.time).toISOString(), archived: { data: false },
        metadata: { data: {} }, usageRights: {}, photoshoot: {},
        labels: { data: image.id === "target" && projected ? [{ data: "reviewed" }] : [] } } },
    } })) });
  const operation = admitLabelObservation(["target"]);
  if (typeof operation !== "number") throw new Error(operation);
  recordLabelOutcome(operation, "target", "unknown");
  releaseLabelObservation(operation);
  calls = standInMediaApi(corpus, {
    "/images/rank": body => ({ rank: Number((body.sortValues as SortValues)[0]) === epoch ? 5000 : 5001 }),
    "/images/search-after": body => {
      if (body.ids) return payload([target()]);
      const cursor = body.sortValues as SortValues;
      if (!body.reverse) projected = true;
      const ordered = [...before, middle, target(), ...after];
      const matching = ordered.filter(image => body.reverse ? image.time < Number(cursor[0]) : image.time > Number(cursor[0]));
      return payload(body.reverse ? matching.slice(-Number(body.length)) : matching.slice(0, Number(body.length)));
    },
  });
  useSearchStore.setState({ total: 10_000, results: [template], imagePositions: new Map([[template.id, 0]]) });
  await state().restoreAroundCursor("target", tuple(target()), 5000, true);
  expect(state().results.filter(image => image?.id === "target")).toHaveLength(1);
  expect(state().results[state()._seekTargetLocalIndex]?.id).toBe("target");
  expect(state().imagePositions.get("target")).toBe(5001);
  expect(state().results[state()._seekTargetLocalIndex]?.userMetadata?.labels).toEqual(["reviewed"]);
  expect(getRetainedSortValues("target", buildSearchKey(state().params))).toEqual(tuple(target()));
  expect(bodiesFor("/images/rank")).toHaveLength(2);
});

it("keeps the freshest retained owner and the incoming AI ordinal when rejecting a projection", async () => {
  useApiMode(2);
  const [original, unrelated] = await corpus.getByIds(["img-0", "img-1"]);
  const resource = { resource: { links: [] }, actions: [] };
  const observed = { ...original, metadata: { description: "Observed" },
    userMetadata: { labels: ["news"], lastModified: "2026-11-02T00:00:00Z" } };
  const operation = admitLabelObservation([original.id]);
  if (typeof operation !== "number") throw new Error(operation);
  stampImageRead(observed, resource, captureImageRead(), "lean");
  acceptObservedImages([observed], operation);
  useSearchStore.setState({ results: [observed, unrelated], imagePositions: new Map([[observed.id, 0], [unrelated.id, 1]]) });
  _resetMetadataCache();
  useSelectionStore.setState({ selectedIds: new Set([original.id]), anchorId: original.id });
  useSelectionStore.getState().publishSelectedMetadata([observed]);
  const newer = { ...observed, metadata: { description: "Newer selected projection" },
    userMetadata: { labels: ["external"], lastModified: "2026-11-03T00:00:00Z" } };
  const previousSource = useSelectionStore.getState().dataSource;
  vi.spyOn(corpus, "getByIds").mockResolvedValue([newer]);
  useSelectionStore.setState({ dataSource: corpus });
  try {
    await useSelectionStore.getState().hydrate();
    expect(useSelectionStore.getState().metadataCache.get(original.id)).toBe(newer);
    useSearchStore.setState({ results: [...state().results] });
    expect(state().results[0]).toBe(newer);
    expect(state().results[1]).toBe(unrelated);
    const aiHit = { ...original, __aiScore: 17, userMetadata: { labels: [], lastModified: "2026-11-01T00:00:00Z" } };
    stampImageRead(aiHit, undefined, captureImageRead(), "lean");
    useSearchStore.setState({ results: [aiHit, unrelated] });
    expect(state().results[0]?.metadata).toBe(newer.metadata);
    expect(state().results[0]?.__aiScore).toBe(17);
    const equalClock = { ...aiHit, userMetadata: { labels: ["contradiction"], lastModified: newer.userMetadata.lastModified } };
    stampImageRead(equalClock, undefined, captureImageRead(), "lean");
    useSearchStore.setState({ results: [equalClock, unrelated] });
    expect(state().results[0]?.userMetadata?.labels).toEqual(["external"]);
  } finally {
    useSelectionStore.getState().clear();
    useSelectionStore.setState({ dataSource: previousSource });
  }
});

it("releases an old API response after readback without restoring metadata or editing authority", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/touched" }] };
  const original = {
    id: "touched", uploadTime: "2026-11-01T00:00:00Z", uploadedBy: "fixture",
    source: { mimeType: "image/jpeg", dimensions: { width: 400, height: 300 } },
    metadata: { description: "Before" },
  };
  const envelope = (version: number, labels: string[], permitted = false) => ({
    ...resource, links: permitted ? resource.links : [], actions: [],
    data: { ...original, metadata: { description: `Projection ${version}` },
      userMetadata: { data: { lastModified: `2026-11-0${version}T00:00:00Z`,
        archived: { data: false }, metadata: { data: {} }, usageRights: {}, photoshoot: {},
        labels: { data: labels.map(label => ({ data: label })) } } } },
  });
  const stalePayload = structuredClone({ data: [envelope(1, [], true), {
    data: { ...original, id: "unrelated", metadata: { description: "Unrelated current body" } },
  }], total: 2, sortValues: [[200, "touched"], [100, "unrelated"]] });
  let pageReads = 0;
  let excluded = false;
  let currentProjection = envelope(2, ["news"]);
  useApiMode(2, { routes: {
    "/images/search-after": async () => {
      if (pageReads++ === 0) { await held; return stalePayload; }
      return excluded ? { data: [], total: 0, sortValues: [] }
        : { data: [currentProjection], total: 1, sortValues: [[200, "touched"]] };
    },
    "/images/mget": () => ({ data: [currentProjection] }),
  } });
  useSearchStore.setState({ results: [original], total: 1, imagePositions: new Map([["touched", 0]]) });
  _resetMetadataCache();
  useSelectionStore.setState({ selectedIds: new Set([original.id]), anchorId: original.id });
  useEnrichmentStore.getState().setEnrichment(new Map([["touched", { resource }]]));
  const oldRead = state().search();
  const operation = createLabelOperation(async () => ({ outcome: "acknowledged" }), {
    readImages: (ids, signal) => state().dataSource.getByIds(ids, signal),
    publishImages: images => publishImages(images.map(image => ({ image, enrichment: attachedEnrichment(image) }))),
  });
  try {
    await operation.confirm({ action: "add", label: "news", targetIds: ["touched"] }, new Map([["touched", { resource }]]));
    await waitFor(() => operation.getSnapshot()?.items[0].observation === "observed", "owned publication");
    const accepted = state().results[0];
    expect(accepted?.userMetadata?.labels).toEqual(["news"]);
    release();
    await oldRead;
    expect(state().results[0]).toBe(accepted);
    expect(state().results[1]?.metadata.description).toBe("Unrelated current body");
    expect(useEnrichmentStore.getState().data.get("touched")?.resource?.links).toEqual([]);
    currentProjection = envelope(1, [], true);
    useSearchStore.setState({ params: { ...state().params, query: "subsequent" }, focusedImageId: null, _phantomFocusImageId: null });
    await state().search();
    await waitFor(() => !state().loading && state().sortAroundFocusStatus === null, "subsequent query");
    expect(state().results[0]?.metadata).toBe(accepted?.metadata);
    expect(state().results[0]?.userMetadata).toBe(accepted?.userMetadata);
    expect(useEnrichmentStore.getState().data.get("touched")?.resource?.links).toEqual([]);
    currentProjection = envelope(3, [], true);
    useSearchStore.setState({ params: { ...state().params, query: "newer" }, focusedImageId: null, _phantomFocusImageId: null });
    await state().search();
    await waitFor(() => !state().loading && state().sortAroundFocusStatus === null, "newer query");
    expect(state().results[0]?.userMetadata?.labels).toEqual([]);
    expect(state().results[0]?.metadata.description).toBe("Projection 3");
    expect(useSelectionStore.getState().metadataCache.get(original.id)).toBe(state().results[0]);
    expect(useEnrichmentStore.getState().data.get("touched")?.resource?.links).toEqual(resource.links);
    useSelectionStore.getState().clear();
    _resetMetadataCache();
    excluded = true;
    await state().search();
    expect(state().results).toEqual([]);
    excluded = false;
    currentProjection = envelope(1, [], true);
    await state().search();
    expect(state().results).toEqual([undefined]);
    expect(useEnrichmentStore.getState().data.get("touched")?.resource?.links).toEqual([]);
    currentProjection = envelope(3, ["conflicting equal-version projection"], true);
    await state().search();
    expect(state().results).toEqual([undefined]);
    currentProjection = envelope(3, [], true);
    await state().search();
    expect(state().results[0]?.metadata.description).toBe("Projection 3");
    currentProjection = envelope(4, [], true);
    await state().search();
    expect(state().results[0]?.metadata.description).toBe("Projection 4");
  } finally {
    release();
    await oldRead;
    useSelectionStore.getState().clear();
    vi.clearAllTimers();
    vi.unstubAllEnvs();
  }
});

it("lifecycle publication retains slots and selection while fencing stale bodies and authority", async () => {
  useApiMode(20);
  const page = await corpus.searchAfter({ length: 20, nonFree: "true" }, null);
  const original = { ...page.hits[1], __aiScore: 0.75 };
  const overlay = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/fixture" }] } };
  const issued = captureImageRead();
  stampImageRead(original, overlay, issued, "full");
  const results = page.hits.map((image, index) => index === 1 ? original : image);
  const positions = new Map(results.map((image, index) => [image.id, index]));
  useSearchStore.setState({ results, imagePositions: positions, total: 20, bufferOffset: 0 });
  const selectedIds = new Set([original.id]);
  useSelectionStore.setState({ selectedIds, anchorId: original.id });
  useSelectionStore.getState().metadataCache.set(original.id, original);
  try {
    publishUnavailableImages([original.id], "deleted");
    const unavailable = state().results[1]!;
    expect(unavailable).toMatchObject({ id: original.id, __availability: "deleted", __aiScore: 0.75 });
    expect(unavailable.source.dimensions).toEqual(original.source.dimensions);
    expect(unavailable.thumbnail).toBeUndefined();
    expect(unavailable.metadata).toEqual({});
    expect(state().results[0]).toBe(results[0]);
    expect(state().imagePositions).toBe(positions);
    expect(state().total).toBe(20);
    expect(useSelectionStore.getState().selectedIds).toBe(selectedIds);
    expect(useSelectionStore.getState().anchorId).toBe(original.id);
    expect(useSelectionStore.getState().metadataCache.get(original.id)).toBe(unavailable);
    expect(acceptImageRead(original, unavailable)).toBe(unavailable);
    expect(acceptImageOverlay(original.id, overlay).resource?.links).toEqual([]);
    expect(isLabelAuthorityCurrent(original.id, overlay.resource)).toBe(false);
    expect(protectsImageOmission(original.id, issued)).toBe(true);
    const later = { ...original };
    stampImageRead(later, overlay, captureImageRead(), "full");
    expect(acceptImageRead(later)?.__availability).toBe("deleted");
    const peer = results[2];
    publishUnavailableImages([peer.id], "unavailable");
    const accessible = { ...peer, userMetadata: { lastModified: "2026-11-07T00:00:00Z" } };
    stampImageRead(accessible, undefined, captureImageRead(), "full");
    expect(acceptImageRead(accessible, state().results[2])).toBe(accessible);
    expect(getImageAvailability(peer.id)).toBeUndefined();
    publishUnavailableImages([peer.id], "unavailable");
    const stale = { ...peer, userMetadata: { lastModified: "2026-11-06T00:00:00Z" } };
    stampImageRead(stale, undefined, captureImageRead(), "full");
    expect(acceptImageRead(stale)?.__availability).toBe("unavailable");
    expect(getImageAvailability(peer.id)).toBe("unavailable");
  } finally {
    _resetReconcileQueue();
    useSelectionStore.getState().clear();
  }
});

it("metadata-only publication does not compact retained deletion after the viewport grows", async () => {
  useApiMode(5);
  registerScrollContainer(null);
  const page = await corpus.searchAfter({ length: 5, nonFree: "true" }, null);
  const positions = new Map(page.hits.map((image, index) => [image.id, index]));
  useSearchStore.setState({ results: page.hits, imagePositions: positions, total: 5, bufferOffset: 0 });
  publishUnavailableImages([page.hits[1].id], "deleted");
  const container = document.createElement("div");
  Object.defineProperties(container, { clientHeight: { value: 1000 }, scrollHeight: { value: 1000 } });
  for (const image of page.hits) {
    const cell = document.createElement("div");
    cell.dataset.cellId = image.id;
    container.append(cell);
  }
  document.body.append(container);
  registerScrollContainer(container);
  try {
    const retained = state().results;
    const updated = { ...page.hits[2], metadata: { description: "Fresh metadata after density change" } };
    publishImage(updated, {});
    expect(state().results.map(image => image?.id)).toEqual(page.hits.map(image => image.id));
    expect(state().results[1]).toBe(retained[1]);
    expect(state().results[2]).toBe(updated);
    expect(state().imagePositions).toBe(positions);
    expect(state().total).toBe(5);
  } finally {
    registerScrollContainer(null);
    container.remove();
  }
});

it("buffer publication replaces resident content without changing its slot", async () => {
  try {
    useApiMode(20);
    const page = await corpus.searchAfter({ length: 20, nonFree: "true" }, null);
    const original = page.hits[5];
    const positions = new Map(page.hits.map((image, index) => [image.id, index]));
    useSearchStore.setState({ results: page.hits, imagePositions: positions, total: 20 });
    _resetMetadataCache();
    const selectedIds = new Set([original.id]);
    useSelectionStore.setState({ selectedIds, anchorId: original.id });
    useSelectionStore.getState().metadataCache.set(original.id, original);
    const revision = useSelectionStore.getState().metadataRevision;
    const updated = { ...original, metadata: { ...original.metadata, description: "A2 published description" },
      userMetadata: { ...original.userMetadata, labels: ["A2 published label"] } };
    const peer = { ...page.hits[6], userMetadata: { labels: ["A3 grouped label"] } };
    const notifications: unknown[] = [];
    const unsubscribe = useSearchStore.subscribe((next, previous) => {
      if (next.results !== previous.results) notifications.push(next.results);
    });
    const enrichmentUpdates = vi.spyOn(useEnrichmentStore.getState(), "upsertEnrichment");
    const selectionUpdates = vi.spyOn(useSelectionStore.getState(), "publishSelectedMetadata");
    publishImages([
      { image: updated, enrichment: { resource: { links: [] }, actions: [] } },
      { image: peer, enrichment: { resource: { links: [] }, actions: [] } },
    ]);
    unsubscribe();
    expect(notifications).toHaveLength(1);
    expect(enrichmentUpdates).toHaveBeenCalledTimes(1);
    expect(selectionUpdates).toHaveBeenCalledTimes(1);
    expect(state().results[6]).toBe(peer);
    const accepted = state().results[5]!;
    expect(accepted.metadata.description).toBe("A2 published description");
    expect(accepted.userMetadata?.labels).toEqual(["A2 published label"]);
    expect(state().imagePositions).toBe(positions);
    expect(state().results[4]).toBe(page.hits[4]);
    expect(state().results.map(image => image?.id)).toEqual(page.hits.map(image => image.id));
    expect(useSelectionStore.getState().metadataCache.get(original.id)).toBe(updated);
    expect(useSelectionStore.getState().metadataRevision).toBe(revision + 1);
    expect(useSelectionStore.getState().selectedIds).toBe(selectedIds);
    expect(useSelectionStore.getState().anchorId).toBe(original.id);
    expect(useEnrichmentStore.getState().data.get(original.id)).toEqual({ resource: { links: [] }, actions: [] });
    useSelectionStore.setState({ selectedIds: new Set() });
    const newer = { ...updated, metadata: { ...updated.metadata, description: "A2 newer page" } };
    const nextPage = page.hits.map(image => image.id === newer.id ? newer : image);
    useSearchStore.setState({ results: nextPage });
    useSelectionStore.getState().publishSelectedMetadata([newer]);
    expect(state().results[5]!).toBe(newer);
    expect(useSelectionStore.getState().metadataCache.get(original.id)).toBe(newer);
    useSelectionStore.setState({ selectedIds });
    const offscreenResults = state().results.filter(image => image?.id !== original.id);
    useSearchStore.setState({ results: offscreenResults, imagePositions: new Map(offscreenResults.map((image, index) => [image!.id, index])) });
    useEnrichmentStore.getState().upsertEnrichment(new Map([[original.id, { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/fixture" }] } }]]));
    publishImage(updated, { resource: { links: [] }, actions: [] });
    expect(state().results).toBe(offscreenResults);
    expect(useSelectionStore.getState().metadataCache.get(original.id)).toBe(updated);
    expect(useEnrichmentStore.getState().data.get(original.id)?.resource?.links).toEqual([]);
  } finally {
    _resetReconcileQueue();
    useSelectionStore.getState().clear();
  }
});

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
    const expectedStart = Math.max(0, offset - 100);
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
  const totalImages = 30_000;
  const defaultBoundary = totalImages * 0.2;

  afterEach(() => {
    state().abortExtends();
    vi.useRealTimers();
    registerScrollGeometry(originalGeometry);
  });

  async function setup(orderBy: string, offset: number, ratio = 0.2, length = 200, columns = 1) {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    useApiMode(totalImages, { orderBy, sparse: true });
    if (ratio !== 0.2) corpus = new MockDataSource(totalImages, [{ field: "lastModified", ratio }]);
    if (ratio === 0) delete (await corpus.getByIds(["img-0"]))[0].lastModified;
    registerScrollGeometry({ rowHeight: 100, columns });
    useEnrichmentStore.getState().setEnrichment(new Map());
    const boundary = totalImages * ratio;
    const params = state().params;
    if (ratio > 0 && ratio < 1) {
      const tied = await corpus.searchAfter({ ...params, length: 3 }, null);
      for (const image of tied.hits) {
        image.lastModified = orderBy.startsWith("-") ? "1900-01-01T00:00:00Z" : "2100-01-01T00:00:00Z";
        image.uploadTime = "2026-01-01T00:00:00Z";
      }
    }
    const initial = await corpus.searchAfter({ ...params, offset, length }, null);
    retainSortValues(buildSearchKey(params), initial.hits, initial.sortValues, true);
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
      results: initial.hits, bufferOffset: offset, total: totalImages,
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
    const offset = defaultBoundary + distance;
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

  it("admits one paired body and tuple when an image crosses between the two backward responses", async () => {
    const { initial, firstPage, valuedPage, params } = await setup("lastModified", defaultBoundary + 40);
    const original = firstPage.hits[0];
    const movedTuple: SortValues = [...valuedPage.sortValues[0].slice(0, -1), original.id];
    const moved: typeof original = {
      ...original, lastModified: new Date(Number(movedTuple[0])).toISOString(),
      usageRights: { ...original.usageRights, category: original.usageRights?.category === "handout" ? "agency" : "handout" },
    };
    valuedPage.hits[0] = moved;
    valuedPage.sortValues[0] = movedTuple;

    await state().extendBackward();

    const accepted = [...valuedPage.hits, ...firstPage.hits.slice(1)];
    expect(state().results.map(image => image?.id)).toEqual([...accepted, ...initial.hits].map(image => image.id));
    expect(state().results.filter(image => image?.id === original.id)).toHaveLength(1);
    expect(state().results.find(image => image?.id === original.id)?.lastModified).toBe(moved.lastModified);
    if (mode === "media-api") expect(useEnrichmentStore.getState().data.get(original.id)?.usageRights).toEqual(moved.usageRights);
    expect(getRetainedSortValues(original.id, buildSearchKey(params))).toEqual(movedTuple);
    expect(state().startCursor).toEqual(valuedPage.sortValues[0]);
    expect(state()._lastPrependCount).toBe(199);
    expect(state().bufferOffset).toBe(defaultBoundary + 40 - 199);
    for (const [index, image] of initial.hits.entries()) {
      expect(state().imagePositions.get(image.id)).toBe(defaultBoundary + 40 + index);
    }
  });

  it("keeps complete pages, full-buffer eviction and focus coherent across the boundary", async () => {
    const { initial } = await setup("-lastModified", defaultBoundary + 40, 0.2, 1000, 3);
    await state().extendBackward();
    const expected = await expectBuffer(defaultBoundary - 160, 1000);
    expect(state().focusedImageId).toBe(initial.hits[50].id);
    expect(state()._lastPrependCount).toBe(200);
    for (const image of initial.hits.slice(-200)) expect(state().imagePositions.has(image.id)).toBe(false);
    expect(state().endCursor).toEqual(expected.sortValues.at(-1));
  });

  it.each(["lastModified", "-lastModified"])("keeps forward valued-to-null crossing under %s to one read", async (orderBy) => {
    const { initial, params } = await setup(orderBy, defaultBoundary - 200);
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

    await expectBuffer(defaultBoundary - 200, 400);
    expect(state().focusedImageId).toBe(initial.hits[50].id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a mixed corpus's valued-zone reverse page to one read", async () => {
    const { requests } = await setup("-lastModified", defaultBoundary - 500);
    await state().extendBackward();
    await expectBuffer(defaultBoundary - 700, 400);
    expect(requests).toHaveLength(1);
  });

  it.each([1, 2])("cancels request %s without publishing either part of the prepend", async (requestNumber) => {
    const { initial, transport, requests } = await setup("-lastModified", defaultBoundary + 40);
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
    expect(state().bufferOffset).toBe(defaultBoundary + 40);
    expect(state()._prependGeneration).toBe(0);
    expect(state()._extendBackwardInFlight).toBe(false);
    expect(useEnrichmentStore.getState().data.size).toBe(0);
  });

  it("keeps the original buffer when the boundary read fails", async () => {
    const { initial, transport, requests } = await setup("-lastModified", defaultBoundary + 40);
    transport.failBoundary = true;
    await state().extendBackward();
    expect(requests).toHaveLength(2);
    expect(state().results).toBe(initial.hits);
    expect(state().bufferOffset).toBe(defaultBoundary + 40);
    expect(state().error).not.toBeNull();
    expect(state()._prependGeneration).toBe(0);
    expect(state()._extendBackwardInFlight).toBe(false);
    expect(useEnrichmentStore.getState().data.size).toBe(0);
  });

  it("rejects an un-aborted second backward page after forward eviction and permits fresh loading", async () => {
    const { transport, requests } = await setup("-lastModified", defaultBoundary + 40, 0.2, 1000);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let capturedSignal: AbortSignal | null | undefined;
    transport.beforeReply = async (number, signal) => {
      if (number !== 2) return;
      capturedSignal = signal;
      await held;
    };
    const source = state().dataSource;
    const original = source.searchAfter.bind(source);
    const reads = vi.spyOn(source, "searchAfter").mockImplementation((...args) =>
      args[4] ? original(...args) : corpus.searchAfter(...args));
    const pending = state().extendBackward();
    try {
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      await state().extendForward();
      await expectBuffer(defaultBoundary + 240, 1000);
      const published = state().results;
      expect(capturedSignal?.aborted).toBe(false);
      release();
      await pending;
      expect(state().results).toBe(published);
      expect(state()._extendBackwardInFlight).toBe(false);
      expect(state()._prependGeneration).toBe(0);
      expect(useEnrichmentStore.getState().data.size).toBe(0);
      reads.mockImplementation((...args) => corpus.searchAfter(...args));
      await state().extendBackward();
      await expectBuffer(defaultBoundary + 40, 1000);
      expect(state()._extendBackwardInFlight).toBe(false);
    } finally {
      release();
      await pending;
    }
  });
});

beforeEach(() => {
  resetImageFreshnessForTests();
  rescues = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(rescues).toEqual([]);
});

describe("API mode: routing and counting", () => {
  it("opens no API PIT, counts exactly once and restores arrivals with either direct PIT outcome", async () => {
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

    try {
      for (const pitId of [null, "fixture-restored-pit"]) {
        const direct = new ElasticsearchDataSource();
        const openPit = vi.spyOn(direct, "openPit");
        if (pitId) openPit.mockResolvedValue(pitId);
        else openPit.mockRejectedValue(new Error("PIT unavailable"));
        vi.spyOn(direct, "closePit").mockResolvedValue();
        vi.spyOn(direct, "searchAfter").mockResolvedValue({ hits: [], total: 0, sortValues: [] });
        vi.spyOn(direct, "countWithTickers").mockResolvedValue({ count: 0, tickerCounts: {} });
        useSearchStore.setState({ dataSource: direct, params: { nonFree: "true" }, pitId: null, newCount: 0, newCountSince: null });
        const frozenUntil = "2026-04-26T10:00:00.000Z";
        await state().search(undefined, { frozenUntil, frozenNewCount: 134 });
        expect(state()).toMatchObject({ pitId, newCount: 134, newCountSince: frozenUntil, total: 0, loading: false });
        expect(direct.openPit).toHaveBeenCalledOnce();
        expect(direct.searchAfter).toHaveBeenCalledWith(expect.objectContaining({ until: frozenUntil }), null, null, expect.any(AbortSignal));
        expect(direct.countWithTickers).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ until: frozenUntil }));
      }
    } finally {
      useSearchStore.setState({ dataSource: Object.assign(corpus, { searchByAi: undefined }), params: { aiQuery: "poll-cleanup" }, pitId: null });
      await state().search();
    }
  });

  it("publishes the first page's tickers from media-api's count, without a sort", async () => {
    useApiMode(120_000);
    await state().search();

    expect(state().tickerCounts).toEqual({ "GNM-owned": { value: 7, searchClause: "is:GNM-owned", backgroundColour: "#005689" } });
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

describe("API mode: extension duplicate exclusion", () => {
  it.each(["forward", "backward"] as const)(
    "advances %s duplicate-only and short pages without republishing residents or disabling later demand",
    async (direction) => {
      let response: unknown;
      useApiMode(10_000, { routes: { "/images/search-after": () => response } });
      const initial = await corpus.searchAfter({ ...state().params, offset: 2000, length: 200 }, null);
      const searchKey = buildSearchKey(state().params);
      retainSortValues(searchKey, initial.hits, initial.sortValues, true);
      useSearchStore.setState({
        results: initial.hits, bufferOffset: 2000, total: 10_000,
        imagePositions: new Map(initial.hits.map((image, index) => [image.id, 2000 + index])),
        startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)!,
      });
      const duplicate = initial.hits[1];
      const originalOverlay = { valid: true };
      useEnrichmentStore.getState().setEnrichment(new Map([[duplicate.id, originalOverlay]]));
      const before = state();
      const overlays = useEnrichmentStore.getState().data;
      const boundary = (direction === "forward" ? before.endCursor : before.startCursor)!;
      const step = direction === "forward" ? -1000 : 1000;
      const duplicateTuple: SortValues = [Number(boundary[0]) + step, duplicate.id];
      const duplicateEntity = { data: { ...duplicate, valid: false, lastModified: "2026-11-06T12:00:00Z" } };
      response = { data: [duplicateEntity], sortValues: [duplicateTuple], total: 0 };
      const extend = direction === "forward" ? state().extendForward : state().extendBackward;
      vi.useFakeTimers({ toFake: ["Date"] });
      state().abortExtends();
      await waitPastCooldown();

      await extend();

      expect(paths()).toEqual(["/images/search-after"]);
      expect(state().results).toBe(before.results);
      expect(state().imagePositions).toBe(before.imagePositions);
      expect(state()._arrivingImageIds).toBe(before._arrivingImageIds);
      expect(state()._prependGeneration).toBe(before._prependGeneration);
      expect(state()._forwardEvictGeneration).toBe(before._forwardEvictGeneration);
      expect(state().bufferOffset).toBe(before.bufferOffset);
      expect(useEnrichmentStore.getState().data).toBe(overlays);
      expect(getRetainedSortValues(duplicate.id, searchKey)).toEqual(initial.sortValues[1]);
      expect(direction === "forward" ? state().endCursor : state().startCursor).toEqual(duplicateTuple);

      const fresh = await corpus.searchAfter(
        { ...state().params, length: 1 }, boundary, null, undefined, direction === "backward",
      );
      const freshTuple: SortValues = [Number(boundary[0]) + step * 2, fresh.hits[0].id];
      const nextDuplicateTuple: SortValues = [Number(boundary[0]) + step * 3, duplicate.id];
      const freshEntity = { data: { ...fresh.hits[0], valid: false } };
      response = {
        data: direction === "forward" ? [freshEntity, duplicateEntity] : [duplicateEntity, freshEntity],
        sortValues: direction === "forward" ? [freshTuple, nextDuplicateTuple] : [nextDuplicateTuple, freshTuple],
        total: 0,
      };
      await extend();

      expect(bodiesFor("/images/search-after")).toHaveLength(2);
      expect(bodiesFor("/images/search-after")[1]).toMatchObject({ sortValues: duplicateTuple, reverse: direction === "backward" });
      expect(state().results).toHaveLength(201);
      expect(state().results.find((image) => image?.id === duplicate.id)).toBe(duplicate);
      expect(useEnrichmentStore.getState().data.get(duplicate.id)).toBe(originalOverlay);
      expect(useEnrichmentStore.getState().data.get(fresh.hits[0].id)?.valid).toBe(false);
      expect(getRetainedSortValues(fresh.hits[0].id, searchKey)).toEqual(freshTuple);
      expect(getRetainedSortValues(duplicate.id, searchKey)).toEqual(initial.sortValues[1]);
      for (const image of initial.hits) {
        expect(state().imagePositions.get(image.id)).toBe(before.imagePositions.get(image.id));
      }
      if (direction === "backward") {
        expect(state()._lastPrependCount).toBe(1);
        expect(state()._arrivingImageIds).toEqual(new Set([fresh.hits[0].id]));
      }

      const published = state();
      response = { data: [], sortValues: [], total: 0 };
      await waitPastCooldown();
      await extend();
      expect(bodiesFor("/images/search-after")[2]).toMatchObject({ sortValues: nextDuplicateTuple });
      expect(paths()).toEqual(Array(3).fill("/images/search-after"));
      expect(state().results).toBe(published.results);
      expect(state().imagePositions).toBe(published.imagePositions);
      expect(state()._windowRecovery).toMatchObject({ terminal: true, retainedOnly: true });
      expect(direction === "forward" ? state().endCursor : state().startCursor).toEqual(nextDuplicateTuple);
      expect(state().total).toBe(before.total);
      expect(state().error).toBeNull();
      const later = await corpus.searchAfter({
        ...state().params, offset: direction === "forward" ? 2201 : 1998, length: 1,
      }, null);
      response = { data: later.hits.map(data => ({ data })), sortValues: later.sortValues, total: 0 };
      await extend();
      expect(bodiesFor("/images/search-after")).toHaveLength(4);
      expect(bodiesFor("/images/search-after")[3]).toMatchObject({ sortValues: nextDuplicateTuple });
      expect(state().results.some(image => image?.id === later.hits[0].id)).toBe(true);
      const operation = admitLabelObservation([duplicate.id]);
      if (typeof operation !== "number") throw new Error(operation);
      const observed = { ...duplicate, userMetadata: { labels: ["news"], lastModified: "2026-11-06T00:00:00Z" } };
      const positive = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/fixture" }] } };
      stampImageRead(observed, positive, captureImageRead(), "lean");
      acceptObservedImages([observed], operation);
      publishImage(observed, positive);
      const retained = state().results;
      response = { data: [duplicateEntity], sortValues: [nextDuplicateTuple], total: 0 };
      await waitPastCooldown();
      await extend();
      expect(state().results).toBe(retained);
      expect(useEnrichmentStore.getState().data.get(duplicate.id)?.resource?.links).toEqual([]);
      state().abortExtends();
    },
  );
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

  it.each(FAILURE_KINDS)("U6z keeps browsing usable when the map read is %s", async (kind) => {
    useApiMode(20_000, { routes: { "/images/keys": () => failedRead(kind, "keys") } });
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
    expect(bodiesFor("/images/search-after").some((b) => (b.ids as string[] | undefined)?.join() === "img-70000")).toBe(true);
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
  it.each(FAILURE_KINDS)("U6z/KUP-036 does not turn a %s first page into empty success", async (kind) => {
    useApiMode(120_000, { routes: { "/images/search-after": () => failedRead(kind, "search-after") } });
    await state().search();
    await flush();

    expect(state().error).not.toBeNull();
    expect(state().loading).toBe(false);
    expect(state().results).toEqual([]);
    expect(state().imagePositions.size).toBe(0);
    expect(bodiesFor("/images/search-after")).toHaveLength(1);
    expect(state().pitId).toBeNull();
  });

  it.each(FAILURE_KINDS.flatMap(kind =>
    (["forward", "backward", "window", "deep rank"] as const).map(operation => ({ kind, operation })),
  ))("U6z/KUP-036 retains the committed buffer on $kind $operation reads", async ({ kind, operation }) => {
    useApiMode(120_000);
    await state().search();
    if (operation === "backward") await state().seek(60_000);
    await flush();
    await waitPastCooldown();
    const before = state();
    const enrichment = useEnrichmentStore.getState().data;
    const endpoint = operation === "window" ? "window" : operation === "deep rank" ? "rank" : "search-after";
    calls = standInMediaApi(corpus, { [`/images/${endpoint}`]: () => failedRead(kind, endpoint) });
    const publications: unknown[] = [];
    const unsubscribe = useSearchStore.subscribe((next) => { publications.push(next.results); });
    try {
      if (operation === "window") await state().seek(5_000);
      else if (operation === "deep rank") await state().seek(60_000);
      else if (operation === "forward") await state().extendForward();
      else await state().extendBackward();
      await flush();
    } finally {
      unsubscribe();
    }

    expect(state().error).not.toBeNull();
    expect(state().loading).toBe(false);
    expect(state()._extendForwardInFlight).toBe(false);
    expect(state()._extendBackwardInFlight).toBe(false);
    expect(state().results).toBe(before.results);
    expect(publications.every((results) => results === before.results)).toBe(true);
    expect(state().imagePositions).toBe(before.imagePositions);
    expect(state().bufferOffset).toBe(before.bufferOffset);
    expect(state().total).toBe(before.total);
    expect(state().startCursor).toEqual(before.startCursor);
    expect(state().endCursor).toEqual(before.endCursor);
    expect(useEnrichmentStore.getState().data).toBe(enrichment);
    expect(bodiesFor(`/images/${endpoint}`)).toHaveLength(1);
  });

  it.each(FAILURE_KINDS.flatMap(kind =>
    (["rank", "target", "forward", "backward"] as const).map(stage => ({ kind, stage })),
  ))("U6z/KUP-036 restore $stage $kind retains the view without numeric substitution", async ({ kind, stage }) => {
    useApiMode(120_000);
    await state().search();
    await flush();
    const before = state();
    const target = await corpus.searchAfter({ orderBy: "-uploadTime", nonFree: "true", ids: "img-5000", length: 1 }, null);
    calls = standInMediaApi(corpus, {
      "/images/rank": async (body) => stage === "rank"
        ? failedRead(kind, "rank")
        : { rank: await corpus.countBefore(toParams(body), body.sortValues as SortValues) },
      "/images/search-after": async (body) => {
        const isTarget = (body.ids as string[] | undefined)?.join(",") === "img-5000";
        if ((stage === "target" && isTarget)
          || (stage === "forward" && !isTarget && !body.reverse)
          || (stage === "backward" && !isTarget && body.reverse)) {
          return failedRead(kind, "search-after");
        }
        const page = await corpus.searchAfter(toParams(body), (body.sortValues as SortValues | undefined) ?? null,
          null, undefined, body.reverse as boolean);
        return { data: page.hits.map((data) => ({ data })), total: 0, sortValues: page.sortValues };
      },
    });
    const publications: unknown[] = [];
    const unsubscribe = useSearchStore.subscribe((next, previous) => {
      if (next.results !== previous.results) publications.push(next.results);
    });
    try {
      await state().restoreAroundCursor("img-5000", target.sortValues[0], 5_000);
      await flush();
    } finally {
      unsubscribe();
    }

    expect(state().loading).toBe(false);
    expect(bodiesFor("/images/window")).toEqual([]);
    expect(bodiesFor("/images/search-after")).toHaveLength(stage === "target" || stage === "rank" ? 1 : 3);
    expect(calls.every((call) => call.path.startsWith("/images/") && !("pitId" in call.body))).toBe(true);
    expect(state().error).not.toBeNull();
    expect(state().results).toBe(before.results);
    expect(state().imagePositions).toBe(before.imagePositions);
    expect(state().bufferOffset).toBe(before.bufferOffset);
    expect(publications).toEqual([]);
    await expectCoherentBuffer();
  });

  it("U6z publishes successful empty search without a core-read error", async () => {
    useApiMode(0);
    await state().search();
    await flush();

    expect(state().error).toBeNull();
    expect(state().loading).toBe(false);
    expect(state().total).toBe(0);
    expect(state().results).toEqual([]);
  });

  it.each(FAILURE_KINDS)("U6z leaves optional profile data absent when profiles are %s", async (kind) => {
    useApiMode(120_000, { orderBy: "-credit", skewed: true, routes: { "/images/sort-profile": () => failedRead(kind, "sort-profile") } });
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

  it.each(FAILURE_KINDS)("U6z keeps the whole selection when the lookup is %s", async (kind) => {
    selectInApiMode(["img-1", "img-gone"], { "/images/mget": () => failedRead(kind, "mget") });
    await selection().hydrate();

    expect([...selection().selectedIds]).toEqual(["img-1", "img-gone"]);
    expect(selection().anchorId).toBe("img-gone");
    expect(selection().metadataCache.has("img-1")).toBe(false);
  });
});

describe("API mode: facet aggregations", () => {
  it.each(["immediate", "debounced"] as const)("shares dispatched hover facets with an equivalent %s call", async (mode) => {
    vi.useFakeTimers();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    useApiMode(500, { routes: {
      "/images/aggregations": async () => {
        await held;
        return {
          fields: {
            "metadata.credit": { buckets: [{ key: "Fixture", count: 3 }] },
            usagesPlatform: { buckets: [{ key: "digital", count: 9 }] },
          },
          isFilterCounts: { deleted: 0, "under-quota": 11 },
        };
      },
    } });
    useSearchStore.setState({ aggregations: null, _aggCacheKey: null, aggCircuitOpen: false });

    const hover = state().fetchAggregations();
    await vi.advanceTimersByTimeAsync(500);
    expect(bodiesFor("/images/aggregations")).toHaveLength(1);
    const firstSignal = calls[0].signal;
    let joinedSettled = false;
    const joined = state().fetchAggregations(mode).then(() => { joinedSettled = true; });
    try {
      await vi.advanceTimersByTimeAsync(500);
      expect(firstSignal?.aborted).toBe(false);
      expect(bodiesFor("/images/aggregations")).toHaveLength(1);
      expect(joinedSettled).toBe(false);
      expect(state().aggLoading).toBe(true);
    } finally {
      release();
      await Promise.all([hover, joined]);
    }

    expect(joinedSettled).toBe(true);
    expect(state().aggLoading).toBe(false);
    expect(state().aggregations?.fields["metadata.credit"]?.buckets).toEqual([{ key: "Fixture", count: 3 }]);
    expect(state().isFilterCounts).toEqual({ deleted: 0, "under-quota": 11 });
    expect(state().usageFilterCounts?.digital).toBe(9);
    const completed = state().aggregations;
    await state().fetchExpandedAgg("metadata.credit");
    const expanded = state().expandedAggs["metadata.credit"];
    expect((bodiesFor("/images/aggregations")[1].fields as Array<{ size: number }>)[0].size).toBe(100);
    await state().fetchAggregations("immediate");
    await state().fetchExpandedAgg("metadata.credit");
    expect(bodiesFor("/images/aggregations")).toHaveLength(2);
    expect(state().aggregations).toBe(completed);
    expect(state().expandedAggs["metadata.credit"]).toBe(expanded);
  });

  it("publishes field, is: and usage counts from one media-api read", async () => {
    useApiMode(5_000);
    await state().search();
    await state().fetchAggregations("force");

    const bodies = bodiesFor("/images/aggregations");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].isFilters).toEqual(["deleted", "under-quota", "GNM-owned-photo", "GNM-owned-illustration"]);
    const requested = (bodies[0].fields as Array<{ field: string }>).map((f) => f.field);
    expect(requested).toEqual(expect.arrayContaining(["usageRights.category", "metadata.credit", "usagesPlatform", "usagesStatus"]));
    expect(state().aggregations?.fields["metadata.credit"]?.buckets).toEqual([{ key: "metadata.credit-top", count: 3 }]);
    expect(state().aggregations?.fields).not.toHaveProperty("usagesPlatform");
    expect(state().isFilterCounts).toEqual({ deleted: 0, "under-quota": 11, "GNM-owned-photo": 11, "GNM-owned-illustration": 11 });
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

describe("U6z API recovery lifetime", () => {
  it("treats a successful empty restore target as absence, not a failed-read seek", async () => {
    useApiMode(120_000);
    await state().search();
    const before = state();
    const target = await corpus.searchAfter({ ...before.params, ids: "img-5000", length: 1 }, null);
    calls = standInMediaApi(corpus, { "/images/search-after": () => ({ data: [], sortValues: [] }) });
    await state().restoreAroundCursor("img-5000", target.sortValues[0], 5_000);
    expect(state().loading).toBe(false);
    expect(state().error).toBeNull();
    expect(state().results).toBe(before.results);
    expect(state().imagePositions).toBe(before.imagePositions);
    expect(paths().sort()).toEqual(["/images/rank", "/images/search-after"]);
  });

  it.each(FAILURE_KINDS)("does not publish a pending recovery after a %s rank is superseded by a new search", async (kind) => {
    useApiMode(120_000);
    await state().search();
    const target = await corpus.searchAfter({ ...state().params, ids: "img-5000", length: 1 }, null);
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    calls = standInMediaApi(corpus, {
      "/images/rank": async () => {
        entered();
        await held;
        return failedRead(kind, "rank");
      },
    });
    const pending = state().restoreAroundCursor("img-5000", target.sortValues[0], 5_000);
    await started;
    state().setParams({ query: "replacement" });
    await state().search();
    const current = state();
    const overlay = useEnrichmentStore.getState().data;
    release();
    await pending;
    expect(calls.find(call => call.path === "/images/rank")?.signal?.aborted).toBe(true);
    expect(paths()).not.toContain("/images/window");
    expect(state().results).toBe(current.results);
    expect(state().imagePositions).toBe(current.imagePositions);
    expect(state().bufferOffset).toBe(0);
    expect(state().params.query).toBe("replacement");
    expect(state().loading).toBe(false);
    expect(state().error).toBeNull();
    expect(useEnrichmentStore.getState().data).toBe(overlay);
    await expectCoherentBuffer();
  });
});

describe("U6z API polling", () => {
  it.each(FAILURE_KINDS)("retains accepted values after %s, but accepts a later successful zero", async (kind) => {
    vi.useFakeTimers();
    let outcome: "baseline" | "arrival" | "failure" | "zero" = "baseline";
    useApiMode(120_000, { routes: {
      "/images/count": () => {
        if (outcome === "failure") return failedRead(kind, "count");
        const value = outcome === "baseline" ? 7 : outcome === "arrival" ? 2 : 0;
        return { total: value, tickerCounts: { "GNM-owned": { value } } };
      },
    } });
    const frozenUntil = "2026-04-26T10:00:00.000Z";
    const restoring = state().search(undefined, { frozenUntil, frozenNewCount: 134 });
    expect(state().newCount).toBe(134);
    await restoring;
    expect(state()).toMatchObject({ newCount: 134, newCountSince: frozenUntil, pitId: null });
    const initial = state();
    outcome = "failure";
    await vi.advanceTimersByTimeAsync(NEW_IMAGES_POLL_INTERVAL);
    expect(state().newCount).toBe(134);
    outcome = "arrival";
    await vi.advanceTimersByTimeAsync(NEW_IMAGES_POLL_INTERVAL);
    expect(state().newCount).toBe(2);
    expect(state().tickerCounts).toEqual({ "GNM-owned": { value: 9 } });
    const accepted = state();
    outcome = "failure";
    await vi.advanceTimersByTimeAsync(NEW_IMAGES_POLL_INTERVAL);
    expect(state().newCount).toBe(2);
    expect(state().tickerCounts).toBe(accepted.tickerCounts);
    expect(state().tickersLastUpdated).toBe(accepted.tickersLastUpdated);
    outcome = "zero";
    await vi.advanceTimersByTimeAsync(NEW_IMAGES_POLL_INTERVAL);
    expect(state().newCount).toBe(0);
    expect(state().tickerCounts).toEqual({ "GNM-owned": { value: 7 } });
    expect(state().results).toBe(initial.results);
    expect(state().total).toBe(initial.total);
    expect(state().error).toBeNull();
    expect(bodiesFor("/images/count")).toHaveLength(5);
    expect(bodiesFor("/images/count")[0].until).toBe(frozenUntil);
    expect(bodiesFor("/images/count").slice(1).map(body => body.since)).toEqual(Array(4).fill(initial.newCountSince));
    vi.clearAllTimers();
  });
});

describe("U9-B media-api AI search", () => {
  const tickerCounts = { "GNM-owned": { value: 42, searchClause: "is:GNM-owned", backgroundColour: "#005689" } };
  const aiAnswer = (data: unknown[], total = 5000) => ({ offset: 0, length: data.length, total, data, actions: { tickerCounts } });
  const staff = async (ids: string[]) => (await corpus.getByIds(ids)).map(image => ({ ...image, usageRights: { category: "staff-photographer" } }));
  const aiParams = { aiQuery: "fixture sky", query: "credit:Fixture", orderBy: "-relevance" };
  const toasts = async () => (await import("./toast-store")).useToastStore.getState().queue;

  function useAiApiMode(ai: (query: Body) => unknown, pageCost = "overquota") {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    useApiMode(120_000, { routes: {
      "/images/search-after": async (body) => {
        const page = await corpus.searchAfter(toParams(body), null);
        return { data: page.hits.map(image => ({ data: { ...image, cost: pageCost, valid: true } })), total: page.total, sortValues: page.sortValues };
      },
      "/images": ai,
      "/images/img-0": async () => ({ data: { ...(await staff(["img-0"]))[0], cost: "pay" } }),
    } });
    useSearchStore.setState({ aggregations: null, _aggCacheKey: null, aggCircuitOpen: false, aiPoolTotal: null });
    useEnrichmentStore.getState().setEnrichment(new Map());
  }

  it("replaces same-ID overlays across ordinary -> AI -> ordinary, with pool metadata and no count, PIT or ES/Bedrock (KUP-030)", async () => {
    let selected: Awaited<ReturnType<typeof staff>> = [];
    const image = (id: string) => selected.find(candidate => candidate.id === id)!;
    useAiApiMode(() => aiAnswer([
      { data: { ...image("img-1"), cost: "free", valid: false, usages: { data: [] } }, actions: [] },
      { data: { ...image("img-0"), cost: "free", valid: true, persisted: { value: false, reasons: [] } }, actions: [] },
    ]));
    selected = await staff(["img-0", "img-1"]);
    const source = state().dataSource;

    await state().search();
    expect(useEnrichmentStore.getState().data.get("img-0")?.cost).toBe("overquota");
    expect(state().aiPoolTotal).toBeNull();
    calls.length = 0;

    state().setParams(aiParams);
    await state().search();
    await flush();
    expect(paths()).toEqual(["/images"]);
    expect(calls[0].body).toEqual({
      useAISearch: "true", q: "credit:Fixture", aiQuery: "fixture sky", length: "200",
    });
    expect(state()).toMatchObject({ total: 2, aiPoolTotal: 5000, tickerCounts: { "GNM-owned": { value: 42 } }, pitId: null, error: null, loading: false });
    expect(state().results.map(image => image?.id)).toEqual(["img-1", "img-0"]);
    expect(state().positionMap).toBeNull();
    const overlay = useEnrichmentStore.getState().data;
    expect([...overlay.keys()]).toEqual(["img-1", "img-0"]);
    expect(overlay.get("img-1")).toMatchObject({ cost: "free", valid: false, usages: [] });
    expect(overlay.get("img-0")).toMatchObject({ cost: "free", valid: true, persisted: { value: false, reasons: [] } });
    expect(deriveImage(state().results[1]!, overlay.get("img-0")).cost).toBe("free");

    for (const orderBy of ["-uploadTime", "-relevance"]) {
      state().setParams({ orderBy });
      state().resortAiBuffer(orderBy);
    }
    expect(state().results.map(image => image?.id)).toEqual(["img-1", "img-0"]);
    await waitPastCooldown();
    await state().extendForward();
    await state().extendBackward();
    await state().fetchAggregations("force");
    expect(bodiesFor("/images/aggregations")[0].ids).toEqual(["img-0", "img-1"]);
    expect((await source.getById("img-0"))?.enrichment?.cost).toBe("pay");
    _resetMetadataCache();
    useSelectionStore.setState({ dataSource: source, selectedIds: new Set(["img-0"]), anchorId: "img-0" });
    await useSelectionStore.getState().hydrate();
    expect(useEnrichmentStore.getState().data).toBe(overlay);
    expect(paths()).toEqual(["/images", "/images/aggregations", "/images/img-0", "/images/mget"]);

    state().setParams({ aiQuery: undefined, query: undefined, orderBy: "-uploadTime" });
    await state().search();
    expect(state()).toMatchObject({ total: 120_000, aiPoolTotal: null, error: null });
    expect(useEnrichmentStore.getState().data.get("img-0")).toMatchObject({ cost: "overquota", valid: true });
    expect(useEnrichmentStore.getState().data.get("img-1")).toMatchObject({ valid: true });
  });

  it("publishes a successful empty result as an empty overlay with the pool metadata", async () => {
    let empty = false;
    useAiApiMode(async () => aiAnswer(empty ? [] : [{ data: (await staff(["img-3"]))[0], actions: [] }], empty ? 0 : 900));
    state().setParams(aiParams);
    await state().search();
    expect(useEnrichmentStore.getState().data.size).toBe(1);

    empty = true;
    state().setParams({ aiQuery: "nothing matches" });
    await state().search();
    expect(state()).toMatchObject({ results: [], total: 0, aiPoolTotal: 0, tickerCounts: { "GNM-owned": { value: 42 } }, error: null, loading: false });
    expect(useEnrichmentStore.getState().data.size).toBe(0);
    expect(state().aggregations).toEqual({ fields: {}, filters: {}, usageFilters: {} });
  });

  it.each([
    ["forbidden", () => refusal(403)],
    ["a conflicting query", () => refusal(422, "invalid-uri-parameters")],
    ["unavailable", () => new Response(null, { status: 503 })],
    ["unreachable", () => { throw new TypeError("synthetic transport unavailable"); }],
  ] as const)("publishes %s AI search as an empty, error-free, quiet absence", async (_label, fail) => {
    let failing = false;
    useAiApiMode(async () => failing ? fail() : aiAnswer([{ data: (await staff(["img-3"]))[0], actions: [] }], 900));
    state().setParams(aiParams);
    await state().search();
    expect(state()).toMatchObject({ total: 1, aiPoolTotal: 900 });
    vi.mocked(console.warn).mockClear();
    (await import("./toast-store")).useToastStore.getState()._clearAll();

    failing = true;
    state().setParams({ aiQuery: "refused" });
    await state().search();
    expect(state()).toMatchObject({ results: [], total: 0, aiPoolTotal: null, tickerCounts: {}, error: null, loading: false, pitId: null });
    expect(state().aggregations).toEqual({ fields: {}, filters: {}, usageFilters: {} });
    expect(useEnrichmentStore.getState().data.size).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
    expect(await toasts()).toEqual([]);
    expect(paths()).toEqual(["/images", "/images"]);
  });

  it("B8 range cancellation preserves the pending AI search and its owned completion", async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    useAiApiMode(async () => {
      await held;
      return aiAnswer([{ data: (await staff(["img-6"]))[0], actions: [] }], 22);
    });
    state().setParams({ ...aiParams, aiQuery: "pending density" });
    const pending = state().search();
    try {
      await flush();
      const request = calls.find(call => call.path === "/images")!;
      expect(request.signal?.aborted).toBe(false);
      expect(state().loading).toBe(true);
      state().abortExtends();
      expect(request.signal?.aborted).toBe(false);
      expect(state().loading).toBe(true);
      release();
      await pending;
      expect(state()).toMatchObject({ total: 1, aiPoolTotal: 22, loading: false, error: null });
      expect(state().results.map(image => image?.id)).toEqual(["img-6"]);
      expect([...useEnrichmentStore.getState().data.keys()]).toEqual(["img-6"]);
    } finally {
      release();
      await pending;
    }
  });

  it("lets neither a cancelled nor a superseded AI completion change the published result or overlay", async () => {
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
    useAiApiMode(async (query) => {
      if (query.aiQuery === "first") await firstHeld;
      return aiAnswer([{ data: (await staff([query.aiQuery === "first" ? "img-5" : "img-6"]))[0], actions: [] }], query.aiQuery === "first" ? 11 : 22);
    });
    state().setParams({ ...aiParams, aiQuery: "first" });
    const first = state().search();
    await flush();
    state().setParams({ aiQuery: "second" });
    await state().search();
    const published = { results: state().results, overlay: useEnrichmentStore.getState().data };
    expect(state()).toMatchObject({ total: 1, aiPoolTotal: 22 });

    releaseFirst();
    await first;
    await flush();
    expect(state().results).toBe(published.results);
    expect(useEnrichmentStore.getState().data).toBe(published.overlay);
    expect([...published.overlay.keys()]).toEqual(["img-6"]);
    expect(calls.find(call => call.body.aiQuery === "first")?.signal?.aborted).toBe(true);
  });

  it("applies the latest sort to a pending same-query completion and restores server order without another request (KUP-008)", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let images: Awaited<ReturnType<typeof staff>> = [];
    useAiApiMode(async () => {
      await held;
      return aiAnswer(images.map(data => ({ data, actions: [] })));
    });
    images = await staff(["img-7", "img-2", "img-9"]);
    const byId = new Map(images.map(image => [image.id, image]));
    images = ["img-7", "img-2", "img-9"].map(id => byId.get(id)!);
    const order = images.map(image => image.id);
    const uploaded = [...images].sort((a, b) => Date.parse(b.uploadTime) - Date.parse(a.uploadTime)).map(image => image.id);
    expect(uploaded).not.toEqual(order);

    state().setParams(aiParams);
    const pending = state().search();
    await flush();
    state().setParams({ orderBy: "-uploadTime" });
    state().resortAiBuffer("-uploadTime");
    release();
    await pending;
    expect(state().params.orderBy).toBe("-uploadTime");
    expect(state().results.map(image => image?.id)).toEqual(uploaded);

    state().setParams({ orderBy: "-relevance" });
    state().resortAiBuffer("-relevance");
    expect(state().results.map(image => image?.id)).toEqual(order);
    expect(paths().filter(path => path === "/images")).toHaveLength(1);
  });

  it("publishes the same fixed-set pool metadata from direct ES as from media-api", async () => {
    const published = async () => {
      await state().search();
      const { total, aiPoolTotal, tickerCounts, results } = state();
      return { total, aiPoolTotal, tickerCounts, ids: results.map(image => image?.id) };
    };
    const selected = async () => staff(["img-1", "img-0"]);

    useAiApiMode(async () => aiAnswer((await selected()).map(data => ({ data, actions: [] })), 5000));
    state().setParams(aiParams);
    const viaApi = await published();

    const images = await selected();
    const es = new ElasticsearchDataSource();
    const esBodies: Body[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/bedrock/embed?")) return Response.json({ embedding: Array(256).fill(0) });
      const body = JSON.parse(String(init?.body)) as Body;
      esBodies.push(body);
      if (body.knn) return Response.json({ hits: { hits: images.map((image, i) => ({ _id: image.id, _source: image, _score: 1 - i / 10 })) } });
      return Response.json({ hits: { total: { value: 5000 } }, aggregations: { "GNM-owned": { doc_count: 42 } } });
    }));
    useSearchStore.setState({ dataSource: es, aiPoolTotal: null, tickerCounts: null });
    const viaDirect = await published();

    expect(viaDirect).toEqual(viaApi);
    expect(viaApi).toMatchObject({ total: 2, aiPoolTotal: 5000, tickerCounts: { "GNM-owned": { value: 42 } } });
    const poolCount = esBodies.filter(body => body.size === 0);
    expect(poolCount).toHaveLength(1);
    expect(JSON.stringify(poolCount[0].query)).not.toContain("img-0");
  });
});
