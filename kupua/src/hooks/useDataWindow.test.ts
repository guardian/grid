// @vitest-environment jsdom

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  _updateForwardVelocity,
  _resetForwardVelocity,
  forwardExtendThreshold,
  useDataWindow,
  useVisibleRange,
  resetVisibleRange,
} from "@/hooks/useDataWindow";
import { PAGE_SIZE } from "@/constants/tuning";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";
import { MockDataSource } from "@/dal/mock-data-source";
import type { SearchAfterResult } from "@/dal/types";

describe("KUP-016 indexed seek ownership", () => {
  const initial = useSearchStore.getState();
  const seek = vi.fn().mockResolvedValue(undefined);
  const extendForward = vi.fn().mockResolvedValue(undefined);
  const extendBackward = vi.fn().mockResolvedValue(undefined);
  const images = Array.from({ length: 200 }, (_, index) => ({ id: `image-${index}` }) as Image);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetVisibleRange();
    _resetForwardVelocity();
    useSearchStore.setState({ ...initial, params: { query: "first", orderBy: "-uploadTime" }, results: images,
      total: 5000, bufferOffset: 1000, positionMap: null, seek, extendForward, extendBackward }, true);
  });

  afterEach(() => {
    cleanup();
    resetVisibleRange();
    vi.clearAllTimers();
    vi.useRealTimers();
    useSearchStore.setState(initial, true);
  });

  for (const change of ["query", "order", "reset", "small-tier", "seek-tier", "unmount"] as const) {
    it(`does not dispatch an old global coordinate after ${change}`, () => {
      const view = renderHook(() => useDataWindow());
      act(() => view.result.current.reportVisibleRange(3000, 3020));
      act(() => {
        if (change === "query") useSearchStore.getState().setParams({ query: "newer" });
        if (change === "order") useSearchStore.getState().setParams({ orderBy: "uploadTime" });
        if (change === "reset") resetVisibleRange();
        if (change === "small-tier") useSearchStore.setState({ total: 800 });
        if (change === "seek-tier") useSearchStore.setState({ total: 100000 });
        if (change === "unmount") view.unmount();
      });
      act(() => vi.advanceTimersByTime(200));
      expect(seek).not.toHaveBeenCalled();
    });
  }

  it("seeks exactly once after 200ms without requiring a position map", () => {
    const view = renderHook(() => ({ data: useDataWindow(), visible: useVisibleRange() }));
    act(() => view.result.current.data.reportVisibleRange(3000, 3020));
    expect(view.result.current.visible).toEqual({ start: 3000, end: 3020 });
    expect(view.result.current.data.twoTier).toBe(true);
    expect(view.result.current.data.virtualizerCount).toBe(5000);
    act(() => vi.advanceTimersByTime(199));
    expect(seek).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(seek).toHaveBeenCalledExactlyOnceWith(3000, "seek", undefined, "refill");
  });

  it("ordinary buffer publication and an unrelated consumer unmount preserve valid work", () => {
    const view = renderHook(() => useDataWindow());
    const detail = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(3000, 3020));
    detail.unmount();
    act(() => useSearchStore.setState({ results: [...images], bufferOffset: 1100, loading: false }));
    act(() => vi.advanceTimersByTime(200));
    expect(seek).toHaveBeenCalledExactlyOnceWith(3000, "seek", undefined, "refill");
  });

  it("a new same-query search invalidates the old coordinate before its response", async () => {
    const source = new MockDataSource(0);
    let release!: (result: SearchAfterResult) => void;
    vi.spyOn(source, "searchAfter").mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    useSearchStore.setState({ dataSource: source });
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(3000, 3020));
    let searching!: Promise<void>;
    await act(async () => { searching = useSearchStore.getState().search(); });
    expect(source.searchAfter).toHaveBeenCalled();
    expect(useSearchStore.getState().total).toBe(5000);
    act(() => vi.advanceTimersByTime(200));
    expect(seek).not.toHaveBeenCalled();
    await act(async () => {
      release({ hits: [], total: 0, sortValues: [] });
      await searching;
    });
  });

  it("pagination-only params changes preserve a valid indexed timer", () => {
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(3000, 3020));
    act(() => useSearchStore.getState().setParams({ length: 400 }));
    act(() => vi.advanceTimersByTime(200));
    expect(seek).toHaveBeenCalledExactlyOnceWith(3000, "seek", undefined, "refill");
  });

  it("retains global indexed and buffer-local normal coordinate access", () => {
    const view = renderHook(() => useDataWindow());
    expect(view.result.current.getImage(1005)).toBe(images[5]);
    expect(view.result.current.getImage(5)).toBeUndefined();
    act(() => useSearchStore.setState({ total: 100000 }));
    expect(view.result.current.virtualizerCount).toBe(200);
    expect(view.result.current.getImage(5)).toBe(images[5]);
    expect(view.result.current.getImage(1005)).toBeUndefined();
  });

  it("a newer reporting view retains its timer when the earlier view unmounts", () => {
    const previous = renderHook(() => useDataWindow());
    const current = renderHook(() => useDataWindow());
    act(() => previous.result.current.reportVisibleRange(3000, 3020));
    act(() => current.result.current.reportVisibleRange(4000, 4020));
    previous.unmount();
    act(() => vi.advanceTimersByTime(200));
    expect(seek).toHaveBeenCalledExactlyOnceWith(4000, "seek", undefined, "refill");
  });

  it("returning near the buffer cancels seek but retains forward/backward extension", () => {
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(3000, 3020));
    act(() => view.result.current.reportVisibleRange(1150, 1190));
    act(() => view.result.current.reportVisibleRange(1000, 1020));
    act(() => vi.advanceTimersByTime(200));
    expect(seek).not.toHaveBeenCalled();
    expect(extendForward).toHaveBeenCalled();
    expect(extendBackward).toHaveBeenCalled();
  });

  it("an already-queued obsolete callback cannot dispatch or consume a newer range", () => {
    const timers = vi.spyOn(globalThis, "setTimeout");
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(3000, 3020));
    const obsolete = timers.mock.calls.find((call) => call[1] === 200)![0] as () => void;
    act(() => view.result.current.reportVisibleRange(4000, 4020));
    act(() => obsolete());
    expect(seek).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(seek).toHaveBeenCalledExactlyOnceWith(4000, "seek", undefined, "refill");
    timers.mockRestore();
  });
});

