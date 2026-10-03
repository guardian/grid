// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => routeParams,
}));

import { MockDataSource } from "@/dal/mock-data-source";
import { ApiDataSource } from "@/dal/api-data-source";
import { ElasticsearchDataSource } from "@/dal/es-adapter";
import { parseSortField } from "@/dal/adapters/elasticsearch/sort-builders";
import type { SearchParams, SortValues } from "@/dal/types";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { useListNavigation } from "./useListNavigation";
import { useDataWindow } from "./useDataWindow";
import { clearDensityFocusRatio, useScrollEffects } from "./useScrollEffects";

const routeParams = { nonFree: "true" };
const initialSearch = useSearchStore.getState();
const initialSelection = useSelectionStore.getState();
const initialPreferences = useUiPrefsStore.getState();
const initialFullscreen = Object.getOwnPropertyDescriptor(document, "fullscreenElement");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
  clearDensityFocusRatio();
  useSearchStore.setState(initialSearch, true);
  useSelectionStore.setState({ ...initialSelection, selectedIds: new Set(), anchorId: null }, true);
  useUiPrefsStore.setState({ ...initialPreferences, focusMode: "explicit", _pointerCoarse: false }, true);
});

afterEach(() => {
  cleanup();
  clearDensityFocusRatio();
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (initialFullscreen) Object.defineProperty(document, "fullscreenElement", initialFullscreen);
  else Reflect.deleteProperty(document, "fullscreenElement");
  useSearchStore.setState(initialSearch, true);
  useSelectionStore.setState(initialSelection, true);
  useUiPrefsStore.setState(initialPreferences, true);
});

async function mountNavigation(windowed: boolean, mode: "explicit" | "selection" | "phantom" | "none", total = windowed ? 12000 : 300, orderBy = "-uploadTime") {
  const source = new MockDataSource(total, orderBy === "-uploadTime" ? undefined : [{ field: "lastModified", ratio: 1 }]);
  const params = { nonFree: "true", orderBy, length: windowed ? 200 : total };
  const firstPage = await source.searchAfter(params, null, null);
  const origin = firstPage.hits[0].id;
  useSearchStore.setState({
    dataSource: source,
    params,
    results: firstPage.hits,
    total,
    imagePositions: new Map(firstPage.hits.map((image, index) => [image.id, index])),
    bufferOffset: 0,
    focusedImageId: mode === "none" ? null : origin,
    startCursor: firstPage.sortValues[0],
    endCursor: firstPage.sortValues.at(-1),
    loading: false,
  });
  if (mode === "selection") useSelectionStore.setState({ selectedIds: new Set([origin]), anchorId: origin });
  if (mode === "phantom") useUiPrefsStore.setState({ focusMode: "phantom" });

  const container = document.createElement("div");
  document.body.appendChild(container);
  Object.defineProperties(container, {
    clientHeight: { value: 600 },
    clientWidth: { value: 1000 },
    scrollHeight: { get: () => {
      const state = useSearchStore.getState();
      return (isTwoTierFromTotal(state.total) ? state.total : state.results.length) * 32;
    } },
  });
  const parentRef = { current: container };
  const scrollToIndex = vi.fn((index: number) => { container.scrollTop = Math.max(0, (index + 1) * 32 - 600); });
  const virtualizer = {
    options: { count: total },
    range: { startIndex: 0, endIndex: 10 },
    scrollToIndex,
    scrollToOffset: vi.fn((offset: number) => { container.scrollTop = offset; }),
    measure: vi.fn(),
    getVirtualItems: () => [],
  } as unknown as Virtualizer<HTMLDivElement, Element>;
  const loadMore = vi.fn().mockResolvedValue(undefined);
  const reportVisibleRange = vi.fn();
  const geometry = { rowHeight: 32, columns: 1, headerOffset: 0, preserveScrollLeftOnSort: true };
  const findImageIndex = (imageId: string) => {
    const state = useSearchStore.getState();
    return (state.imagePositions.get(imageId) ?? -1) - (isTwoTierFromTotal(state.total) ? 0 : state.bufferOffset);
  };
  let seekWork: Promise<void> | undefined;
  const seekRequests: Promise<void>[] = [];
  const seek = vi.fn((offset: number) => {
    seekWork = useSearchStore.getState().seek(offset);
    seekRequests.push(seekWork);
    return seekWork;
  });
  renderHook(() => {
    const state = useSearchStore();
    const twoTier = isTwoTierFromTotal(state.total);
    const virtualizerCount = twoTier ? state.total : state.results.length;
    virtualizer.options.count = virtualizerCount;
    useScrollEffects({ virtualizer, parentRef, geometry, reportVisibleRange, resultsLength: state.results.length,
      total: state.total, bufferOffset: state.bufferOffset, loadMore, focusedImageId: state.focusedImageId,
      findImageIndex, twoTier });
    useListNavigation({ virtualizer, scrollRef: parentRef, columnsPerRow: 1, rowHeight: 32, headerHeight: 0,
      focusedImageId: state.focusedImageId, setFocusedImageId: state.setFocusedImageId, virtualizerCount,
      getImage: (index) => {
        const current = useSearchStore.getState();
        return current.results[index - (twoTier ? current.bufferOffset : 0)];
      }, findImageIndex, resultsLength: state.results.length, total: state.total, loadMore,
      onEnter: vi.fn(), imageParam: undefined, flatIndexToRow: (index) => index, bufferOffset: state.bufferOffset, seek });
  });
  scrollToIndex.mockClear();
  return {
    origin, source, scrollToIndex, seek, container,
    dispatchKey: (key: string, target: HTMLElement = container) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
    finishSeek: () => Promise.all(seekRequests),
    holdRead: () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const original = source.searchAfter.bind(source);
      const read = vi.spyOn(source, "searchAfter").mockImplementationOnce(async (...args) => {
        await gate;
        if (args[3]?.aborted) throw new DOMException("Aborted", "AbortError");
        return original(...args);
      });
      return { release, read };
    },
    pressEnd: async () => {
      await act(async () => {
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
        await seekWork;
      });
    },
  };
}

