// @vitest-environment jsdom

import { createElement, StrictMode, useEffect, type PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
const anchor = vi.hoisted(() => ({ viewportId: null as string | null, visibleIds: null as string[] | null }));
const navigate = vi.hoisted(() => vi.fn());
const startupDefaults = vi.hoisted(() => ({ value: { nonFree: "true" } as Record<string, string | undefined> }));
vi.mock("@/lib/home-defaults", () => ({ get DEFAULT_SEARCH() { return startupDefaults.value; } }));
const router = vi.hoisted(() => {
  type Notification = { location: { state: { kupuaKey?: string } }; action: { type: "BACK" | "PUSH" } };
  const listeners = new Set<(notification: Notification) => void>();
  return { history: { subscribe: (listener: (notification: Notification) => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  } }, notify: (type: Notification["action"]["type"]) => {
    listeners.forEach(listener => listener({ location: { state: window.history.state ?? {} }, action: { type } }));
  } };
});
vi.mock("@tanstack/react-router", () => ({ useSearch: () => routeParams, useNavigate: () => navigate,
  useRouter: () => router, useRouterState: () => {
    const state = window.history.state;
    if (routeLocation?.search !== routeParams || routeLocation.state !== state) routeLocation = { search: routeParams, state };
    return routeLocation;
  } }));
vi.mock("@/hooks/useDataWindow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useDataWindow")>();
  return { ...actual, getViewportAnchorId: () => anchor.viewportId,
    getVisibleImageIds: () => anchor.visibleIds ?? actual.getVisibleImageIds() };
});

import { useSearchStore } from "@/stores/search-store";
import { ApiDataSource } from "@/dal/api-data-source";
import { ElasticsearchDataSource } from "@/dal/es-adapter";
import { MockDataSource } from "@/dal/mock-data-source";
import { parseSortField } from "@/dal/adapters/elasticsearch/sort-builders";
import type { SortValues } from "@/dal/types";
import { useDataWindow } from "./useDataWindow";
import { Scrubber } from "@/components/Scrubber";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import type { Image } from "@/types/image";
import { SEEK_DEFERRED_SCROLL_MS } from "@/constants/tuning";
import { clearDensityFocusRatio, useScrollEffects, type ScrollGeometry } from "./useScrollEffects";
import { useUrlSearchSync } from "./useUrlSearchSync";
import { consumeUserInitiatedFlag, markUserInitiatedNavigation, setPrevParamsSerialized, setPrevSearchOnly } from "@/lib/orchestration/search";
import type { UrlSearchParams } from "@/lib/search-params-schema";
import * as searchContinuity from "@/lib/search-continuity";
import { snapshotStore } from "@/lib/history-snapshot";
import { buildSearchKey, getRetainedSortValues } from "@/lib/image-offset-cache";
import { buildHistorySnapshot } from "@/lib/build-history-snapshot";
import { StatusBar } from "@/components/StatusBar";
import { resetToHome } from "@/lib/reset-to-home";
import { useReturnFromDetail } from "./useReturnFromDetail";

let routeParams: UrlSearchParams = { nonFree: "true" };
let routeLocation: { search: UrlSearchParams; state: unknown } | undefined;
let beforeUrlSync: (() => void) | undefined;
const initialState = useSearchStore.getState();
const initialPreferences = useUiPrefsStore.getState();
const initialSelection = useSelectionStore.getState();
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const table: ScrollGeometry = { columns: 1, rowHeight: 32, headerOffset: 36, preserveScrollLeftOnSort: true };
const grid: ScrollGeometry = { columns: 4, rowHeight: 303, headerOffset: 0, preserveScrollLeftOnSort: false, minCellWidth: 280 };

beforeEach(() => {
  vi.useFakeTimers();
  routeParams = { nonFree: "true" };
  routeLocation = undefined;
  beforeUrlSync = undefined;
  setPrevParamsSerialized("");
  setPrevSearchOnly({});
  consumeUserInitiatedFlag();
  navigate.mockReset();
  startupDefaults.value = { nonFree: "true" };
  frames.clear();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const handle = ++nextFrame;
    frames.set(handle, callback);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => { frames.delete(handle); });
  clearDensityFocusRatio();
  anchor.viewportId = null;
  anchor.visibleIds = null;
  const results = Array.from({ length: 800 }, (_, index) => ({ id: `image-${index + 200}` }) as Image);
  useSearchStore.setState({ ...initialState, results, total: 70000, bufferOffset: 200, focusedImageId: "image-400",
    imagePositions: new Map(results.map((image, index) => [image.id, index + 200])) }, true);
  useSelectionStore.setState({ ...initialSelection, selectedIds: new Set(), anchorId: null }, true);
});

afterEach(() => {
  cleanup();
  clearDensityFocusRatio();
  frames.clear();
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useSearchStore.setState(initialState, true);
  useUiPrefsStore.setState(initialPreferences, true);
  useSelectionStore.setState(initialSelection, true);
});

function frame() {
  act(() => {
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) callback(performance.now());
  });
}

it("Home from unmarked detail does not reinstate its return focus", async () => {
  window.history.replaceState({ kupuaKey: "unmarked-detail" }, "", "/search?nonFree=true&image=image-400");
  useUiPrefsStore.setState({ density: "grid" });
  useSearchStore.setState({ dataSource: new MockDataSource(100), params: { nonFree: "true" }, pitId: null });
  const setFocus = vi.spyOn(useSearchStore.getState(), "setFocusedImageId");
  const scrollToIndex = vi.fn();
  const view = renderHook(({ imageParam }: { imageParam: string | undefined }) => useReturnFromDetail({
    imageParam, setFocusedImageId: setFocus, findImageIndex: () => 40,
    flatIndexToRow: (index) => index,
    virtualizer: { scrollToIndex } as unknown as Virtualizer<HTMLDivElement, Element>,
  }), { initialProps: { imageParam: "image-400" as string | undefined } });
  try {
    await act(async () => {
      await resetToHome(() => {
        window.history.replaceState({ kupuaKey: "home-destination" }, "", "/search?nonFree=true");
      });
    });
    setFocus.mockClear();
    act(() => view.rerender({ imageParam: undefined }));
    frame();
    expect(setFocus).not.toHaveBeenCalled();
    expect(useSearchStore.getState().focusedImageId).toBeNull();
    expect(scrollToIndex).not.toHaveBeenCalled();
  } finally {
    act(() => vi.runOnlyPendingTimers());
  }
});

function UrlSyncHarness({ children }: PropsWithChildren) {
  useEffect(() => { beforeUrlSync?.(); }, [routeParams]);
  useUrlSearchSync();
  return children;
}

describe("KUP-039 startup defaults", () => {
  it.each([
    { transport: "direct-ES", strict: false, defaults: { nonFree: "true" }, label: "all-rights" },
    { transport: "media-api", strict: true, defaults: { nonFree: "true" }, label: "all-rights" },
    { transport: "media-api", strict: true, defaults: { orderBy: "-uploadTime" }, label: "free-only" },
  ] as const)("$transport holds $label admission during pending replacement (Strict Mode=$strict)", async ({ transport, strict, defaults, label }) => {
    startupDefaults.value = { ...defaults };
    vi.stubGlobal("scheduler", { yield: async () => {} });
    const corpus = new MockDataSource(100);
    const intended = await corpus.searchAfter({ nonFree: "true", length: 200 }, null);
    const dataSource = transport === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
    vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
    const pages = vi.spyOn(dataSource, "searchAfter");
    const counts = vi.spyOn(dataSource, "countWithTickers");
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (transport === "media-api") {
        expect(url).toMatch(/^\/api\/images\/(search-after|count)$/);
        return Response.json(url.endsWith("/count")
          ? { total: 100, tickerCounts: { "GNM-owned": { value: 7 } } }
          : { data: intended.hits.map(data => ({ data })), total: 100, sortValues: intended.sortValues });
      }
      expect(url).toMatch(/^\/es\//);
      return Response.json({ hits: { total: { value: 100 }, hits: body.size === 0 ? [] : intended.hits.map((image, index) => ({
        _id: image.id, _source: image, sort: intended.sortValues[index],
      })) }, aggregations: { "GNM-owned": { doc_count: 7 } } });
    });
    vi.stubGlobal("fetch", fetch);
    routeParams = {};
    useSearchStore.setState({ ...initialState, dataSource }, true);
    const search = vi.spyOn(useSearchStore.getState(), "search");
    let release!: () => void;
    const replacement = new Promise<void>(resolve => { release = resolve; });
    navigate.mockImplementationOnce(() => replacement);
    const view = renderHook(() => useUrlSearchSync(), { wrapper: strict ? StrictMode : undefined });
    try {
      expect(search).not.toHaveBeenCalled();
      act(() => { routeParams = {}; view.rerender(); });
      expect(search).not.toHaveBeenCalled();
      expect(pages).not.toHaveBeenCalled();
      expect(counts).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate.mock.calls[0][0]).toMatchObject({ replace: true, search: defaults });
      await act(async () => { release(); await replacement; routeParams = { ...defaults }; view.rerender(); });
      expect(search).toHaveBeenCalledOnce();
      await act(async () => { await search.mock.results[0].value; });
      expect(pages).toHaveBeenCalledOnce();
      expect(counts).toHaveBeenCalledOnce();
      expect(pages.mock.calls[0][0].nonFree).toBe(startupDefaults.value.nonFree);
      expect(counts.mock.calls[0][0].nonFree).toBe(startupDefaults.value.nonFree);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(useSearchStore.getState()).toMatchObject({ loading: false, total: 100, params: defaults,
        tickerCounts: { "GNM-owned": { value: 7 } } });
      expect(useSearchStore.getState().results.map(image => image?.id)).toEqual(intended.hits.map(image => image.id));
      act(() => { routeParams = { ...defaults, image: "img-40" }; view.rerender(); });
      act(() => { routeParams = { ...defaults }; view.rerender(); });
      expect(search).toHaveBeenCalledOnce();
      act(() => { routeParams = {}; markUserInitiatedNavigation(); view.rerender(); });
      await act(async () => { await search.mock.results[1].value; });
      expect(search).toHaveBeenCalledTimes(2);
      expect(pages.mock.calls[1][0].nonFree).toBeUndefined();
      expect(counts.mock.calls[1][0].nonFree).toBeUndefined();
      expect(navigate).toHaveBeenCalledOnce();
      const commitHome = vi.fn(() => { routeParams = { ...startupDefaults.value }; });
      await act(async () => { await resetToHome(commitHome); });
      expect(commitHome).toHaveBeenCalledOnce();
      expect(search).toHaveBeenCalledTimes(3);
      act(() => { view.rerender(); });
      expect(search).toHaveBeenCalledTimes(3);
      expect(pages).toHaveBeenCalledTimes(3);
      expect(counts).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenCalledTimes(6);
      const freeScopes = fetch.mock.calls.map(([, init]) => {
        const body = JSON.parse(init.body as string);
        return transport === "media-api" ? body.free === true
          : JSON.stringify(body.query).includes('"usageRights.category"');
      });
      const initialFree = label === "free-only";
      expect(freeScopes).toEqual([initialFree, initialFree, true, true, initialFree, initialFree]);
    } finally {
      await act(async () => { release(); await replacement; await Promise.all(search.mock.results.map(result => result.value)); });
      view.unmount();
    }
  });

  it("admits observed explicit intent while default replacement is still pending", async () => {
    routeParams = {};
    const fixture = await aiContinuityFixture("direct-ES");
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource }, true);
    const search = vi.spyOn(useSearchStore.getState(), "search");
    let release!: () => void;
    const replacement = new Promise<void>(resolve => { release = resolve; });
    navigate.mockImplementationOnce(() => replacement);
    const view = renderHook(() => useUrlSearchSync(), { wrapper: StrictMode });
    try {
      expect(search).not.toHaveBeenCalled();
      act(() => { routeParams = { query: "new-intent", nonFree: "false" }; markUserInitiatedNavigation(); view.rerender(); });
      await act(async () => { await search.mock.results[0].value; });
      expect(search).toHaveBeenCalledOnce();
      expect(useSearchStore.getState().params).toMatchObject({ query: "new-intent", nonFree: "false" });
      await act(async () => { release(); await replacement; });
      act(() => { routeParams = { ...routeParams }; view.rerender(); });
      expect(search).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await replacement; });
    }
  });

  it.each([
    { label: "canonical absent free-only defaults", defaults: {}, params: {}, expected: undefined },
    { label: "explicit free-only", defaults: { nonFree: "true" }, params: { nonFree: "false" }, expected: "false" },
    { label: "explicit all-rights over free-only defaults", defaults: {}, params: { nonFree: "true" }, expected: "true" },
    { label: "nonempty query without rights", defaults: { nonFree: "true" }, params: { query: "startup" }, expected: undefined },
    { label: "detail entry without rights", defaults: { nonFree: "true" }, params: { image: "img-40" }, expected: undefined },
  ])("resolves $label without injecting defaults", async ({ defaults, params, expected }) => {
    startupDefaults.value = defaults;
    routeParams = params;
    const fixture = await aiContinuityFixture("direct-ES");
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource }, true);
    const search = vi.spyOn(useSearchStore.getState(), "search");
    const view = renderHook(() => useUrlSearchSync(), { wrapper: StrictMode });
    await act(async () => { await search.mock.results[0].value; });
    expect(navigate).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledOnce();
    expect(fixture.pages).toHaveBeenCalledOnce();
    expect(fixture.counts).toHaveBeenCalledOnce();
    expect(useSearchStore.getState().params.nonFree).toBe(expected);
    expect(useSearchStore.getState().params.query).toBe(params.query);
    act(() => { routeParams = { ...params }; view.rerender(); });
    expect(search).toHaveBeenCalledOnce();
  });
});

function mountDensity(initialGeometry: ScrollGeometry, strict = false, reportViewport = false, syncUrl = false,
  chooseDensityAnchor?: Parameters<typeof useScrollEffects>[0]["chooseDensityAnchor"]) {
  const dimensions = { width: 1120, height: 600 };
  let geometry = initialGeometry;
  const container = document.createElement("div");
  document.body.appendChild(container);
  Object.defineProperties(container, {
    clientWidth: { get: () => dimensions.width },
    clientHeight: { get: () => dimensions.height },
    scrollHeight: { get: () => {
      const state = useSearchStore.getState();
      const count = isTwoTierFromTotal(state.total) ? state.total : state.results.length;
      return Math.ceil(count / geometry.columns) * geometry.rowHeight + geometry.headerOffset;
    } },
  });
  const parentRef = { current: container };
  const scrollToIndex = vi.fn((index: number, options?: { align?: string }) => {
    container.scrollTop = options?.align === "end"
      ? container.scrollHeight - container.clientHeight
      : Math.max(0, index * geometry.rowHeight + geometry.headerOffset - container.clientHeight / 2);
  });
  const virtualizer = { options: { count: 0 }, range: { startIndex: 0, endIndex: 1 },
    scrollToIndex, scrollToOffset: vi.fn((offset: number) => { container.scrollTop = offset; }), measure: vi.fn(), getVirtualItems: () => [] } as unknown as Virtualizer<HTMLDivElement, Element>;
  const reportVisibleRange = vi.fn();
  const loadMore = vi.fn().mockResolvedValue(undefined);
  const findImageIndex = (imageId: string) => {
    const state = useSearchStore.getState();
    return (state.imagePositions.get(imageId) ?? -1) - (isTwoTierFromTotal(state.total) ? 0 : state.bufferOffset);
  };
  const view = renderHook((props: { geometry: ScrollGeometry }) => {
    const state = useSearchStore();
    const dataWindow = useDataWindow();
    geometry = props.geometry;
    const twoTier = isTwoTierFromTotal(state.total);
    virtualizer.options.count = Math.ceil((twoTier ? state.total : state.results.length) / geometry.columns);
    useScrollEffects({ virtualizer, parentRef, geometry, reportVisibleRange: reportViewport ? dataWindow.reportVisibleRange : reportVisibleRange, loadMore,
      resultsLength: state.results.length, total: state.total, bufferOffset: state.bufferOffset,
      focusedImageId: state.focusedImageId, findImageIndex, twoTier, chooseDensityAnchor });
  }, { initialProps: { geometry }, wrapper: syncUrl ? UrlSyncHarness : strict ? StrictMode : undefined });
  return { ...view, container, dimensions, scrollToIndex, virtualizer,
    changeGeometry: (next: ScrollGeometry) => view.rerender({ geometry: next }) };
}

function transition(sourceGeometry = grid, targetGeometry = table, extremum?: "top" | "bottom") {
  const source = mountDensity(sourceGeometry);
  frame();
  frame();
  source.container.scrollTop = extremum === "top" ? 0 : extremum === "bottom"
    ? source.container.scrollHeight - source.container.clientHeight
    : Math.floor((isTwoTierFromTotal(useSearchStore.getState().total) ? 400 : 200) / sourceGeometry.columns) * sourceGeometry.rowHeight + sourceGeometry.headerOffset - 300;
  source.unmount();
  source.container.remove();
  const target = mountDensity(targetGeometry, true);
  return target;
}