describe("maintenance-safe forward velocity", () => {
  const initial = useSearchStore.getState();
  const extendForward = vi.fn().mockResolvedValue(undefined);
  const extendBackward = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance"] });
    vi.clearAllMocks();
    resetVisibleRange();
    _resetForwardVelocity();
    const results = Array.from({ length: 201 }, (_, index) => ({ id: `image-${index + 200}` }) as Image);
    useSearchStore.setState({ ...initial, results, total: 70000, bufferOffset: 41924,
      extendForward, extendBackward }, true);
  });

  afterEach(() => {
    cleanup();
    resetVisibleRange();
    vi.useRealTimers();
    useSearchStore.setState(initial, true);
  });

  it.each([false, true])("rejects stale-end forward admission after eviction with navigation intent=%s", userInitiated => {
    const view = renderHook(() => ({ data: useDataWindow(), visible: useVisibleRange() }));
    act(() => view.result.current.data.reportVisibleRange(160, 200, userInitiated, undefined, false, false));
    expect(view.result.current.visible).toEqual({ start: 160, end: 200 });
    expect(extendForward).not.toHaveBeenCalled();
    act(() => view.result.current.data.reportVisibleRange(10, 40, false, undefined, true, true));
    expect(extendBackward).toHaveBeenCalledOnce();
    act(() => view.result.current.data.reportVisibleRange(160, 200, false, undefined, true, true));
    expect(extendForward).toHaveBeenCalledOnce();
  });

  it("does not turn a stopped prepend's stale and converged reports into forward demand", () => {
    const view = renderHook(() => ({ data: useDataWindow(), visible: useVisibleRange() }));
    const layout = {};
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current.data.reportVisibleRange(8, 48, true, { scrollTop: 472, viewportHeight: 888, layout }));
    const previous = useSearchStore.getState();
    const prepended = Array.from({ length: 200 }, (_, index) => ({ id: `image-${index}` }) as Image);
    act(() => useSearchStore.setState({ results: [...prepended, ...previous.results],
      bufferOffset: previous.bufferOffset - 200, _lastPrependCount: 200,
      _prependGeneration: previous._prependGeneration + 1 }));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.data.reportVisibleRange(10, 42, false));
    act(() => vi.advanceTimersByTime(60));
    act(() => view.result.current.data.reportVisibleRange(208, 248, false, { scrollTop: 5985, viewportHeight: 888, layout }));
    expect(view.result.current.visible).toEqual({ start: 208, end: 248 });
    expect(extendForward).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(40));
    act(() => view.result.current.data.reportVisibleRange(222, 255, true, { scrollTop: 6285, viewportHeight: 888, layout }));
    expect(extendForward).not.toHaveBeenCalled();
  });

  it.each([true, false])("preserves physical-scroll prediction with navigation intent=%s", userInitiated => {
    const view = renderHook(() => useDataWindow());
    const layout = {};
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current.reportVisibleRange(40, 80, userInitiated, { scrollTop: 1000, viewportHeight: 600, layout }));
    expect(extendForward).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(90, 130, userInitiated, { scrollTop: 2000, viewportHeight: 600, layout }));
    expect(extendForward).toHaveBeenCalledOnce();
  });

  it("rebases a stationary range correction without manufacturing velocity", () => {
    const view = renderHook(() => useDataWindow());
    const layout = {};
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current.reportVisibleRange(10, 40, true, { scrollTop: 500, viewportHeight: 600, layout }));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(100, 140, true, { scrollTop: 500, viewportHeight: 600, layout }));
    expect(extendForward).not.toHaveBeenCalled();
  });

  it("resets prediction when layout changes while input remains active", () => {
    const view = renderHook(() => useDataWindow());
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current.reportVisibleRange(10, 40, true, { scrollTop: 500, viewportHeight: 600, layout: {} }));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(100, 140, true, { scrollTop: 1500, viewportHeight: 600, layout: {} }));
    expect(extendForward).not.toHaveBeenCalled();
  });

  it("keeps base edge admission without a velocity sample", () => {
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(160, 195));
    expect(extendForward).toHaveBeenCalledOnce();
  });

  it.each([false, true])("rejects stale-start backward admission after publication with navigation intent=%s", userInitiated => {
    const view = renderHook(() => ({ data: useDataWindow(), visible: useVisibleRange() }));
    act(() => view.result.current.data.reportVisibleRange(0, 23, userInitiated, undefined, true));
    expect(extendBackward).toHaveBeenCalledOnce();
    const previous = useSearchStore.getState();
    const prepended = Array.from({ length: 198 }, (_, index) => ({ id: `prepended-${index}` }) as Image);
    act(() => useSearchStore.setState({ results: [...prepended, ...previous.results],
      bufferOffset: previous.bufferOffset - 198, _lastPrependCount: 198,
      _prependGeneration: previous._prependGeneration + 1 }));
    act(() => view.result.current.data.reportVisibleRange(30, 53, userInitiated, undefined, false));
    expect(view.result.current.visible).toEqual({ start: 30, end: 53 });
    expect(extendBackward).toHaveBeenCalledOnce();
    act(() => view.result.current.data.reportVisibleRange(228, 251, false, undefined, true));
    expect(extendBackward).toHaveBeenCalledOnce();
    act(() => view.result.current.data.reportVisibleRange(48, 71, false, undefined, true));
    expect(extendBackward).toHaveBeenCalledTimes(2);
  });

  it("retains backward admission for callers without explicit range evidence", () => {
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(0, 23));
    expect(extendBackward).toHaveBeenCalledOnce();
  });

  it("does not apply backward start validity to forward admission", () => {
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(160, 195, false, undefined, false));
    expect(extendForward).toHaveBeenCalledOnce();
  });

  it("retains indexed backward policy when start validity is false", () => {
    useSearchStore.setState({ total: 5000, bufferOffset: 1000 });
    const view = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(1000, 1023, false, undefined, false));
    expect(extendBackward).toHaveBeenCalledOnce();
  });

  it("does not count a taller viewport as forward travel on the next scroll", () => {
    const view = renderHook(() => useDataWindow());
    const layout = {};
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current.reportVisibleRange(90, 108, true,
      { scrollTop: 2880, layout, viewportHeight: 600 }));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(91, 119, true,
      { scrollTop: 2912, layout, viewportHeight: 920 }));
    expect(extendForward).not.toHaveBeenCalled();
  });

  it.each(["results", "offset"] as const)("resets an active sample across a %s publication", publication => {
    const view = renderHook(() => useDataWindow());
    const layout = {};
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current.reportVisibleRange(10, 40, true, { scrollTop: 500, viewportHeight: 600, layout }));
    act(() => {
      const state = useSearchStore.getState();
      useSearchStore.setState(publication === "results" ? { results: [...state.results] }
        : { bufferOffset: state.bufferOffset + 200 });
      vi.advanceTimersByTime(50);
    });
    act(() => view.result.current.reportVisibleRange(100, 140, true, { scrollTop: 1500, viewportHeight: 600, layout }));
    expect(extendForward).not.toHaveBeenCalled();
  });

  it("preserves prediction in indexed coordinates without navigation intent", () => {
    useSearchStore.setState({ total: 5000, bufferOffset: 1000 });
    const view = renderHook(() => useDataWindow());
    const layout = {};
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current.reportVisibleRange(1040, 1080, false, { scrollTop: 30000, viewportHeight: 600, layout }));
    expect(extendForward).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(1090, 1130, false, { scrollTop: 31000, viewportHeight: 600, layout }));
    expect(extendForward).toHaveBeenCalledOnce();
  });

  it("does not share velocity across owners or let old disposal reset the current owner", () => {
    const previous = renderHook(() => useDataWindow());
    const current = renderHook(() => useDataWindow());
    const layout = {};
    act(() => vi.advanceTimersByTime(1000));
    act(() => previous.result.current.reportVisibleRange(10, 40, true, { scrollTop: 500, viewportHeight: 600, layout }));
    act(() => vi.advanceTimersByTime(50));
    act(() => current.result.current.reportVisibleRange(100, 140, true, { scrollTop: 1500, viewportHeight: 600, layout }));
    expect(extendForward).not.toHaveBeenCalled();
    previous.unmount();
    act(() => vi.advanceTimersByTime(50));
    act(() => current.result.current.reportVisibleRange(110, 150, true, { scrollTop: 1700, viewportHeight: 600, layout }));
    expect(extendForward).toHaveBeenCalledOnce();
  });
});