function holdInitialRead(
  fixture: Awaited<ReturnType<typeof mountNavigation>>,
  transport: "direct-ES" | "media-api",
  outcome: "abort-aware" | "ignore-abort" | "failure",
  orderBy = "uploadTime",
  holdEnd = false,
  membership?: { total: number; source: MockDataSource; count?: "held" | "failure" },
) {
  vi.stubGlobal("scheduler", { yield: async () => {} });
  const dataSource = transport === "media-api" ? new ApiDataSource() : new ElasticsearchDataSource();
  vi.spyOn(dataSource, "openPit").mockResolvedValue(null);
  const countResult = { count: membership?.total ?? 12000, tickerCounts: {} };
  let releaseCount!: () => void;
  const heldCount = new Promise<typeof countResult>(resolve => { releaseCount = () => resolve(countResult); });
  const counts = vi.spyOn(dataSource, "countWithTickers").mockResolvedValue(countResult);
  if (membership?.count === "held") counts.mockReturnValueOnce(heldCount);
  if (membership?.count === "failure") counts.mockRejectedValueOnce(new Error("Fixture count unavailable"));
  vi.spyOn(dataSource, "fetchPositionIndex").mockResolvedValue(null);
  let release!: () => void;
  let releaseEnd!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const endHeld = new Promise<void>(resolve => { releaseEnd = resolve; });
  const observed = { initialSignal: undefined as AbortSignal | null | undefined,
    endSignal: undefined as AbortSignal | null | undefined, initialRequests: 0, endRequests: 0, homeRequests: 0, windowRequests: 0 };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    if (membership) expect(JSON.stringify(body)).toContain("new-membership");
    const counted = transport === "media-api" ? body.countAll === true : body.track_total_hits === true;
    if (!counted) observed.windowRequests += 1;
    const cursor = (transport === "media-api" ? body.sortValues : body.search_after) as SortValues | undefined;
    const reverse = transport === "media-api" ? body.reverse === true
      : parseSortField((body.sort as Record<string, unknown>[])[0]).direction === "desc";
    if (counted) {
      observed.initialRequests += 1;
      observed.initialSignal = init.signal;
      await held;
      if (outcome === "failure") throw new TypeError("Late initial transport failure");
      if (outcome === "abort-aware") init.signal?.throwIfAborted();
    } else if (reverse && holdEnd) {
      observed.endRequests += 1;
      observed.endSignal = init.signal;
      await endHeld;
      init.signal?.throwIfAborted();
    } else if (!cursor && !reverse) {
      observed.homeRequests += 1;
    }
    const params: SearchParams = { nonFree: "true", orderBy,
      length: (transport === "media-api" ? body.length : body.size) as number,
      offset: (transport === "media-api" ? body.offset : body.from) as number | undefined };
    const result = await (membership?.source ?? fixture.source).searchAfter(params, cursor ?? null, null, undefined, reverse,
      transport === "media-api" ? body.seekToEnd === true : reverse && !cursor);
    const hits = transport === "direct-ES" && reverse ? [...result.hits].reverse() : result.hits;
    const sortValues = transport === "direct-ES" && reverse ? [...result.sortValues].reverse() : result.sortValues;
    return Response.json(transport === "media-api"
      ? { data: hits.map(data => ({ data })), total: counted ? result.total : 0, sortValues }
      : { hits: { ...(counted ? { total: { value: result.total } } : {}),
        hits: hits.map((image, index) => ({ _id: image.id, _source: image, sort: sortValues[index] })) } });
  }));
  act(() => {
    useSearchStore.setState({ dataSource });
    useSearchStore.getState().setParams({ orderBy, ...(membership && { query: "new-membership" }) });
  });
  let pending!: Promise<void>;
  act(() => { pending = useSearchStore.getState().search(); });
  return { release, releaseEnd, releaseCount, counts, observed, pending };
}