async function aiContinuityFixture(transport: "direct-ES" | "media-api", total = 100) {
  vi.stubGlobal("scheduler", { yield: async () => {} });
  const corpus = new MockDataSource(total);
  const dataSource = transport === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
  vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
  const pages = vi.spyOn(dataSource, "searchAfter").mockImplementation((...args) => corpus.searchAfter(...args));
  const counts = vi.spyOn(dataSource, "countWithTickers").mockImplementation(() => corpus.countWithTickers());
  const ranks = vi.spyOn(dataSource, "countBefore").mockImplementation((...args) => corpus.countBefore(...args));
  vi.spyOn(dataSource, "fetchPositionIndex").mockResolvedValue(null);
  const ordinary = await corpus.searchAfter({ offset: total > 200 ? Math.floor(total / 2) : 0, length: 100 }, null);
  const aiHits = ordinary.hits.slice(0, 80).reverse().map((image, index) => ({ ...image, __aiScore: 80 - index }));
  let gate = Promise.resolve();
  let outcome: "success" | "empty" | "failure" = "success";
  const fetch = vi.fn(async (url: string) => {
    if (url.startsWith("/bedrock/embed?")) return Response.json({ embedding: Array(256).fill(0) });
    const requestGate = gate;
    const requestOutcome = outcome;
    await requestGate;
    if (requestOutcome === "failure") return new Response("Fixture refusal", { status: 403 });
    const hits = requestOutcome === "empty" ? [] : aiHits;
    return Response.json(transport === "media-api"
      ? { data: hits.map(image => ({ data: { ...image, cost: "free", valid: true } })), total }
      : { hits: { hits: hits.map(image => ({ _id: image.id, _source: image, _score: image.__aiScore })) } });
  });
  vi.stubGlobal("fetch", fetch);
  const ai = vi.spyOn(dataSource, "searchByAi");
  return { dataSource, corpus, pages, counts, ranks, fetch, ai, aiHits,
    hold: (nextOutcome: typeof outcome = "success") => {
      outcome = nextOutcome;
      let release!: () => void;
      gate = new Promise<void>(resolve => { release = resolve; });
      return () => { release(); gate = Promise.resolve(); outcome = "success"; };
    } };
}

describe.each(["direct-ES", "media-api"] as const)("destination history %s through publication and placement", (transport) => {
  it.each([{ total: 100, intent: "clear" }, { total: 12000, intent: "same-id" }] as const)(
    "L42 history with neighbour fallback retains $intent retirement through $total-result discovery", async ({ total, intent }) => {
      const fixture = await aiContinuityFixture(transport, total);
      routeParams = { nonFree: "true" };
      useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
      useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
      const targetId = total === 100 ? "img-40" : fixture.aiHits[10].id;
      useSearchStore.getState().setFocusedImageId(targetId);
      const view = mountDensity(table);
      frame();
      frame();
      view.container.scrollTop = 640;
      const continuity = { ...searchContinuity.historySearchContinuity({ searchKey: buildSearchKey(routeParams),
        anchorImageId: targetId, anchorIsPhantom: false, anchorOffset: total === 100 ? 40 : Math.floor(total / 2) + 69,
        viewportRatio: 0.3, newCountSince: null }, routeParams), fallback: undefined };
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const read = fixture.pages.getMockImplementation()!;
      fixture.pages.mockImplementationOnce(async (...args) => { const result = await read(...args); await gate; return result; });
      let pending!: Promise<void>;
      act(() => { pending = useSearchStore.getState().search(undefined, { continuity }); });
      const before = useSearchStore.getState();
      act(() => useSearchStore.getState().setFocusedImageId(intent === "clear" ? null : targetId));
      try {
        await act(async () => { release(); await pending; await vi.advanceTimersByTimeAsync(0); });
        await vi.waitFor(() => expect(useSearchStore.getState().loading).toBe(false));
        const state = useSearchStore.getState();
        expect(state.focusedImageId).toBe(intent === "clear" ? null : targetId);
        expect(state._searchContinuity).toMatchObject({ provenance: "history", targetId, phase: "retired" });
        expect(state._searchContinuity?.owner.aborted).toBe(false);
        expect(state.sortAroundFocusGeneration).toBe(before.sortAroundFocusGeneration);
        expect(state._scrollReset).toEqual(before._scrollReset);
        expect(view.container.scrollTop).toBe(640);
        expect(state.total).toBe(total);
        expect(state.error).toBeNull();
        expect(state.imagePositions.has(targetId)).toBe(true);
        expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, state.bufferOffset + index]));
        expect(fixture.pages).toHaveBeenCalledTimes(total === 100 ? 1 : 4);
        expect(fixture.counts).toHaveBeenCalledOnce();
        expect(fixture.ranks).toHaveBeenCalledTimes(total === 100 ? 0 : 1);
      } finally {
        await act(async () => { release(); await pending; });
      }
    });

  it.each(["success", "empty", "failure"] as const)("L42 adopted AI history with neighbour fallback retains retirement on %s", async (outcome) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    useSearchStore.getState().setFocusedImageId("img-40");
    const view = mountDensity(table);
    frame();
    frame();
    view.container.scrollTop = 640;
    const release = fixture.hold(outcome);
    let pending!: Promise<void>;
    act(() => {
      useSearchStore.getState().setParams({ aiQuery: "L42-history", orderBy: "-relevance" });
      pending = useSearchStore.getState().search(undefined, { continuity: searchContinuity.captureSearchContinuity(false) });
    });
    const predecessor = useSearchStore.getState()._searchContinuity!;
    const departure = useSearchStore.getState();
    const params = { ...departure.params, orderBy: "uploadTime" };
    const continuity = { ...searchContinuity.historySearchContinuity({ searchKey: buildSearchKey(params),
      anchorImageId: "img-49", anchorIsPhantom: false, anchorOffset: 49, viewportRatio: 0.3,
      newCountSince: null }, params), fallback: undefined };
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      act(() => {
        useSearchStore.getState().setParams({ orderBy: "uploadTime" });
        useSearchStore.getState().resortAiBuffer("uploadTime", continuity);
      });
      const adopted = useSearchStore.getState();
      expect(adopted.results).toBe(departure.results);
      expect(adopted.sortAroundFocusGeneration).toBe(departure.sortAroundFocusGeneration);
      expect(adopted._scrollReset).toEqual(departure._scrollReset);
      expect(adopted._searchContinuity).toMatchObject({ provenance: "history", targetId: "img-49", phase: "pending" });
      expect(predecessor.owner.aborted).toBe(true);
      expect(fixture.ai.mock.calls[0][1]?.aborted).toBe(false);
      expect(view.container.scrollTop).toBe(640);
      act(() => useSearchStore.getState().setFocusedImageId(outcome === "success" ? "img-49" : null));
      await act(async () => { release(); await pending; });
      const state = useSearchStore.getState();
      expect(state.loading).toBe(false);
      expect(state.focusedImageId).toBe(outcome === "success" ? "img-49" : null);
      expect(state.sortAroundFocusGeneration).toBe(departure.sortAroundFocusGeneration);
      expect(state._scrollReset).toEqual(departure._scrollReset);
      expect(view.container.scrollTop).toBe(640);
      if (outcome === "failure" && transport === "direct-ES") {
        expect(state.results).toBe(departure.results);
        expect(state.error).not.toBeNull();
        expect(state._searchContinuity).toBeNull();
      } else {
        expect(state.total).toBe(outcome === "success" ? 80 : 0);
        expect(state.error).toBeNull();
        expect(state._searchContinuity).toMatchObject({ owner: adopted._searchContinuity!.owner, phase: "retired" });
        expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, index]));
        if (outcome === "success") expect(state.results.map(image => image?.id)).toEqual([...fixture.aiHits].reverse().map(image => image.id));
      }
      expect(fixture.ai).toHaveBeenCalledOnce();
      expect(fixture.pages).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  it("L42 user top fallback keeps immediate pending AI reorder rather than adopting history departure handling", async () => {
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    useSearchStore.getState().setFocusedImageId("img-40");
    const release = fixture.hold();
    useSearchStore.getState().setParams({ aiQuery: "L42-user", orderBy: "-relevance" });
    const pending = useSearchStore.getState().search(undefined, { continuity: searchContinuity.captureSearchContinuity(false) });
    const departure = useSearchStore.getState();
    const continuity = { ...searchContinuity.captureSearchContinuity(true), fallback: "top" as const };
    try {
      act(() => {
        useSearchStore.getState().setParams({ orderBy: "-uploadTime" });
        useSearchStore.getState().resortAiBuffer("-uploadTime", continuity);
      });
      const state = useSearchStore.getState();
      expect(state.results).not.toBe(departure.results);
      expect(state.results.map(image => image?.id)).toEqual([...departure.results].reverse().map(image => image?.id));
      expect(state._searchContinuity).toMatchObject({ provenance: "user", targetId: "img-40", phase: "ready" });
      expect(state._searchContinuity?.historyFocusIntent).toBeUndefined();
      expect(state.sortAroundFocusGeneration).toBe(departure.sortAroundFocusGeneration + 1);
      expect(state.loading).toBe(true);
      expect(fixture.ai.mock.calls[0][1]?.aborted).toBe(false);
      act(() => useSearchStore.getState().setFocusedImageId(null));
      await act(async () => { release(); await pending; });
      expect(useSearchStore.getState()).toMatchObject({ focusedImageId: "img-40", total: 80, loading: false, error: null });
      expect(fixture.ai).toHaveBeenCalledOnce();
      expect(fixture.pages).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  const layouts = [100, 12000, 70000].flatMap(total => (["explicit", "phantom"] as const).flatMap(focusMode =>
    (["grid", "table"] as const).flatMap(layout => (["ratio", "centre"] as const).map(policy => ({ total, focusMode, layout, policy })))));
  it.each(layouts)("restores captured $total $focusMode destination in current $layout with $policy policy", async ({ total, focusMode, layout, policy }) => {
    const fixture = await aiContinuityFixture(transport, total);
    const destination = { nonFree: "true" };
    routeParams = destination;
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode, _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    const offset = total === 100 ? 0 : Math.floor(total / 2);
    if (offset) await act(async () => { await useSearchStore.getState().seek(offset); });
    const targetId = useSearchStore.getState().results[40]!.id;
    const sourceGeometry = layout === "grid" ? table : grid;
    const currentGeometry = layout === "grid" ? grid : table;
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(sourceGeometry, false, false, true);
    frame();
    frame();
    anchor.viewportId = targetId;
    if (focusMode === "explicit") useSearchStore.getState().setFocusedImageId(targetId);
    const sourceState = useSearchStore.getState();
    const sourceIndex = sourceState.imagePositions.get(targetId)! - (isTwoTierFromTotal(total) ? 0 : sourceState.bufferOffset);
    view.container.scrollTop = Math.floor(sourceIndex / sourceGeometry.columns) * sourceGeometry.rowHeight - 180;
    useSearchStore.setState({ newCount: 134 });
    const snapshot = buildHistorySnapshot();
    expect(snapshot.anchorImageId).toBe(targetId);
    expect(snapshot.viewportRatio).toBe(0.3);
    expect(snapshot.newCount).toBe(134);
    const key = `layout-history-${total}-${focusMode}-${layout}-${policy}`;
    const oldState = window.history.state;
    snapshotStore.set(key, snapshot);
    const original = searchContinuity.historySearchContinuity;
    if (policy === "centre") vi.spyOn(searchContinuity, "historySearchContinuity").mockImplementation((...args) =>
      ({ ...original(...args), placement: { kind: "centre" } }));
    const search = vi.spyOn(useSearchStore.getState(), "search");
    try {
      vi.setSystemTime(Date.now() + 1000);
      act(() => {
        routeParams = { ...destination, orderBy: "uploadTime" };
        markUserInitiatedNavigation();
        view.changeGeometry(currentGeometry);
      });
      await act(async () => { await search.mock.results[0].value; await vi.advanceTimersByTimeAsync(0); });
      await vi.waitFor(() => expect(useSearchStore.getState().loading).toBe(false));
      useSearchStore.getState().setFocusedImageId("img-10");
      anchor.viewportId = "img-10";
      window.history.replaceState({ kupuaKey: key }, "");
      act(() => { routeParams = destination; view.changeGeometry(currentGeometry); });
      await act(async () => { await search.mock.results[1].value; await vi.advanceTimersByTimeAsync(0); });
      await vi.waitFor(() => expect(useSearchStore.getState().loading).toBe(false));
      const state = useSearchStore.getState();
      expect(state.focusedImageId).toBe(focusMode === "explicit" ? targetId : null);
      expect(state._searchContinuity).toMatchObject({ targetId, focus: focusMode === "explicit" ? "target" : "none", phase: "placed" });
      expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, state.bufferOffset + index]));
      const index = state.imagePositions.get(targetId)! - (isTwoTierFromTotal(total) ? 0 : state.bufferOffset);
      expect(Math.floor(index / currentGeometry.columns) * currentGeometry.rowHeight - view.container.scrollTop)
        .toBe(policy === "ratio" ? 180 : (600 - currentGeometry.headerOffset - currentGeometry.rowHeight) / 2);
      expect(state.total).toBe(total);
      expect(state.error).toBeNull();
      expect(state.newCountSince! > snapshot.newCountSince!).toBe(true);
      expect(state.newCount).toBe(0);
    } finally {
      snapshotStore.delete(key);
      window.history.replaceState(oldState, "");
    }
  });

  it.each(["ordinary", "AI"] as const)("restores a distinct %s entry even when the query fingerprint is unchanged", async (kind) => {
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true", ...(kind === "AI" ? { aiQuery: "same-query", orderBy: "-relevance" } : {}) };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    const oldState = window.history.state;
    window.history.replaceState({ kupuaKey: "same-query-source" }, "");
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    useSearchStore.getState().setFocusedImageId("img-60");
    view.container.scrollTop = 60 * table.rowHeight - 180;
    const key = `same-query-destination-${kind}`;
    snapshotStore.set(key, { searchKey: buildSearchKey(routeParams), anchorImageId: "img-40",
      anchorIsPhantom: true, anchorOffset: 40, viewportRatio: 0.3, newCountSince: null });
    const search = vi.spyOn(useSearchStore.getState(), "search");
    const requests = fixture.fetch.mock.calls.length;
    try {
      act(() => {
        window.history.replaceState({ kupuaKey: key }, "");
        router.notify("BACK");
        routeParams = { ...routeParams };
        view.changeGeometry(table);
      });
      if (kind === "ordinary") await act(async () => { await search.mock.results[0]?.value; });
      const state = useSearchStore.getState();
      expect(state.focusedImageId).toBeNull();
      expect(state._searchContinuity).toMatchObject({ targetId: "img-40", focus: "none", phase: "placed" });
      expect(state.imagePositions.get("img-40")! * table.rowHeight - view.container.scrollTop).toBe(180);
      if (kind === "AI") {
        expect(search).not.toHaveBeenCalled();
        expect(fixture.fetch).toHaveBeenCalledTimes(requests);
      }
    } finally {
      snapshotStore.delete(key);
      snapshotStore.delete("same-query-source");
      window.history.replaceState(oldState, "");
    }
  });

  it("B13 missing matching-key target cannot adopt visible departing candidates", async () => {
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true", orderBy: "uploadTime" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "phantom", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    anchor.viewportId = "img-70";
    anchor.visibleIds = ["img-70"];
    expect(useSearchStore.getState().imagePositions.has("img-70")).toBe(true);
    view.container.scrollTop = 70 * table.rowHeight - 180;
    const destination = { nonFree: "true" };
    const historyKey = "missing-destination-anchor";
    const oldHistoryState = window.history.state;
    snapshotStore.set(historyKey, { searchKey: buildSearchKey(destination), anchorImageId: "missing-image",
      anchorIsPhantom: true, anchorOffset: 70, viewportRatio: 0.3, newCountSince: null });
    const search = vi.spyOn(useSearchStore.getState(), "search");
    try {
      window.history.replaceState({ kupuaKey: historyKey }, "");
      act(() => { routeParams = destination; view.changeGeometry(table); });
      await act(async () => { await search.mock.results[0].value; await vi.advanceTimersByTimeAsync(0); });
      expect(useSearchStore.getState()).toMatchObject({ loading: false, focusedImageId: null, bufferOffset: 0, error: null });
      expect(view.container.scrollTop).toBe(0);
      expect(fixture.pages.mock.calls.some(([params]) => params.ids?.includes("img-70"))).toBe(false);
      expect(fixture.ranks).not.toHaveBeenCalled();
    } finally {
      snapshotStore.delete(historyKey);
      window.history.replaceState(oldHistoryState, "");
    }
  });

  it.each(["explicit", "phantom"] as const)("B14 repeated AI A-none/B-focus history restores represented focus in %s mode", async (focusMode) => {
    const fixture = await aiContinuityFixture(transport);
    const entryA = { nonFree: "true", aiQuery: "history-focus", orderBy: "-relevance" };
    const entryB = { ...entryA, orderBy: "uploadTime" };
    routeParams = entryB;
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode, _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    const oldHistoryState = window.history.state;
    const keyA = `history-none-${focusMode}`;
    const keyB = `history-focus-${focusMode}`;
    snapshotStore.set(keyA, { searchKey: buildSearchKey(entryA), anchorImageId: "img-40",
      anchorIsPhantom: true, anchorOffset: 39, viewportRatio: 0.3, newCountSince: null });
    snapshotStore.set(keyB, { searchKey: buildSearchKey(entryB), anchorImageId: "img-60",
      anchorIsPhantom: focusMode === "phantom", anchorOffset: 60, viewportRatio: 0.3, newCountSince: null });
    anchor.viewportId = "img-60";
    useSearchStore.getState().setFocusedImageId("img-60");
    const requests = fixture.fetch.mock.calls.length;
    try {
      for (let cycle = 0; cycle < 3; cycle += 1) {
        window.history.replaceState({ kupuaKey: keyA }, "");
        act(() => { routeParams = entryA; view.changeGeometry(table); });
        const stateA = useSearchStore.getState();
        expect(window.history.state.kupuaKey).toBe(keyA);
        expect(stateA.focusedImageId).toBeNull();
        expect(stateA._searchContinuity).toMatchObject({ targetId: "img-40", focus: "none", phase: "placed" });
        expect(stateA.imagePositions.get("img-40")! * table.rowHeight - view.container.scrollTop).toBe(180);
        anchor.viewportId = "img-40";
        window.history.replaceState({ kupuaKey: keyB }, "");
        act(() => { routeParams = entryB; view.changeGeometry(table); });
        const stateB = useSearchStore.getState();
        expect(window.history.state.kupuaKey).toBe(keyB);
        expect(stateB.focusedImageId).toBe(focusMode === "explicit" ? "img-60" : null);
        expect(stateB._searchContinuity).toMatchObject({ targetId: "img-60", focus: focusMode === "explicit" ? "target" : "none", phase: "placed" });
        expect(stateB.imagePositions.get("img-60")! * table.rowHeight - view.container.scrollTop).toBe(180);
        anchor.viewportId = "img-60";
      }
      expect(fixture.fetch).toHaveBeenCalledTimes(requests);
      expect(fixture.ai).toHaveBeenCalledOnce();
      expect(fixture.pages).not.toHaveBeenCalled();
    } finally {
      snapshotStore.delete(keyA);
      snapshotStore.delete(keyB);
      window.history.replaceState(oldHistoryState, "");
    }
  });
});

