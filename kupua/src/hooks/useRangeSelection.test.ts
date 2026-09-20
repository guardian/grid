/**
 * @vitest-environment jsdom
 */

/**
 * Tests for the in-buffer helper and mounted range-request ownership.
 */

import { cleanup, renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Image } from "@/types/image";
import { MockDataSource } from "@/dal/mock-data-source";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore, _resetMetadataCache, _resetDebounceState, _resetReconcileQueue } from "@/stores/selection-store";
import { useToastStore } from "@/stores/toast-store";
import { RANGE_HARD_CAP, RANGE_SOFT_CAP } from "@/constants/tuning";
import type { AddRangeEffect } from "@/lib/dispatchClickEffects";
import { resolveInBufferRange, useRangeSelection } from "./useRangeSelection";

// ---------------------------------------------------------------------------
// Minimal Image stub
// ---------------------------------------------------------------------------

function makeImage(id: string): Image {
  return { id } as unknown as Image;
}

// ---------------------------------------------------------------------------
// resolveInBufferRange
// ---------------------------------------------------------------------------

describe("resolveInBufferRange", () => {
  it("returns ids in order when anchor < target and all loaded", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
      makeImage("d"),
      makeImage("e"),
    ];
    const ids = resolveInBufferRange(1, 3, 0, results);
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("returns ids in order when target < anchor (reversed range)", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
      makeImage("d"),
      makeImage("e"),
    ];
    // anchor=3, target=1 → min=1, max=3 → same range
    const ids = resolveInBufferRange(3, 1, 0, results);
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("includes single item when anchor === target", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(1, 1, 0, results);
    expect(ids).toEqual(["b"]);
  });

  it("respects bufferOffset — uses global indices", () => {
    const results: (Image | undefined)[] = [
      makeImage("x"),
      makeImage("y"),
      makeImage("z"),
    ];
    // Buffer starts at global index 10. Image "y" is at global 11.
    const ids = resolveInBufferRange(10, 12, 10, results);
    expect(ids).toEqual(["x", "y", "z"]);
  });

  it("returns null when anchor is before buffer start", () => {
    const results: (Image | undefined)[] = [makeImage("a"), makeImage("b")];
    // bufferOffset=5, anchorGlobal=4 (before buffer)
    const ids = resolveInBufferRange(4, 6, 5, results);
    expect(ids).toBeNull();
  });

  it("returns null when target is after buffer end", () => {
    const results: (Image | undefined)[] = [makeImage("a"), makeImage("b")];
    // bufferOffset=0, length=2, targetGlobal=2 (out of range)
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when anchor is after buffer end", () => {
    const results: (Image | undefined)[] = [makeImage("a"), makeImage("b")];
    const ids = resolveInBufferRange(5, 0, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when any item in range is a skeleton (undefined)", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      undefined, // skeleton
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when skeleton is at the start of the range", () => {
    const results: (Image | undefined)[] = [
      undefined,
      makeImage("b"),
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when skeleton is at the end of the range", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      undefined,
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("handles empty results array", () => {
    const ids = resolveInBufferRange(0, 2, 0, []);
    expect(ids).toBeNull();
  });

  it("handles single-item buffer", () => {
    const results: (Image | undefined)[] = [makeImage("solo")];
    const ids = resolveInBufferRange(5, 5, 5, results);
    expect(ids).toEqual(["solo"]);
  });

  it("full range: returns all ids when range spans entire buffer", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Value>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("mounted range ownership", () => {
  let source: MockDataSource;
  let images: Image[];
  const effect: AddRangeEffect = {
    op: "add-range",
    anchorId: "img-0",
    anchorGlobalIndex: 0,
    anchorSortValues: [0, "img-0"],
    targetId: "img-2",
    targetGlobalIndex: 2,
    targetSortValues: [2, "img-2"],
  };
  const completed = { ids: ["img-1", "img-2"], walked: 2, truncated: false };

  beforeEach(async () => {
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 0));
    source = new MockDataSource(10);
    images = await source.getByIds(["img-0", "img-1", "img-2", "img-3", "img-4"]);
    useSearchStore.setState(useSearchStore.getInitialState());
    useSearchStore.setState({ results: images.slice(1, 3), bufferOffset: 1, total: 10 });
    useSelectionStore.getState().clear();
    _resetMetadataCache();
    useSelectionStore.setState({ dataSource: source, pendingFetchIds: new Set() });
    for (const image of images) useSelectionStore.getState().metadataCache.set(image.id, image);
    useSelectionStore.getState().add(["img-0"]);
    useSelectionStore.getState().setAnchor("img-0");
    useToastStore.setState({ queue: [] });
  });

  afterEach(() => {
    cleanup();
    useSelectionStore.getState().clear();
    _resetReconcileQueue();
    _resetDebounceState();
    useToastStore.getState().queue.forEach(toast => useToastStore.getState().dismiss(toast.id));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["add", "remove"] as const)("publishes a current %s walk with inclusive target and unchanged anchor", async (polarity) => {
    if (polarity === "remove") {
      useSelectionStore.getState().add(["img-1", "img-2", "img-3"]);
      useSelectionStore.getState().remove(["img-0"]);
      useSelectionStore.getState().setAnchor("img-0");
    }
    const response = deferred<typeof completed>();
    const walk = vi.spyOn(source, "getIdRange").mockReturnValue(response.promise);
    const metadata = vi.spyOn(source, "getByIds");
    const { result } = renderHook(() => useRangeSelection());
    const pending = result.current({ ...effect, targetGlobalIndex: -1 });
    expect(useSelectionStore.getState().isRangeWalking).toBe(true);
    expect(walk).toHaveBeenCalledExactlyOnceWith(useSearchStore.getState().params, effect.targetSortValues, effect.anchorSortValues, expect.any(AbortSignal));
    response.resolve({ ...completed, ids: ["img-1", "img-1"] });
    await pending;

    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(polarity === "add" ? ["img-0", "img-1", "img-2"] : ["img-3"]));
    expect(useSelectionStore.getState().anchorId).toBe("img-0");
    expect(useSelectionStore.getState().isRangeWalking).toBe(false);
    expect(useSelectionStore.getState().rangeWalkTime).toEqual(expect.any(Number));
    expect(metadata).not.toHaveBeenCalled();
    expect(useToastStore.getState().queue).toEqual([]);
  });

  it.each(
    (["clear", "add", "remove", "toggle", "anchor", "query", "order", "filter", "unmount"] as const)
      .flatMap(change => ["add", "remove"].map(polarity => ({ change, polarity }))),
  )("cancels $polarity publication and busy state on $change without clearing newer membership", async ({ change, polarity }) => {
    if (polarity === "remove") {
      useSelectionStore.getState().add(["img-1", "img-2"]);
      useSelectionStore.getState().remove(["img-0"]);
      useSelectionStore.getState().setAnchor("img-0");
    }
    const response = deferred<typeof completed>();
    const walk = vi.spyOn(source, "getIdRange").mockReturnValue(response.promise);
    const { result, unmount } = renderHook(() => useRangeSelection());
    const pending = result.current(effect);
    const signal = walk.mock.calls[0][3]!;
    expect(signal.aborted).toBe(false);
    expect(useSelectionStore.getState().isRangeWalking).toBe(true);

    if (change === "clear") useSelectionStore.getState().clear();
    if (change === "add") useSelectionStore.getState().add(["img-3"]);
    if (change === "remove") useSelectionStore.getState().remove([polarity === "add" ? "img-0" : "img-1"]);
    if (change === "toggle") useSelectionStore.getState().toggle("img-3");
    if (change === "anchor") useSelectionStore.getState().setAnchor("img-3");
    if (change === "query") useSearchStore.getState().setParams({ query: "new query" });
    if (change === "order") useSearchStore.getState().setParams({ orderBy: "uploadTime" });
    if (change === "filter") useSearchStore.getState().setParams({ nonFree: "false" });
    if (change === "unmount") unmount();
    const current = useSelectionStore.getState();
    response.resolve(completed);
    await pending;

    expect.soft(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect.soft(current.isRangeWalking).toBe(false);
    expect.soft(useSelectionStore.getState().rangeWalkTime).toBeNull();
    expect(useSelectionStore.getState().anchorId).toBe(current.anchorId);
    expect(signal.aborted).toBe(true);
    expect(walk).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().queue).toEqual([]);
  });

  it.each(["success", "failure"] as const)("keeps the successor busy when a superseded walk settles with %s", async (outcome) => {
    const first = deferred<typeof completed>();
    const second = deferred<typeof completed>();
    const walk = vi.spyOn(source, "getIdRange").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRangeSelection());
    const initial = useSelectionStore.getState().selectedIds;
    const obsolete = result.current(effect);
    const current = result.current({ ...effect, targetId: "img-4", targetGlobalIndex: 4, targetSortValues: [4, "img-4"] });
    expect(walk.mock.calls[0][3]?.aborted).toBe(true);
    if (outcome === "failure") first.reject(new Error("obsolete failure"));
    else first.resolve(completed);
    await obsolete;

    expect.soft(useSelectionStore.getState().isRangeWalking).toBe(true);
    expect(useSelectionStore.getState().rangeWalkTime).toBeNull();
    expect(useSelectionStore.getState().selectedIds).toBe(initial);
    expect(useToastStore.getState().queue).toEqual([]);
    second.resolve({ ...completed, ids: ["img-3", "img-4"] });
    await current;
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-3", "img-4"]));
    expect(useSelectionStore.getState().isRangeWalking).toBe(false);
  });

  it("does not erase a successor's completed timing on stale rejection", async () => {
    const first = deferred<typeof completed>();
    vi.spyOn(source, "getIdRange").mockReturnValueOnce(first.promise).mockResolvedValueOnce(completed);
    const { result } = renderHook(() => useRangeSelection());
    const obsolete = result.current(effect);
    await result.current(effect);
    const current = useSelectionStore.getState();
    expect(current.rangeWalkTime).toEqual(expect.any(Number));
    first.reject(new Error("late obsolete failure"));
    await obsolete;
    expect(useSelectionStore.getState().rangeWalkTime).toBe(current.rangeWalkTime);
    expect(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect(useToastStore.getState().queue).toEqual([]);
  });

  it.each(["buffer", "missing anchor"] as const)("retires a server walk on %s takeover", async (takeover) => {
    const response = deferred<typeof completed>();
    const walk = vi.spyOn(source, "getIdRange").mockReturnValue(response.promise);
    const { result } = renderHook(() => useRangeSelection());
    const obsolete = result.current(effect);
    if (takeover === "buffer") {
      useSearchStore.setState({ results: images, bufferOffset: 0 });
      const current = result.current(effect);
      expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-1", "img-2"]));
      await current;
    } else {
      await result.current({ ...effect, anchorId: "missing", anchorSortValues: null, anchorGlobalIndex: null });
    }
    expect.soft(useSelectionStore.getState().isRangeWalking).toBe(false);
    expect(useSelectionStore.getState().rangeWalkTime).toBeNull();
    const current = useSelectionStore.getState();
    response.resolve({ ...completed, ids: ["img-4"], truncated: true });
    await obsolete;
    expect(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect(walk).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().queue).toHaveLength(takeover === "buffer" ? 0 : 1);
  });

  it.each(["current", "clear", "query", "unmount", "abort"] as const)("handles %s rejection without stale publication or feedback", async (context) => {
    const response = deferred<typeof completed>();
    vi.spyOn(source, "getIdRange").mockReturnValue(response.promise);
    const { result, unmount } = renderHook(() => useRangeSelection());
    const pending = result.current(effect);
    if (context === "clear") useSelectionStore.getState().clear();
    if (context === "query") useSearchStore.getState().setParams({ query: "replacement" });
    if (context === "unmount") unmount();
    const current = useSelectionStore.getState();
    response.reject(context === "abort" ? Object.assign(new Error("aborted"), { name: "AbortError" }) : new Error("fixture failure"));
    await pending;
    expect(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect(useSelectionStore.getState().isRangeWalking).toBe(false);
    expect(useSelectionStore.getState().rangeWalkTime).toBeNull();
    expect(useToastStore.getState().queue.map(toast => toast.category)).toEqual(context === "current" ? ["error"] : []);
  });

  it("preserves a walk through metadata, no-op membership, display and buffer changes", async () => {
    const response = deferred<typeof completed>();
    const walk = vi.spyOn(source, "getIdRange").mockReturnValue(response.promise);
    const { result, rerender } = renderHook(() => useRangeSelection());
    const pending = result.current(effect);
    const initial = useSelectionStore.getState();
    initial.add(["img-0"]);
    initial.remove(["absent"]);
    initial.setAnchor("img-0");
    await initial.ensureMetadata(["img-9"]);
    await useSelectionStore.getState().hydrate();
    const params = { ...useSearchStore.getState().params, image: "img-1", density: "table", offset: 20, length: 10 };
    useSearchStore.setState({ params, results: images.slice(3), bufferOffset: 3, focusedImageId: "img-3" });
    rerender();
    expect(useSelectionStore.getState().selectedIds).toBe(initial.selectedIds);
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(initial.generationCounter);
    expect(useSelectionStore.getState().metadataRevision).toBeGreaterThan(initial.metadataRevision);
    expect(walk.mock.calls[0][3]?.aborted).toBe(false);
    expect(useSelectionStore.getState().isRangeWalking).toBe(true);
    response.resolve(completed);
    await pending;
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-1", "img-2"]));
    expect(walk).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])("preserves unknown-direction retry for walked=%s", async (walked) => {
    const walk = vi.spyOn(source, "getIdRange").mockResolvedValueOnce({ ids: [], walked, truncated: false }).mockResolvedValueOnce(completed);
    const { result } = renderHook(() => useRangeSelection());
    await result.current({ ...effect, anchorGlobalIndex: null });
    expect(walk).toHaveBeenCalledTimes(walked === 0 ? 2 : 1);
    if (walked === 0) {
      expect(walk.mock.calls[1].slice(1, 3)).toEqual([effect.targetSortValues, effect.anchorSortValues]);
      expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-1", "img-2"]));
    } else {
      expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-2"]));
    }
  });

  it("guards cancellation while the existing reverse retry is pending", async () => {
    const response = deferred<typeof completed>();
    const walk = vi.spyOn(source, "getIdRange").mockResolvedValueOnce({ ids: [], walked: 0, truncated: false }).mockReturnValueOnce(response.promise);
    const { result } = renderHook(() => useRangeSelection());
    const pending = result.current({ ...effect, anchorGlobalIndex: null });
    await vi.waitFor(() => expect(walk).toHaveBeenCalledTimes(2));
    useSelectionStore.getState().clear();
    response.resolve(completed);
    await pending;
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect(useSelectionStore.getState().rangeWalkTime).toBeNull();
    expect(walk.mock.calls[1][3]?.aborted).toBe(true);
  });

  it.each(["hard", "soft"] as const)("preserves %s cap feedback", async (cap) => {
    const ids = cap === "hard" ? ["img-1"] : Array.from({ length: RANGE_SOFT_CAP }, (_, index) => `range-${index}`);
    vi.spyOn(source, "getIdRange").mockResolvedValue({ ids, walked: ids.length, truncated: cap === "hard" });
    vi.spyOn(source, "getByIds").mockResolvedValue([]);
    const { result } = renderHook(() => useRangeSelection());
    await result.current(effect);
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-2", ...ids]));
    expect(useToastStore.getState().queue.map(toast => toast.message)).toEqual([
      cap === "hard" ? `Selection was limited to ${RANGE_HARD_CAP.toLocaleString()} images.` : `Added ${(RANGE_SOFT_CAP + 1).toLocaleString()} images to your selection.`,
    ]);
  });

  it.each(["success", "failure", "unmount"] as const)("releases both store subscriptions after %s", async (outcome) => {
    const subscribeSelection = useSelectionStore.subscribe;
    const subscribeSearch = useSearchStore.subscribe;
    const releaseSelection = vi.fn();
    const releaseSearch = vi.fn();
    vi.spyOn(useSelectionStore, "subscribe").mockImplementation(listener => {
      const unsubscribe = subscribeSelection(listener);
      return () => { releaseSelection(); unsubscribe(); };
    });
    vi.spyOn(useSearchStore, "subscribe").mockImplementation(listener => {
      const unsubscribe = subscribeSearch(listener);
      return () => { releaseSearch(); unsubscribe(); };
    });
    const response = deferred<typeof completed>();
    const walk = vi.spyOn(source, "getIdRange").mockReturnValue(response.promise);
    const { result, unmount } = renderHook(() => useRangeSelection());
    const pending = result.current(effect);
    if (outcome === "unmount") unmount();
    if (outcome === "failure") response.reject(new Error("fixture failure"));
    else response.resolve(completed);
    await pending;
    expect(releaseSelection).toHaveBeenCalledTimes(1);
    expect(releaseSearch).toHaveBeenCalledTimes(1);
    useSelectionStore.getState().clear();
    useSearchStore.getState().setParams({ query: "after settlement" });
    expect(walk.mock.calls[0][3]?.aborted).toBe(outcome === "unmount");
  });
});