describe("B17 browse, cursor restore and snap-back ownership", () => {
  for (const successor of ["cursor", "focus"] as const) {
    it.each([false, true])(`${successor} inherits new query membership (missing target=%s)`, async (missing) => {
      const fixture = await mountNavigation(true, "none");
      await act(async () => { await useSearchStore.getState().seek(4000); });
      const targetId = missing ? "img-4001" : "img-20";
      useSearchStore.getState().setFocusedImageId(targetId);
      const source = new MockDataSource(100, [{ field: "lastModified", ratio: 1 }]);
      const expected = await source.searchAfter({ nonFree: "true", orderBy: "uploadTime", length: 200 }, null);
      const cached = await fixture.source.getById(targetId);
      const cursor: SortValues = [Date.parse(cached!.image.uploadTime), targetId];
      let releaseInitial!: () => void;
      let releaseBrowse!: () => void;
      const initialGate = new Promise<void>(resolve => { releaseInitial = resolve; });
      const browseGate = new Promise<void>(resolve => { releaseBrowse = resolve; });
      const original = source.searchAfter.bind(source);
      let browseHeld = false;
      vi.spyOn(source, "searchAfter").mockImplementation(async (...args) => {
        if (args[0].trackTotalHits) { await initialGate; args[3] = undefined; }
        else if (!browseHeld && !args[0].ids && !args[1]) { browseHeld = true; await browseGate; }
        return original(...args);
      });
      useSearchStore.setState({ dataSource: source });
      useSearchStore.getState().setParams({ query: "new-membership", orderBy: "uploadTime" });
      const initial = useSearchStore.getState().search(targetId);
      let browse!: Promise<void>;
      await act(async () => { browse = useSearchStore.getState().seek(5000); });
      let replacement!: Promise<void>;
      act(() => {
        replacement = successor === "cursor"
          ? useSearchStore.getState().restoreAroundCursor(targetId, cursor, missing ? 4001 : 20, true)
          : useSearchStore.getState().seekToFocused();
      });
      try {
        await act(async () => { releaseInitial(); await initial; await replacement; });
        expect(useSearchStore.getState()).toMatchObject({ total: 100, bufferOffset: 0, loading: false, error: null });
        expect(useSearchStore.getState().results.map(image => image?.id)).toEqual(expected.hits.map(image => image.id));
        if (!missing) expect(useSearchStore.getState().imagePositions.get(targetId)).toBe(20);
        const current = useSearchStore.getState().results;
        await act(async () => { releaseBrowse(); await browse; });
        expect(useSearchStore.getState().results === current).toBe(true);
      } finally {
        await act(async () => { releaseInitial(); releaseBrowse(); await Promise.all([initial, browse, replacement]); });
      }
    });
  }

  for (const initialFocus of [null, "img-8000"]) {
    it.each(["during-restore", "after-restore"] as const)(`retired initial placement (${initialFocus}) stays retired %s`, async (arrival) => {
      const fixture = await mountNavigation(true, "none");
      await act(async () => { await useSearchStore.getState().seek(4000); });
      const target = await fixture.source.searchAfter({ nonFree: "true", orderBy: "uploadTime", offset: 3000, length: 1 }, null);
      let releaseInitial!: () => void;
      let releaseBrowse!: () => void;
      let releaseLookup!: () => void;
      const initialGate = new Promise<void>(resolve => { releaseInitial = resolve; });
      const browseGate = new Promise<void>(resolve => { releaseBrowse = resolve; });
      const lookupGate = new Promise<void>(resolve => { releaseLookup = resolve; });
      const original = fixture.source.searchAfter.bind(fixture.source);
      vi.spyOn(fixture.source, "searchAfter").mockImplementation(async (...args) => {
        if (args[0].trackTotalHits) { await initialGate; args[3] = undefined; }
        else if (args[0].offset === 4900) await browseGate;
        else if (args[0].ids === target.hits[0].id) await lookupGate;
        return original(...args);
      });
      useSearchStore.getState().setParams({ orderBy: "uploadTime" });
      const initial = useSearchStore.getState().search(initialFocus);
      let browse!: Promise<void>;
      await act(async () => { browse = useSearchStore.getState().seek(5000); });
      const departing = useSearchStore.getState().results;
      let restore!: Promise<void>;
      act(() => { restore = useSearchStore.getState().restoreAroundCursor(target.hits[0].id, target.sortValues[0], 3000); });
      try {
        if (arrival === "during-restore") {
          await act(async () => { releaseInitial(); await initial; });
          expect(useSearchStore.getState().results === departing).toBe(true);
          expect(useSearchStore.getState().loading).toBe(true);
        }
        await act(async () => { releaseLookup(); await restore; });
        const owned = useSearchStore.getState();
        const placement = fixture.container.scrollTop;
        await act(async () => { releaseInitial(); releaseBrowse(); await Promise.all([initial, browse]); });
        expect(useSearchStore.getState().results === owned.results).toBe(true);
        expect(useSearchStore.getState()).toMatchObject({ loading: false, error: null, sortAroundFocusStatus: null });
        expect(fixture.container.scrollTop).toBe(placement);
      } finally {
        await act(async () => { releaseInitial(); releaseBrowse(); releaseLookup(); await Promise.all([initial, browse, restore]); });
      }
    });
  }

  for (const successor of ["cursor", "snap-back"] as const) {
    it.each(["success", "failure"] as const)(`${successor} supersedes a pending browse with late %s`, async (outcome) => {
      const fixture = await mountNavigation(true, "explicit");
      const cursor = useSearchStore.getState().startCursor;
      await act(async () => { await useSearchStore.getState().seek(4000); });
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const original = fixture.source.searchAfter.bind(fixture.source);
      const read = vi.spyOn(fixture.source, "searchAfter").mockImplementationOnce(async (...args) => {
        await held;
        if (outcome === "failure") throw new Error("Obsolete browse failed");
        args[3] = undefined;
        return original(...args);
      });
      let pending!: Promise<void>;
      act(() => { pending = useSearchStore.getState().seek(6000); });
      try {
        await act(async () => {
          if (successor === "cursor") await useSearchStore.getState().restoreAroundCursor(fixture.origin, cursor, 0);
          else await useSearchStore.getState().seekToFocused();
        });
        const owned = useSearchStore.getState();
        expect(owned.imagePositions.has(fixture.origin)).toBe(true);
        await act(async () => { release(); await pending; });
        expect(useSearchStore.getState().results === owned.results).toBe(true);
        expect(useSearchStore.getState()).toMatchObject({ loading: false, error: null, focusedImageId: fixture.origin });
        expect(read.mock.calls[0][3]?.aborted).toBe(true);
      } finally {
        await act(async () => { release(); await pending; });
      }
    });
  }

  it("a newer browse cancels snap-back without clearing the retained bookmark", async () => {
    const fixture = await mountNavigation(true, "explicit");
    await act(async () => { await useSearchStore.getState().seek(4000); });
    const held = fixture.holdRead();
    let snapBack!: Promise<void>;
    act(() => { snapBack = useSearchStore.getState().seekToFocused(); });
    try {
      await act(async () => { await useSearchStore.getState().seek(8000); });
      const destination = useSearchStore.getState().results;
      await act(async () => { held.release(); await snapBack; });
      expect(useSearchStore.getState().results === destination).toBe(true);
      expect(useSearchStore.getState()).toMatchObject({ focusedImageId: fixture.origin, loading: false, error: null });
    } finally {
      await act(async () => { held.release(); await snapBack; });
    }
  });
});