describe.each(["direct-ES", "media-api"] as const)("AI continuity %s through the URL producer", (transport) => {
  it.each(["ratio", "centre"] as const)("L39 preserves the browsed centre on AI exit with %s placement", async (policy) => {
    const { dataSource, pages, counts, fetch, ai, aiHits } = await aiContinuityFixture(transport);
    const capture = searchContinuity.captureSearchContinuity;
    const captures = vi.spyOn(searchContinuity, "captureSearchContinuity").mockImplementation((...args) => {
      const captured = capture(...args);
      return policy === "centre" ? { ...captured, placement: { kind: "centre" } } : captured;
    });
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "phantom", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { ...routeParams, aiQuery: "test AI", orderBy: "-relevance" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    await act(async () => { await search.mock.results[0].value; });
    expect(ai).toHaveBeenCalledOnce();
    expect(useSearchStore.getState()).toMatchObject({ focusedImageId: null, total: 80, aiPoolTotal: 100, loading: false });
    expect(useSearchStore.getState().results.map(image => image?.id)).toEqual(aiHits.map(image => image.id));
    expect(useEnrichmentStore.getState().data.size).toBe(transport === "media-api" ? 80 : 0);
    const targetId = aiHits[30].id;
    anchor.viewportId = targetId;
    view.container.scrollTop = 30 * table.rowHeight - 180;
    expect(view.container.scrollTop).toBeGreaterThan(0);
    act(() => {
      routeParams = { nonFree: "true" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    await act(async () => { await search.mock.results[1].value; });
    const state = useSearchStore.getState();
    expect(state).toMatchObject({ focusedImageId: null, total: 100, loading: false, sortAroundFocusStatus: null });
    expect(state.imagePositions.get(targetId)).toBe(49);
    expect(49 * table.rowHeight - view.container.scrollTop).toBe(policy === "ratio" ? 180 : (600 - table.headerOffset - table.rowHeight) / 2);
    expect(state._searchContinuity).toMatchObject({ targetId, focus: "none", phase: "placed" });
    expect(state._searchContinuity?.owner.aborted).toBe(false);
    expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, index]));
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect(search).toHaveBeenCalledTimes(2);
    expect(captures).toHaveBeenCalledTimes(2);
    expect(pages).toHaveBeenCalledTimes(2);
    expect(counts).toHaveBeenCalledTimes(transport === "media-api" ? 2 : 3);
    expect(fetch).toHaveBeenCalledTimes(transport === "media-api" ? 1 : 2);
  });

  const exits = [12000, 70000].flatMap(total =>
    (["explicit", "phantom"] as const).map(focusMode => ({ total, focusMode })));
  it.each(exits)("follows remembered A rather than browsed B into $total ordinary results in $focusMode mode", async ({ total, focusMode }) => {
    const fixture = await aiContinuityFixture(transport, total);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode, _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    const targetId = fixture.aiHits[10].id;
    useSearchStore.getState().setFocusedImageId(targetId);
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { ...routeParams, aiQuery: "remembered-A", orderBy: "-relevance" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    await act(async () => { await search.mock.results[0].value; });
    expect(useSearchStore.getState().focusedImageId).toBe(targetId);
    useSearchStore.getState().setFocusedImageId(targetId);
    expect(useSearchStore.getState()._focusedImageKnownOffset).toBe(10);
    anchor.viewportId = fixture.aiHits[30].id;
    view.container.scrollTop = 30 * table.rowHeight - 180;
    act(() => {
      routeParams = { nonFree: "true" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    await act(async () => { await search.mock.results[1].value; await vi.advanceTimersByTimeAsync(0); });
    await vi.waitFor(() => expect(useSearchStore.getState().loading).toBe(false));
    const state = useSearchStore.getState();
    expect(search.mock.calls[1][1]).toMatchObject({ discardOffsetHint: true, continuity: { targetId, focus: "target" } });
    expect(state).toMatchObject({ total, focusedImageId: targetId, loading: false, error: null,
      sortAroundFocusStatus: null, aiPoolTotal: null });
    expect(state.imagePositions.get(targetId)).toBe(Math.floor(total / 2) + 69);
    const index = state.imagePositions.get(targetId)! - (isTwoTierFromTotal(total) ? 0 : state.bufferOffset);
    expect(index * table.rowHeight - view.container.scrollTop).toBe(0);
    expect(state._searchContinuity).toMatchObject({ targetId, focus: "target", phase: "placed" });
    expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, state.bufferOffset + index]));
    expect(fixture.pages).toHaveBeenCalledTimes(5);
    expect(fixture.ranks).toHaveBeenCalledOnce();
    expect(fixture.ai).toHaveBeenCalledOnce();
  });

  const placements = (["ratio", "centre"] as const).flatMap(policy =>
    ([false, "before", "after"] as const).map(interrupted => ({ policy, interrupted })));
  it.each(placements)("pending AI sort uses latest $policy policy after density, interrupted=$interrupted", async ({ policy, interrupted }) => {
    const fixture = await aiContinuityFixture(transport);
    const capture = searchContinuity.captureSearchContinuity;
    vi.spyOn(searchContinuity, "captureSearchContinuity").mockImplementation((...args) => {
      const captured = capture(...args);
      return policy === "centre" ? { ...captured, placement: { kind: "centre" } } : captured;
    });
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "phantom", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    useSearchStore.getState().setFocusedImageId("img-20");
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const source = mountDensity(table, false, false, true);
    frame();
    frame();
    source.container.scrollTop = 20 * table.rowHeight - 180;
    const search = vi.spyOn(useSearchStore.getState(), "search");
    const release = fixture.hold();
    act(() => {
      routeParams = { ...routeParams, aiQuery: "pending-sort", orderBy: "-relevance" };
      markUserInitiatedNavigation();
      source.changeGeometry(table);
    });
    const pending = search.mock.results[0].value;
    const predecessor = useSearchStore.getState()._searchContinuity!;
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const selectedIds = new Set(["img-60", "img-70"]);
      useSelectionStore.setState({ selectedIds, anchorId: "img-60" });
      for (const [orderBy, targetId] of [["-uploadTime", "img-60"], ["uploadTime", "img-70"]] as const) {
        useSelectionStore.setState({ anchorId: targetId });
        source.container.scrollTop = useSearchStore.getState().imagePositions.get(targetId)! * table.rowHeight - 180;
        act(() => {
          routeParams = { ...routeParams, orderBy };
          markUserInitiatedNavigation();
          source.changeGeometry(table);
        });
      }
      expect(predecessor.owner.aborted).toBe(true);
      expect(fixture.ai.mock.calls[0][1]?.aborted).toBe(false);
      expect(useSearchStore.getState().loading).toBe(true);
      let owner = useSearchStore.getState()._searchContinuity!.owner;
      source.unmount();
      source.container.remove();
      const target = mountDensity(grid, true, false, interrupted === "before");
      frame();
      if (interrupted === "before") {
        target.container.scrollTop = Math.floor(useSearchStore.getState().imagePositions.get("img-70")! / grid.columns) * grid.rowHeight - 180;
        act(() => {
          routeParams = { ...routeParams, orderBy: "-uploadTime" };
          markUserInitiatedNavigation();
          target.changeGeometry(grid);
        });
        owner = useSearchStore.getState()._searchContinuity!.owner;
        act(() => {
          target.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 640 }));
          target.container.scrollTop = 640;
          target.container.dispatchEvent(new Event("scroll"));
        });
        expect(useSearchStore.getState()._searchContinuity).toMatchObject({ phase: "retired", owner });
      }
      await act(async () => { release(); await pending; });
      expect(useSearchStore.getState()._searchContinuity).toMatchObject({ targetId: "img-70", phase: interrupted === "before" ? "retired" : "ready", owner });
      if (interrupted === "after") act(() => {
        target.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 640 }));
        target.container.scrollTop = 640;
        target.container.dispatchEvent(new Event("scroll"));
      });
      frame();
      const state = useSearchStore.getState();
      expect(state).toMatchObject({ focusedImageId: "img-20", total: 80, bufferOffset: 0,
        aiPoolTotal: 100, loading: false, error: null, params: { orderBy: interrupted === "before" ? "-uploadTime" : "uploadTime" } });
      const index = state.imagePositions.get("img-70")!;
      if (interrupted) expect(target.container.scrollTop).toBe(640);
      else expect(Math.floor(index / grid.columns) * grid.rowHeight - target.container.scrollTop)
        .toBe(policy === "ratio" ? 180 : (600 - grid.rowHeight) / 2);
      expect(state._searchContinuity).toMatchObject({ targetId: "img-70", phase: interrupted ? "retired" : "placed", focus: "retain", owner });
      expect(owner.aborted).toBe(false);
      expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, index]));
      expect(useSelectionStore.getState().selectedIds).toBe(selectedIds);
      expect(useSelectionStore.getState().anchorId).toBe("img-70");
      expect(useEnrichmentStore.getState().data.size).toBe(transport === "media-api" ? 80 : 0);
      const requests = fixture.fetch.mock.calls.length;
      act(() => useSearchStore.getState().resortAiBuffer("-relevance",
        { provenance: "user", targetId: "img-70", placement: { kind: "ratio", ratio: 0.3 }, focus: "retain" }));
      expect(owner.aborted).toBe(true);
      expect(useSearchStore.getState()._searchContinuity).toMatchObject({ targetId: "img-70", phase: "placed" });
      expect(fixture.fetch).toHaveBeenCalledTimes(requests);
      expect(fixture.pages).toHaveBeenCalledOnce();
      expect(fixture.ai).toHaveBeenCalledOnce();
      expect(search).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  const historyCases = (["target", "phantom", "none"] as const).flatMap(focus =>
    (["success", "empty", "failure"] as const).flatMap(outcome =>
      (["none", "history", "search"] as const).map(successor => ({ focus, outcome, successor, interrupted: false }))));
  historyCases.push({ focus: "target", outcome: "success", successor: "none", interrupted: true },
    { focus: "phantom", outcome: "success", successor: "none", interrupted: true });
  it.each(historyCases)("pending history $focus/$outcome, successor=$successor, interrupted=$interrupted retains ownership", async ({ focus, outcome, successor, interrupted }) => {
    const none = focus === "none";
    const phantom = focus !== "target";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    useSearchStore.getState().setFocusedImageId("img-49");
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    view.container.scrollTop = 49 * table.rowHeight - 180;
    const release = fixture.hold(outcome);
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { ...routeParams, aiQuery: "history-compatibility", orderBy: "-relevance" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    const pending = search.mock.results[0].value;
    const originalOwner = useSearchStore.getState()._searchContinuity!.owner;
    const historyKey = "ai-continuity-review-history";
    const successorKey = "ai-continuity-review-successor";
    const oldHistoryState = window.history.state;
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      act(() => {
        routeParams = { ...routeParams, orderBy: "-uploadTime" };
        markUserInitiatedNavigation();
        view.changeGeometry(table);
      });
      expect(originalOwner.aborted).toBe(true);
      const departureResults = useSearchStore.getState().results;
      const departureScroll = view.container.scrollTop;
      const destination = { ...routeParams, orderBy: "-relevance" };
      snapshotStore.set(historyKey, { searchKey: buildSearchKey(destination), anchorImageId: none ? null : "img-49",
        anchorIsPhantom: phantom, anchorOffset: 49, viewportRatio: 0.3, newCountSince: null });
      window.history.replaceState({ ...oldHistoryState, kupuaKey: historyKey }, "");
      act(() => {
        routeParams = destination;
        view.changeGeometry(table);
      });
      expect(useSearchStore.getState()._searchContinuity).toMatchObject({ targetId: none ? null : "img-49", focus: phantom ? "none" : "target", phase: "pending" });
      expect(useSearchStore.getState().results).toBe(departureResults);
      expect(view.container.scrollTop).toBe(departureScroll);
      expect(fixture.ai.mock.calls[0][1]?.aborted).toBe(false);
      const historyOwner = useSearchStore.getState()._searchContinuity!.owner;
      if (successor === "history") {
        const latest = { ...destination, orderBy: "-uploadTime" };
        snapshotStore.set(successorKey, { searchKey: buildSearchKey(latest), anchorImageId: "img-60",
          anchorIsPhantom: true, anchorOffset: 60, viewportRatio: 0.2, newCountSince: null });
        window.history.replaceState({ kupuaKey: successorKey }, "");
        act(() => { routeParams = latest; view.changeGeometry(table); });
        expect(historyOwner.aborted).toBe(true);
        expect(fixture.ai.mock.calls[0][1]?.aborted).toBe(false);
        expect(useSearchStore.getState().results).toBe(departureResults);
      } else if (successor === "search") {
        act(() => {
          routeParams = { nonFree: "true", query: "history-successor" };
          markUserInitiatedNavigation();
          view.changeGeometry(table);
        });
        await act(async () => { await search.mock.results[1].value; });
        const current = useSearchStore.getState();
        const currentTop = view.container.scrollTop;
        expect(fixture.ai.mock.calls[0][1]?.aborted).toBe(true);
        await act(async () => { release(); await pending; });
        expect(useSearchStore.getState()).toBe(current);
        expect(view.container.scrollTop).toBe(currentTop);
        return;
      }
      const owner = useSearchStore.getState()._searchContinuity!.owner;
      let placementView = view;
      if (interrupted) {
        anchor.viewportId = "img-49";
        view.unmount();
        view.container.remove();
        placementView = mountDensity(grid, true);
        frame();
      }
      await act(async () => { release(); await pending; });
      const state = useSearchStore.getState();
      if (outcome === "failure" && transport === "direct-ES") {
        expect(state.results).toBe(departureResults);
        expect(state.error).not.toBeNull();
        expect(state.loading).toBe(false);
        expect(state._searchContinuity).toBeNull();
        expect(view.container.scrollTop).toBe(departureScroll);
        return;
      }
      expect(state).toMatchObject({ total: outcome === "success" ? 80 : 0, loading: false, error: null,
        params: { orderBy: successor === "history" ? "-uploadTime" : "-relevance" } });
      const targetId = successor === "history" ? "img-60" : none ? null : "img-49";
      expect(state.focusedImageId).toBe(outcome === "success" && !phantom && successor !== "history" ? "img-49" : null);
      if (interrupted) {
        expect(state._searchContinuity).toMatchObject({ targetId, phase: "ready", owner });
        act(() => {
          placementView.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 640 }));
          placementView.container.scrollTop = 640;
          placementView.container.dispatchEvent(new Event("scroll"));
        });
        frame();
        expect(useSearchStore.getState()._searchContinuity).toMatchObject({ phase: "retired", owner });
        expect(placementView.container.scrollTop).toBe(640);
        expect(useSearchStore.getState().results).toBe(state.results);
        placementView.unmount();
        placementView.container.remove();
        mountDensity(table, true);
        frame();
        frame();
        expect(useSearchStore.getState()._searchContinuity).toMatchObject({ phase: "retired", owner });
        expect(owner.aborted).toBe(false);
        expect(fixture.ai).toHaveBeenCalledOnce();
        return;
      }
      if (!targetId || outcome !== "success") {
        expect(state._searchContinuity).toBeNull();
        expect(view.container.scrollTop).toBe(0);
      } else {
        expect(state._searchContinuity).toMatchObject({ targetId, phase: "placed", owner,
          placement: { kind: "ratio", ratio: successor === "history" ? 0.2 : 0.3 } });
        expect(state.imagePositions.get(targetId)! * table.rowHeight - view.container.scrollTop).toBe(successor === "history" ? 120 : 180);
      }
      expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, index]));
      expect(fixture.ai).toHaveBeenCalledOnce();
      expect(search).toHaveBeenCalledOnce();
    } finally {
      snapshotStore.delete(historyKey);
      snapshotStore.delete(successorKey);
      window.history.replaceState(oldHistoryState, "");
      await act(async () => { release(); await pending; });
    }
  });

  it.each(["success", "empty", "failure"] as const)("settles owned %s with finite missing-target and transport-specific absence/failure", async (outcome) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    useSearchStore.getState().setFocusedImageId("img-90");
    const before = useSearchStore.getState().results;
    const previousOverlay = new Map([["img-90", { cost: "free" as const }]]);
    useEnrichmentStore.getState().setEnrichment(previousOverlay);
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    view.container.scrollTop = 90 * table.rowHeight - 180;
    const release = fixture.hold(outcome);
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { ...routeParams, aiQuery: "missing-target", orderBy: "-relevance" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    const pending = search.mock.results[0].value;
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); release(); await pending; });
      const state = useSearchStore.getState();
      expect(state).toMatchObject({ loading: false, sortAroundFocusStatus: null, _searchContinuity: null });
      if (outcome === "failure" && transport === "direct-ES") {
        expect(state.error).not.toBeNull();
        expect(state.results).toBe(before);
        expect(useEnrichmentStore.getState().data).toBe(previousOverlay);
      } else {
        expect(state).toMatchObject({ error: null, focusedImageId: null, total: outcome === "success" ? 80 : 0 });
        expect(state.total).toBe(state.results.length);
        expect(view.container.scrollTop).toBe(0);
        expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, index]));
        expect(useEnrichmentStore.getState().data.size).toBe(outcome === "success" && transport === "media-api" ? 80 : 0);
      }
      if (transport === "media-api") expect(warn).not.toHaveBeenCalled();
      expect(fixture.pages).toHaveBeenCalledOnce();
      expect(fixture.ranks).not.toHaveBeenCalled();
      expect(fixture.ai).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  it("L39 missing centre uses the existing ordinary top fallback without creating focus", async () => {
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true", aiQuery: "missing-centre", orderBy: "-relevance" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    await act(async () => { await useSearchStore.getState().search(); });
    const narrowed = new MockDataSource(40);
    fixture.pages.mockImplementation((...args) => narrowed.searchAfter(...args));
    fixture.counts.mockImplementation(() => narrowed.countWithTickers());
    anchor.viewportId = "img-49";
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    view.container.scrollTop = 30 * table.rowHeight - 180;
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { nonFree: "true" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    await act(async () => { await search.mock.results[0].value; await vi.advanceTimersByTimeAsync(0); });
    expect(useSearchStore.getState()).toMatchObject({ total: 40, focusedImageId: null, loading: false,
      error: null, sortAroundFocusStatus: null, _searchContinuity: null });
    expect(view.container.scrollTop).toBe(0);
    expect(fixture.pages).toHaveBeenCalledTimes(3);
    expect(fixture.ranks).not.toHaveBeenCalled();
  });
  const successors = (["success", "empty", "failure"] as const).flatMap(outcome =>
    (["AI", "ordinary"] as const).map(successor => ({ outcome, successor })));
  it.each(successors)("rejects late $outcome after a newer $successor query", async ({ outcome, successor }) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fixture = await aiContinuityFixture(transport);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: routeParams }, true);
    await act(async () => { await useSearchStore.getState().search(); });
    anchor.viewportId = "img-49";
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    view.container.scrollTop = 49 * table.rowHeight - 180;
    const release = fixture.hold(outcome);
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { ...routeParams, aiQuery: "predecessor", orderBy: "-relevance" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    const pending = search.mock.results[0].value;
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      release();
      act(() => {
        routeParams = successor === "AI" ? { ...routeParams, aiQuery: "successor" } : { nonFree: "true", query: "successor" };
        markUserInitiatedNavigation();
        view.changeGeometry(table);
      });
      await act(async () => { await search.mock.results[1].value; });
      const owned = useSearchStore.getState();
      const overlay = useEnrichmentStore.getState().data;
      const scrollTop = view.container.scrollTop;
      expect(fixture.ai.mock.calls[0][1]?.aborted).toBe(true);
      expect(owned).toMatchObject({ loading: false, error: null, focusedImageId: null, total: successor === "AI" ? 80 : 100 });
      expect(owned._searchContinuity).toMatchObject({ targetId: "img-49", phase: "placed" });
      await act(async () => { await pending; });
      expect(useSearchStore.getState()).toBe(owned);
      expect(useEnrichmentStore.getState().data).toBe(overlay);
      expect(view.container.scrollTop).toBe(scrollTop);
      expect([...owned.imagePositions]).toEqual(owned.results.map((image, index) => [image!.id, index]));
      expect(search).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => { release(); await pending; });
    }
  });
});

