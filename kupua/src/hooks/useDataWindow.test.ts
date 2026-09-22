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
    expect(seek).toHaveBeenCalledExactlyOnceWith(3000);
  });

  it("ordinary buffer publication and an unrelated consumer unmount preserve valid work", () => {
    const view = renderHook(() => useDataWindow());
    const detail = renderHook(() => useDataWindow());
    act(() => view.result.current.reportVisibleRange(3000, 3020));
    detail.unmount();
    act(() => useSearchStore.setState({ results: [...images], bufferOffset: 1100, loading: false }));
    act(() => vi.advanceTimersByTime(200));
    expect(seek).toHaveBeenCalledExactlyOnceWith(3000);
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
    expect(seek).toHaveBeenCalledExactlyOnceWith(3000);
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
    expect(seek).toHaveBeenCalledExactlyOnceWith(4000);
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
    expect(seek).toHaveBeenCalledExactlyOnceWith(4000);
    timers.mockRestore();
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