describe("L37 explicit navigation versus viewport refill", () => {
  it("cursor takeover settles superseded focus status before a later refill", async () => {
    const fixture = await mountNavigation(true, "explicit", 12000, "-credit");
    const target = await fixture.source.searchAfter({ nonFree: "true", orderBy: "credit", offset: 3000, length: 1 }, null);
    let releaseRank!: (value: number) => void;
    const rank = new Promise<number>(resolve => { releaseRank = resolve; });
    const rankRead = vi.spyOn(fixture.source, "countBefore").mockReturnValueOnce(rank);
    useSearchStore.getState().setParams({ orderBy: "credit" });
    try {
      await act(async () => { await useSearchStore.getState().search(fixture.origin); });
      await vi.waitFor(() => expect(rankRead).toHaveBeenCalled());
      expect(useSearchStore.getState().sortAroundFocusStatus).not.toBeNull();
      await act(async () => {
        await useSearchStore.getState().restoreAroundCursor(target.hits[0].id, target.sortValues[0], 3000);
      });
      expect(useSearchStore.getState()).toMatchObject({ loading: false, sortAroundFocusStatus: null });
      await act(async () => { await useSearchStore.getState().seek(6000, undefined, undefined, "refill"); });
      expect(useSearchStore.getState()).toMatchObject({ loading: false, sortAroundFocusStatus: null });
    } finally {
      await act(async () => { releaseRank(0); await Promise.resolve(); });
    }
  });

  it("reuses the current search's map and polling work when browsing supersedes focus resolution", async () => {
    const fixture = await mountNavigation(true, "explicit", 12000, "-credit");
    let releaseRank!: (value: number) => void;
    const rank = new Promise<number>(resolve => { releaseRank = resolve; });
    const rankRead = vi.spyOn(fixture.source, "countBefore").mockReturnValueOnce(rank);
    let releaseMap!: () => void;
    const map = new Promise<null>(resolve => { releaseMap = () => resolve(null); });
    const maps = vi.spyOn(fixture.source, "fetchPositionIndex").mockReturnValue(map);
    const counts = vi.spyOn(fixture.source, "countWithTickers");
    useSearchStore.getState().setParams({ orderBy: "credit" });
    try {
      await act(async () => { await useSearchStore.getState().search(fixture.origin); });
      await vi.waitFor(() => expect(rankRead).toHaveBeenCalled());
      expect(maps).toHaveBeenCalledOnce();
      const countRequests = counts.mock.calls.length;
      const freeze = useSearchStore.getState().newCountSince;
      await act(async () => { await vi.advanceTimersByTimeAsync(500); await useSearchStore.getState().seek(6000); });
      expect(maps).toHaveBeenCalledOnce();
      expect(counts).toHaveBeenCalledTimes(countRequests);
      expect(useSearchStore.getState().newCountSince).toBe(freeze);
    } finally {
      await act(async () => { releaseRank(0); releaseMap(); await Promise.resolve(); });
    }
  });

  it("does not let an automatic indexed refill cancel the pending initial search", async () => {
    const fixture = await mountNavigation(true, "none");
    const dataWindow = renderHook(() => useDataWindow());
    const original = fixture.source.searchAfter.bind(fixture.source);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let initialSignal: AbortSignal | undefined;
    vi.spyOn(fixture.source, "searchAfter").mockImplementation(async (...args) => {
      if (args[0].trackTotalHits) {
        initialSignal = args[3];
        await held;
      }
      return original(...args);
    });
    let pending!: Promise<void>;
    act(() => { pending = useSearchStore.getState().search(); });
    try {
      const generation = useSearchStore.getState()._seekGeneration;
      await act(async () => {
        dataWindow.result.current.reportVisibleRange(5000, 5010);
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(useSearchStore.getState()._seekGeneration).toBeGreaterThan(generation);
      expect(useSearchStore.getState().bufferOffset).toBeGreaterThan(0);
      expect(initialSignal).toBeDefined();
      expect(initialSignal?.aborted).toBe(false);
      expect(useSearchStore.getState().loading).toBe(true);
      await act(async () => { release(); await pending; });
      const state = useSearchStore.getState();
      const firstPage = await original({ ...state.params, length: 200 }, null);
      expect(state.results.map(image => image?.id)).toEqual(firstPage.hits.map(image => image.id));
      expect(state).toMatchObject({ bufferOffset: 0, total: 12000, loading: false, error: null });
    } finally {
      await act(async () => { release(); await pending; });
    }
  });
});

describe.each(["direct-ES", "media-api"] as const)("L37 %s newer End owns publication", (transport) => {
  it.each([false, true])("cancelled pre-dispatch browsing leaves discovery owned (newer browse=%s)", async (newer) => {
    const fixture = await mountNavigation(true, "none");
    const read = holdInitialRead(fixture, transport, "ignore-abort", "uploadTime", false,
      { total: 100, source: new MockDataSource(100) });
    act(() => {
      useSearchStore.getState().queueBrowsePosition(5000);
      useSearchStore.getState().abortExtends();
    });
    try {
      if (newer) await act(async () => { await useSearchStore.getState().seek(70); });
      const owned = useSearchStore.getState().results;
      await act(async () => { read.release(); await read.pending; await vi.advanceTimersByTimeAsync(250); });
      expect(useSearchStore.getState()).toMatchObject({ total: 100, loading: false, error: null });
      expect(useSearchStore.getState().results).toHaveLength(100);
      if (newer) expect(useSearchStore.getState().results === owned).toBe(true);
    } finally {
      await act(async () => { read.release(); await read.pending; });
    }
  });

  it.each([false, true])("failed browsing uses its first page unless a newer query owns results (newer=%s)", async (newer) => {
    const fixture = await mountNavigation(true, "none");
    const source = new MockDataSource(100, [{ field: "lastModified", ratio: 1 }]);
    const read = holdInitialRead(fixture, transport, "ignore-abort", "uploadTime", false, { total: 100, source });
    vi.spyOn(useSearchStore.getState().dataSource, "searchAfter").mockRejectedValueOnce(new Error("Browse unavailable"));
    let browse!: Promise<void>;
    await act(async () => { browse = useSearchStore.getState().seek(5000); });
    try {
      expect(useSearchStore.getState().loading).toBe(true);
      if (newer) {
        await act(async () => {
          useSearchStore.setState({ dataSource: new MockDataSource(50) });
          useSearchStore.getState().setParams({ query: "successor" });
          await useSearchStore.getState().search();
        });
      }
      const owned = useSearchStore.getState().results;
      await act(async () => { read.release(); await Promise.all([read.pending, browse]); });
      expect(useSearchStore.getState()).toMatchObject({ total: newer ? 50 : 100, bufferOffset: 0,
        loading: false, error: null, _browseNavigation: null });
      if (newer) expect(useSearchStore.getState().results === owned).toBe(true);
      else expect(useSearchStore.getState().results).toHaveLength(100);
      expect(read.observed.initialRequests).toBe(1);
    } finally {
      await act(async () => { read.release(); await Promise.all([read.pending, browse]); });
    }
  });

  it("settles discovery failure without publishing fabricated membership", async () => {
    const fixture = await mountNavigation(true, "none");
    const previous = useSearchStore.getState().results;
    const read = holdInitialRead(fixture, transport, "failure", "uploadTime", false,
      { total: 100, source: new MockDataSource(100), count: "failure" });
    let browse!: Promise<void>;
    act(() => { browse = useSearchStore.getState().seek(5000); });
    try {
      await act(async () => { read.release(); await Promise.all([read.pending, browse]); });
      expect(useSearchStore.getState()).toMatchObject({ total: 12000, loading: false, _browseNavigation: null });
      expect(useSearchStore.getState().error).toBeTruthy();
      expect(useSearchStore.getState().results === previous).toBe(true);
    } finally {
      await act(async () => { read.release(); await Promise.all([read.pending, browse]); });
    }
  });

  it("End remains at the tail when a deep window becomes a fully resident query", async () => {
    const fixture = await mountNavigation(true, "none");
    await act(async () => { await useSearchStore.getState().seek(4000); });
    const source = new MockDataSource(100, [{ field: "lastModified", ratio: 1 }]);
    const read = holdInitialRead(fixture, transport, "ignore-abort", "uploadTime", false, { total: 100, source });
    try {
      await fixture.pressEnd();
      expect(useSearchStore.getState()).toMatchObject({ total: 100, bufferOffset: 0, loading: false, error: null });
      expect(fixture.container.scrollTop).toBe(100 * 32 - 600);
      await act(async () => { read.release(); await read.pending; });
      expect(fixture.container.scrollTop).toBe(100 * 32 - 600);
    } finally {
      await act(async () => { read.release(); await read.pending; await fixture.finishSeek(); });
    }
  });

  it("waits for current count metadata without publishing an intermediate first page", async () => {
    const fixture = await mountNavigation(true, "none");
    const source = new MockDataSource(25000, [{ field: "lastModified", ratio: 1 }]);
    const read = holdInitialRead(fixture, transport, "abort-aware", "uploadTime", false,
      { total: 25000, source, count: "held" });
    let firstPagePublished = false;
    const unsubscribe = useSearchStore.subscribe(state => {
      if (state.total === 25000 && state.bufferOffset === 0 && state.results.length > 0) firstPagePublished = true;
    });
    let browse!: Promise<void>;
    act(() => { browse = useSearchStore.getState().seek(5000); });
    try {
      await act(async () => { read.release(); await Promise.resolve(); });
      expect(read.observed.initialSignal?.aborted).toBe(false);
      expect(read.observed.windowRequests).toBe(0);
      expect(useSearchStore.getState().loading).toBe(true);
      await act(async () => { read.releaseCount(); await read.pending; await browse; });
      expect(firstPagePublished).toBe(false);
      expect(useSearchStore.getState()).toMatchObject({ total: 25000, bufferOffset: 4900, loading: false, error: null });
      expect(read.observed.windowRequests).toBe(1);
    } finally {
      unsubscribe();
      await act(async () => { read.release(); read.releaseCount(); await read.pending; await browse; });
    }
  });

  it("uses the already-requested first page when the count is unavailable", async () => {
    const fixture = await mountNavigation(true, "none");
    const source = new MockDataSource(100, [{ field: "lastModified", ratio: 1 }]);
    const read = holdInitialRead(fixture, transport, "abort-aware", "uploadTime", false,
      { total: 100, source, count: "failure" });
    let browse!: Promise<void>;
    act(() => { browse = useSearchStore.getState().seek(5000); });
    try {
      expect(read.observed.initialSignal?.aborted).toBe(false);
      expect(read.observed.windowRequests).toBe(0);
      await act(async () => { read.release(); await read.pending; await browse; });
      expect(useSearchStore.getState()).toMatchObject({ total: 100, bufferOffset: 0, loading: false, error: null });
      expect(useSearchStore.getState().results).toHaveLength(100);
      expect(read.observed.initialRequests).toBe(1);
    } finally {
      await act(async () => { read.release(); await read.pending; await browse; });
    }
  });

  it("only the newest browse dispatches after a delayed discovery", async () => {
    const fixture = await mountNavigation(true, "none");
    const source = new MockDataSource(25000, [{ field: "lastModified", ratio: 1 }]);
    const read = holdInitialRead(fixture, transport, "ignore-abort", "uploadTime", false,
      { total: 25000, source, count: "held" });
    let first!: Promise<void>;
    let latest!: Promise<void>;
    act(() => { first = useSearchStore.getState().seek(5000); latest = useSearchStore.getState().seek(9000); });
    try {
      await act(async () => { read.releaseCount(); await Promise.all([first, latest]); });
      expect(read.observed.windowRequests).toBe(1);
      expect(useSearchStore.getState()).toMatchObject({ total: 25000, bufferOffset: 8900, loading: false, error: null });
      const results = useSearchStore.getState().results;
      await act(async () => { read.release(); await read.pending; });
      expect(useSearchStore.getState().results === results).toBe(true);
    } finally {
      await act(async () => { read.releaseCount(); read.release(); await Promise.all([first, latest, read.pending]); });
    }
  });

  it("a newer search rejects late membership discovery", async () => {
    const fixture = await mountNavigation(true, "none");
    const read = holdInitialRead(fixture, transport, "ignore-abort", "uploadTime", false,
      { total: 25000, source: new MockDataSource(25000), count: "held" });
    let browse!: Promise<void>;
    act(() => { browse = useSearchStore.getState().seek(5000); });
    try {
      await act(async () => {
        useSearchStore.setState({ dataSource: new MockDataSource(100) });
        useSearchStore.getState().setParams({ query: "successor" });
        await useSearchStore.getState().search();
      });
      const current = useSearchStore.getState();
      await act(async () => { read.releaseCount(); read.release(); await Promise.all([browse, read.pending]); });
      expect(useSearchStore.getState().results === current.results).toBe(true);
      expect(useSearchStore.getState()).toMatchObject({ total: 100, loading: false, error: null, params: { query: "successor" } });
      expect(read.observed.windowRequests).toBe(0);
    } finally {
      await act(async () => { read.releaseCount(); read.release(); await Promise.all([browse, read.pending]); });
    }
  });

  it.each(["Home", "End"] as const)("%s cannot reuse an old fully resident result set during a new query", async (edge) => {
    const fixture = await mountNavigation(false, "none");
    const source = new MockDataSource(25000, [{ field: "lastModified", ratio: 1 }]);
    const read = holdInitialRead(fixture, transport, "ignore-abort", "uploadTime", false, { total: 25000, source });
    try {
      await act(async () => { fixture.dispatchKey(edge); await fixture.finishSeek(); });
      const state = useSearchStore.getState();
      expect(state).toMatchObject({ total: 25000, loading: false, error: null });
      expect(edge === "Home" ? state.bufferOffset : state.bufferOffset + state.results.length).toBe(edge === "Home" ? 0 : 25000);
      const results = state.results;
      await act(async () => { read.release(); await read.pending; });
      expect(useSearchStore.getState().results === results).toBe(true);
    } finally {
      await act(async () => { read.release(); await read.pending; await fixture.finishSeek(); });
    }
  });

  for (const total of [0, 100, 25000]) {
    it.each(["scrubber", "End"] as const)(`retains new membership (${total} matches) while %s supersedes initial placement`, async (producer) => {
      const fixture = await mountNavigation(true, "none");
      const source = new MockDataSource(total, [{ field: "lastModified", ratio: 1 }]);
      const read = holdInitialRead(fixture, transport, "ignore-abort", "uploadTime", false, { total, source });
      try {
        await act(async () => {
          if (producer === "End") await fixture.pressEnd();
          else await useSearchStore.getState().seek(5000, "scrubber-seek");
        });
        const destination = useSearchStore.getState();
        expect(destination).toMatchObject({ total, loading: false, error: null,
          params: { query: "new-membership", orderBy: "uploadTime" } });
        if (total === 0) {
          expect(destination.results).toEqual([]);
          expect(destination.bufferOffset).toBe(0);
          expect(destination.imagePositions.size).toBe(0);
        } else {
          const target = producer === "End" ? total - 1 : Math.min(5000, total - 1);
          const expected = await source.searchAfter({ nonFree: "true", orderBy: "uploadTime", offset: target, length: 1 }, null);
          expect(destination.imagePositions.get(expected.hits[0].id)).toBe(target);
          if (producer === "End") expect(destination.bufferOffset + destination.results.length).toBe(total);
        }
        await act(async () => { read.release(); await read.pending; });
        expect(useSearchStore.getState().results === destination.results).toBe(true);
        expect(useSearchStore.getState().total).toBe(total);
        expect(read.observed.initialRequests).toBe(1);
      } finally {
        await act(async () => { read.release(); await read.pending; await fixture.finishSeek(); });
      }
    });
  }

  it.each(["abort-aware", "ignore-abort", "failure"] as const)("B17 scrubber destination survives a late %s initial read", async (outcome) => {
    const fixture = await mountNavigation(true, "none");
    const read = holdInitialRead(fixture, transport, outcome);
    try {
      await act(async () => { await useSearchStore.getState().seek(6000, "scrubber-seek"); });
      const destination = useSearchStore.getState();
      const placement = fixture.container.scrollTop;
      expect(destination.bufferOffset).toBe(5900);
      await act(async () => { read.release(); await read.pending; });
      expect(useSearchStore.getState().results).toBe(destination.results);
      expect(useSearchStore.getState()).toMatchObject({ bufferOffset: 5900, loading: false, error: null });
      expect(fixture.container.scrollTop).toBe(placement);
      expect(read.observed.initialSignal?.aborted).toBe(true);
    } finally {
      await act(async () => { read.release(); await read.pending; });
    }
  });

  it.each(["abort-aware", "ignore-abort", "failure"] as const)("preserves the End tail after a late %s initial read", async (outcome) => {
    const fixture = await mountNavigation(true, "none");
    const read = holdInitialRead(fixture, transport, outcome);
    try {
      expect(read.observed.initialRequests).toBe(1);
      expect(read.observed.initialSignal?.aborted).toBe(false);
      expect(useSearchStore.getState().loading).toBe(true);
      await fixture.pressEnd();
      const end = useSearchStore.getState();
      expect(end.bufferOffset + end.results.length).toBe(end.total);
      expect(end.bufferOffset).toBeGreaterThan(0);
      expect(fixture.container.scrollTop).toBeGreaterThan(0);
      const placement = fixture.container.scrollTop;
      await act(async () => { read.release(); await read.pending; });
      const current = useSearchStore.getState();
      expect(current.results).toBe(end.results);
      expect(current.imagePositions).toBe(end.imagePositions);
      expect(current).toMatchObject({ bufferOffset: end.bufferOffset, total: end.total,
        loading: false, error: null, focusedImageId: null, params: { orderBy: "uploadTime" } });
      expect(current.startCursor).toEqual(end.startCursor);
      expect(current.endCursor).toEqual(end.endCursor);
      expect(current._scrollReset).toEqual(end._scrollReset);
      expect(fixture.container.scrollTop).toBe(placement);
      expect(read.observed.initialSignal?.aborted).toBe(true);
      expect(read.observed.initialRequests).toBe(1);
    } finally {
      await act(async () => { read.release(); await read.pending; await fixture.finishSeek(); });
    }
  });

  it("Home after pending End does not present the previous order as the new first page", async () => {
    const fixture = await mountNavigation(true, "none", 12000, "-credit");
    const previous = useSearchStore.getState().results.map(image => image?.id);
    const read = holdInitialRead(fixture, transport, "abort-aware", "credit", true);
    try {
      await act(async () => { fixture.dispatchKey("End"); });
      expect(read.observed.endRequests).toBe(1);
      act(() => fixture.dispatchKey("Home"));
      await act(async () => { await fixture.seek.mock.results.at(-1)!.value; });
      const expected = await fixture.source.searchAfter({ nonFree: "true", orderBy: "credit", length: 200 }, null);
      expect(expected.hits.map(image => image.id)).not.toEqual(previous);
      const home = useSearchStore.getState();
      expect(home.results.map(image => image?.id)).toEqual(expected.hits.map(image => image.id));
      expect(read.observed.homeRequests).toBe(1);
      expect(read.observed.endSignal?.aborted).toBe(true);
      expect(home).toMatchObject({ bufferOffset: 0, total: 12000, loading: false, error: null, focusedImageId: null });
      await act(async () => { read.releaseEnd(); read.release(); await fixture.finishSeek(); await read.pending; });
      expect(useSearchStore.getState().results).toBe(home.results);
      expect(fixture.container.scrollTop).toBe(0);
    } finally {
      await act(async () => { read.releaseEnd(); read.release(); await fixture.finishSeek(); await read.pending; });
    }
  });
});

describe("KUP-013 End producer and post-seek consumer", () => {
  for (const windowed of [false, true]) {
    for (const mode of ["explicit", "selection", "phantom", "none"] as const) {
      it(`${windowed ? "windowed" : "resident"} End preserves ${mode} focus policy and reaches the tail`, async () => {
        const fixture = await mountNavigation(windowed, mode);
        await fixture.pressEnd();
        const state = useSearchStore.getState();
        const lastImage = state.results.at(-1)!;
        expect(state.bufferOffset + state.results.length).toBe(state.total);
        expect(fixture.scrollToIndex).toHaveBeenCalledWith(state.total - 1, { align: "end" });
        expect(fixture.container.scrollTop).toBeGreaterThan(0);
        expect(fixture.seek).toHaveBeenCalledTimes(windowed ? 1 : 0);
        expect(state._pendingFocusAfterSeek).toBeNull();
        expect(state.focusedImageId).toBe(mode === "explicit" ? lastImage.id : mode === "none" ? null : fixture.origin);
        if (mode === "selection") {
          expect(useSelectionStore.getState().selectedIds).toEqual(new Set([fixture.origin]));
          expect(useSelectionStore.getState().anchorId).toBe(fixture.origin);
          act(() => useSelectionStore.getState().clear());
          expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
        }
      });
    }
  }

  for (const mode of ["explicit", "selection", "phantom", "none"] as const) {
    it(`uses buffer-local End coordinates in seek tier with ${mode} focus`, async () => {
      const fixture = await mountNavigation(true, mode, 70000);
      await fixture.pressEnd();
      const state = useSearchStore.getState();
      expect(state.bufferOffset + state.results.length).toBe(70000);
      expect(state._seekTargetGlobalIndex).toBe(-1);
      expect(fixture.scrollToIndex).toHaveBeenCalledWith(state.results.length - 1, { align: "end" });
      expect(state.focusedImageId).toBe(mode === "explicit" ? state.results.at(-1)!.id : mode === "none" ? null : fixture.origin);
      expect(state._pendingFocusAfterSeek).toBeNull();
    });
  }

  for (const startMode of ["selection", "phantom", "none"] as const) {
    it(`does not acquire focus permission when ${startMode} ends during the seek`, async () => {
      const fixture = await mountNavigation(true, startMode);
      const held = fixture.holdRead();
      act(() => fixture.dispatchKey("End"));
      expect(held.read).toHaveBeenCalledOnce();
      act(() => {
        useSelectionStore.getState().clear();
        useUiPrefsStore.getState().setFocusMode("explicit");
        if (startMode === "none") useSearchStore.getState().setFocusedImageId("img-1");
      });
      await act(async () => { held.release(); await fixture.finishSeek(); });
      expect(useSearchStore.getState().focusedImageId).toBe(startMode === "none" ? "img-1" : fixture.origin);
      expect(fixture.scrollToIndex).toHaveBeenCalledWith(11999, { align: "end" });
      expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
    });
  }

  for (const change of ["focus", "clear-focus", "selection", "phantom"] as const) {
    it(`retains newer ${change} intent during an explicit End seek`, async () => {
      const fixture = await mountNavigation(true, "explicit");
      const held = fixture.holdRead();
      act(() => fixture.dispatchKey("End"));
      expect(held.read).toHaveBeenCalledOnce();
      act(() => {
        if (change === "focus") useSearchStore.getState().setFocusedImageId("img-1");
        if (change === "clear-focus") useSearchStore.getState().setFocusedImageId(null);
        if (change === "selection") useSelectionStore.getState().add(["img-1"]);
        if (change === "phantom") useUiPrefsStore.getState().setFocusMode("phantom");
      });
      const expectedFocus = useSearchStore.getState().focusedImageId;
      await act(async () => { held.release(); await fixture.finishSeek(); });
      expect(useSearchStore.getState().focusedImageId).toBe(expectedFocus);
      expect(fixture.scrollToIndex).toHaveBeenCalledWith(11999, { align: "end" });
      expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
    });
  }

  it("does not attach End focus or edge scrolling to a newer seek", async () => {
    const fixture = await mountNavigation(true, "explicit");
    const held = fixture.holdRead();
    act(() => fixture.dispatchKey("End"));
    expect(held.read).toHaveBeenCalledOnce();
    await act(async () => { await useSearchStore.getState().seek(7000); });
    await act(async () => { held.release(); await fixture.finishSeek(); });
    expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
    expect(fixture.scrollToIndex).not.toHaveBeenCalledWith(11999, { align: "end" });
    expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
    expect(useSearchStore.getState()._seekTargetGlobalIndex).toBe(7000);
  });

  it("Home supersedes pending End even while the original first page is still resident", async () => {
    const fixture = await mountNavigation(true, "explicit");
    const held = fixture.holdRead();
    act(() => fixture.dispatchKey("End"));
    expect(held.read).toHaveBeenCalledOnce();
    act(() => fixture.dispatchKey("Home"));
    expect(held.read.mock.calls[0][3]?.aborted).toBe(true);
    expect(held.read).toHaveBeenCalledOnce();
    await act(async () => { held.release(); await fixture.finishSeek(); });
    expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
    expect(useSearchStore.getState().bufferOffset).toBe(0);
    expect(fixture.container.scrollTop).toBe(0);
    expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
  });

  for (const total of [12000, 70000]) {
    for (const mode of ["explicit", "selection", "phantom", "none"] as const) {
      it(`resident End supersedes pending Home with ${mode} focus at total ${total}`, async () => {
        const fixture = await mountNavigation(true, mode, total);
        await fixture.pressEnd();
        const tailState = useSearchStore.getState();
        const expectedFocus = tailState.focusedImageId;
        const expectedScrollIndex = isTwoTierFromTotal(total) ? total - 1 : tailState.results.length - 1;
        const held = fixture.holdRead();

        act(() => fixture.dispatchKey("Home"));
        expect(held.read).toHaveBeenCalledOnce();
        act(() => fixture.dispatchKey("End"));

        expect(held.read.mock.calls[0][3]?.aborted).toBe(true);
        expect(fixture.seek).toHaveBeenCalledTimes(2);
        expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
        expect(useSearchStore.getState().loading).toBe(false);
        expect(useSearchStore.getState().error).toBeNull();
        expect(useSearchStore.getState().focusedImageId).toBe(expectedFocus);
        expect(fixture.scrollToIndex).toHaveBeenLastCalledWith(expectedScrollIndex, { align: "end" });

        await act(async () => { held.release(); await fixture.finishSeek(); });
        expect(useSearchStore.getState().bufferOffset + useSearchStore.getState().results.length).toBe(total);
        expect(useSearchStore.getState().loading).toBe(false);
        expect(useSearchStore.getState().error).toBeNull();
        expect(useSearchStore.getState().focusedImageId).toBe(expectedFocus);
        expect(fixture.scrollToIndex).toHaveBeenLastCalledWith(expectedScrollIndex, { align: "end" });
        expect(fixture.seek).toHaveBeenCalledTimes(2);
      });
    }
  }

  for (const outcome of ["failure", "abort"] as const) {
    it(`discards End focus intent after request ${outcome}`, async () => {
      const fixture = await mountNavigation(true, "explicit");
      if (outcome === "failure") {
        vi.spyOn(fixture.source, "searchAfter").mockRejectedValueOnce(new Error("local read failure"));
        await fixture.pressEnd();
        expect(useSearchStore.getState().error).toBe("local read failure");
      } else {
        const held = fixture.holdRead();
        act(() => fixture.dispatchKey("End"));
        expect(held.read).toHaveBeenCalledOnce();
        act(() => useSearchStore.getState().abortExtends());
        expect(held.read.mock.calls[0][3]?.aborted).toBe(true);
        await act(async () => { held.release(); await fixture.finishSeek(); });
      }
      expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
      expect(fixture.scrollToIndex).not.toHaveBeenCalledWith(11999, { align: "end" });
      expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
      expect(useSearchStore.getState().loading).toBe(false);
    });
  }

  for (const target of ["input", "fullscreen"] as const) {
    it(`does not intercept End from ${target}`, async () => {
      const fixture = await mountNavigation(true, "explicit");
      const input = document.createElement("input");
      fixture.container.appendChild(input);
      if (target === "fullscreen") vi.spyOn(document, "fullscreenElement", "get").mockReturnValue(fixture.container);
      let event!: KeyboardEvent;
      act(() => { event = fixture.dispatchKey("End", target === "input" ? input : fixture.container); });
      expect(event.defaultPrevented).toBe(false);
      expect(fixture.seek).not.toHaveBeenCalled();
      expect(fixture.scrollToIndex).not.toHaveBeenCalled();
    });
  }
});