describe("B6 selected sort through the URL producer", () => {
  const cases = (["equal", "distinct"] as const).flatMap(relationship =>
    (["explicit", "phantom"] as const).map(focusMode => ({ relationship, focusMode })));
  it.each(cases)("retains $relationship focus and selection anchors through sort and Clear in $focusMode mode", async ({ relationship, focusMode }) => {
    const dataSource = new MockDataSource(100, [{ field: "lastModified", ratio: 1 }]);
    routeParams = { nonFree: "true", orderBy: "-uploadTime" };
    useSearchStore.setState({ ...initialState, dataSource, params: { ...routeParams, length: 200 } }, true);
    useUiPrefsStore.setState({ focusMode, _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    const focusId = useSearchStore.getState().results[20]!.id;
    const selectionAnchorId = relationship === "equal" ? focusId : useSearchStore.getState().results[30]!.id;
    const selectedIds = new Set([selectionAnchorId]);
    useSearchStore.getState().setFocusedImageId(focusId);
    useSelectionStore.setState({ selectedIds, anchorId: selectionAnchorId });
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const search = vi.spyOn(useSearchStore.getState(), "search");
    const view = mountDensity(grid, false, false, true);
    frame();
    frame();
    const sourceIndex = useSearchStore.getState().imagePositions.get(selectionAnchorId)!;
    view.container.scrollTop = Math.floor(sourceIndex / grid.columns) * grid.rowHeight - 120;
    expect(useSearchStore.getState().focusedImageId).toBe(focusId);
    expect(search).not.toHaveBeenCalled();

    act(() => {
      routeParams = { ...routeParams, orderBy: "uploadTime" };
      markUserInitiatedNavigation();
      view.changeGeometry(grid);
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect.soft(useSearchStore.getState().focusedImageId).toBe(focusId);
    await act(async () => { await search.mock.results[0].value; });
    expect.soft(useSearchStore.getState().focusedImageId).toBe(focusId);
    expect(useSearchStore.getState()).toMatchObject({ loading: false, sortAroundFocusStatus: null, total: 100 });
    expect(useSearchStore.getState().imagePositions.has(selectionAnchorId)).toBe(true);
    expect(useSelectionStore.getState().selectedIds).toBe(selectedIds);
    expect(useSelectionStore.getState().anchorId).toBe(selectionAnchorId);
    const targetIndex = useSearchStore.getState().imagePositions.get(selectionAnchorId)!;
    expect(Math.floor(targetIndex / grid.columns) * grid.rowHeight - view.container.scrollTop).toBe(120);
    const placed = view.container.scrollTop;

    act(() => useSelectionStore.getState().clear());
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect.soft(useSearchStore.getState().focusedImageId).toBe(focusId);
    expect(view.container.scrollTop).toBe(placed);
    expect(search).toHaveBeenCalledTimes(1);

    act(() => useSelectionStore.setState({ selectedIds, anchorId: selectionAnchorId }));
    anchor.viewportId = useSearchStore.getState().results[5]!.id;
    view.container.scrollTop = 303;
    act(() => {
      routeParams = { ...routeParams, query: "retains-bookmark" };
      markUserInitiatedNavigation();
      view.changeGeometry(grid);
    });
    await act(async () => { await search.mock.results[1].value; });
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect(useSearchStore.getState().focusedImageId).toBe(focusId);
    expect(useSearchStore.getState()._searchContinuity).toMatchObject({ targetId: focusId, phase: "placed" });
    const focusedIndex = useSearchStore.getState().imagePositions.get(focusId)!;
    const focusedTop = Math.floor(focusedIndex / grid.columns) * grid.rowHeight - view.container.scrollTop;
    expect(focusedTop).toBeGreaterThanOrEqual(0);
    expect(focusedTop).toBeLessThanOrEqual(view.container.clientHeight - grid.rowHeight);
    expect(search).toHaveBeenCalledTimes(2);
    view.unmount();
    view.container.remove();
    const density = mountDensity(table, true);
    frame();
    frame();
    expect(density.container.scrollTop).toBe(focusedIndex * table.rowHeight + table.headerOffset - focusedTop);
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe("ordinary search capture timing", () => {
  it.each(["ratio", "centre"] as const)("uses %s placement for the same captured target with coherent, owned publication", async (policy) => {
    const capture = searchContinuity.captureSearchContinuity;
    const captures = vi.spyOn(searchContinuity, "captureSearchContinuity").mockImplementation((...args) => {
      const captured = capture(...args);
      return policy === "centre" ? { ...captured, placement: { kind: "centre" } } : captured;
    });
    const dataSource = new MockDataSource(100);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource, params: routeParams }, true);
    await act(async () => { await useSearchStore.getState().search(); });
    anchor.viewportId = "img-30";
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    view.container.scrollTop = 30 * table.rowHeight - 180;
    const search = vi.spyOn(useSearchStore.getState(), "search");
    const reads = vi.spyOn(dataSource, "searchAfter");
    beforeUrlSync = () => { view.container.scrollTop += 100; };
    act(() => {
      routeParams = { ...routeParams, query: "changed" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    await act(async () => { await search.mock.results[0].value; });
    expect(search).toHaveBeenCalledOnce();
    expect(captures).toHaveBeenCalledOnce();
    expect(reads).toHaveBeenCalledOnce();
    expect(useSearchStore.getState()).toMatchObject({ focusedImageId: null, loading: false, total: 100 });
    expect(useSearchStore.getState().imagePositions.get("img-30")).toBe(30);
    expect(30 * table.rowHeight - view.container.scrollTop).toBe(policy === "ratio" ? 180 : (600 - table.headerOffset - table.rowHeight) / 2);
    expect(useSearchStore.getState()._searchContinuity).toMatchObject({ targetId: "img-30", phase: "placed" });

    const originalRead = MockDataSource.prototype.searchAfter.bind(dataSource);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let predecessorSignal: AbortSignal | undefined;
    reads.mockImplementationOnce(async (...args) => {
      predecessorSignal = args[3];
      const result = await originalRead(...args);
      await held;
      return result;
    });
    act(() => {
      routeParams = { ...routeParams, query: "predecessor" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    const predecessor = search.mock.results[1].value;
    try {
      anchor.viewportId = "img-40";
      act(() => {
        routeParams = { ...routeParams, query: "successor" };
        markUserInitiatedNavigation();
        view.changeGeometry(table);
      });
      await act(async () => { await search.mock.results[2].value; });
      const owned = useSearchStore.getState();
      const placed = view.container.scrollTop;
      expect(owned._searchContinuity).toMatchObject({ targetId: "img-40", phase: "placed" });
      expect(predecessorSignal?.aborted).toBe(true);
      expect([...owned.imagePositions]).toEqual(owned.results.map((image, index) => [image!.id, index]));
      const expected = await MockDataSource.prototype.searchAfter.call(dataSource, { ...owned.params, length: 200 }, null);
      expect(owned.startCursor).toEqual(expected.sortValues[0]);
      expect(owned.endCursor).toEqual(expected.sortValues.at(-1));
      expect(owned).toMatchObject({ loading: false, sortAroundFocusStatus: null, bufferOffset: 0, total: 100, focusedImageId: null });
      await act(async () => { release(); await predecessor; });
      expect(useSearchStore.getState()).toBe(owned);
      expect(view.container.scrollTop).toBe(placed);
      expect(reads).toHaveBeenCalledTimes(3);
      expect(search).toHaveBeenCalledTimes(3);
      let releaseQuery!: () => void;
      const queryGate = new Promise<void>(resolve => { releaseQuery = resolve; });
      reads.mockImplementationOnce(async (...args) => {
        const result = await originalRead(...args);
        await queryGate;
        return result;
      });
      act(() => {
        routeParams = { ...routeParams, query: "browse-successor" };
        markUserInitiatedNavigation();
        view.changeGeometry(table);
      });
      const query = search.mock.results[3].value;
      try {
        await act(async () => { await useSearchStore.getState().seek(70); });
        const browsed = useSearchStore.getState();
        const browseTop = view.container.scrollTop;
        expect(browsed).toMatchObject({ total: 100, loading: false, error: null, focusedImageId: null,
          sortAroundFocusStatus: null, _searchContinuity: null, _browseNavigation: null });
        expect(browseTop).toBe(70 * table.rowHeight);
        expect([...browsed.imagePositions]).toEqual(browsed.results.map((image, index) => [image!.id, index]));
        expect(browsed.startCursor).toEqual(expected.sortValues[0]);
        expect(browsed.endCursor).toEqual(expected.sortValues.at(-1));
        await act(async () => { releaseQuery(); await query; });
        expect(useSearchStore.getState()).toBe(browsed);
        expect(view.container.scrollTop).toBe(browseTop);
        expect(reads).toHaveBeenCalledTimes(5);
        expect(search).toHaveBeenCalledTimes(4);
      } finally {
        await act(async () => { releaseQuery(); await query; });
      }
      view.container.scrollTop = placed;
      view.unmount();
      view.container.remove();
      const density = mountDensity(grid, true);
      frame();
      frame();
      expect(density.container.scrollTop).toBe(2733);
      expect(reads).toHaveBeenCalledTimes(5);
    } finally {
      await act(async () => { release(); await predecessor; });
    }
  });

  it.each([40, 20])("publishes the resolved neighbour or top fallback when membership narrows to %s", async (total) => {
    const source = new MockDataSource(100);
    const narrowed = new MockDataSource(total);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: source, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    useSearchStore.getState().setFocusedImageId("img-50");
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    view.container.scrollTop = 50 * table.rowHeight - 180;
    const reads = vi.spyOn(source, "searchAfter").mockImplementation((...args) => narrowed.searchAfter(...args));
    vi.spyOn(source, "countWithTickers").mockImplementation((...args) => narrowed.countWithTickers(...args));
    const ranks = vi.spyOn(source, "countBefore").mockImplementation((...args) => narrowed.countBefore(...args));
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { ...routeParams, query: "narrowed" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    await act(async () => { await search.mock.results[0].value; await vi.advanceTimersByTimeAsync(0); });
    const state = useSearchStore.getState();
    expect(state).toMatchObject({ total, bufferOffset: 0, loading: false, sortAroundFocusStatus: null, error: null,
      focusedImageId: total === 40 ? "img-39" : null });
    expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, index]));
    const expected = await narrowed.searchAfter({ ...state.params, length: 200 }, null);
    expect(state.results).toEqual(expected.hits);
    expect(state.startCursor).toEqual(expected.sortValues[0]);
    expect(state.endCursor).toEqual(expected.sortValues.at(-1));
    if (total === 40) {
      expect(state._searchContinuity).toMatchObject({ targetId: "img-39", placement: { kind: "ratio", ratio: 0.3 }, phase: "placed" });
      const top = 39 * table.rowHeight - view.container.scrollTop;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThanOrEqual(600 - table.rowHeight);
    } else {
      expect(state._searchContinuity).toBeNull();
      expect(view.container.scrollTop).toBe(0);
    }
    expect(reads).toHaveBeenCalledTimes(total === 40 ? 6 : 3);
    expect(ranks).toHaveBeenCalledTimes(total === 40 ? 1 : 0);
    expect(search).toHaveBeenCalledOnce();
  });

  it("keeps a no-selection phantom bookmark until its sort publishes the top reset", async () => {
    const source = new MockDataSource(100);
    routeParams = { nonFree: "true" };
    useSearchStore.setState({ ...initialState, dataSource: source, params: routeParams }, true);
    useUiPrefsStore.setState({ focusMode: "phantom", _pointerCoarse: false });
    await act(async () => { await useSearchStore.getState().search(); });
    useSearchStore.getState().setFocusedImageId("img-30");
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(table, false, false, true);
    frame();
    frame();
    view.container.scrollTop = 780;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const reads = vi.spyOn(source, "searchAfter").mockImplementationOnce(async (...args) => {
      await held;
      return MockDataSource.prototype.searchAfter.call(source, ...args);
    });
    const search = vi.spyOn(useSearchStore.getState(), "search");
    act(() => {
      routeParams = { ...routeParams, orderBy: "uploadTime" };
      markUserInitiatedNavigation();
      view.changeGeometry(table);
    });
    try {
      expect(useSearchStore.getState()).toMatchObject({ focusedImageId: "img-30", loading: true });
      expect(view.container.scrollTop).toBe(780);
      await act(async () => { release(); await search.mock.results[0].value; });
      expect(useSearchStore.getState()).toMatchObject({ focusedImageId: null, loading: false, _searchContinuity: null });
      expect(view.container.scrollTop).toBe(0);
      expect(reads).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await search.mock.results[0].value; });
    }
  });
});

describe.each(["direct-ES", "media-api"] as const)("ordinary continuity %s resolution", (transport) => {
  it.each(["mapped", "indexed-unmapped", "unmapped"] as const)("publishes one coherent selected window after %s lookup", async (path) => {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    const total = path === "unmapped" ? 70000 : 12000;
    const geometry = path === "mapped" ? grid : table;
    const corpus = new MockDataSource(total, [{ field: "lastModified", ratio: 1 }]);
    const dataSource = transport === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
    routeParams = { nonFree: "true", orderBy: "-uploadTime" };
    const offset = path === "unmapped" ? 45000 : 4000;
    const initial = await corpus.searchAfter({ ...routeParams, offset, length: 200 }, null);
    const targetId = initial.hits[50].id;
    const focusId = initial.hits[10].id;
    const selectedIds = new Set([targetId]);
    vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
    vi.spyOn(dataSource, "countWithTickers").mockResolvedValue({ count: total, tickerCounts: {} });
    const ranks = vi.spyOn(dataSource, "countBefore").mockImplementation((...args) => corpus.countBefore(...args));
    const maps = vi.spyOn(dataSource, "fetchPositionIndex").mockImplementation((...args) =>
      path === "mapped" ? corpus.fetchPositionIndex(...args) : Promise.resolve(null));
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let lookupStarted = false;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const length = transport === "media-api" ? body.length : body.size;
      const cursor = (transport === "media-api" ? body.sortValues : body.search_after) as SortValues | undefined;
      const reverse = transport === "media-api" ? body.reverse === true : parseSortField(body.sort[0]).direction === "desc";
      const result = await corpus.searchAfter({ nonFree: "true", orderBy: "uploadTime", length,
        ...(length === 1 && { ids: targetId }) }, cursor ?? null, null, undefined, reverse);
      if (length === 1) { lookupStarted = true; await held; }
      init.signal?.throwIfAborted();
      const hits = transport === "direct-ES" && reverse ? [...result.hits].reverse() : result.hits;
      const sortValues = transport === "direct-ES" && reverse ? [...result.sortValues].reverse() : result.sortValues;
      return Response.json(transport === "media-api"
        ? { data: hits.map(data => ({ data })), total, sortValues }
        : { hits: { total: { value: total }, hits: hits.map((image, index) => ({
          _id: image.id, _source: image, sort: sortValues[index],
        })) } });
    });
    vi.stubGlobal("fetch", fetch);
    useSearchStore.setState({ ...initialState, dataSource, params: routeParams, total, results: initial.hits, bufferOffset: offset,
      imagePositions: new Map(initial.hits.map((image, index) => [image.id, offset + index])),
      focusedImageId: focusId, startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)! }, true);
    useSelectionStore.setState({ selectedIds, anchorId: targetId });
    useUiPrefsStore.setState({ focusMode: path === "mapped" ? "explicit" : "phantom", _pointerCoarse: false });
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    const view = mountDensity(geometry, false, false, true);
    frame();
    frame();
    const sourceIndex = isTwoTierFromTotal(total) ? offset + 50 : 50;
    view.container.scrollTop = Math.floor(sourceIndex / geometry.columns) * geometry.rowHeight - 150;
    const search = vi.spyOn(useSearchStore.getState(), "search");
    let publications = 0;
    const unsubscribe = useSearchStore.subscribe((state, previous) => {
      if (state.results !== previous.results) publications += 1;
    });
    act(() => {
      routeParams = { ...routeParams, orderBy: "uploadTime" };
      markUserInitiatedNavigation();
      view.changeGeometry(geometry);
    });
    try {
      await act(async () => { await search.mock.results[0].value; });
      await vi.waitFor(() => expect(lookupStarted).toBe(true));
      if (path === "mapped") await vi.waitFor(() => expect(useSearchStore.getState().positionMap).not.toBeNull());
      expect(useSearchStore.getState().results).toBe(initial.hits);
      expect(useSearchStore.getState()).toMatchObject({ total, bufferOffset: offset, loading: true, focusedImageId: focusId });
      expect(publications).toBe(0);
      await act(async () => { release(); await vi.advanceTimersByTimeAsync(0); });
      const state = useSearchStore.getState();
      expect(state).toMatchObject({ total, loading: false, error: null, sortAroundFocusStatus: null, focusedImageId: focusId });
      expect(state._searchContinuity).toMatchObject({ targetId, phase: "placed", focus: "retain", placement: { kind: "ratio", ratio: 0.25 } });
      expect(state._searchContinuity?.owner.aborted).toBe(false);
      const expected = await corpus.searchAfter({ ...routeParams, offset: state.bufferOffset, length: state.results.length }, null);
      expect(state.results.map(image => image?.id)).toEqual(expected.hits.map(image => image.id));
      expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, state.bufferOffset + index]));
      expect(state.startCursor).toEqual(expected.sortValues[0]);
      expect(state.endCursor).toEqual(expected.sortValues.at(-1));
      const targetIndex = state.imagePositions.get(targetId)! - (isTwoTierFromTotal(total) ? 0 : state.bufferOffset);
      expect(Math.floor(targetIndex / geometry.columns) * geometry.rowHeight - view.container.scrollTop).toBe(150);
      expect(useSelectionStore.getState().selectedIds).toBe(selectedIds);
      expect(useSelectionStore.getState().anchorId).toBe(targetId);
      expect(publications).toBe(1);
      expect(search).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(ranks).toHaveBeenCalledTimes(path === "mapped" ? 0 : 1);
      expect(maps).toHaveBeenCalledTimes(path === "unmapped" ? 0 : 1);
    } finally {
      unsubscribe();
      await act(async () => { release(); await search.mock.results[0].value; await vi.advanceTimersByTimeAsync(0); });
    }
  });
});

describe("L43 reset publication versus buffer bookkeeping", () => {
  it.each([table, grid])("B10 final prepend to zero retains the viewed anchor ($columns columns)", (geometry) => {
    const view = mountDensity(geometry);
    frame();
    frame();
    const before = geometry.rowHeight * 20 + 7;
    view.container.scrollTop = before;
    useSelectionStore.setState({ selectedIds: new Set(["image-400"]), anchorId: "image-400" });
    const viewedIndex = 200 + 20 * geometry.columns;
    const anchorBefore = Math.floor((viewedIndex - 200) / geometry.columns) * geometry.rowHeight - before;
    act(() => {
      const results = Array.from({ length: 1000 }, (_, index) => ({ id: `image-${index}` }) as Image);
      useSearchStore.setState({ results, bufferOffset: 0, _prependGeneration: 1, _lastPrependCount: 200,
        imagePositions: new Map(results.map((image, index) => [image.id, index])) });
    });
    const anchorAfter = Math.floor(viewedIndex / geometry.columns) * geometry.rowHeight - view.container.scrollTop;
    expect(anchorAfter).toBe(anchorBefore);
    expect(view.container.scrollTop).toBe(before + 200 / geometry.columns * geometry.rowHeight);
    expect(useSearchStore.getState().focusedImageId).toBe("image-400");
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["image-400"]));
    expect(useSearchStore.getState()._scrollReset.gen).toBe(0);
  });

  const refreshCases = [table, grid].flatMap(geometry => [0, 500].flatMap(offset =>
    ["success", "failure"].map(outcome => ({ geometry, offset, outcome, columns: geometry.columns }))));
  it.each(refreshCases)("B16 actual refresh at $offset in $columns columns retains pending placement ($outcome)", async ({ geometry, offset, outcome }) => {
    const dataSource = new MockDataSource(70000);
    const oldPage = await dataSource.searchAfter({ offset, length: 200 }, null);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const read = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async (...args) => {
      const page = await MockDataSource.prototype.searchAfter.call(dataSource, ...args);
      await gate;
      if (outcome === "failure") throw new Error("Current refresh failure");
      return page;
    });
    const oldFocus = oldPage.hits[70].id;
    useSearchStore.setState({ dataSource, results: oldPage.hits, total: 70000, bufferOffset: offset, newCount: 5,
      focusedImageId: oldFocus, newCountSince: "2020-01-01T00:00:00.000Z",
      _isInitialLoad: false, imagePositions: new Map(oldPage.hits.map((image, index) => [image.id, index + offset])) });
    useSelectionStore.setState({ selectedIds: new Set([oldFocus]), anchorId: oldFocus });
    const params = useSearchStore.getState().params;
    const historyLength = window.history.length;
    const densityIntent = useUiPrefsStore.getState()._densityIntent;
    const view = mountDensity(geometry);
    frame();
    frame();
    view.container.scrollTop = 2000;
    view.container.scrollLeft = 120;
    const search = vi.spyOn(useSearchStore.getState(), "search");
    const bar = render(createElement(StatusBar));
    try {
      act(() => fireEvent.click(bar.getByRole("button", { name: "5 new" })));
      expect(useSearchStore.getState().loading).toBe(true);
      expect(useSearchStore.getState().results).toBe(oldPage.hits);
      expect(view.container.scrollTop).toBe(2000);
      expect(view.container.scrollLeft).toBe(120);
      expect(useSearchStore.getState().focusedImageId).toBe(oldFocus);
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
      frame();
      frame();
      expect(view.container.scrollTop).toBe(2000);
    } finally {
      await act(async () => { release(); await search.mock.results[0].value; });
    }
    expect(read).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledExactlyOnceWith();
    expect(useSearchStore.getState().loading).toBe(false);
    expect(window.history.length).toBe(historyLength);
    expect(useUiPrefsStore.getState()._densityIntent).toBe(densityIntent);
    expect(useSearchStore.getState().params).toEqual(params);
    if (outcome === "success") {
      expect(view.container.scrollTop).toBe(0);
      expect(view.container.scrollLeft).toBe(0);
      expect(useSearchStore.getState().focusedImageId).toBeNull();
      expect(useSearchStore.getState().newCountSince! > "2020-01-01T00:00:00.000Z").toBe(true);
      expect(useSearchStore.getState()._scrollReset.gen).toBe(1);
    } else {
      expect(view.container.scrollTop).toBe(2000);
      expect(view.container.scrollLeft).toBe(120);
      expect(useSearchStore.getState().results).toBe(oldPage.hits);
      expect(useSearchStore.getState().focusedImageId).toBe(oldFocus);
      expect(useSearchStore.getState()._scrollReset.gen).toBe(0);
    }
  });

  const homeCancellationCases = ["history", "browse"].flatMap(supersession =>
    ["success", "failure", "abort"].map(outcome => ({ supersession, outcome })));
  it.each(homeCancellationCases)("B11 actual Home $supersession cancellation rejects late $outcome with unchanged deep props", async ({ supersession, outcome }) => {
    const { createMemoryHistory } = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const dataSource = new MockDataSource(70000);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let delivered = false;
    const read = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async (...args) => {
      const page = await MockDataSource.prototype.searchAfter.call(dataSource, ...args);
      await gate;
      delivered = true;
      if (outcome === "failure") throw new Error("Obsolete Home failure");
      if (outcome === "abort") throw new DOMException("Obsolete Home abort", "AbortError");
      return page;
    });
    useSearchStore.setState({ dataSource });
    const scrubber = render(createElement(Scrubber, { total: 70000, currentPosition: 35000, visibleCount: 20,
      bufferLength: 200, loading: true, onSeek: vi.fn() }));
    const thumb = scrubber.container.querySelector<HTMLElement>("[data-scrubber-thumb]")!;
    const deepTop = Number.parseFloat(thumb.style.top);
    expect(deepTop).toBeGreaterThan(200);
    const history = createMemoryHistory({ initialEntries: ["/search?query=A", "/search?query=B"], initialIndex: 1 });
    const navigateHome = vi.fn();
    let home!: Promise<void>;
    act(() => { home = resetToHome(navigateHome, undefined, history); });
    try {
      expect(thumb.style.top).toBe("0px");
      expect(scrubber.container.textContent).toContain("1 of 70,000");
      act(() => {
        if (supersession === "history") history.back();
        else useSearchStore.getState().queueBrowsePosition(5000);
      });
      expect(Number.parseFloat(thumb.style.top)).toBe(deepTop);
      expect(scrubber.container.textContent).toContain("35,001 of 70,000");
    } finally {
      await act(async () => { release(); await home; });
    }
    expect(read).toHaveBeenCalledOnce();
    expect(delivered).toBe(true);
    expect(navigateHome).not.toHaveBeenCalled();
    expect(Number.parseFloat(thumb.style.top)).toBe(deepTop);
    expect(scrubber.container.textContent).toContain("35,001 of 70,000");
  });

  it.each(["success", "failure", "abort"] as const)("B11 obsolete Home %s cannot retire a successor's hold or busy state", async (outcome) => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const dataSource = new MockDataSource(70000);
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const secondGate = new Promise<void>(resolve => { releaseSecond = resolve; });
    let obsoleteDelivered = false;
    const reads = vi.spyOn(dataSource, "searchAfter")
      .mockImplementationOnce(async (...args) => {
        const page = await MockDataSource.prototype.searchAfter.call(dataSource, ...args);
        await firstGate;
        obsoleteDelivered = true;
        if (outcome === "failure") throw new Error("Obsolete Home failure");
        if (outcome === "abort") throw new DOMException("Obsolete Home abort", "AbortError");
        return page;
      })
      .mockImplementationOnce(async (...args) => {
        const page = await MockDataSource.prototype.searchAfter.call(dataSource, ...args);
        await secondGate;
        return page;
      });
    useSearchStore.setState({ dataSource });
    const props = { total: 70000, currentPosition: 35000, visibleCount: 20, bufferLength: 200, loading: true, onSeek: vi.fn() };
    const scrubber = render(createElement(Scrubber, props));
    const thumb = scrubber.container.querySelector<HTMLElement>("[data-scrubber-thumb]")!;
    const obsoleteNavigation = vi.fn();
    const currentNavigation = vi.fn();
    let firstHome!: Promise<void>;
    let secondHome!: Promise<void>;
    act(() => { firstHome = resetToHome(obsoleteNavigation); });
    act(() => { secondHome = resetToHome(currentNavigation); });
    const successor = useSearchStore.getState()._pitGeneration;
    try {
      await act(async () => { releaseFirst(); await firstHome; });
      expect(obsoleteDelivered).toBe(true);
      expect(obsoleteNavigation).not.toHaveBeenCalled();
      expect(currentNavigation).not.toHaveBeenCalled();
      expect(useSearchStore.getState()).toMatchObject({ loading: true, _pitGeneration: successor });
      expect(thumb.style.top).toBe("0px");
      scrubber.rerender(createElement(Scrubber, { ...props, currentPosition: 0 }));
      scrubber.rerender(createElement(Scrubber, props));
      expect(thumb.style.top).toBe("0px");
      expect(scrubber.container.textContent).toContain("1 of 70,000");
    } finally {
      await act(async () => { releaseSecond(); await secondHome; });
    }
    expect(reads).toHaveBeenCalledTimes(2);
    expect(currentNavigation).toHaveBeenCalledOnce();
    expect(useSearchStore.getState().loading).toBe(false);
    expect(Number.parseFloat(thumb.style.top)).toBeGreaterThan(200);
  });

  it.each(["success", "failure", "fixture-rejection"] as const)("B11 current Home %s retires only its hold; later density remains independent", async (outcome) => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const dataSource = new MockDataSource(70000);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reads = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async (...args) => {
      const page = await MockDataSource.prototype.searchAfter.call(dataSource, ...args);
      await gate;
      if (outcome === "failure") throw new Error("Current Home failure");
      return page;
    });
    useSearchStore.setState({ dataSource });
    const props = { total: 70000, currentPosition: 35000, visibleCount: 20, bufferLength: 200, loading: true, onSeek: vi.fn() };
    const scrubber = render(createElement(Scrubber, props));
    const thumb = scrubber.container.querySelector<HTMLElement>("[data-scrubber-thumb]")!;
    const navigateHome = vi.fn();
    let home!: Promise<void>;
    act(() => { home = resetToHome(navigateHome); });
    const fixtureInterruption = new Error("Fixture assertion interruption");
    try {
      try {
        try {
          act(() => useUiPrefsStore.getState().setDensity("table"));
          scrubber.rerender(createElement(Scrubber, { ...props, currentPosition: 0 }));
          scrubber.rerender(createElement(Scrubber, props));
          expect(thumb.style.top).toBe("0px");
          expect(navigateHome).not.toHaveBeenCalled();
          if (outcome === "fixture-rejection") throw fixtureInterruption;
        } finally {
          await act(async () => { release(); await home; });
        }
      } catch (error) {
        if (outcome !== "fixture-rejection") throw error;
        expect(error).toBe(fixtureInterruption);
      }
      expect(navigateHome).toHaveBeenCalledOnce();
      expect(reads).toHaveBeenCalledOnce();
      expect(useUiPrefsStore.getState().density).toBe("table");
      expect(Number.parseFloat(thumb.style.top)).toBeGreaterThan(200);
      expect(scrubber.container.textContent).toContain("35,001 of 70,000");
    } finally {
      await act(async () => { release(); await home; });
    }
  });

  for (const transport of ["direct-ES", "media-api"] as const) {
    it.each([table, grid])(`B10 ${transport} production seek/evict/prepend retains each held anchor ($columns columns)`, async (geometry) => {
      const fixture = await aiContinuityFixture(transport, 70000);
      useSearchStore.setState({ dataSource: fixture.dataSource, focusedImageId: null });
      await act(async () => { await useSearchStore.getState().search(); });
      const view = mountDensity(geometry);
      frame();
      frame();
      await act(async () => { await useSearchStore.getState().seek(600); });
      const bookmark = useSearchStore.getState().results[100]!.id;
      useSearchStore.setState({ focusedImageId: bookmark });
      useSelectionStore.setState({ selectedIds: new Set([bookmark]), anchorId: bookmark });
      for (let step = 0; step < 8 && useSearchStore.getState()._forwardEvictGeneration === 0; step++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
          await useSearchStore.getState().extendForward();
        });
      }
      expect(useSearchStore.getState()._forwardEvictGeneration).toBeGreaterThan(0);
      let positiveControls = 0;
      for (let step = 0; step < 8 && useSearchStore.getState().bufferOffset > 0; step++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        const before = useSearchStore.getState();
        view.container.scrollTop = 10 * geometry.rowHeight + 7;
        const image = before.results[10 * geometry.columns + geometry.columns]!;
        const heldTop = view.container.scrollTop;
        const anchorTop = Math.floor((before.imagePositions.get(image.id)! - before.bufferOffset) / geometry.columns) * geometry.rowHeight - heldTop;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        let delivered = false;
        fixture.pages.mockImplementationOnce(async (...args) => {
          const page = await fixture.corpus.searchAfter(...args);
          await gate;
          delivered = true;
          return page;
        });
        let prepend!: Promise<void>;
        await act(async () => { prepend = useSearchStore.getState().extendBackward(); await Promise.resolve(); });
        try {
          expect(useSearchStore.getState()._extendBackwardInFlight).toBe(true);
          expect(view.container.scrollTop).toBe(heldTop);
          expect(useSearchStore.getState().results).toBe(before.results);
          frame();
          frame();
          expect(view.container.scrollTop).toBe(heldTop);
        } finally {
          await act(async () => { release(); await prepend; });
        }
        const after = useSearchStore.getState();
        expect(delivered).toBe(true);
        expect(after.bufferOffset).toBeLessThan(before.bufferOffset);
        expect(after._scrollReset.gen).toBe(before._scrollReset.gen);
        expect(Math.floor((after.imagePositions.get(image.id)! - after.bufferOffset) / geometry.columns) * geometry.rowHeight - view.container.scrollTop).toBe(anchorTop);
        const expected = await fixture.corpus.searchAfter({ ...after.params, offset: after.bufferOffset, length: after.results.length }, null);
        expect(after.results).toEqual(expected.hits);
        expect(after.startCursor).toEqual(expected.sortValues[0]);
        expect(after.endCursor).toEqual(expected.sortValues.at(-1));
        for (const [index, resident] of after.results.entries()) {
          if (resident) {
            expect(after.imagePositions.get(resident.id)).toBe(after.bufferOffset + index);
            expect(getRetainedSortValues(resident.id, buildSearchKey(after.params))).toEqual(expected.sortValues[index]);
          }
        }
        expect(after.focusedImageId).toBe(bookmark);
        expect(useSelectionStore.getState().selectedIds).toEqual(new Set([bookmark]));
        if (after.bufferOffset > 0) positiveControls++;
      }
      expect(positiveControls).toBeGreaterThan(0);
      expect(useSearchStore.getState().bufferOffset).toBe(0);
    });
  }

  it.each([table, grid].flatMap(geometry => [800, 12000, 70000].map(total => ({ geometry, total, columns: geometry.columns }))))(
    "owned seek(0) lands exactly at top within one row in $columns columns / $total results", async ({ geometry, total }) => {
      const dataSource = new MockDataSource(total);
      const page = await dataSource.searchAfter({ offset: 200, length: 200 }, null);
      useSearchStore.setState({ dataSource, results: page.hits, total, bufferOffset: 200, focusedImageId: null,
        imagePositions: new Map(page.hits.map((image, index) => [image.id, index + 200])) });
      const view = mountDensity(geometry);
      frame();
      frame();
      view.container.scrollTop = 7;
      view.container.scrollLeft = 120;
      await act(async () => { await useSearchStore.getState().seek(0); });
      expect(view.container.scrollTop).toBe(0);
      expect(view.container.scrollLeft).toBe(0);
      expect(useSearchStore.getState()._browseNavigation).toBeNull();
    });

  it.each([table, grid].flatMap(geometry => ["success", "failure", "abort"].map(outcome => ({ geometry, outcome, columns: geometry.columns }))))(
    "B11 destination history publication in $columns columns rejects delivered obsolete Home $outcome", async ({ geometry, outcome }) => {
      vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
      const fixture = await aiContinuityFixture("direct-ES", 70000);
      const destination = { nonFree: "true" };
      routeParams = destination;
      const entry = `L43-home-history-${geometry.columns}-${outcome}`;
      const oldHistory = window.history.state;
      window.history.replaceState({ kupuaKey: entry }, "");
      useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
      useSearchStore.setState({ ...initialState, dataSource: fixture.dataSource, params: destination }, true);
      await act(async () => { await useSearchStore.getState().search("img-40000"); });
      await vi.waitFor(() => expect(useSearchStore.getState().loading).toBe(false));
      setPrevParamsSerialized(JSON.stringify(destination));
      setPrevSearchOnly({ ...destination });
      const view = mountDensity(geometry, false, false, true);
      frame();
      frame();
      const targetId = useSearchStore.getState().focusedImageId!;
      const sourceIndex = useSearchStore.getState().imagePositions.get(targetId)! - useSearchStore.getState().bufferOffset;
      view.container.scrollTop = Math.floor(sourceIndex / geometry.columns) * geometry.rowHeight - 180;
      snapshotStore.set(entry, buildHistorySnapshot());
      const search = vi.spyOn(useSearchStore.getState(), "search");
      act(() => {
        window.history.replaceState({ kupuaKey: `${entry}-B` }, "");
        routeParams = { ...destination, orderBy: "uploadTime" };
        markUserInitiatedNavigation();
        view.changeGeometry(geometry);
      });
      await act(async () => { await search.mock.results[0].value; });
      await vi.waitFor(() => expect(useSearchStore.getState().loading).toBe(false));
      const props = { total: 70000, currentPosition: 30000, visibleCount: 20, bufferLength: 200, loading: true, onSeek: vi.fn() };
      const scrubber = render(createElement(Scrubber, props));
      const thumb = scrubber.container.querySelector<HTMLElement>("[data-scrubber-thumb]")!;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let delivered = false;
      fixture.pages.mockImplementationOnce(async (...args) => {
        const page = await fixture.corpus.searchAfter(...args);
        await gate;
        delivered = true;
        if (outcome === "failure") throw new Error("Obsolete Home failure");
        if (outcome === "abort") throw new DOMException("Obsolete Home abort", "AbortError");
        return page;
      });
      const navigateHome = vi.fn();
      let home!: Promise<void>;
      act(() => { home = resetToHome(navigateHome, undefined, router.history as Parameters<typeof resetToHome>[2]); });
      try {
        expect(thumb.style.top).toBe("0px");
        act(() => {
          window.history.replaceState({ kupuaKey: entry }, "");
          routeParams = destination;
          router.notify("BACK");
          view.changeGeometry(geometry);
        });
        await act(async () => { await search.mock.results[2].value; });
        await vi.waitFor(() => expect(useSearchStore.getState().loading).toBe(false));
        const accepted = useSearchStore.getState();
        expect(accepted._searchContinuity).toMatchObject({ provenance: "history", targetId, phase: "placed" });
        expect(accepted.focusedImageId).toBe(targetId);
        const targetIndex = accepted.imagePositions.get(targetId)! - accepted.bufferOffset;
        expect(Math.floor(targetIndex / geometry.columns) * geometry.rowHeight - view.container.scrollTop).toBe(180);
        const currentPosition = accepted.bufferOffset + Math.floor(view.container.scrollTop / geometry.rowHeight) * geometry.columns;
        scrubber.rerender(createElement(Scrubber, { ...props, currentPosition, loading: false }));
        const expectedTop = currentPosition / (70000 - 20) * 580;
        expect(Number.parseFloat(thumb.style.top)).toBeCloseTo(expectedTop);
        expect(scrubber.container.textContent).toContain(`${(currentPosition + 1).toLocaleString()} of 70,000`);
        const reads = fixture.pages.mock.calls.length;
        await act(async () => { release(); await home; });
        expect(delivered).toBe(true);
        expect(navigateHome).not.toHaveBeenCalled();
        expect(search).toHaveBeenCalledTimes(3);
        expect(fixture.pages).toHaveBeenCalledTimes(reads);
        expect(useSearchStore.getState().results).toBe(accepted.results);
        expect(useSearchStore.getState()._scrollReset).toBe(accepted._scrollReset);
        expect(useSearchStore.getState()).toMatchObject({ focusedImageId: targetId, loading: false, error: null });
        expect(view.container.scrollTop).toBe(Math.floor(targetIndex / geometry.columns) * geometry.rowHeight - 180);
        expect(Number.parseFloat(thumb.style.top)).toBeCloseTo(expectedTop);
      } finally {
        await act(async () => { release(); await home; });
        snapshotStore.delete(entry);
        window.history.replaceState(oldHistory, "");
      }
    });
});

