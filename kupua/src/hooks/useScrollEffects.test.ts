// @vitest-environment jsdom

import { createElement, StrictMode, useEffect, type PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
const anchor = vi.hoisted(() => ({ viewportId: null as string | null }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useSearch: () => routeParams, useNavigate: () => navigate }));
vi.mock("@/hooks/useDataWindow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useDataWindow")>()),
  getViewportAnchorId: () => anchor.viewportId,
}));

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
import type { Image } from "@/types/image";
import { SEEK_DEFERRED_SCROLL_MS } from "@/constants/tuning";
import { clearDensityFocusRatio, useScrollEffects, type ScrollGeometry } from "./useScrollEffects";
import { useUrlSearchSync } from "./useUrlSearchSync";
import { consumeUserInitiatedFlag, markUserInitiatedNavigation, setPrevParamsSerialized, setPrevSearchOnly } from "@/lib/orchestration/search";
import type { UrlSearchParams } from "@/lib/search-params-schema";
import * as searchContinuity from "@/lib/search-continuity";

let routeParams: UrlSearchParams = { nonFree: "true" };
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
  beforeUrlSync = undefined;
  setPrevParamsSerialized("");
  setPrevSearchOnly({});
  consumeUserInitiatedFlag();
  navigate.mockClear();
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

function UrlSyncHarness({ children }: PropsWithChildren) {
  useEffect(() => { beforeUrlSync?.(); }, [routeParams]);
  useUrlSearchSync();
  return children;
}

function mountDensity(initialGeometry: ScrollGeometry, strict = false, reportViewport = false, syncUrl = false) {
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
      focusedImageId: state.focusedImageId, findImageIndex, twoTier });
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

describe("KUP-017 saved density geometry and input lifetime", () => {
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
    it(`retains the ${extremum} extremum`, () => {
      const target = transition(grid, table, extremum);
      frame();
      frame();
      expect(target.container.scrollTop).toBe(extremum === "top" ? 0 : target.container.scrollHeight - target.container.clientHeight);
      if (extremum === "bottom") expect(target.scrollToIndex).toHaveBeenCalledWith(799, { align: "end" });
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
        anchor.viewportId = "image-400";
        const sourceGeometry = direction === "grid-table" ? grid : table;
        const targetGeometry = direction === "grid-table" ? table : grid;
        const source = mountDensity(sourceGeometry);
        frame();
        frame();
        source.container.scrollTop = 1000;
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