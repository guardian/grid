// @vitest-environment jsdom

import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
const anchor = vi.hoisted(() => ({ viewportId: null as string | null }));
vi.mock("@tanstack/react-router", () => ({ useSearch: () => routeParams }));
vi.mock("@/hooks/useDataWindow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useDataWindow")>()),
  getViewportAnchorId: () => anchor.viewportId,
}));

import { useSearchStore } from "@/stores/search-store";
import { ApiDataSource } from "@/dal/api-data-source";
import { ElasticsearchDataSource } from "@/dal/es-adapter";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import type { Image } from "@/types/image";
import { clearDensityFocusRatio, useScrollEffects, type ScrollGeometry } from "./useScrollEffects";

const routeParams = { nonFree: "true" };
const initialState = useSearchStore.getState();
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const table: ScrollGeometry = { columns: 1, rowHeight: 32, headerOffset: 36, preserveScrollLeftOnSort: true };
const grid: ScrollGeometry = { columns: 4, rowHeight: 303, headerOffset: 0, preserveScrollLeftOnSort: false, minCellWidth: 280 };

beforeEach(() => {
  vi.useFakeTimers();
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
});

function frame() {
  act(() => {
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) callback(performance.now());
  });
}

function mountDensity(initialGeometry: ScrollGeometry, strict = false) {
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
    scrollToIndex, scrollToOffset: vi.fn(), measure: vi.fn(), getVirtualItems: () => [] } as unknown as Virtualizer<HTMLDivElement, Element>;
  const reportVisibleRange = vi.fn();
  const loadMore = vi.fn().mockResolvedValue(undefined);
  const findImageIndex = (imageId: string) => {
    const state = useSearchStore.getState();
    return (state.imagePositions.get(imageId) ?? -1) - (isTwoTierFromTotal(state.total) ? 0 : state.bufferOffset);
  };
  const view = renderHook((props: { geometry: ScrollGeometry }) => {
    const state = useSearchStore();
    geometry = props.geometry;
    const twoTier = isTwoTierFromTotal(state.total);
    virtualizer.options.count = Math.ceil((twoTier ? state.total : state.results.length) / geometry.columns);
    useScrollEffects({ virtualizer, parentRef, geometry, reportVisibleRange, loadMore,
      resultsLength: state.results.length, total: state.total, bufferOffset: state.bufferOffset,
      focusedImageId: state.focusedImageId, findImageIndex, twoTier });
  }, { initialProps: { geometry }, wrapper: strict ? StrictMode : undefined });
  return { ...view, container, dimensions, scrollToIndex,
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
        useSearchStore.setState({ dataSource, pitId: null, focusedImageId: focused ? "image-400" : null,
          params: { query: 'keyword:"B8 pending"', orderBy: "uploadTime", nonFree: "true" } });
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
        const source = mountDensity(sourceGeometry);
        frame();
        frame();
        source.container.scrollTop = 1000;
        const abortExtends = vi.spyOn(useSearchStore.getState(), "abortExtends");
        let pending!: Promise<void>;
        act(() => { pending = useSearchStore.getState().search(focused ? "image-400" : null, { sortOnly: true }); });
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
            expect(abortExtends).toHaveBeenCalled();
            expect(frames.size).toBe(1);
            frame();
            frame();
          } else {
            expect(abortExtends).not.toHaveBeenCalled();
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
        } finally {
          await act(async () => { release(); await pending; });
        }
      });
    }
  }
});