describe("KUP-017 saved density geometry and input lifetime", () => {
  it.each(["ready", "already-placed"] as const)("unsaved mount yields to %s publication without vetoing older compatibility input", async (phase) => {
    const dataSource = new MockDataSource(100);
    const reads = vi.spyOn(dataSource, "searchAfter");
    useSearchStore.setState({ ...initialState, dataSource, params: routeParams }, true);
    await act(async () => { await useSearchStore.getState().search(undefined, { continuity: {
      provenance: "user", targetId: "img-40", placement: { kind: "ratio", ratio: 0.3 }, focus: "target",
    } }); });
    expect(useSearchStore.getState()._searchContinuity?.phase).toBe("ready");
    if (phase === "already-placed") {
      const consumer = mountDensity(table);
      expect(consumer.container.scrollTop).toBe(1100);
      expect(useSearchStore.getState()._searchContinuity?.phase).toBe("placed");
      consumer.unmount();
      clearDensityFocusRatio();
    }
    const target = mountDensity(table);
    if (phase === "ready") expect(target.container.scrollTop).toBe(1100);
    frame();
    frame();
    expect(target.container.scrollTop).toBe(phase === "ready" ? 1100 : 1016);
    expect(useSearchStore.getState()._searchContinuity?.phase).toBe("placed");
    expect(reads).toHaveBeenCalledOnce();
  });

  it("completed callback delivery cannot reposition later indexed browsing", () => {
    useSearchStore.setState({ total: 12000 });
    const target = transition();
    frame();
    const completed = [...frames.values()][0];
    frame();
    act(() => {
      useSearchStore.getState().queueBrowsePosition(5000);
      target.container.scrollTop = 320;
      completed(performance.now());
    });
    expect(target.container.scrollTop).toBe(320);
    expect(useSearchStore.getState()._browseNavigation).toMatchObject({ phase: "queued", targetOffset: 5000 });
  });

  it("pending browsing without a departure handoff acknowledges readiness without electing a mount target", async () => {
    const dataSource = new MockDataSource(70000);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const reads = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async (...args) => {
      await held;
      return MockDataSource.prototype.searchAfter.call(dataSource, ...args);
    });
    useSearchStore.setState({ dataSource, pitId: null, focusedImageId: null });
    const source = mountDensity(table);
    frame();
    frame();
    let pending!: Promise<void>;
    act(() => { pending = useSearchStore.getState().seek(5000, "scrubber-seek"); });
    source.unmount();
    anchor.viewportId = "image-600";
    try {
      const target = mountDensity(grid, true);
      frame();
      frame();
      expect(target.container.scrollTop).toBe(0);
      expect(reads.mock.calls[0][3]?.aborted).toBe(false);
      expect(reads).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  it("obsolete callback delivery cannot place or consume a successor handoff", () => {
    const target = transition();
    frame();
    const obsolete = [...frames.values()][0];
    target.unmount();
    target.container.scrollTop = 777;
    const successor = mountDensity(table, true);
    frame();
    act(() => obsolete(performance.now()));
    expect(target.container.scrollTop).toBe(777);
    expect(successor.container.scrollTop).toBe(0);
    frame();
    expect(successor.container.scrollTop).toBe(6136);
    successor.unmount();
    const next = mountDensity(grid, true);
    frame();
    act(() => obsolete(performance.now()));
    frame();
    expect(next.container.scrollTop).toBe(14853);
  });

  it("retired input remains a tombstone across unready remount without fallback revival", () => {
    const target = transition();
    frame();
    act(() => target.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 320 })));
    target.unmount();
    const successor = mountDensity(table, true);
    frame();
    frame();
    expect(successor.container.scrollTop).toBe(0);
    expect(successor.scrollToIndex).not.toHaveBeenCalled();
  });

  it.each(["wheel", "click", "pointerdown"] as const)("resident Scrubber %s retires placement without changing ownership counters or reading", (input) => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const state = useSearchStore.getState();
    useSearchStore.setState({ total: 800, bufferOffset: 0,
      imagePositions: new Map(state.results.map((image, index) => [image!.id, index])) });
    const read = vi.spyOn(state.dataSource, "searchAfter");
    const target = transition();
    frame();
    const before = useSearchStore.getState();
    const scrubber = render(createElement(Scrubber, { total: 800, currentPosition: 200, visibleCount: 20,
      bufferLength: 800, loading: false, onSeek: before.seek, onBrowsePosition: before.queueBrowsePosition }));
    const track = scrubber.getByRole("slider");
    act(() => {
      target.container.scrollTop = 320;
      if (input === "wheel") fireEvent.wheel(track, { deltaY: 100 });
      else if (input === "click") fireEvent.click(track, { clientY: 150 });
      else {
        const thumb = track.querySelector<HTMLElement>("[data-scrubber-thumb]")!;
        thumb.setPointerCapture = vi.fn();
        fireEvent.pointerDown(thumb, { pointerId: 1, clientY: 150 });
        fireEvent.pointerUp(document, { pointerId: 1 });
      }
    });
    const position = target.container.scrollTop;
    frame();
    expect(target.container.scrollTop).toBe(position);
    const after = useSearchStore.getState();
    expect([after._seekGeneration, after.sortAroundFocusGeneration, after._scrollReset.gen, after._focusIntent])
      .toEqual([before._seekGeneration, before.sortAroundFocusGeneration, before._scrollReset.gen, before._focusIntent]);
    expect(after._browseNavigation).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["focus-A", "viewport-B"] as const)("fixture %s policy changes only capture, retaining publication ownership and read budget", (policy) => {
    const read = vi.spyOn(useSearchStore.getState().dataSource, "searchAfter");
    anchor.viewportId = "image-600";
    const source = mountDensity(grid, false, false, false,
      (focus, viewport) => policy === "focus-A" ? focus : viewport());
    frame();
    frame();
    source.container.scrollTop = 30000;
    source.unmount();
    const target = mountDensity(table, true);
    frame();
    frame();
    expect(target.container.scrollTop).toBe(policy === "focus-A" ? 6400 : 12536);
    expect(useSearchStore.getState().focusedImageId).toBe("image-400");
    target.unmount();
    const successor = mountDensity(grid, true);
    frame();
    act(() => useSearchStore.setState({ _scrollReset: { gen: 1, sortOnly: false } }));
    frame();
    expect(successor.container.scrollTop).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("supports a third fixed-row geometry without another lifecycle", () => {
    const target = transition(grid, { columns: 2, rowHeight: 64, headerOffset: 12, preserveScrollLeftOnSort: true });
    frame();
    frame();
    expect(target.container.scrollTop).toBe(6112);
  });

  it("acknowledges an empty mount without inventing or reviving a target", () => {
    useSearchStore.setState({ results: [], total: 0, focusedImageId: null, imagePositions: new Map() });
    const target = mountDensity(table, true);
    frame();
    frame();
    expect(target.container.scrollTop).toBe(0);
    expect(target.scrollToIndex).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it.each(["top", "bottom", "clamp"] as const)("temporary destination %s does not confer result-edge permission", (edge) => {
    const source = mountDensity(table);
    frame();
    frame();
    source.container.scrollTop = 5944;
    source.unmount();
    const offset = edge === "top" ? 385 : 204;
    act(() => {
      const results = Array.from({ length: edge === "top" ? 100 : 200 }, (_, index) => ({ id: `image-${offset + index}` }) as Image);
      useSearchStore.setState({ results, bufferOffset: offset,
        imagePositions: new Map(results.map((image, index) => [image.id, offset + index])) });
    });
    const target = mountDensity({ ...table, rowHeight: edge === "clamp" ? 16 : 32 }, true);
    frame();
    frame();
    expect(target.container.scrollTop).toBeCloseTo(edge === "top" ? 24 : edge === "bottom" ? 5816 : 2636, 6);
    expect(target.scrollToIndex).not.toHaveBeenCalled();
  });

  it("preserves held failing Home with newer resident focus and a suppressed non-Strict mount", async () => {
    useUiPrefsStore.setState({ density: "table" });
    const dataSource = new MockDataSource(70000);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const reads = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async () => {
      await held;
      throw new Error("Held Home refusal");
    });
    useSearchStore.setState({ dataSource, pitId: null });
    const source = mountDensity(table);
    frame();
    frame();
    source.container.scrollTop = 9000;
    let target: ReturnType<typeof mountDensity> | undefined;
    let home!: Promise<void>;
    act(() => { home = resetToHome(() => {
      source.unmount();
      source.container.remove();
      target = mountDensity(grid);
    }); });
    try {
      expect(reads).toHaveBeenCalledOnce();
      act(() => useSearchStore.getState().setFocusedImageId("image-600"));
      await act(async () => { release(); await home; });
      expect(target).toBeDefined();
      expect(useSearchStore.getState()).toMatchObject({ focusedImageId: "image-600", bufferOffset: 200,
        error: "Held Home refusal", loading: false });
      expect(useUiPrefsStore.getState().density).toBe("grid");
      frame();
      frame();
      expect(target!.container.scrollTop).toBe(30000);
      expect(reads).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await home; });
    }
  });

  it.each(["new-focus", "same-id", "clear", "passive"] as const)(
    "B4 respects %s focus intent between frames independently of target policy", (input) => {
      const target = transition();
      frame();
      const intent = useSearchStore.getState()._focusIntent;
      act(() => {
        target.container.scrollTop = 320;
        if (input === "passive") useSearchStore.setState({ focusedImageId: "image-500" });
        else useSearchStore.getState().setFocusedImageId(input === "clear" ? null : input === "same-id" ? "image-400" : "image-500");
      });
      expect(useSearchStore.getState()._focusIntent).toBe(intent + (input === "passive" ? 0 : 1));
      frame();
      expect(target.container.scrollTop).toBe(input === "passive" ? 6136 : 320);
      expect(useSearchStore.getState().focusedImageId).toBe(input === "clear" ? null : input === "same-id" ? "image-400" : "image-500");
    });

  it.each([12000, 70000])("B7 preserves the chosen row at a temporary bottom with total=%s", (total) => {
    const results = Array.from({ length: 300 }, (_, index) => ({ id: `interior-${index}` }) as Image);
    useSearchStore.setState({ results, total, bufferOffset: 6000, positionMap: null,
      focusedImageId: "interior-275", imagePositions: new Map(results.map((image, index) => [image.id, 6000 + index])) });
    const source = mountDensity(table);
    frame();
    frame();
    source.container.scrollTop = (total === 12000 ? 192000 : 0) + 8886;
    source.unmount();
    source.container.remove();
    const target = mountDensity(grid, true);
    frame();
    frame();
    const chosenRowTop = total === 12000 ? 475104 : 20604;
    expect(chosenRowTop - target.container.scrollTop).toBe(0);
    expect(useSearchStore.getState().focusedImageId).toBe("interior-275");
    expect(useSearchStore.getState().positionMap).toBeNull();
  });

  for (const direction of ["grid-table", "table-grid"] as const) {
    it(`preserves the source ratio across ${direction} and Strict Mode replay`, () => {
      const target = direction === "grid-table" ? transition() : transition(table, grid);
      expect(frames.size).toBe(1);
      frame();
      expect(target.container.scrollTop).toBe(0);
      frame();
      expect(target.container.scrollTop).toBe(direction === "grid-table" ? 6136 : 14853);
      expect(frames.size).toBe(0);
    });
  }

  it("uses current columns and viewport size without cancelling a valid restore", () => {
    const target = transition(table, grid);
    frame();
    target.dimensions.width = 840;
    target.dimensions.height = 720;
    target.changeGeometry({ ...grid, columns: 3 });
    frame();
    expect(target.container.scrollTop).toBe(19638);
  });

  it("uses the current sticky-header measurement", () => {
    const target = transition();
    frame();
    target.dimensions.height = 720;
    target.changeGeometry({ ...table, headerOffset: 72 });
    frame();
    expect(target.container.scrollTop).toBe(6112);
  });

  it("uses global indexed coordinates without waiting for a position map", () => {
    useSearchStore.setState({ total: 12000, positionMap: null });
    const target = transition();
    frame();
    frame();
    expect(useSearchStore.getState().positionMap).toBeNull();
    expect(target.container.scrollTop).toBe(12536);
  });

  it("recomputes the local index after a same-context prepend and compensation", () => {
    const target = transition();
    frame();
    act(() => {
      const results = Array.from({ length: 1000 }, (_, index) => ({ id: `image-${index}` }) as Image);
      useSearchStore.setState({ results, bufferOffset: 0, _prependGeneration: 1, _lastPrependCount: 200,
        imagePositions: new Map(results.map((image, index) => [image.id, index])) });
    });
    frame();
    expect(target.container.scrollTop).toBe(12536);
  });

  for (const extremum of ["top", "bottom"] as const) {
    it(`retains the true result ${extremum} extremum`, () => {
      const offset = extremum === "top" ? 0 : 69200;
      const results = Array.from({ length: 800 }, (_, index) => ({ id: `edge-${offset + index}` }) as Image);
      useSearchStore.setState({ results, bufferOffset: offset, focusedImageId: `edge-${offset + 400}`,
        imagePositions: new Map(results.map((image, index) => [image.id, offset + index])) });
      const target = transition(grid, table, extremum);
      frame();
      frame();
      expect(target.container.scrollTop).toBe(extremum === "top" ? 0 : target.container.scrollHeight - target.container.clientHeight);
    });
  }

  for (const input of ["wheel", "touch", "keyboard"] as const) {
    it(`respects newer ${input} input between frames`, () => {
      const target = transition();
      frame();
      act(() => {
        target.container.scrollTop = 320;
        const event = input === "wheel" ? new WheelEvent("wheel", { deltaY: 320 })
          : input === "touch" ? new Event("touchmove")
          : new KeyboardEvent("keydown", { key: "PageDown", bubbles: true });
        target.container.dispatchEvent(event);
      });
      frame();
      expect(target.container.scrollTop).toBe(320);
      expect(frames.size).toBe(0);
    });
  }

  it("does not treat native-input editing or zoom-wheel geometry as list navigation", () => {
    const target = transition();
    frame();
    const input = document.createElement("input");
    target.container.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      target.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 20, ctrlKey: true }));
    });
    frame();
    expect(target.container.scrollTop).toBe(6136);
  });

  it("does not cancel restoration for a key consumed by another control", () => {
    const target = transition();
    frame();
    const control = document.createElement("button");
    control.addEventListener("keydown", (event) => event.stopPropagation());
    target.container.appendChild(control);
    act(() => control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    frame();
    expect(target.container.scrollTop).toBe(6136);
  });

  it("still observes Home in capture phase before a control consumes the key", () => {
    const target = transition();
    frame();
    const control = document.createElement("button");
    control.addEventListener("keydown", (event) => event.stopPropagation());
    target.container.appendChild(control);
    act(() => control.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    frame();
    expect(target.container.scrollTop).toBe(0);
  });

  it("cancels queued work on disposal without consuming the saved state", () => {
    const target = transition();
    frame();
    target.unmount();
    target.container.remove();
    expect(frames.size).toBe(0);
    const successor = mountDensity(table, true);
    frame();
    frame();
    expect(successor.container.scrollTop).toBe(6136);
  });

  it("does not apply a record cleared by a newer reset", () => {
    const target = transition();
    frame();
    clearDensityFocusRatio();
    frame();
    expect(target.container.scrollTop).toBe(0);
  });

  for (const [tier, total, expected] of [["seek", 70000, 6136], ["two-tier", 12000, 12536]] as const) {
    it(`anchors on the viewport centre when explicit focus is outside the buffer (${tier})`, () => {
      useSearchStore.setState({ total, focusedImageId: "image-seeked-away" });
      anchor.viewportId = "image-400";
      const target = transition();
      frame();
      frame();
      expect(target.container.scrollTop).toBe(expected);
    });
  }
});