describe("B2 scoped backward admission", () => {
  const initial = useSearchStore.getState();
  const extendBackward = vi.fn().mockResolvedValue(undefined);
  const extendForward = vi.fn().mockResolvedValue(undefined);
  const geometry = {};
  const sample = (scrollTop: number, layout = geometry, viewportHeight = 600) => ({ scrollTop, layout, viewportHeight });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance"] });
    vi.clearAllMocks();
    _resetForwardVelocity();
    resetVisibleRange();
    useSearchStore.setState({ ...initial, total: 70000, bufferOffset: 42000,
      results: Array.from({ length: 600 }, (_, index) => ({ id: `b2-${index}` }) as Image),
      extendBackward, extendForward }, true);
    vi.advanceTimersByTime(1000);
  });

  afterEach(() => {
    cleanup();
    resetVisibleRange();
    vi.useRealTimers();
    useSearchStore.setState(initial, true);
  });

  it.each(["grid", "table"] as const)("%s admits earlier physical backward demand with or without input intent", layout => {
    const view = renderHook(() => useDataWindow(layout));
    act(() => view.result.current.reportVisibleRange(220, 240, true, sample(7000)));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(170, 190, false, sample(5400)));
    expect(extendBackward).toHaveBeenCalledOnce();
    expect(extendForward).not.toHaveBeenCalled();
  });

  it.each([undefined, "justified"] as const)("keeps %s at 50 despite valid backward velocity", layout => {
    const view = renderHook(() => useDataWindow(layout));
    act(() => view.result.current.reportVisibleRange(220, 240, true, sample(7000)));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(170, 190, true, sample(5400)));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => view.result.current.reportVisibleRange(50, 70));
    expect(extendBackward).toHaveBeenCalledOnce();
  });

  it.each(["grid", "table", "justified"] as const)("%s preserves base non-wheel demand without a velocity sample", layout => {
    const view = renderHook(() => useDataWindow(layout));
    act(() => view.result.current.reportVisibleRange(51, 71));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => view.result.current.reportVisibleRange(50, 70));
    expect(extendBackward).toHaveBeenCalledOnce();
  });

  it("caps backward prediction at one page", () => {
    const view = renderHook(() => useDataWindow("grid"));
    act(() => view.result.current.reportVisibleRange(400, 420, true, sample(12000)));
    act(() => vi.advanceTimersByTime(10));
    act(() => view.result.current.reportVisibleRange(PAGE_SIZE + 1, PAGE_SIZE + 21, true, sample(6500)));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10));
    act(() => view.result.current.reportVisibleRange(PAGE_SIZE, PAGE_SIZE + 20, true, sample(6400)));
    expect(extendBackward).toHaveBeenCalledOnce();
  });

  it.each([90, 91])("uses the unsaturated 90-image threshold at start %s", start => {
    const view = renderHook(() => useDataWindow("grid"));
    act(() => view.result.current.reportVisibleRange(start + 25, start + 45, false, sample(4000)));
    act(() => vi.advanceTimersByTime(100));
    act(() => view.result.current.reportVisibleRange(start, start + 20, false, sample(3200)));
    expect(extendBackward).toHaveBeenCalledTimes(start === 90 ? 1 : 0);
  });

  it.each(["grid", "table", "justified"] as const)("%s preserves forward prediction without widening backward demand", layout => {
    const view = renderHook(() => useDataWindow(layout));
    act(() => view.result.current.reportVisibleRange(60, 80, false, sample(2000)));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(100, 120, false, sample(3200)));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => view.result.current.reportVisibleRange(460, 480));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(460, 480, false, sample(15000)));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(510, 530, false, sample(16600)));
    expect(extendForward).toHaveBeenCalledOnce();
  });

  it("keeps predictive demand behind real cooldown, concurrency and newer-seek ownership", async () => {
    const source = new MockDataSource(70000);
    const pending: Promise<void>[] = [];
    let clock = Date.now();
    const date = vi.spyOn(Date, "now").mockImplementation(() => clock);
    let release!: () => void;
    let holdBackward = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const read = source.searchAfter.bind(source);
    const reads = vi.spyOn(source, "searchAfter").mockImplementation(async (...args) => {
      const response = await read(...args);
      if (args[4] && holdBackward) await gate;
      return response;
    });
    useSearchStore.setState({ dataSource: source, extendForward: initial.extendForward,
      extendBackward: () => { const operation = initial.extendBackward(); pending.push(operation); return operation; } });
    const view = renderHook(() => useDataWindow("table"));
    try {
      await act(async () => { await useSearchStore.getState().seek(42000); });
      holdBackward = true;
      reads.mockClear();
      act(() => view.result.current.reportVisibleRange(140, 160, false, sample(4500)));
      act(() => vi.advanceTimersByTime(50));
      act(() => view.result.current.reportVisibleRange(100, 120, false, sample(3200)));
      expect(reads).not.toHaveBeenCalled();
      clock += 2100;
      act(() => vi.advanceTimersByTime(300));
      act(() => view.result.current.reportVisibleRange(140, 160, false, sample(4500)));
      act(() => vi.advanceTimersByTime(50));
      act(() => view.result.current.reportVisibleRange(100, 120, false, sample(3200)));
      expect(useSearchStore.getState()._extendBackwardInFlight).toBe(true);
      act(() => vi.advanceTimersByTime(50));
      act(() => view.result.current.reportVisibleRange(80, 100, false, sample(2600)));
      expect(reads.mock.calls.filter(args => args[4])).toHaveLength(1);
      const signal = reads.mock.calls.find(args => args[4])![3];
      holdBackward = false;
      await act(async () => { await useSearchStore.getState().seek(52000); });
      const destination = useSearchStore.getState().results;
      expect(signal?.aborted).toBe(true);
      await act(async () => { release(); await Promise.all(pending); });
      expect(useSearchStore.getState().results).toBe(destination);
      expect(useSearchStore.getState()._extendBackwardInFlight).toBe(false);
    } finally { release(); await Promise.all(pending); date.mockRestore(); }
  });

  it("rejects an invalid first row even with predictive velocity", () => {
    const view = renderHook(() => useDataWindow("table"));
    act(() => view.result.current.reportVisibleRange(220, 240, true, sample(7000)));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(170, 190, true, sample(5400), false));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => view.result.current.reportVisibleRange(20, 40, false, undefined, false));
    expect(extendBackward).not.toHaveBeenCalled();
  });

  it.each(["results", "offset", "total", "layout", "height", "idle", "maintenance", "stationary"] as const)(
    "drops predictive backward demand across %s discontinuity", discontinuity => {
      const view = renderHook(() => useDataWindow("grid"));
      act(() => view.result.current.reportVisibleRange(260, 280, true, sample(8000)));
      act(() => vi.advanceTimersByTime(50));
      act(() => view.result.current.reportVisibleRange(210, 230, true, sample(6500)));
      act(() => {
        const state = useSearchStore.getState();
        if (discontinuity === "results") useSearchStore.setState({ results: [...state.results] });
        if (discontinuity === "offset") useSearchStore.setState({ bufferOffset: state.bufferOffset - 200 });
        if (discontinuity === "total") useSearchStore.setState({ total: state.total + 1 });
        if (discontinuity === "maintenance") view.result.current.reportVisibleRange(210, 230);
        vi.advanceTimersByTime(discontinuity === "idle" ? 300 : 50);
      });
      act(() => view.result.current.reportVisibleRange(170, 190, false,
        sample(discontinuity === "stationary" ? 6500 : 5400,
          discontinuity === "layout" ? {} : geometry, discontinuity === "height" ? 900 : 600)));
      expect(extendBackward).not.toHaveBeenCalled();
    });

  it("does not carry backward velocity into a replacement reporting owner", () => {
    const previous = renderHook(() => useDataWindow("grid"));
    act(() => previous.result.current.reportVisibleRange(260, 280, false, sample(8000)));
    act(() => vi.advanceTimersByTime(50));
    act(() => previous.result.current.reportVisibleRange(210, 230, false, sample(6500)));
    const current = renderHook(() => useDataWindow("table"));
    act(() => vi.advanceTimersByTime(50));
    act(() => current.result.current.reportVisibleRange(170, 190, false, sample(5400)));
    expect(extendBackward).not.toHaveBeenCalled();
    previous.unmount();
    act(() => vi.advanceTimersByTime(50));
    act(() => current.result.current.reportVisibleRange(130, 150, false, sample(4000)));
    expect(extendBackward).toHaveBeenCalledOnce();
  });

  it("updates layout policy without leaving a stale callback or carrying velocity into the new layout", () => {
    const view = renderHook(({ layout }: { layout: "grid" | "justified" }) => useDataWindow(layout),
      { initialProps: { layout: "grid" } });
    const report = view.result.current.reportVisibleRange;
    act(() => report(260, 280, true, sample(8000)));
    act(() => vi.advanceTimersByTime(50));
    act(() => report(210, 230, true, sample(6500)));
    view.rerender({ layout: "justified" });
    act(() => vi.advanceTimersByTime(50));
    act(() => report(170, 190, true, sample(5400)));
    expect(extendBackward).not.toHaveBeenCalled();
    view.rerender({ layout: "grid" });
    act(() => vi.advanceTimersByTime(50));
    act(() => report(130, 150, true, sample(4000)));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(50));
    act(() => report(90, 110, true, sample(2700)));
    expect(extendBackward).toHaveBeenCalledOnce();
  });

  it("leaves indexed backward admission at 50", () => {
    useSearchStore.setState({ total: 5000, bufferOffset: 1000 });
    const view = renderHook(() => useDataWindow("table"));
    act(() => view.result.current.reportVisibleRange(1220, 1240, true, sample(39000)));
    act(() => vi.advanceTimersByTime(50));
    act(() => view.result.current.reportVisibleRange(1170, 1190, true, sample(37400)));
    expect(extendBackward).not.toHaveBeenCalled();
    act(() => view.result.current.reportVisibleRange(1049, 1069));
    expect(extendBackward).toHaveBeenCalledOnce();
  });
});