describe("B17 fully resident density", () => {
  for (const direction of ["grid-table", "table-grid"] as const) {
    it.each(["explicit", "phantom"] as const)(`${direction} retains focus and selection without fetching in %s mode`, (focusMode) => {
      const results = Array.from({ length: 800 }, (_, index) => ({ id: `image-${index}` }) as Image);
      useSearchStore.setState({ results, total: 800, bufferOffset: 0,
        imagePositions: new Map(results.map((image, index) => [image.id, index])) });
      useUiPrefsStore.setState({ focusMode, _pointerCoarse: false });
      useSelectionStore.setState({ selectedIds: new Set(["image-401"]), anchorId: "image-401" });
      const read = vi.spyOn(useSearchStore.getState().dataSource, "searchAfter");
      const sourceGeometry = direction === "grid-table" ? grid : table;
      const targetGeometry = direction === "grid-table" ? table : grid;
      const source = mountDensity(sourceGeometry);
      frame();
      frame();
      source.container.scrollTop = Math.floor(400 / sourceGeometry.columns) * sourceGeometry.rowHeight + sourceGeometry.headerOffset - 300;
      source.unmount();
      source.container.remove();
      const target = mountDensity(targetGeometry, true);
      frame();
      frame();
      expect(target.container.scrollTop).toBe(direction === "grid-table" ? 12536 : 30003);
      expect(useSearchStore.getState()).toMatchObject({ loading: false, focusedImageId: "image-400" });
      expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["image-401"]));
      expect(read).not.toHaveBeenCalled();
    });
  }
});

describe.each(["direct-ES", "media-api"] as const)("B17 %s deep read paths", (transport) => {
  for (const path of ["estimated", "mapped"] as const) {
    for (const direction of ["grid-table", "table-grid"] as const) {
      it.each(["explicit", "phantom"] as const)(`${path} ${direction} completes in %s mode`, async (focusMode) => {
        vi.stubGlobal("scheduler", { yield: async () => {} });
        const total = path === "mapped" ? 20000 : 70000;
        const targetOffset = path === "mapped" ? 15000 : 45000;
        const mock = new MockDataSource(total, [{ field: "lastModified", ratio: 1 }]);
        const params = { nonFree: "true", orderBy: "uploadTime" };
        const firstPage = await mock.searchAfter({ ...params, length: 200 }, null);
        const expected = await mock.searchAfter({ ...params, offset: targetOffset, length: 1 }, null);
        const positionMap = path === "mapped" ? await mock.fetchPositionIndex(params, new AbortController().signal) : null;
        const dataSource = transport === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
        const estimates = vi.spyOn(dataSource, "estimateSortValue").mockImplementation((...args) => mock.estimateSortValue(...args));
        const ranks = vi.spyOn(dataSource, "countBefore").mockImplementation((...args) => mock.countBefore(...args));
        let release!: () => void;
        const held = new Promise<void>(resolve => { release = resolve; });
        const signals: Array<AbortSignal | null | undefined> = [];
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
          signals.push(init.signal);
          const body = JSON.parse(init.body as string);
          const reverse = transport === "media-api" ? body.reverse === true : parseSortField(body.sort[0]).direction === "desc";
          const cursor = (transport === "media-api" ? body.sortValues : body.search_after) as SortValues | undefined;
          const result = await mock.searchAfter({ ...params, length: transport === "media-api" ? body.length : body.size },
            cursor ?? null, null, undefined, reverse);
          await held;
          init.signal?.throwIfAborted();
          const hits = transport === "direct-ES" && reverse ? [...result.hits].reverse() : result.hits;
          const sortValues = transport === "direct-ES" && reverse ? [...result.sortValues].reverse() : result.sortValues;
          return Response.json(transport === "media-api"
            ? { data: hits.map(data => ({ data })), total, sortValues }
            : { hits: { total: { value: total }, hits: hits.map((image, index) => ({
              _id: image.id, _source: image, sort: sortValues[index],
            })) } });
        });
        vi.stubGlobal("fetch", fetch);
        useUiPrefsStore.setState({ focusMode, _pointerCoarse: false });
        useSearchStore.setState({ dataSource, params, results: firstPage.hits, total, bufferOffset: 0, pitId: null,
          positionMap, focusedImageId: firstPage.hits[0].id,
          imagePositions: new Map(firstPage.hits.map((image, index) => [image.id, index])) });
        const sourceGeometry = direction === "grid-table" ? grid : table;
        const targetGeometry = direction === "grid-table" ? table : grid;
        const source = mountDensity(sourceGeometry);
        frame();
        frame();
        let pending!: Promise<void>;
        act(() => { pending = useSearchStore.getState().seek(targetOffset, "scrubber-seek"); });
        try {
          await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
          source.unmount();
          source.container.remove();
          const target = mountDensity(targetGeometry, true);
          frame();
          frame();
          await act(async () => { release(); await pending; });
          const state = useSearchStore.getState();
          expect(state).toMatchObject({ total, loading: false, error: null, _browseNavigation: null,
            focusedImageId: firstPage.hits[0].id });
          expect(signals.every(signal => signal?.aborted === false)).toBe(true);
          expect(fetch).toHaveBeenCalledTimes(2);
          expect(estimates).toHaveBeenCalledTimes(path === "estimated" ? 1 : 0);
          expect(ranks).toHaveBeenCalledTimes(path === "estimated" ? 1 : 0);
          const position = state.imagePositions.get(expected.hits[0].id);
          expect(position).toBeDefined();
          const index = isTwoTierFromTotal(total) ? position! : position! - state.bufferOffset;
          const relativeTop = Math.floor(index / targetGeometry.columns) * targetGeometry.rowHeight - target.container.scrollTop;
          expect(relativeTop).toBeGreaterThanOrEqual(-targetGeometry.rowHeight);
          expect(relativeTop).toBeLessThan(target.container.clientHeight);
          expect([...state.imagePositions]).toEqual(state.results.map((image, index) => [image!.id, state.bufferOffset + index]));
        } finally {
          await act(async () => { release(); await pending; });
        }
      });
    }
  }
});

describe("B17 placement completion ownership", () => {
  it("allows navigation after the saved density anchor leaves the buffer", async () => {
    const source = mountDensity(grid);
    frame();
    frame();
    source.container.scrollTop = 1000;
    source.unmount();
    source.container.remove();
    const dataSource = new MockDataSource(70000);
    const params = { nonFree: "true", orderBy: "-uploadTime" };
    const page = await dataSource.searchAfter({ ...params, offset: 6000, length: 200 }, null);
    useSearchStore.setState({ dataSource, params, results: page.hits, bufferOffset: 6000, total: 70000,
      imagePositions: new Map(page.hits.map((image, index) => [image.id, index + 6000])) });
    const target = mountDensity(table, true);
    frame();
    frame();
    await act(async () => { await useSearchStore.getState().seek(5000); });
    frame();
    frame();
    expect(target.container.scrollTop).toBe(3200);
    expect(useSearchStore.getState()._browseNavigation).toBeNull();
  });

  it("retains the post-seek notification after consuming ready placement", async () => {
    const dataSource = new MockDataSource(12000);
    useSearchStore.setState({ dataSource, total: 12000, focusedImageId: null, pitId: null });
    const view = mountDensity(table);
    frame();
    frame();
    const onScroll = vi.fn();
    view.container.addEventListener("scroll", onScroll);
    await act(async () => { await useSearchStore.getState().seek(5000); });
    expect(useSearchStore.getState()._browseNavigation).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(SEEK_DEFERRED_SCROLL_MS); });
    expect(onScroll).toHaveBeenCalledOnce();
  });
});

describe("B17 indexed browsing before request dispatch", () => {
  const cases = (["list", "scrubber"] as const).flatMap(origin => [false, true].map(changeDensity => ({ origin, changeDensity })));
  it.each(cases)("retains a $origin wheel destination with density=$changeDensity before debounce", async ({ origin, changeDensity }) => {
    const dataSource = new MockDataSource(12000);
    const params = { nonFree: "true", orderBy: "-uploadTime" };
    const firstPage = await dataSource.searchAfter({ ...params, length: 200 }, null);
    const reads = vi.spyOn(dataSource, "searchAfter");
    useSearchStore.setState({ dataSource, params, results: firstPage.hits, total: 12000, bufferOffset: 0,
      focusedImageId: null, pitId: null, positionMap: null,
      imagePositions: new Map(firstPage.hits.map((image, index) => [image.id, index])) });
    const source = mountDensity(table, false, true);
    frame();
    frame();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const scrubber = render(createElement(Scrubber, { total: 12000, currentPosition: 0, visibleCount: 18,
      bufferLength: 200, loading: false, twoTier: true,
      onSeek: useSearchStore.getState().seek, onBrowsePosition: useSearchStore.getState().queueBrowsePosition }));
    act(() => {
      source.virtualizer.range = { startIndex: 5000, endIndex: 5010 } as typeof source.virtualizer.range;
      if (origin === "scrubber") fireEvent.wheel(scrubber.getByRole("slider"), { deltaY: 160000 });
      else {
        source.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 160000 }));
        source.container.scrollTop = 160000;
      }
      source.container.dispatchEvent(new Event("scroll"));
    });
    expect(reads).not.toHaveBeenCalled();
    let target = source;
    if (changeDensity) {
      source.unmount();
      source.container.remove();
      target = mountDensity(grid, true);
      frame();
      frame();
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    frame();
    frame();
    const state = useSearchStore.getState();
    expect(reads).toHaveBeenCalledOnce();
    expect(state).toMatchObject({ bufferOffset: 4900, loading: false, error: null, focusedImageId: null });
    const expected = await dataSource.searchAfter({ ...params, offset: 4900, length: 200 }, null);
    expect(state.results).toEqual(expected.hits);
    expect(target.container.scrollTop).toBe(changeDensity ? 1250 * 303 : 160000);
  });
});