describe("forwardExtendThreshold (velocity-aware)", () => {
  it("returns base threshold (50) at zero velocity", () => {
    expect(forwardExtendThreshold(0)).toBe(50);
  });

  it("returns base threshold for negative (upward) velocity", () => {
    expect(forwardExtendThreshold(-2)).toBe(50);
    expect(forwardExtendThreshold(-100)).toBe(50);
  });

  it("widens linearly with positive velocity", () => {
    // 0.1 items/ms × 400ms lookahead = 40 items ahead → 50 + 40 = 90
    expect(forwardExtendThreshold(0.1)).toBe(90);
    // 0.25 items/ms × 400ms = 100 items ahead → 50 + 100 = 150
    expect(forwardExtendThreshold(0.25)).toBe(150);
  });

  it("caps at PAGE_SIZE (no benefit beyond one fetch in flight)", () => {
    // 10 items/ms is absurdly fast; should clamp to PAGE_SIZE
    expect(forwardExtendThreshold(10)).toBe(PAGE_SIZE);
    expect(forwardExtendThreshold(1000)).toBe(PAGE_SIZE);
  });
});

describe("_updateForwardVelocity (EMA)", () => {
  it("returns 0 on first call (no prevTime)", () => {
    expect(_updateForwardVelocity(100, 1000, 0, 0, 0)).toBe(0);
  });

  it("returns 0 on idle gap > IDLE_RESET_MS (250ms)", () => {
    // dt = 300ms — too long; treat as fresh
    expect(_updateForwardVelocity(200, 1300, 1000, 100, 0.5)).toBe(0);
  });

  it("returns 0 on non-monotonic clock (dt <= 0)", () => {
    expect(_updateForwardVelocity(200, 900, 1000, 100, 0.5)).toBe(0);
    expect(_updateForwardVelocity(200, 1000, 1000, 100, 0.5)).toBe(0);
  });

  it("applies EMA: 0.4 × instant + 0.6 × prevEma", () => {
    // delta = 50 items in 100ms = 0.5 items/ms instant
    // prevEma = 0.1 → result = 0.4 × 0.5 + 0.6 × 0.1 = 0.20 + 0.06 = 0.26
    const v = _updateForwardVelocity(150, 1100, 1000, 100, 0.1);
    expect(v).toBeCloseTo(0.26, 5);
  });

  it("smooths bursty input: spike doesn't dominate after one sample", () => {
    // Steady 0.05 items/ms baseline, then 1.0 spike — EMA still well below 1.0
    let v = 0.05;
    v = _updateForwardVelocity(110, 1100, 1000, 100, v); // steady
    // Spike: +200 items in 100ms = 2.0 items/ms
    v = _updateForwardVelocity(310, 1200, 1100, 110, v);
    expect(v).toBeLessThan(1.0); // tempered by EMA
    expect(v).toBeGreaterThan(0.5); // but still reflects the burst
  });

  it("captures backwards velocity as negative", () => {
    // delta = -50 items in 100ms
    const v = _updateForwardVelocity(50, 1100, 1000, 100, 0);
    expect(v).toBeLessThan(0);
  });
});