describe.each(["direct-ES", "media-api"] as const)("B17 %s pending destination across density", (transport) => {
  it.each(["failure", "newer-Home"] as const)("B18 retires departure presentation after %s", async (outcome) => {
    const dataSource = new MockDataSource(70000);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const original = dataSource.searchAfter.bind(dataSource);
    const read = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async (...args) => {
      await held;
      if (outcome === "failure") throw new Error("B18 controlled failed seek");
      args[3]?.throwIfAborted();
      return original(...args);
    });
    useSearchStore.setState({ dataSource, pitId: null });
    anchor.viewportId = "image-600";
    const source = mountDensity(grid);
    frame();
    frame();
    source.container.scrollTop = 100 * grid.rowHeight - 280;
    let pending!: Promise<void>;
    act(() => { pending = useSearchStore.getState().seek(5000, "scrubber-seek"); });
    source.unmount();
    source.container.remove();
    const target = mountDensity(table, true);
    try {
      expect(target.container.scrollTop).toBe(400 * table.rowHeight + table.headerOffset - 280);
      frame();
      if (outcome === "newer-Home") await act(async () => { await useSearchStore.getState().seek(0, "keyboard-home"); });
      await act(async () => { release(); await pending; });
      frame();
      frame();
      expect(useSearchStore.getState()._browseNavigation).toBeNull();
      expect(useSearchStore.getState().loading).toBe(false);
      if (outcome === "failure") {
        expect(target.container.scrollTop).toBe(400 * table.rowHeight + table.headerOffset - 280);
        expect(useSearchStore.getState().bufferOffset).toBe(200);
        expect(read).toHaveBeenCalledOnce();
      } else {
        expect(read.mock.calls[0][3]?.aborted).toBe(true);
        expect(target.container.scrollTop).toBe(0);
        expect(useSearchStore.getState()).toMatchObject({ bufferOffset: 0, error: null });
      }
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  it("settles a cancelled maintenance refill without a successor", async () => {
    const dataSource = new MockDataSource(12000);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const original = dataSource.searchAfter.bind(dataSource);
    const read = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async (...args) => {
      await held;
      args[3]?.throwIfAborted();
      return original(...args);
    });
    useSearchStore.setState({ dataSource, total: 12000, pitId: null });
    let pending!: Promise<void>;
    act(() => { pending = useSearchStore.getState().seek(5000, "seek", undefined, "refill"); });
    try {
      expect(useSearchStore.getState().loading).toBe(true);
      act(() => useSearchStore.getState().cancelWindowMaintenance());
      expect(read.mock.calls[0][3]?.aborted).toBe(true);
      await act(async () => { release(); await pending; });
      expect(useSearchStore.getState()).toMatchObject({ loading: false, error: null, bufferOffset: 200 });
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  const cases = (["explicit", "phantom"] as const).flatMap(focusMode =>
    (["bookmark", "none", "selection"] as const).flatMap(context =>
      (["after-frames", "between-frames", "unmounted", "repeated"] as const).map(arrival => ({ focusMode, context, arrival }))));
  for (const total of [12000, 70000]) {
    for (const direction of ["grid-table", "table-grid"] as const) {
      it.each(cases)(`${total} ${direction} retains $context destination in $focusMode mode ($arrival)`, async ({ focusMode, context, arrival }) => {
        vi.stubGlobal("scheduler", { yield: async () => {} });
        const dataSource = transport === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
        const hits = Array.from({ length: 200 }, (_, index) => ({ id: `destination-${index}`,
          uploadTime: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString() }) as Image);
        const sortValues = hits.map(image => [Date.parse(image.uploadTime!), image.id]);
        let release!: () => void;
        const held = new Promise<void>(resolve => { release = resolve; });
        let requestSignal: AbortSignal | null | undefined;
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
          requestSignal = init.signal;
          await held;
          init.signal?.throwIfAborted();
          return Response.json(transport === "media-api"
            ? { data: hits.map(data => ({ data })), total, sortValues }
            : { hits: { total: { value: total }, hits: hits.map((image, index) => ({
              _id: image.id, _source: image, sort: sortValues[index],
            })) } });
        });
        vi.stubGlobal("fetch", fetch);
        useUiPrefsStore.setState({ focusMode, _pointerCoarse: false });
        useSearchStore.setState({ dataSource, total, pitId: null, positionMap: null,
          focusedImageId: context === "none" ? null : "image-400",
          params: { orderBy: "uploadTime", nonFree: "true" } });
        if (context === "selection") useSelectionStore.setState({ selectedIds: new Set(["image-401"]), anchorId: "image-401" });
        anchor.viewportId = "image-600";
        const sourceGeometry = direction === "grid-table" ? grid : table;
        const targetGeometry = direction === "grid-table" ? table : grid;
        const source = mountDensity(sourceGeometry);
        frame();
        frame();
        const departureIndex = isTwoTierFromTotal(total) ? 600 : 400;
        source.container.scrollTop = Math.floor(departureIndex / sourceGeometry.columns) * sourceGeometry.rowHeight + sourceGeometry.headerOffset - 280;
        let pending!: Promise<void>;
        act(() => { pending = useSearchStore.getState().seek(5000, "scrubber-seek"); });
        try {
          expect(fetch).toHaveBeenCalledOnce();
          expect(requestSignal?.aborted).toBe(false);
          source.unmount();
          source.container.remove();
          if (arrival === "unmounted") await act(async () => { release(); await pending; });
          let target = mountDensity(targetGeometry, true);
          frame();
          if (arrival === "between-frames") await act(async () => { release(); await pending; });
          frame();
          if (arrival === "repeated") {
            target.unmount();
            target.container.remove();
            const middle = mountDensity(sourceGeometry, true);
            frame();
            middle.unmount();
            middle.container.remove();
            target = mountDensity(targetGeometry, true);
            frame();
            frame();
          }
          expect(requestSignal?.aborted).toBe(false);
          if (total === 70000 && (arrival === "after-frames" || arrival === "repeated")) {
            const departureTop = Math.floor(departureIndex / targetGeometry.columns) * targetGeometry.rowHeight
              + targetGeometry.headerOffset - target.container.scrollTop;
            expect.soft(departureTop, "B18 pending departure anchor remains visible").toBeGreaterThanOrEqual(targetGeometry.headerOffset);
            expect.soft(departureTop + targetGeometry.rowHeight, "B18 pending departure anchor remains visible").toBeLessThanOrEqual(target.container.clientHeight);
            expect(useSearchStore.getState()).toMatchObject({ loading: true, bufferOffset: 200,
              _browseNavigation: { phase: "loading", targetOffset: 5000 } });
          }
          await act(async () => { release(); await pending; });
          frame();
          frame();
          const state = useSearchStore.getState();
          expect(state.error).toBeNull();
          expect(state.results.map(image => image?.id)).toEqual(hits.map(image => image.id));
          expect(state).toMatchObject({ bufferOffset: 4900, total, loading: false, error: null,
            focusedImageId: context === "none" ? null : "image-400", _browseNavigation: null });
          expect(useSelectionStore.getState().selectedIds).toEqual(new Set(context === "selection" ? ["image-401"] : []));
          expect(useSelectionStore.getState().anchorId).toBe(context === "selection" ? "image-401" : null);
          expect(state.imagePositions.get("destination-100")).toBe(5000);
          expect(state.startCursor).toEqual(sortValues[0]);
          expect(state.endCursor).toEqual(sortValues.at(-1));
          const destinationIndex = isTwoTierFromTotal(total) ? 5000 : 100;
          expect(target.container.scrollTop).toBe(Math.floor(destinationIndex / targetGeometry.columns) * targetGeometry.rowHeight);
          expect(fetch).toHaveBeenCalledOnce();
        } finally {
          await act(async () => { release(); await pending; });
        }
      });
    }
  }
});

describe.each(["direct-ES", "media-api"] as const)("B8 %s pending search and saved density", (mode) => {
  function response(hits: Image[]) {
    const sortValues = hits.map((image) => [Date.parse(image.uploadTime!), image.id]);
    return new Response(JSON.stringify(mode === "media-api"
      ? { data: hits.map((data) => ({ data })), total: hits.length, sortValues }
      : { hits: { total: { value: hits.length }, hits: hits.map((image, index) => ({
        _id: image.id, _source: image, sort: sortValues[index],
      })) } }));
  }

  it.each(["success", "abort", "failure"].flatMap(outcome =>
    [false, true].map(settled => ({ outcome, settled })),
  ))("late $outcome cannot overwrite a successor (settled=$settled)", async ({ outcome, settled }) => {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    const dataSource = mode === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
    vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
    vi.spyOn(dataSource, "countWithTickers").mockResolvedValue({ count: 1, tickerCounts: {} });
    const successorImage = { id: "image-401", uploadTime: "2026-01-02T00:00:00Z" } as Image;
    const predecessorImage = { id: "image-400", uploadTime: "2026-01-01T00:00:00Z" } as Image;
    const gates = [0, 1].map(() => {
      let release!: () => void;
      const promise = new Promise<void>(resolve => { release = resolve; });
      return { promise, release };
    });
    const signals: Array<AbortSignal | null | undefined> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const index = signals.length;
      signals.push(init.signal);
      await gates[index].promise;
      if (index === 0 && outcome === "abort") throw new DOMException("Cancelled predecessor", "AbortError");
      if (index === 0 && outcome === "failure") throw new TypeError("Failed predecessor");
      return response([index === 0 ? predecessorImage : successorImage]);
    }));
    useSearchStore.setState({ dataSource, pitId: null,
      params: { query: 'keyword:"predecessor"', orderBy: "uploadTime", nonFree: "true" } });
    const predecessor = useSearchStore.getState().search("image-400");
    useSearchStore.getState().setParams({ query: 'keyword:"successor"' });
    const successor = useSearchStore.getState().search("image-401");
    try {
      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      if (settled) await act(async () => { gates[1].release(); await successor; });
      const ownedState = useSearchStore.getState();
      await act(async () => { gates[0].release(); await predecessor; });
      expect(useSearchStore.getState()).toBe(ownedState);
      expect(ownedState.loading).toBe(!settled);
      await act(async () => { gates[1].release(); await successor; });
      expect(useSearchStore.getState()).toMatchObject({ results: [expect.objectContaining({ id: "image-401" })],
        total: 1, focusedImageId: "image-401", loading: false, error: null,
        params: { query: 'keyword:"successor"', orderBy: "uploadTime" } });
    } finally {
      await act(async () => { gates.forEach(gate => gate.release()); await Promise.all([predecessor, successor]); });
    }
  });

  it.each(["zero", "refused", "unavailable"] as const)("settles a genuine %s initial read without disguising failure", async (outcome) => {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    const dataSource = mode === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
    vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
    vi.spyOn(dataSource, "countWithTickers").mockResolvedValue({ count: 0, tickerCounts: {} });
    const before = useSearchStore.getState().results;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (outcome === "unavailable") throw new TypeError("Fixture unavailable");
      return outcome === "refused" ? new Response("Forbidden", { status: 403 }) : response([]);
    }));
    useSearchStore.setState({ dataSource, pitId: null, params: { nonFree: "true" } });
    await act(async () => { await useSearchStore.getState().search(); });
    const state = useSearchStore.getState();
    expect(state.loading).toBe(false);
    if (outcome === "zero") {
      expect(state.results).toEqual([]);
      expect(state.total).toBe(0);
      expect(state.error).toBeNull();
      expect(state.imagePositions.size).toBe(0);
    } else {
      expect(state.results).toBe(before);
      expect(state.total).toBe(70000);
      expect(state.error).not.toBeNull();
    }
  });

  it("starts fill on a range signal after density and prevents its cancelled page from publishing", async () => {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    const dataSource = mode === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
    vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
    vi.spyOn(dataSource, "countWithTickers").mockResolvedValue({ count: 240, tickerCounts: {} });
    const pages = vi.spyOn(dataSource, "searchAfter");
    const gates = [0, 1].map(() => {
      let release!: () => void;
      const promise = new Promise<void>(resolve => { release = resolve; });
      return { promise, release };
    });
    const hits = Array.from({ length: 240 }, (_, index) => ({ id: `fill-${index}`,
      uploadTime: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString() }) as Image);
    const signals: Array<AbortSignal | null | undefined> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const index = signals.length;
      signals.push(init.signal);
      await gates[index].promise;
      init.signal?.throwIfAborted();
      const reply = await response(index === 0 ? hits.slice(0, 200) : hits.slice(200)).json();
      if (mode === "media-api") reply.total = 240;
      else reply.hits.total.value = 240;
      return Response.json(reply);
    }));
    useSearchStore.setState({ dataSource, pitId: null, params: { orderBy: "uploadTime", nonFree: "true" } });
    anchor.viewportId = "image-400";
    const pending = useSearchStore.getState().search();
    try {
      transition();
      frame();
      frame();
      expect(signals[0]?.aborted).toBe(false);
      await act(async () => { gates[0].release(); await pending; });
      expect(signals).toHaveLength(2);
      expect(signals[1]).not.toBe(signals[0]);
      expect(signals[1]?.aborted).toBe(false);
      const published = useSearchStore.getState().results;
      expect(published.map(image => image?.id)).toEqual(hits.slice(0, 200).map(image => image.id));
      anchor.viewportId = "fill-40";
      transition(table, grid);
      frame();
      frame();
      expect(signals[1]?.aborted).toBe(true);
      await act(async () => { gates[1].release(); await pages.mock.results[1].value.catch(() => {}); });
      expect(useSearchStore.getState().results).toBe(published);
      expect(useSearchStore.getState()).toMatchObject({ total: 240, bufferOffset: 0, loading: false,
        error: null, _extendForwardInFlight: false, _extendBackwardInFlight: false });
    } finally {
      await act(async () => { gates.forEach(gate => gate.release()); await pending;
        await pages.mock.results[1]?.value.catch(() => {}); });
    }
  });

  const inputTimings = (["before-publication", "after-publication"] as const).flatMap(timing =>
    (["saved", "browse"] as const).map(mount => ({ timing, mount })));
  it.each(inputTimings)("respects resident wheel input $timing between density frames ($mount mount)", async ({ timing, mount }) => {
    vi.stubGlobal("scheduler", { yield: async () => {} });
    const dataSource = mode === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
    const hits = Array.from({ length: 100 }, (_, index) => ({ id: `image-${350 + index}`,
      uploadTime: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString() }) as Image);
    const sortValues = hits.map(image => [Date.parse(image.uploadTime!), image.id]);
    vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
    vi.spyOn(dataSource, "countWithTickers").mockResolvedValue({ count: hits.length, tickerCounts: {} });
    routeParams = { nonFree: "true", orderBy: "-uploadTime" };
    setPrevParamsSerialized(JSON.stringify(routeParams));
    setPrevSearchOnly({ ...routeParams });
    useSearchStore.setState({ dataSource, pitId: null, params: routeParams });
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let requestSignal: AbortSignal | null | undefined;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      requestSignal = init.signal;
      await held;
      init.signal?.throwIfAborted();
      return response(hits);
    });
    vi.stubGlobal("fetch", fetch);
    const source = mountDensity(grid, false, false, true);
    frame();
    frame();
    source.container.scrollTop = 50 * grid.rowHeight - 180;
    const search = vi.spyOn(useSearchStore.getState(), "search");
    const startSearch = (view: ReturnType<typeof mountDensity>, geometry: ScrollGeometry) => act(() => {
      routeParams = { ...routeParams, orderBy: "uploadTime", ...(mount === "browse" && { query: "resident" }) };
      markUserInitiatedNavigation();
      view.changeGeometry(geometry);
    });
    if (mount === "saved") startSearch(source, grid);
    else act(() => useSearchStore.getState().queueBrowsePosition(5000));
    let pending: Promise<void> | undefined;
    try {
      source.unmount();
      source.container.remove();
      const target = mountDensity(table, mount === "saved", true, mount === "browse");
      frame();
      if (mount === "browse") {
        target.container.scrollTop = 200 * table.rowHeight - 180;
        startSearch(target, table);
      }
      pending = search.mock.results[0].value;
      const browse = () => act(() => {
        target.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 640 }));
        target.container.scrollTop = 640;
        target.container.dispatchEvent(new Event("scroll"));
      });
      if (timing === "before-publication") browse();
      await act(async () => { release(); await pending; });
      expect(useSearchStore.getState()._searchContinuity).toMatchObject({ targetId: "image-400", phase: "ready" });
      const published = useSearchStore.getState().results;
      if (timing === "after-publication") browse();
      frame();
      expect(target.container.scrollTop).toBe(timing === "after-publication" ? 640 : 50 * table.rowHeight - 180);
      const state = useSearchStore.getState();
      expect(state.results).toBe(published);
      expect(state.results.map(image => image?.id)).toEqual(hits.map(image => image.id));
      expect(state).toMatchObject({ total: 100, bufferOffset: 0, loading: false, error: null,
        focusedImageId: "image-400", sortAroundFocusStatus: null, _browseNavigation: null });
      expect([...state.imagePositions]).toEqual(hits.map((image, index) => [image.id, index]));
      expect(state.startCursor).toEqual(sortValues[0]);
      expect(state.endCursor).toEqual(sortValues.at(-1));
      expect(requestSignal?.aborted).toBe(false);
      expect(state._searchContinuity?.owner.aborted).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
      expect(search).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { release(); await pending; });
    }
  });

  for (const direction of ["grid-table", "table-grid"] as const) {
    for (const focused of [false, true]) {
      it.each([false, true])(`${direction}, focused=${focused}, density=%s publishes the requested order and settles`, async (changeDensity) => {
        vi.stubGlobal("scheduler", { yield: async () => {} });
        const dataSource = mode === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
        const hits = [403, 402, 401, 400].map((index) => ({
          id: `image-${index}`, uploadTime: `2026-01-0${404 - index}T00:00:00Z`,
        }) as Image);
        const sortValues = hits.map((image) => [Date.parse(image.uploadTime!), image.id]);
        vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
        vi.spyOn(dataSource, "countWithTickers").mockResolvedValue({ count: hits.length, tickerCounts: {} });
        routeParams = { query: 'keyword:"B8 pending"', orderBy: "-uploadTime", nonFree: "true" };
        setPrevParamsSerialized(JSON.stringify(routeParams));
        setPrevSearchOnly({ ...routeParams });
        useSearchStore.setState({ dataSource, pitId: null, focusedImageId: focused ? "image-400" : null,
          params: routeParams });
        anchor.viewportId = "image-400";

        let release!: () => void;
        const held = new Promise<void>((resolve) => { release = resolve; });
        let requestSignal: AbortSignal | null | undefined;
        const requests: Record<string, unknown>[] = [];
        vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
          requests.push(JSON.parse(init.body as string));
          requestSignal = init.signal;
          await new Promise<void>((resolve, reject) => {
            const cancel = () => reject(new DOMException("Cancelled fixture request", "AbortError"));
            init.signal?.addEventListener("abort", cancel, { once: true });
            held.then(() => { init.signal?.removeEventListener("abort", cancel); resolve(); });
          });
          init.signal?.throwIfAborted();
          return new Response(JSON.stringify(mode === "media-api"
            ? { data: hits.map((data) => ({ data })), total: hits.length, sortValues }
            : { hits: { total: { value: hits.length }, hits: hits.map((image, index) => ({
              _id: image.id, _source: image, sort: sortValues[index],
            })) } }));
        }));

        const sourceGeometry = direction === "grid-table" ? grid : table;
        const targetGeometry = direction === "grid-table" ? table : grid;
        const source = mountDensity(sourceGeometry, false, false, true);
        frame();
        frame();
        source.container.scrollTop = 1000;
        const cancelWindowMaintenance = vi.spyOn(useSearchStore.getState(), "cancelWindowMaintenance");
        const search = vi.spyOn(useSearchStore.getState(), "search");
        act(() => {
          routeParams = { ...routeParams, orderBy: "uploadTime" };
          markUserInitiatedNavigation();
          source.changeGeometry(sourceGeometry);
        });
        const pending = search.mock.results[0].value;
        try {
          expect(requests).toHaveLength(1);
          expect(requestSignal?.aborted).toBe(false);
          expect(useSearchStore.getState().loading).toBe(true);
          expect(requests[0]).toMatchObject(mode === "media-api"
            ? { q: 'keyword:"B8 pending" -is:deleted -usages@status:replaced', orderBy: "uploadTime" }
            : { sort: [{ uploadTime: "asc" }, { id: "asc" }] });
          if (changeDensity) {
            source.unmount();
            source.container.remove();
            mountDensity(targetGeometry, true);
            expect(cancelWindowMaintenance).toHaveBeenCalled();
            expect(frames.size).toBe(1);
            frame();
            frame();
          } else {
            expect(cancelWindowMaintenance).not.toHaveBeenCalled();
          }
          await act(async () => { release(); await pending; });
          const state = useSearchStore.getState();
          expect(state.results.map((image) => image?.id)).toEqual(hits.map((image) => image.id));
          expect(state).toMatchObject({ total: hits.length, bufferOffset: 0, loading: false, error: null,
            params: { query: 'keyword:"B8 pending"', orderBy: "uploadTime" },
            focusedImageId: focused ? "image-400" : null });
          expect([...state.imagePositions]).toEqual(hits.map((image, index) => [image.id, index]));
          expect(state.startCursor).toEqual(sortValues[0]);
          expect(state.endCursor).toEqual(sortValues[sortValues.length - 1]);
          expect(requestSignal?.aborted).toBe(false);
          expect(search).toHaveBeenCalledOnce();
          expect(requests).toHaveLength(1);
          if (focused) expect(state._searchContinuity).toMatchObject({ targetId: "image-400", phase: "placed" });
        } finally {
          await act(async () => { release(); await pending; });
        }
      });
    }
  }
});