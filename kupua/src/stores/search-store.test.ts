/**
 * Integration tests for search-store.ts — the core state machine.
 *
 * Uses a MockDataSource (no real ES) to validate:
 * - Buffer management (seek, extend, eviction)
 * - imagePositions consistency (global→local index translation)
 * - Sort-around-focus lifecycle
 * - Seek generation and target index
 * - Backward extend scroll compensation
 *
 * These tests would have caught the bugs we spent hours debugging:
 * - FocusedImageMetadata using global index as array index
 * - Density switch saving wrong viewport ratio
 * - Scroll position not resetting after seek
 * - Sort-around-focus hanging forever
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useSearchStore } from "./search-store";
import { useEnrichmentStore } from "./enrichment-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { TABLE_ROW_HEIGHT } from "@/constants/layout";
import { buildSearchKey, getRetainedSortValues } from "@/lib/image-offset-cache";
import { getScrollGeometry, registerScrollGeometry } from "@/lib/scroll-geometry-ref";
import type { SortDistribution } from "@/dal/types";
import type {
  SearchParams,
  AggregationRequest,
  AggregationsResult,
  FilterAggRequest,
  UsageFilterAggRequest,
  SearchAfterResult,
  SortValues,
} from "@/dal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the store state imperatively. */
const state = () => useSearchStore.getState();

/** Shorthand for store actions. */
const actions = () => useSearchStore.getState();

/**
 * Wait for all pending microtasks to flush.
 * Needed because store actions are async.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Wait past the longest cooldown (2000ms from search, 500ms from seek)
 * so extends aren't suppressed. The cooldown is a module-level var in
 * search-store — persists across tests. Bumped from 550→2100 after
 * 8720085a1 added a 2s cooldown inside search() for buffer corruption fix.
 */
const waitPastCooldown = () => new Promise((r) => setTimeout(r, 2100));

/**
 * Wait for a condition to become true, with a timeout.
 * Polls every 10ms. Useful for async operations like sort-around-focus.
 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
  label = "condition",
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor("${label}") timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * Assert that imagePositions is consistent with the buffer.
 * Every image in the buffer should have a correct global index.
 */
function assertPositionsConsistent(label?: string) {
  const { results, bufferOffset, imagePositions } = state();
  const prefix = label ? `[${label}] ` : "";

  for (let i = 0; i < results.length; i++) {
    const img = results[i];
    if (!img) continue;
    const globalIdx = imagePositions.get(img.id);
    expect(globalIdx, `${prefix}imagePositions for ${img.id}`).toBe(bufferOffset + i);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mock: MockDataSource;

beforeEach(() => {
  // Reset the store to initial state
  mock = new MockDataSource(10_000);
  useEnrichmentStore.getState().setEnrichment(new Map());

  // Inject mock data source and reset state
  useSearchStore.setState({
    dataSource: mock,
    results: [],
    bufferOffset: 0,
    total: 0,
    loading: false,
    error: null,
    imagePositions: new Map(),
    startCursor: null,
    endCursor: null,
    pitId: null,
    focusedImageId: null,
    sortAroundFocusStatus: null,
    sortAroundFocusGeneration: 0,
    _extendForwardInFlight: false,
    _extendBackwardInFlight: false,
    _lastPrependCount: 0,
    _prependGeneration: 0,
    _seekGeneration: 0,
    _seekTargetLocalIndex: -1,
    aggregations: null,
    aggLoading: false,
    aggCircuitOpen: false,
    _aggCacheKey: null,
    params: {
      query: undefined,
      offset: 0,
      length: 200,
      orderBy: "-uploadTime",
      nonFree: "true",
    },
  });
});

describe("Q1 — distribution request ownership", () => {
  function distribution(key: string): SortDistribution {
    return { buckets: [{ key, count: 20, startPosition: 0 }], coveredCount: 20 };
  }

  function deferredDistribution() {
    let resolve!: (value: SortDistribution | null) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<SortDistribution | null>((resolveValue, rejectValue) => {
      resolve = resolveValue;
      reject = rejectValue;
    });
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    useSearchStore.setState({
      params: { ...state().params, query: "distribution-fixture", orderBy: "-credit" },
      total: 100,
      sortDistribution: distribution("initial"),
      nullZoneDistribution: null,
      _sortDistCacheKey: null,
      _nullZoneDistCacheKey: null,
    });
  });

  it.each(["keyword", "date", "null-zone"] as const)("shares pending work and completion for %s", async (kind) => {
    if (kind === "date") useSearchStore.setState({ params: { ...state().params, orderBy: "-uploadTime" } });
    const work = deferredDistribution();
    const request = kind === "keyword"
      ? vi.spyOn(mock, "getKeywordDistribution").mockReturnValue(work.promise)
      : vi.spyOn(mock, "getDateDistribution").mockReturnValue(work.promise);
    const fetchDistribution = kind === "null-zone" ? actions().fetchNullZoneDistribution : actions().fetchSortDistribution;
    const first = fetchDistribution();
    const second = fetchDistribution();
    let secondSettled = false;
    void second.then(() => { secondSettled = true; });
    try {
      await flush();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][3]?.aborted).toBe(false);
      expect(secondSettled).toBe(false);
      const result = distribution("shared");
      work.resolve(result);
      await Promise.all([first, second]);
      expect(secondSettled).toBe(true);
      expect(kind === "null-zone" ? state().nullZoneDistribution : state().sortDistribution).toEqual(result);
      await fetchDistribution();
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      work.resolve(null);
      await Promise.allSettled([first, second]);
    }
  });

  it("separates completed null-zone distributions by missing field", async () => {
    const credit = distribution("credit-missing");
    const source = distribution("source-missing");
    const request = vi.spyOn(mock, "getDateDistribution")
      .mockResolvedValueOnce(credit)
      .mockResolvedValueOnce(source);
    await actions().fetchNullZoneDistribution();
    useSearchStore.setState({ params: { ...state().params, orderBy: "-source" } });
    await actions().fetchNullZoneDistribution();

    expect(request.mock.calls.map(call => call[4])).toEqual(["metadata.credit", "metadata.source"]);
    expect(state().nullZoneDistribution).toEqual(source);
  });

  it.each(["primary", "null-zone"] as const)("rejects stale A-to-B-to-A publication without clearing newer %s work", async (kind) => {
    const oldWork = deferredDistribution();
    const middleWork = deferredDistribution();
    const newWork = deferredDistribution();
    const request = kind === "primary"
      ? vi.spyOn(mock, "getKeywordDistribution")
      : vi.spyOn(mock, "getDateDistribution");
    request.mockReturnValueOnce(oldWork.promise).mockReturnValueOnce(middleWork.promise).mockReturnValueOnce(newWork.promise);
    const fetchDistribution = kind === "primary" ? actions().fetchSortDistribution : actions().fetchNullZoneDistribution;
    const readDistribution = () => kind === "primary" ? state().sortDistribution : state().nullZoneDistribution;
    const initial = readDistribution();
    const pending: Promise<void>[] = [];
    try {
      pending.push(fetchDistribution());
      await flush();
      useSearchStore.setState({ params: { ...state().params, query: "distribution-other" } });
      pending.push(fetchDistribution());
      await flush();
      useSearchStore.setState({ params: { ...state().params, query: "distribution-fixture" } });
      pending.push(fetchDistribution());
      await flush();
      expect(request).toHaveBeenCalledTimes(3);
      expect(request.mock.calls[0][3]?.aborted).toBe(true);
      expect(request.mock.calls[1][3]?.aborted).toBe(true);
      expect(request.mock.calls[2][3]?.aborted).toBe(false);

      oldWork.resolve(distribution("stale-a"));
      await pending[0];
      expect(readDistribution()).toEqual(initial);
      pending.push(fetchDistribution());
      await flush();
      expect(request).toHaveBeenCalledTimes(3);
      middleWork.resolve(distribution("stale-b"));
      await pending[1];
      expect(readDistribution()).toEqual(initial);
      const latest = distribution("current-a");
      newWork.resolve(latest);
      await Promise.all(pending);
      expect(readDistribution()).toEqual(latest);
    } finally {
      oldWork.resolve(null);
      middleWork.resolve(null);
      newWork.resolve(null);
      await Promise.allSettled(pending);
    }
  });

  it.each(["primary", "null-zone"] as const)("retries rejected %s work without retaining a failed cache entry", async (kind) => {
    const work = deferredDistribution();
    const result = distribution("retried");
    const request = kind === "primary"
      ? vi.spyOn(mock, "getKeywordDistribution")
      : vi.spyOn(mock, "getDateDistribution");
    request.mockReturnValueOnce(work.promise).mockResolvedValueOnce(result);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchDistribution = kind === "primary" ? actions().fetchSortDistribution : actions().fetchNullZoneDistribution;
    const first = fetchDistribution();
    const second = fetchDistribution();
    try {
      await flush();
      expect(request).toHaveBeenCalledTimes(1);
      work.reject(new Error("fixture distribution unavailable"));
      await Promise.all([first, second]);
      expect(kind === "primary" ? state()._sortDistCacheKey : state()._nullZoneDistCacheKey).toBeNull();
      await fetchDistribution();
      expect(request).toHaveBeenCalledTimes(2);
      expect(kind === "primary" ? state().sortDistribution : state().nullZoneDistribution).toEqual(result);
      await fetchDistribution();
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      work.resolve(null);
      await Promise.allSettled([first, second]);
      warning.mockRestore();
    }
  });

  it.each(["primary", "null-zone"] as const)("preserves completed null-response behavior for %s", async (kind) => {
    const request = kind === "primary"
      ? vi.spyOn(mock, "getKeywordDistribution").mockResolvedValue(null)
      : vi.spyOn(mock, "getDateDistribution").mockResolvedValue(null);
    const fetchDistribution = kind === "primary" ? actions().fetchSortDistribution : actions().fetchNullZoneDistribution;
    await fetchDistribution();
    await fetchDistribution();
    expect(request).toHaveBeenCalledTimes(kind === "primary" ? 1 : 2);
    expect(kind === "primary" ? state().sortDistribution : state().nullZoneDistribution).toBeNull();
  });

  it.each(["primary", "null-zone"] as const)("starts fresh %s work after same-query search invalidation", async (kind) => {
    const oldWork = deferredDistribution();
    const newWork = deferredDistribution();
    const request = kind === "primary"
      ? vi.spyOn(mock, "getKeywordDistribution")
      : vi.spyOn(mock, "getDateDistribution");
    request.mockReturnValueOnce(oldWork.promise).mockReturnValueOnce(newWork.promise);
    const fetchDistribution = kind === "primary" ? actions().fetchSortDistribution : actions().fetchNullZoneDistribution;
    const pending: Promise<void>[] = [];
    try {
      pending.push(fetchDistribution());
      await flush();
      await actions().search();
      expect(request.mock.calls[0][3]?.aborted).toBe(true);
      const initial = distribution("after-search");
      useSearchStore.setState({ total: 100, sortDistribution: initial, nullZoneDistribution: null });
      pending.push(fetchDistribution());
      await flush();
      expect(request).toHaveBeenCalledTimes(2);
      oldWork.resolve(distribution("stale-search"));
      await pending[0];
      expect(kind === "primary" ? state().sortDistribution : state().nullZoneDistribution).toEqual(kind === "primary" ? initial : null);
      pending.push(fetchDistribution());
      await flush();
      expect(request).toHaveBeenCalledTimes(2);
      const current = distribution("fresh-search");
      newWork.resolve(current);
      await Promise.all(pending);
      expect(kind === "primary" ? state().sortDistribution : state().nullZoneDistribution).toEqual(current);
    } finally {
      oldWork.resolve(null);
      newWork.resolve(null);
      await Promise.allSettled(pending);
    }
  });

  it.each(["primary", "null-zone"] as const)("does not dispatch %s work cancelled before its first microtask", async (kind) => {
    const request = kind === "primary"
      ? vi.spyOn(mock, "getKeywordDistribution").mockResolvedValue(distribution("cancelled"))
      : vi.spyOn(mock, "getDateDistribution").mockResolvedValue(distribution("cancelled"));
    const fetchDistribution = kind === "primary" ? actions().fetchSortDistribution : actions().fetchNullZoneDistribution;
    const pending = fetchDistribution();
    await actions().search();
    await pending;
    expect(request).not.toHaveBeenCalled();
    expect(state().sortDistribution).toBeNull();
    expect(state().nullZoneDistribution).toBeNull();
  });

  it.each([
    { label: "missing field", from: "-credit", to: "-source" },
    { label: "date direction", from: "-taken", to: "taken" },
  ])("supersedes pending null-zone work when $label changes", async ({ from, to }) => {
    const oldWork = deferredDistribution();
    const newWork = deferredDistribution();
    const request = vi.spyOn(mock, "getDateDistribution")
      .mockReturnValueOnce(oldWork.promise)
      .mockReturnValueOnce(newWork.promise);
    const pending: Promise<void>[] = [];
    try {
      useSearchStore.setState({ params: { ...state().params, orderBy: from } });
      pending.push(actions().fetchNullZoneDistribution());
      await flush();
      useSearchStore.setState({ params: { ...state().params, orderBy: to } });
      pending.push(actions().fetchNullZoneDistribution());
      await flush();
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[0][3]?.aborted).toBe(true);
      oldWork.resolve(distribution("old-scope"));
      await pending[0];
      expect(state().nullZoneDistribution).toBeNull();
      pending.push(actions().fetchNullZoneDistribution());
      await flush();
      expect(request).toHaveBeenCalledTimes(2);
      const current = distribution("current-scope");
      newWork.resolve(current);
      await Promise.all(pending);
      expect(state().nullZoneDistribution).toEqual(current);
    } finally {
      oldWork.resolve(null);
      newWork.resolve(null);
      await Promise.allSettled(pending);
    }
  });

  it("shares an unchanged null-zone scope across keyword direction changes", async () => {
    const work = deferredDistribution();
    const request = vi.spyOn(mock, "getDateDistribution").mockReturnValue(work.promise);
    const first = actions().fetchNullZoneDistribution();
    useSearchStore.setState({ params: { ...state().params, orderBy: "credit" } });
    const second = actions().fetchNullZoneDistribution();
    try {
      await flush();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][2]).toBe("desc");
      expect(request.mock.calls[0][3]?.aborted).toBe(false);
      expect(request.mock.calls[0][4]).toBe("metadata.credit");
      const result = distribution("shared-null-scope");
      work.resolve(result);
      await Promise.all([first, second]);
      expect(state().nullZoneDistribution).toEqual(result);
    } finally {
      work.resolve(null);
      await Promise.allSettled([first, second]);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Basic search
// ---------------------------------------------------------------------------

describe("search", () => {
  it("loads first page and sets cursors", async () => {
    await actions().search();

    expect(state().results.length).toBe(200);
    expect(state().bufferOffset).toBe(0);
    expect(state().total).toBe(10_000);
    expect(state().startCursor).not.toBeNull();
    expect(state().endCursor).not.toBeNull();
    expect(state().loading).toBe(false);
    expect(state().error).toBeNull();
    assertPositionsConsistent("after search");
  });

  it("first image has id img-0", async () => {
    await actions().search();
    expect(state().results[0]?.id).toBe("img-0");
    expect(state().results[199]?.id).toBe("img-199");
  });

  it("imagePositions maps IDs to global indices (offset=0)", async () => {
    await actions().search();
    expect(state().imagePositions.get("img-0")).toBe(0);
    expect(state().imagePositions.get("img-100")).toBe(100);
    expect(state().imagePositions.get("img-199")).toBe(199);
  });
});

// ---------------------------------------------------------------------------
// Tests: imagePositions global→local consistency
// ---------------------------------------------------------------------------

describe("imagePositions — global vs local index", () => {
  it("after seek, global indices are offset by bufferOffset", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, imagePositions, results } = state();
    expect(bufferOffset).toBeGreaterThan(0);

    // Every image in buffer should have globalIdx = bufferOffset + localIdx
    for (let local = 0; local < results.length; local++) {
      const img = results[local];
      if (!img) continue;
      const global = imagePositions.get(img.id);
      expect(global, `local=${local}`).toBe(bufferOffset + local);
    }
  });

  it("findImageIndex equivalent returns correct local index", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, imagePositions, results } = state();
    // Pick an image in the middle of the buffer
    const midLocal = Math.floor(results.length / 2);
    const midImage = results[midLocal];
    expect(midImage).toBeDefined();

    const globalIdx = imagePositions.get(midImage!.id)!;
    expect(globalIdx).toBe(bufferOffset + midLocal);

    // This is the calculation that views must do
    const localIdx = globalIdx - bufferOffset;
    expect(localIdx).toBe(midLocal);
    expect(results[localIdx]?.id).toBe(midImage!.id);
  });

  it("using global index directly as array index is WRONG after seek", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, imagePositions, results } = state();
    const img = results[0];
    expect(img).toBeDefined();

    const globalIdx = imagePositions.get(img!.id)!;
    expect(globalIdx).toBeGreaterThan(0);
    expect(bufferOffset).toBeGreaterThan(0);

    // The bug: using globalIdx directly as array index
    // This would be wrong — globalIdx > results.length
    expect(globalIdx).toBeGreaterThanOrEqual(results.length);
    // results[globalIdx] would be undefined (out of bounds)
    expect(results[globalIdx]).toBeUndefined();

    // Correct way: subtract bufferOffset
    const correctLocal = globalIdx - bufferOffset;
    expect(results[correctLocal]?.id).toBe(img!.id);
  });
});

// ---------------------------------------------------------------------------
// Tests: Seek
// ---------------------------------------------------------------------------

describe("seek", () => {
  it("repositions buffer at target offset", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, results } = state();
    // Buffer should be centered around 5000
    expect(bufferOffset).toBeLessThan(5000);
    expect(bufferOffset + results.length).toBeGreaterThan(5000);
    assertPositionsConsistent("after seek");
  });

  it("bumps _seekGeneration", async () => {
    await actions().search();
    const gen0 = state()._seekGeneration;

    await actions().seek(3000);
    await flush();
    expect(state()._seekGeneration).toBe(gen0 + 1);

    await actions().seek(7000);
    await flush();
    expect(state()._seekGeneration).toBe(gen0 + 2);
  });

  it("sets _seekTargetLocalIndex", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, _seekTargetLocalIndex } = state();
    // Target local index = 5000 - bufferOffset
    expect(_seekTargetLocalIndex).toBe(5000 - bufferOffset);
    expect(_seekTargetLocalIndex).toBeGreaterThanOrEqual(0);
    expect(_seekTargetLocalIndex).toBeLessThan(state().results.length);
  });

  it("seek to position 0 puts buffer at start", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();
    expect(state().bufferOffset).toBeGreaterThan(0);

    await actions().seek(0);
    await flush();
    expect(state().bufferOffset).toBe(0);
    expect(state().results[0]?.id).toBe("img-0");
    assertPositionsConsistent("after seek to 0");
  });

  it("seek to end puts buffer near the end", async () => {
    await actions().search();
    await actions().seek(9999);
    await flush();

    const { bufferOffset, results } = state();
    expect(bufferOffset + results.length).toBe(10_000);
    assertPositionsConsistent("after seek to end");
  });
});

// ---------------------------------------------------------------------------
// Tests: Extend forward
// ---------------------------------------------------------------------------

describe("extendForward", () => {
  it("appends more images and updates cursors", async () => {
    await actions().search();
    await waitPastCooldown(); // ensure no cooldown from prior tests
    const lenBefore = state().results.length;

    await actions().extendForward();
    await flush();

    expect(state().results.length).toBeGreaterThan(lenBefore);
    assertPositionsConsistent("after extendForward");
  });

  it("updates endCursor", async () => {
    await actions().search();
    await waitPastCooldown();
    const cursorBefore = state().endCursor;

    await actions().extendForward();
    await flush();

    expect(state().endCursor).not.toEqual(cursorBefore);
  });
});

// ---------------------------------------------------------------------------
// Tests: Extend backward
// ---------------------------------------------------------------------------

describe("extendBackward", () => {
  it("does nothing when bufferOffset is 0", async () => {
    await actions().search();
    expect(state().bufferOffset).toBe(0);

    await actions().extendBackward();
    await flush();

    // No change — already at the start
    expect(state()._prependGeneration).toBe(0);
  });

  it("prepends images after seek", async () => {
    await actions().search();
    await actions().seek(5000);
    await waitPastCooldown(); // seek sets cooldown — wait for it

    const offsetBefore = state().bufferOffset;
    expect(offsetBefore).toBeGreaterThan(0);
    const genBefore = state()._prependGeneration;

    await actions().extendBackward();
    await flush();

    expect(state().bufferOffset).toBeLessThan(offsetBefore);
    expect(state()._prependGeneration).toBe(genBefore + 1);
    expect(state()._lastPrependCount).toBeGreaterThan(0);
    assertPositionsConsistent("after extendBackward");
  });

  it("bumps prependGeneration for scroll compensation", async () => {
    await actions().search();
    await actions().seek(5000);
    await waitPastCooldown();

    const gen = state()._prependGeneration;
    await actions().extendBackward();
    await flush();

    expect(state()._prependGeneration).toBe(gen + 1);
    expect(state()._lastPrependCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Sort-around-focus
// ---------------------------------------------------------------------------

describe("sort-around-focus", () => {
  it("finds focused image in first page — no seek needed", async () => {
    await actions().search();
    // Focus an image in the first page
    actions().setFocusedImageId("img-50");
    expect(state().focusedImageId).toBe("img-50");

    // Trigger a sort-only search with the focused image
    await actions().search("img-50");
    await flush();

    // Image should be found in the first page
    expect(state().focusedImageId).toBe("img-50");
    expect(state().sortAroundFocusStatus).toBeNull();
  });

  it("seeks to focused image when outside first page", async () => {
    // Use a smaller dataset so it completes quickly
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    actions().setFocusedImageId("img-500");

    const genBefore = state().sortAroundFocusGeneration;

    // Trigger sort-around-focus
    await actions().search("img-500");

    // Wait for the async _findAndFocusImage to complete
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );

    expect(state().focusedImageId).toBe("img-500");
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
  });

  it.each([
    "-usagesDateAdded",
    "usagesDateAdded",
    "-dateAddedToCollection",
    "dateAddedToCollection",
  ])("passes a complete %s cursor to exact rank counting", async (orderBy) => {
    mock = new MockDataSource(1000);
    const countBeforeSpy = vi.spyOn(mock, "countBefore");
    useSearchStore.setState({
      dataSource: mock,
      params: { orderBy, offset: 0, length: 200, nonFree: "true" },
    });

    await actions().search();
    actions().setFocusedImageId("img-500");
    await actions().search("img-500");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "special sort-around-focus completes",
    );

    const call = countBeforeSpy.mock.calls.find(([, cursor]) => cursor[2] === "img-500");
    expect(call?.[0]).toEqual(expect.objectContaining({ orderBy }));
    expect(call?.[1]).toHaveLength(3);
  });

  it("clears status on image not found", async () => {
    await actions().search();
    actions().setFocusedImageId("img-nonexistent");

    await actions().search("img-nonexistent");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      2000,
      "status clears for missing image",
    );

    // Should gracefully degrade — no focused image
    expect(state().sortAroundFocusStatus).toBeNull();
  });

  it("sets Seeking status during async work", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();
    actions().setFocusedImageId("img-500");

    // Start sort-around-focus — don't await
    const promise = actions().search("img-500");

    // Should show Finding/Seeking status at some point
    // (may be too fast to catch with setTimeout, but verify it clears)
    await promise;
    await waitFor(() => state().sortAroundFocusStatus === null, 3000, "status clears");

    expect(state().sortAroundFocusStatus).toBeNull();
    expect(state().focusedImageId).toBe("img-500");
  });

  it("builds correctly centered buffer around focused image", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    actions().setFocusedImageId("img-500");

    await actions().search("img-500");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );

    const { results, bufferOffset, total, imagePositions, startCursor, endCursor, focusedImageId } = state();

    // Buffer is centered around image 500
    expect(focusedImageId).toBe("img-500");
    expect(total).toBe(1000);

    // Target image is present in the buffer
    const targetLocalIdx = results.findIndex((img) => img?.id === "img-500");
    expect(targetLocalIdx).toBeGreaterThanOrEqual(0);

    // imagePositions maps the target to its global offset
    const globalIdx = imagePositions.get("img-500");
    expect(globalIdx).toBeDefined();
    expect(globalIdx).toBe(bufferOffset + targetLocalIdx);

    // Buffer has backward + target + forward hits (approximately PAGE_SIZE)
    // Each direction fetches floor(PAGE_SIZE/2) = 100 items, plus the target = ~201
    expect(results.length).toBeGreaterThanOrEqual(100);
    expect(results.length).toBeLessThanOrEqual(201);

    // Cursors are set (non-null for a mid-buffer position)
    expect(startCursor).not.toBeNull();
    expect(endCursor).not.toBeNull();

    // bufferOffset is correct: target is at global position ~500,
    // backward fetch returns ~100 items before it
    expect(bufferOffset).toBeGreaterThan(0);
    expect(bufferOffset).toBeLessThanOrEqual(500);
    expect(bufferOffset + targetLocalIdx).toBe(globalIdx);

    // Positions map is consistent across the entire buffer
    assertPositionsConsistent("buffer-around-image");
  });
});

// ---------------------------------------------------------------------------
// Tests: Focus survives search context change
// ---------------------------------------------------------------------------

describe("enrichment publication", () => {
  function addEnrichment() {
    const searchAfter = mock.searchAfter.bind(mock);
    return vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await searchAfter(...args);
      const source = args[0].ids ? "target" : args[4] ? "backward" : "forward";
      return {
        ...result,
        enrichment: new Map(result.hits.map((image) => [image.id, { invalidReasons: { source } }])),
      };
    });
  }

  it.each(["focus", "restore"] as const)("publishes the inserted %s target's enrichment", async (mode) => {
    addEnrichment();
    await actions().search();
    const target = await mock.searchAfter({ ...state().params, ids: "img-500", length: 1 }, null);
    expect(useEnrichmentStore.getState().data.has("img-500")).toBe(false);

    if (mode === "focus") {
      await actions().search("img-500");
      await waitFor(() => !state().loading && state().sortAroundFocusStatus === null);
    } else {
      await actions().restoreAroundCursor("img-500", target.sortValues[0], 500);
    }

    expect(state().results.some((image) => image?.id === "img-500")).toBe(true);
    expect(useEnrichmentStore.getState().data.get("img-500")).toEqual({ invalidReasons: { source: "target" } });
    expect(useEnrichmentStore.getState().data.get("img-499")).toEqual({ invalidReasons: { source: "backward" } });
    expect(useEnrichmentStore.getState().data.get("img-501")).toEqual({ invalidReasons: { source: "forward" } });
    assertPositionsConsistent();
  });

  it.each([30_000, 70_000])("publishes backward seek enrichment with %i results", async (total) => {
    mock = new MockDataSource(total);
    useSearchStore.setState({ dataSource: mock });
    const searchAfter = addEnrichment();
    await actions().search();
    if (total === 30_000) await waitFor(() => state().positionMap?.length === total);
    useEnrichmentStore.getState().upsertEnrichment(new Map([["earlier-page", { valid: true }]]));
    searchAfter.mockClear();

    await actions().seek(total / 2);

    const backwardCall = searchAfter.mock.calls.findIndex((args) => args[4] === true);
    expect(backwardCall).toBeGreaterThanOrEqual(0);
    const backward = await searchAfter.mock.results[backwardCall].value;
    const committed = backward.hits.find((image: { id: string }) => state().results.some((hit) => hit?.id === image.id));
    expect(committed).toBeDefined();
    expect(useEnrichmentStore.getState().data.get(committed!.id)).toEqual({ invalidReasons: { source: "backward" } });
    expect(useEnrichmentStore.getState().data.get("earlier-page")).toEqual({ valid: true });
    assertPositionsConsistent();
  });

  it("does not publish a discarded focus probe after a newer search", async () => {
    const searchAfter = mock.searchAfter.bind(mock);
    const target = await searchAfter({ ...state().params, ids: "img-500", length: 1 }, null);
    let resolveProbe!: (result: SearchAfterResult) => void;
    const probe = new Promise<SearchAfterResult>((resolve) => { resolveProbe = resolve; });
    const fetch = vi.spyOn(mock, "searchAfter").mockImplementation((...args) =>
      args[0].ids === "img-500" ? probe : searchAfter(...args));
    await actions().search("img-500");
    await waitFor(() => fetch.mock.calls.some((args) => args[0].ids === "img-500"));

    await actions().search(null);
    resolveProbe({ ...target, enrichment: new Map([["img-500", { valid: false }]]) });
    await flush();

    expect(state().results[0]?.id).toBe("img-0");
    expect(useEnrichmentStore.getState().data.has("img-500")).toBe(false);
  });

  it.each(["focus", "restore", "mapped seek", "deep seek"] as const)("does not publish cancelled %s pages", async (mode) => {
    const total = mode === "deep seek" ? 70_000 : 30_000;
    mock = new MockDataSource(total);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();
    if (total === 30_000) await waitFor(() => state().positionMap?.length === total);
    const searchAfter = mock.searchAfter.bind(mock);
    const target = await searchAfter({ ...state().params, ids: "img-15000", length: 1 }, null);
    let resolvePage!: (result: SearchAfterResult) => void;
    const page = new Promise<SearchAfterResult>((resolve) => { resolvePage = resolve; });
    const fetch = vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      if (args[4]) return page;
      const result = await searchAfter(...args);
      return { ...result, enrichment: new Map(result.hits.map((image) => [image.id, { valid: true }])) };
    });

    const operation = mode === "focus"
      ? actions().search("img-15000")
      : mode === "restore"
        ? actions().restoreAroundCursor("img-15000", target.sortValues[0], 15000)
        : actions().seek(total / 2);
    await waitFor(() => fetch.mock.calls.some((args) => args[4]));
    const backwardArgs = fetch.mock.calls.find((args) => args[4])!;
    const backward = await searchAfter(...backwardArgs);

    await actions().search(null);
    const committedEnrichment = useEnrichmentStore.getState().data;
    resolvePage({ ...backward, enrichment: new Map(backward.hits.map((image) => [image.id, { valid: false }])) });
    await operation;
    await flush();

    expect(state().results[0]?.id).toBe("img-0");
    expect(useEnrichmentStore.getState().data).toEqual(committedEnrichment);
  });

  it.each(["failure", "timeout"] as const)("publishes fallback enrichment after a focus %s", async (mode) => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const searchAfter = mock.searchAfter.bind(mock);
      vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
        if (args[0].ids) {
          if (mode === "failure") throw new Error("fixture failure");
          return new Promise<SearchAfterResult>(() => {});
        }
        const result = await searchAfter(...args);
        return { ...result, enrichment: new Map([["img-0", { valid: false }]]) };
      });
      useEnrichmentStore.getState().setEnrichment(new Map([["old-image", { valid: true }]]));

      await actions().search("img-500");
      await vi.advanceTimersByTimeAsync(mode === "timeout" ? 8000 : 0);

      expect(state().loading).toBe(false);
      expect(state().results[0]?.id).toBe("img-0");
      expect(useEnrichmentStore.getState().data).toEqual(new Map([["img-0", { valid: false }]]));
    } finally {
      warning.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("focus survives search context change", () => {
  it("replaces enrichment when a missing focus commits the fallback page", async () => {
    const searchAfter = mock.searchAfter.bind(mock);
    const overlay = { valid: false, invalidReasons: { fixture: "fallback" } };
    vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await searchAfter(...args);
      return { ...result, enrichment: new Map(result.hits.map((image) => [image.id, overlay])) };
    });
    useEnrichmentStore.getState().setEnrichment(new Map([["old-image", { valid: true }]]));

    await actions().search("img-missing");
    await waitFor(() => !state().loading && state().sortAroundFocusStatus === null);

    expect(state().results[0]?.id).toBe("img-0");
    expect(useEnrichmentStore.getState().data.get("img-0")).toEqual(overlay);
    expect(useEnrichmentStore.getState().data.has("old-image")).toBe(false);
  });

  it("preserves focus when image exists in new results (first page)", async () => {
    await actions().search();
    // Focus an image that is in the first page (index < 200 = PAGE_SIZE)
    actions().setFocusedImageId("img-50");
    expect(state().focusedImageId).toBe("img-50");

    const genBefore = state().sortAroundFocusGeneration;

    // Simulate a query change by searching with the focused image ID.
    // The image is in the first page, so it should be found immediately.
    await actions().search("img-50");
    await flush();

    expect(state().focusedImageId).toBe("img-50");
    expect(state().loading).toBe(false);
    expect(state().sortAroundFocusStatus).toBeNull();
    // Generation should bump so the view scrolls to the focused image
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
  });

  it("preserves focus when image exists but outside first page", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();
    actions().setFocusedImageId("img-500");

    const genBefore = state().sortAroundFocusGeneration;

    // Search with focus — image is outside the first page (200 items)
    await actions().search("img-500");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "focus-preserve completes",
    );

    expect(state().focusedImageId).toBe("img-500");
    expect(state().loading).toBe(false);
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
    // Image should be in the buffer now
    expect(state().results.some((r) => r?.id === "img-500")).toBe(true);
  });

  it("clears focus and shows first-page results when image not in new results", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();
    actions().setFocusedImageId("img-500");

    // Search for a non-existent image (simulates query change that
    // filters out the focused image)
    await actions().search("img-99999");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "focus-preserve failure clears status",
    );

    // Focus should be cleared
    expect(state().focusedImageId).toBeNull();
    expect(state().loading).toBe(false);
    // Buffer should contain the first page of new results (not stale data)
    expect(state().bufferOffset).toBe(0);
    expect(state().results.length).toBeGreaterThan(0);
    expect(state().results[0]?.id).toBe("img-0");
  });

  it("does not attempt focus preservation when focusedImageId is null", async () => {
    await actions().search();
    expect(state().focusedImageId).toBeNull();

    const genBefore = state().sortAroundFocusGeneration;

    // Search without focus — should behave normally
    await actions().search(null);
    await flush();

    expect(state().focusedImageId).toBeNull();
    expect(state().sortAroundFocusGeneration).toBe(genBefore);
    expect(state().loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Phantom focus promotion
// ---------------------------------------------------------------------------

describe("phantom focus promotion", () => {
  it("preserves position without setting focusedImageId (first page)", async () => {
    await actions().search();
    // No explicit focus — focusedImageId is null
    expect(state().focusedImageId).toBeNull();

    const focusGenBefore = state().sortAroundFocusGeneration;

    // Simulate phantom promotion: pass an image ID with phantomOnly flag
    await actions().search("img-50", { phantomOnly: true });
    await flush();

    // focusedImageId must stay null — no focus ring
    expect(state().focusedImageId).toBeNull();
    expect(state().loading).toBe(false);
    expect(state().sortAroundFocusStatus).toBeNull();
    // sortAroundFocusGeneration bumps (same Effect #9 path as explicit focus)
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(focusGenBefore);
    // _phantomFocusImageId set for Effect #9 to consume
    // (cleared by the effect after scroll positioning — in unit tests
    // there's no effect running, so it stays set)
    expect(state()._phantomFocusImageId).toBe("img-50");
  });

  it("preserves position without focus when image requires seek", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();
    expect(state().focusedImageId).toBeNull();

    const focusGenBefore = state().sortAroundFocusGeneration;

    // Pass an image outside the first page with phantomOnly
    await actions().search("img-500", { phantomOnly: true });
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "phantom promotion completes",
    );

    // focusedImageId must stay null
    expect(state().focusedImageId).toBeNull();
    expect(state().loading).toBe(false);
    // sortAroundFocusGeneration bumps
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(focusGenBefore);
    // Image should be in the buffer
    expect(state().results.some((r) => r?.id === "img-500")).toBe(true);
  });

  it("clears gracefully when viewport anchor not in new results", async () => {
    await actions().search();
    expect(state().focusedImageId).toBeNull();

    // Pass a non-existent ID with phantomOnly
    await actions().search("img-nonexistent", { phantomOnly: true });
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      2000,
      "phantom anchor not found clears",
    );

    expect(state().focusedImageId).toBeNull();
    expect(state()._phantomFocusImageId).toBeNull();
    expect(state().loading).toBe(false);
    // Falls back to first page at offset 0 — no special scroll positioning
    expect(state().bufferOffset).toBe(0);
  });

  it("null sortAroundFocusId does not trigger focus machinery", async () => {
    await actions().search();
    expect(state().focusedImageId).toBeNull();

    const genBefore = state().sortAroundFocusGeneration;

    // Sort-only relaxation: null passed (no phantom anchor)
    await actions().search(null);
    await flush();

    expect(state().focusedImageId).toBeNull();
    expect(state().sortAroundFocusGeneration).toBe(genBefore);
  });

  it("explicit focus still promotes normally (not phantom)", async () => {
    await actions().search();
    actions().setFocusedImageId("img-50");

    const genBefore = state().sortAroundFocusGeneration;

    // Without phantomOnly — normal focus preservation
    await actions().search("img-50");
    await flush();

    expect(state().focusedImageId).toBe("img-50");
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
  });

  // Regression — see audit-history-back-forward-back-forward-bug.md.
  // A leaked focusedImageId across phantomOnly restores corrupted phantom
  // history snapshots on the next departure-capture (build-history-snapshot
  // prefers focusedImageId over the viewport anchor in explicit mode).
  // Phantom invariant: phantomOnly search/restore must clear focusedImageId.
  describe("phantomOnly clears leaked focusedImageId (audit: back/forward bug)", () => {
    it("clears focusedImageId when phantom target is in first page", async () => {
      await actions().search();
      // Simulate a leaked explicit focus from a previous context
      actions().setFocusedImageId("img-100");
      expect(state().focusedImageId).toBe("img-100");

      // Phantom restore (e.g. popstate forward into a phantom snapshot)
      await actions().search("img-50", { phantomOnly: true });
      await flush();

      expect(state().focusedImageId).toBeNull();
      expect(state()._focusedImageKnownOffset).toBeNull();
    });

    it("clears focusedImageId when phantom target requires seek (out-of-buffer)", async () => {
      mock = new MockDataSource(1000);
      useSearchStore.setState({ dataSource: mock });
      await actions().search();
      actions().setFocusedImageId("img-100");
      expect(state().focusedImageId).toBe("img-100");

      // Phantom anchor outside the first page → _findAndFocusImage
      // outside-buffer branch.
      await actions().search("img-500", { phantomOnly: true });
      await waitFor(
        () => state().sortAroundFocusStatus === null,
        3000,
        "phantom promotion completes",
      );

      expect(state().focusedImageId).toBeNull();
      expect(state()._focusedImageKnownOffset).toBeNull();
    });

    it("clears focusedImageId when phantom target is in current buffer", async () => {
      mock = new MockDataSource(1000);
      useSearchStore.setState({ dataSource: mock });
      await actions().search();
      // Force a buffer where img-100 is in-buffer for the phantom call:
      // first search loads 0..199, so img-100 is in buffer. Set leaked focus.
      actions().setFocusedImageId("img-150");
      expect(state().focusedImageId).toBe("img-150");

      // Phantom call for an in-buffer image — exercises the in-buffer
      // phantom branch in _findAndFocusImage.
      await actions().search("img-100", { phantomOnly: true });
      await waitFor(
        () => state().sortAroundFocusStatus === null,
        3000,
        "in-buffer phantom completes",
      );

      expect(state().focusedImageId).toBeNull();
      expect(state()._focusedImageKnownOffset).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Buffer eviction
// ---------------------------------------------------------------------------

describe("buffer eviction", () => {
  it("enforces capacity after multiple extends", async () => {
    await actions().search(); // 200 items

    // Extend forward several times to exceed BUFFER_CAPACITY (1000)
    for (let i = 0; i < 6; i++) {
      await actions().extendForward();
      await flush();
    }

    // Buffer should be capped at 1000
    expect(state().results.length).toBeLessThanOrEqual(1000);
    assertPositionsConsistent("after eviction");
  });

  it("evicts from start when extending forward", async () => {
    await actions().search();

    // Extend forward until eviction happens
    for (let i = 0; i < 6; i++) {
      await actions().extendForward();
      await flush();
    }

    // bufferOffset should have increased (items evicted from start)
    if (state().results.length === 1000) {
      expect(state().bufferOffset).toBeGreaterThan(0);
    }
    assertPositionsConsistent("after forward eviction");
  });

  it("evicted images are removed from imagePositions", async () => {
    await actions().search();
    // img-0 should be in the initial buffer
    expect(state().imagePositions.has("img-0")).toBe(true);

    // Extend forward until img-0 is evicted
    for (let i = 0; i < 6; i++) {
      await actions().extendForward();
      await flush();
    }

    if (state().bufferOffset > 0) {
      // img-0 should have been evicted
      expect(state().imagePositions.has("img-0")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Concurrent operations
// ---------------------------------------------------------------------------

describe("abort / concurrent safety", () => {
  it("seek aborts previous seek", async () => {
    await actions().search();

    // Fire two seeks — the first should be aborted
    const seek1 = actions().seek(3000);
    const seek2 = actions().seek(7000);

    await Promise.all([seek1, seek2]);
    await flush();

    // The second seek should win
    const { bufferOffset, results } = state();
    const bufferEnd = bufferOffset + results.length;
    expect(bufferOffset).toBeLessThanOrEqual(7000);
    expect(bufferEnd).toBeGreaterThanOrEqual(7000);
    assertPositionsConsistent("after concurrent seeks");
  });

  it("search aborts in-flight extends", async () => {
    await actions().search();
    // Start an extend and immediately search — extend should be aborted
    const extend = actions().extendForward();
    await actions().search();
    await extend;
    await flush();

    // Should have clean state from the new search
    expect(state().bufferOffset).toBe(0);
    assertPositionsConsistent("after search-during-extend");
  });

  it("a superseded search's searchAfter request is actually cancelled via AbortSignal, not just its result discarded", async () => {
    mock = new MockDataSource(100);
    useSearchStore.setState({ dataSource: mock });

    // Intercept searchAfter to capture the first call's signal and hold it
    // in-flight until released, so we can inspect abort state before it
    // resolves.
    let firstSignal: AbortSignal | undefined;
    let resolveFirst!: () => void;
    const firstBarrier = new Promise<void>((r) => { resolveFirst = r; });
    let callCount = 0;
    const original = mock.searchAfter.bind(mock);
    mock.searchAfter = async (...args: Parameters<typeof mock.searchAfter>) => {
      callCount++;
      if (callCount === 1) {
        firstSignal = args[3];
        await firstBarrier;
      }
      return original(...args);
    };

    const search1 = actions().search("slow-query");
    await flush();

    expect(firstSignal).toBeDefined();
    expect(firstSignal!.aborted).toBe(false);

    // Fire a second search — the first request must be aborted, not merely
    // superseded by the generation counter.
    const search2 = actions().search("fast-query");
    await search2;

    expect(firstSignal!.aborted).toBe(true);

    // Release the first (now-aborted) call and confirm it doesn't corrupt
    // the second search's state.
    resolveFirst();
    await search1;
    await flush();

    expect(state().total).toBe(100);
    expect(state().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("seek beyond total clamps to end", async () => {
    await actions().search();
    await actions().seek(999_999);
    await flush();

    const { bufferOffset, results, total } = state();
    expect(bufferOffset + results.length).toBeLessThanOrEqual(total);
    assertPositionsConsistent("after seek beyond total");
  });

  it("seek to negative clamps to 0", async () => {
    await actions().search();
    await actions().seek(-100);
    await flush();

    expect(state().bufferOffset).toBe(0);
    assertPositionsConsistent("after seek to negative");
  });

  it("empty dataset", async () => {
    mock = new MockDataSource(0);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    expect(state().results.length).toBe(0);
    expect(state().total).toBe(0);
  });

  it("single-item dataset", async () => {
    mock = new MockDataSource(1);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    expect(state().results.length).toBe(1);
    expect(state().total).toBe(1);
    expect(state().results[0]?.id).toBe("img-0");
  });

  it("dataset smaller than one page", async () => {
    mock = new MockDataSource(50);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    expect(state().results.length).toBe(50);
    expect(state().total).toBe(50);
    assertPositionsConsistent("small dataset");
  });
});

// ---------------------------------------------------------------------------
// Tests: Density-switch viewport ratio calculation
// ---------------------------------------------------------------------------

describe("density-switch viewport ratio", () => {
  /**
   * Simulate the viewport ratio save/restore that density-switch unmount/mount does.
   * This validates the exact calculation that was buggy (global index used as row index).
   */

  // TABLE_ROW_HEIGHT from shared constants — same value used in the real component
  const ROW_HEIGHT = TABLE_ROW_HEIGHT;

  it("correct ratio uses buffer-local index", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, imagePositions, results } = state();
    // Focus an image in the middle of the buffer
    const localIdx = Math.floor(results.length / 2);
    const image = results[localIdx]!;
    actions().setFocusedImageId(image.id);

    const globalIdx = imagePositions.get(image.id)!;
    expect(globalIdx).toBe(bufferOffset + localIdx);

    const scrollTop = localIdx * ROW_HEIGHT; // simulate scroll to that row
    const clientHeight = 600; // typical viewport

    // CORRECT: use localIdx
    const correctRatio = (localIdx * ROW_HEIGHT - scrollTop) / clientHeight;

    // BUG: use globalIdx (this was the old code)
    const buggyRatio = (globalIdx * ROW_HEIGHT - scrollTop) / clientHeight;

    // The correct ratio should be ~0 (row is at scrollTop)
    expect(Math.abs(correctRatio)).toBeLessThan(1);

    // The buggy ratio would be enormous (globalIdx * 32 is huge)
    expect(Math.abs(buggyRatio)).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Tests: Sort context label (interpolation)
// ---------------------------------------------------------------------------

describe("sort-context label", async () => {
  // Dynamic import to avoid issues if the module has side effects
  const { interpolateSortLabel } = await import("@/lib/sort-context");

  it("returns date for position inside buffer", async () => {
    await actions().search();
    const { results, bufferOffset } = state();

    const label = interpolateSortLabel(
      "-uploadTime",
      50, // position inside buffer
      10_000,
      bufferOffset,
      results,
    );

    expect(label).not.toBeNull();
    // Should be a formatted date string (may contain HTML span for month)
    expect(label!.replace(/<[^>]+>/g, "")).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
  });

  it("returns null for unknown sort field", async () => {
    await actions().search();
    const { results, bufferOffset } = state();

    const label = interpolateSortLabel(
      "_script:dimensions",
      50,
      10_000,
      bufferOffset,
      results,
    );

    expect(label).toBeNull();
  });

  it("interpolates date for position outside buffer", async () => {
    await actions().search();
    const { results, bufferOffset, total } = state();

    // Position far beyond the buffer
    const label = interpolateSortLabel(
      "-uploadTime",
      5000, // outside buffer (buffer is 0-199)
      total,
      bufferOffset,
      results,
    );

    expect(label).not.toBeNull();
    // Should still be a formatted date (may contain HTML span for month)
    expect(label!.replace(/<[^>]+>/g, "")).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
  });
});

// ---------------------------------------------------------------------------
// Tests: Scroll mode — buffer fill for small datasets
//
// When total ≤ SCROLL_MODE_THRESHOLD (default 1000), search() eagerly
// fills the buffer with ALL results so the scrubber enters scroll mode
// (allDataInBuffer = true). The fill happens in the background after the
// first PAGE_SIZE results are returned.
// ---------------------------------------------------------------------------

describe("scroll mode — buffer fill", () => {
  /** Set up the store with a small mock dataset. */
  function setupSmallDataset(totalImages: number) {
    const smallMock = new MockDataSource(totalImages);
    useSearchStore.setState({
      dataSource: smallMock,
      results: [],
      bufferOffset: 0,
      total: 0,
      loading: false,
      error: null,
      imagePositions: new Map(),
      startCursor: null,
      endCursor: null,
      pitId: null,
      focusedImageId: null,
      sortAroundFocusStatus: null,
      sortAroundFocusGeneration: 0,
      _extendForwardInFlight: false,
      _extendBackwardInFlight: false,
      _lastPrependCount: 0,
      _prependGeneration: 0,
      _seekGeneration: 0,
      _seekTargetLocalIndex: -1,
      params: {
        query: undefined,
        offset: 0,
        length: 200,
        orderBy: "-uploadTime",
        nonFree: "true",
      },
    });
    return smallMock;
  }

  it("fills the entire buffer for datasets ≤ threshold", async () => {
    setupSmallDataset(500);
    await actions().search();

    // After search, the fill runs in the background — wait for it
    await waitFor(
      () => state().results.length === 500,
      3000,
      "buffer fill to 500",
    );

    expect(state().results.length).toBe(500);
    expect(state().total).toBe(500);
    expect(state().bufferOffset).toBe(0);
    assertPositionsConsistent("after scroll-mode fill");
  });

  it("fills even when total exactly equals PAGE_SIZE", async () => {
    setupSmallDataset(200);
    await actions().search();
    await flush();

    // 200 results = PAGE_SIZE, so no extra fetch needed
    expect(state().results.length).toBe(200);
    expect(state().total).toBe(200);
    assertPositionsConsistent("exact PAGE_SIZE");
  });

  it("fills very small datasets (< PAGE_SIZE) in one shot", async () => {
    setupSmallDataset(50);
    await actions().search();
    await flush();

    // All 50 results fetched in the initial search (no fill needed)
    expect(state().results.length).toBe(50);
    expect(state().total).toBe(50);
    assertPositionsConsistent("small dataset");
  });

  it("does NOT fill for datasets > threshold (seek mode)", async () => {
    // Default threshold is 1000, so 10k stays in seek mode
    await actions().search();
    await flush();

    // Should only have the first page
    expect(state().results.length).toBe(200);
    expect(state().total).toBe(10_000);
  });

  it("imagePositions covers all results after fill", async () => {
    setupSmallDataset(700);
    await actions().search();

    await waitFor(
      () => state().results.length === 700,
      3000,
      "buffer fill to 700",
    );

    const { imagePositions, results, bufferOffset } = state();
    expect(imagePositions.size).toBeGreaterThanOrEqual(700);

    // Check first, middle, and last
    expect(imagePositions.get("img-0")).toBe(0);
    expect(imagePositions.get("img-350")).toBe(350);
    expect(imagePositions.get("img-699")).toBe(699);

    // Every image should be correctly mapped
    for (let i = 0; i < results.length; i++) {
      const img = results[i];
      if (!img) continue;
      expect(imagePositions.get(img.id)).toBe(bufferOffset + i);
    }
  });

  it("cursors are valid after fill completes", async () => {
    setupSmallDataset(500);
    await actions().search();

    await waitFor(
      () => state().results.length === 500,
      3000,
      "buffer fill to 500",
    );

    expect(state().startCursor).not.toBeNull();
    expect(state().endCursor).not.toBeNull();
  });

  it("clears _extendForwardInFlight after fill completes", async () => {
    setupSmallDataset(500);
    await actions().search();

    await waitFor(
      () => state().results.length === 500,
      3000,
      "buffer fill to 500",
    );

    // Fill should have cleared the flag
    expect(state()._extendForwardInFlight).toBe(false);
  });

  it("new search aborts in-progress fill", async () => {
    setupSmallDataset(800);

    // Start first search — fill begins in background
    const firstSearch = actions().search();
    await firstSearch;

    // Immediately start a second search (aborts the first fill)
    setupSmallDataset(300);
    await actions().search();

    await waitFor(
      () => state().results.length === 300,
      3000,
      "second search to complete",
    );

    // Buffer should have the new dataset, not a mix
    expect(state().total).toBe(300);
    expect(state().results.length).toBe(300);
    expect(state().results[0]?.id).toBe("img-0");
    expect(state()._extendForwardInFlight).toBe(false);
    assertPositionsConsistent("after aborted fill");
  });

  // -------------------------------------------------------------------------
  // Regression: scroll-mode fill never triggered on the sort-around-focus /
  // restoreAroundCursor branches — see
  // exploration/docs/worklog-current.md (session 1-2 investigation).
  // These branches land the buffer at an arbitrary offset via
  // _findAndFocusImage/_loadBufferAroundImage but never call
  // _fillBufferForScrollMode, so the scrubber gets stuck thinking it's in
  // seek mode forever for datasets ≤ SCROLL_MODE_THRESHOLD.
  // -------------------------------------------------------------------------

  it("fills entire buffer when reached via sort-around-focus outside first page", async () => {
    setupSmallDataset(700);
    await actions().search();

    // Focus an image outside the first page (page 1 = img-0..img-199).
    actions().setFocusedImageId("img-500");

    // Sort-around-focus: search() called with a focus target not on page 1.
    await actions().search("img-500");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );

    // The buffer is now centered on img-500 — but for a total this small,
    // the scroll-mode fill should still top it up to the full result set
    // so the scrubber can enter scroll mode (live-drag, no seek needed).
    await waitFor(
      () => state().results.length === state().total,
      3000,
      "buffer fill to full total after sort-around-focus",
    );

    expect(state().results.length).toBe(700);
    expect(state().total).toBe(700);
    assertPositionsConsistent("after sort-around-focus scroll-mode fill");
  });

  it("_bufferSelfCorrecting is true only while the post-sort-around-focus top-up is in flight", async () => {
    // Review 4.2 (R-2026-07-31-buffer-self-correcting-fix-review.md): pins
    // the store-side half of the F3/F4 fix's contract deterministically.
    // The React-commit-ordering half (effect #8 must still see this flag
    // true on the commit carrying the LAST bufferOffset->0 write) can't be
    // tested here — see the comment on _topUpScrollModeBuffer's `finally`.
    setupSmallDataset(700);
    await actions().search();

    actions().setFocusedImageId("img-500");
    await actions().search("img-500");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );

    // Landed centred on img-500 (bufferOffset > 0) — top-up hasn't reached
    // 0 yet, so the flag must be true for effect #8's guard to work.
    expect(state().bufferOffset).toBeGreaterThan(0);
    expect(state()._bufferSelfCorrecting).toBe(true);

    await waitFor(
      () => state().results.length === state().total,
      3000,
      "buffer fill to full total",
    );

    // Top-up complete — bufferOffset settled at 0, flag must have cleared
    // (a stuck `true` would permanently disable effect #8's real "go home"
    // resets for this tab).
    expect(state().bufferOffset).toBe(0);
    expect(state()._bufferSelfCorrecting).toBe(false);
  });

  it("_bufferSelfCorrecting cannot outlive a genuine new search landing (review 4.1)", async () => {
    setupSmallDataset(700);
    await actions().search();
    actions().setFocusedImageId("img-500");
    await actions().search("img-500");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );
    // Don't wait for the top-up to finish — fire a brand new search while
    // it's still in flight (the scenario review §1.4/§3 flagged as only
    // "safe by accident"). The new landing's own `set()` must force the
    // flag false itself, not rely on the superseded top-up's `finally`.
    expect(state()._bufferSelfCorrecting).toBe(true);
    await actions().search();
    expect(state()._bufferSelfCorrecting).toBe(false);
    expect(state().bufferOffset).toBe(0);

    // Let both the new search's own fill AND the superseded top-up's
    // orphaned promise (detecting staleness via _pitGeneration, then its
    // `finally`) fully settle before the test ends — `_topUpInFlight` is a
    // module-level re-entrancy guard (like the cooldown noted on
    // waitPastCooldown above) that otherwise leaks into the NEXT test and
    // silently no-ops its own top-up call.
    await waitFor(
      () => state().results.length === state().total,
      3000,
      "final settle after superseding search",
    );
    // This test fires two search() calls, each re-arming the module-level
    // search cooldown (see waitPastCooldown doc above) — wait it out so the
    // NEXT test's own extends aren't silently suppressed by a cooldown
    // this test leaves active.
    await waitPastCooldown();
  });

  it("corrects bufferOffset before topping up when countBefore is slow (review M2 regression)", async () => {
    setupSmallDataset(700);
    await actions().search();

    // Simulate a slow countBefore (real ES over an SSH tunnel, --use-media-api,
    // a cold cache) — must exceed SEEK_COOLDOWN_MS (100ms), the window within
    // which the top-up used to fire before the offset correction, silently
    // locking bufferOffset at the estimate (0) forever. assertPositionsConsistent
    // alone can't catch this: a uniformly-wrong offset is still internally
    // consistent, only globally wrong.
    const originalCountBefore = mock.countBefore.bind(mock);
    mock.countBefore = (async (...args: Parameters<typeof originalCountBefore>) => {
      await new Promise((r) => setTimeout(r, 150));
      return originalCountBefore(...args);
    }) as typeof originalCountBefore;

    actions().setFocusedImageId("img-500");
    await actions().search("img-500");

    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );
    await waitFor(
      () => state().results.length === state().total,
      5000,
      "buffer fill to full total despite slow countBefore",
    );

    // The critical assertion: bufferOffset must land on the CORRECTED value,
    // not stay stuck at the placeholder estimate.
    expect(state().imagePositions.get("img-500")).toBe(500);
    expect(state().results.length).toBe(700);
    assertPositionsConsistent("after slow countBefore + top-up");
  });

  it("keeps making progress despite intermittent no-op extends (review M3 regression)", async () => {
    // The old step counter incremented on every loop iteration, including
    // ones where extendForward() returned without fetching (in-flight flag,
    // missing cursor, cooldown TOCTOU — all silent no-ops in production).
    // Simulate that here by making 2 of every 3 extendForward calls a no-op:
    // total=1000, focused outside first page, needs 4 real forward extends
    // to finish. At a 2-no-op-per-1-real ratio that's 12 loop iterations —
    // more than the old code's step budget of 7 (Math.ceil(1000/200)+2),
    // which counted no-ops against it and gave up after ~2 real steps. The
    // fixed code only counts real progress against the budget, so the
    // no-ops (never more than 2 in a row — under the separate
    // maxConsecutiveNoProgress cap of 3) don't affect it at all.
    setupSmallDataset(1000);
    await actions().search();

    const originalExtendForward = actions().extendForward;
    let callCount = 0;
    useSearchStore.setState({
      extendForward: async () => {
        callCount++;
        if (callCount % 3 !== 0) return; // 2 no-ops, then 1 real call
        await originalExtendForward();
      },
    });

    try {
      actions().setFocusedImageId("img-250");
      await actions().search("img-250");

      await waitFor(
        () => state().sortAroundFocusStatus === null,
        3000,
        "sortAroundFocusStatus clears",
      );
      await waitFor(
        () => state().results.length === state().total,
        5000,
        "buffer fill to full total despite intermittent no-op extends",
      );

      expect(state().results.length).toBe(1000);
      expect(state().bufferOffset).toBe(0);
      assertPositionsConsistent("after intermittent no-op extends");
    } finally {
      useSearchStore.setState({ extendForward: originalExtendForward });
    }
  });

  it("fills entire buffer when reached via sort-around-focus first-page fallback (target not found)", async () => {
    setupSmallDataset(700);
    await actions().search();

    // Focus an image that will never exist in any search result — the
    // target-not-found branch. Unlike the "outside first page" branch above,
    // this one leaves search()'s original SEARCH_FETCH_COOLDOWN_MS (2s)
    // cooldown in place instead of resetting it to the short SEEK_COOLDOWN_MS —
    // exactly the case that exposed a step-budget bug (waiting out the
    // cooldown was consuming the same counter as real extend attempts,
    // exhausting the budget before a single real fetch happened).
    actions().setFocusedImageId("img-nonexistent");

    await actions().search("img-nonexistent");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );

    // Target not found — degrades to the first-page fallback. Total is
    // small enough that the buffer should still top up to the full set.
    await waitFor(
      () => state().results.length === state().total,
      5000,
      "buffer fill to full total after first-page fallback",
    );

    expect(state().results.length).toBe(700);
    expect(state().total).toBe(700);
    assertPositionsConsistent("after first-page-fallback scroll-mode fill");
  });

  it("fills entire buffer when reached via seekToFocused in-buffer fast path", async () => {
    setupSmallDataset(700);
    // Do NOT await the background fill — call seekToFocused() while the
    // buffer is still partial (200/700, right after the initial page),
    // same as arrow-key snap-back firing during the two-phase fill window.
    await actions().search();

    // img-50 is within the current (partial) buffer's [0, 200) range —
    // this is exactly the isInBuffer fast path in _findAndFocusImage,
    // which only replaces focus/scroll state and never used to check
    // whether the buffer itself still needs topping up.
    actions().setFocusedImageId("img-50");
    await actions().seekToFocused();

    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "sortAroundFocusStatus clears",
    );

    await waitFor(
      () => state().results.length === state().total,
      5000,
      "buffer fill to full total after in-buffer fast path",
    );

    expect(state().results.length).toBe(700);
    expect(state().total).toBe(700);
    assertPositionsConsistent("after in-buffer-fast-path scroll-mode fill");
  });

  it("fills entire buffer when reached via restoreAroundCursor (image-detail reload)", async () => {
    setupSmallDataset(700);
    await actions().search();

    // Build a real cursor for a deep image, the same way ImageDetail's
    // cached-offset restore does on reload.
    const targetId = "img-500";
    const idResult = await mock.searchAfter(
      { ...state().params, ids: targetId, length: 1 },
      null,
      null,
    );
    const cursor = idResult.sortValues[0];

    await actions().restoreAroundCursor(targetId, cursor, 500);

    // As above: total is small enough that the buffer should eventually
    // cover the whole result set, not stay windowed around the target.
    await waitFor(
      () => state().results.length === state().total,
      3000,
      "buffer fill to full total after restoreAroundCursor",
    );

    expect(state().results.length).toBe(700);
    expect(state().total).toBe(700);
    assertPositionsConsistent("after restoreAroundCursor scroll-mode fill");
  });

  it("concurrent scroll-mode fill and restoreAroundCursor converges without corruption", async () => {
    // Mirrors the exact race caught live on TEST: a plain search() kicks
    // off _fillBufferForScrollMode in the background, and — before it
    // settles — restoreAroundCursor (fired independently by ImageDetail's
    // mount effect on reload) replaces results/bufferOffset out from
    // under it.
    setupSmallDataset(700);
    await actions().search();

    const targetId = "img-500";
    const idResult = await mock.searchAfter(
      { ...state().params, ids: targetId, length: 1 },
      null,
      null,
    );
    const cursor = idResult.sortValues[0];

    // Fire concurrently with whatever's left of the in-flight fill —
    // deliberately not waiting for the fill to settle first.
    await actions().restoreAroundCursor(targetId, cursor, 500);

    // Whichever mechanism wins individual races, the end state must
    // converge to the full result set and remain internally consistent —
    // not permanently stuck at a partial window (the live bug) and not
    // corrupted (mismatched imagePositions from two writers interleaving).
    await waitFor(
      () => state().results.length === state().total,
      3000,
      "buffer converges to full total despite concurrent writers",
    );
    assertPositionsConsistent("after concurrent fill + restoreAroundCursor");
  });
});

// ---------------------------------------------------------------------------
// Tests: Stale buffer — isInBuffer must not serve old content after query change
// ---------------------------------------------------------------------------

describe("stale buffer prevention", () => {
  it("buffer is refreshed when focused image survives query change (no stale content)", async () => {
    // Regression: _findAndFocusImage had an isInBuffer shortcut that, when the
    // focused image's new offset fell within the old buffer's range, just set
    // focusedImageId without replacing the buffer. After a query change the old
    // buffer is from the PREVIOUS query — stale content stays permanently visible.
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();

    // Focus img-50 — it will SURVIVE the query change.
    actions().setFocusedImageId("img-50");
    expect(state().focusedImageId).toBe("img-50");

    // Simulate a query change that excludes some of img-50's neighbours
    // but NOT img-50 itself (like `-colourModel:CMYK` where img-50 is RGB
    // but img-51, img-52 are CMYK).
    mock.removedIds.add("img-51");
    mock.removedIds.add("img-52");
    mock.removedIds.add("img-53");

    await actions().search("img-50");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "focus-preserve completes",
    );

    // img-50 should still be focused (it survived)
    expect(state().focusedImageId).toBe("img-50");
    expect(state().loading).toBe(false);

    // CRITICAL: removed images must NOT be in the buffer.
    // Before the fix, isInBuffer would fire and leave the old buffer
    // (containing img-51, img-52, img-53) permanently visible.
    expect(state().results.every((r) => r?.id !== "img-51")).toBe(true);
    expect(state().results.every((r) => r?.id !== "img-52")).toBe(true);
    expect(state().results.every((r) => r?.id !== "img-53")).toBe(true);

    // img-50 must be in the new buffer
    expect(state().results.some((r) => r?.id === "img-50")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Neighbour fallback
// ---------------------------------------------------------------------------

describe("neighbour fallback", () => {
  it("focuses nearest neighbour when focused image leaves results", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();

    // Focus img-50 — its neighbours are img-49, img-51, etc.
    actions().setFocusedImageId("img-50");
    expect(state().focusedImageId).toBe("img-50");

    // Remove img-50 so it won't be found in new results.
    // Neighbours img-49 and img-51 still exist.
    mock.removedIds.add("img-50");

    await actions().search("img-50");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "neighbour fallback completes",
    );

    // Nearest neighbour (img-51 at +1 or img-49 at -1) should be focused.
    // _captureNeighbours alternates: +1 first, then -1.
    expect(state().focusedImageId).toBe("img-51");
    expect(state().loading).toBe(false);
    expect(state().results.length).toBeGreaterThan(0);
    // Buffer must NOT contain the removed image — stale content from the
    // previous search must never survive into the post-state.
    expect(state().results.every((r) => r?.id !== "img-50")).toBe(true);
  });

  it("prefers nearest neighbour over more distant ones", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();

    // Focus img-50
    actions().setFocusedImageId("img-50");

    // Remove img-50 and its immediate neighbours (±1, ±2).
    // The nearest survivor should be img-53 (distance +3).
    mock.removedIds.add("img-50");
    mock.removedIds.add("img-51");
    mock.removedIds.add("img-49");
    mock.removedIds.add("img-52");
    mock.removedIds.add("img-48");

    await actions().search("img-50");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "distant neighbour fallback completes",
    );

    // _captureNeighbours order: +1, -1, +2, -2, +3, -3, ...
    // +1 (img-51) removed, -1 (img-49) removed, +2 (img-52) removed,
    // -2 (img-48) removed, +3 (img-53) should be the first survivor.
    expect(state().focusedImageId).toBe("img-53");
    expect(state().loading).toBe(false);
    // No removed images should survive in the buffer.
    for (const id of ["img-50", "img-51", "img-49", "img-52", "img-48"]) {
      expect(state().results.every((r) => r?.id !== id)).toBe(true);
    }
  });

  it("clears focus when no neighbours survive", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();

    // Focus img-50
    actions().setFocusedImageId("img-50");

    // Remove img-50 and ALL neighbours within ±20 range
    for (let i = 30; i <= 70; i++) {
      mock.removedIds.add(`img-${i}`);
    }

    await actions().search("img-50");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "no-neighbour fallback completes",
    );

    // No neighbours survived — focus should be cleared, first page shown.
    expect(state().focusedImageId).toBeNull();
    expect(state().loading).toBe(false);
    expect(state().bufferOffset).toBe(0);
    expect(state().results.length).toBeGreaterThan(0);
    // Buffer must be the new first page — no removed images.
    for (let i = 30; i <= 70; i++) {
      expect(state().results.every((r) => r?.id !== `img-${i}`)).toBe(true);
    }
  });

  it("bumps sortAroundFocusGeneration when neighbour is focused", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();

    actions().setFocusedImageId("img-50");
    const genBefore = state().sortAroundFocusGeneration;

    mock.removedIds.add("img-50");

    await actions().search("img-50");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "neighbour fallback gen bump",
    );

    // Generation should bump so the view scrolls to the neighbour
    expect(state().focusedImageId).toBe("img-51");
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
  });

  it("does not bump sortAroundFocusGeneration when no neighbour found", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();

    actions().setFocusedImageId("img-50");
    const genBefore = state().sortAroundFocusGeneration;

    // Remove everything in ±20 range
    for (let i = 30; i <= 70; i++) {
      mock.removedIds.add(`img-${i}`);
    }

    await actions().search("img-50");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "no-neighbour gen check",
    );

    expect(state().focusedImageId).toBeNull();
    expect(state().sortAroundFocusGeneration).toBe(genBefore);
  });

  it("works when focused image is deep in buffer (not in first page)", async () => {
    // Simulate deep scroll: focus an image far from the first page.
    // After removal, the neighbour should still be found via ES batch check
    // and the buffer should be repositioned around it.
    mock = new MockDataSource(10_000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();

    // Seek to position 8000 so img-8000 is in the buffer
    await actions().seek(8000);
    await flush();

    // Focus img-8000
    actions().setFocusedImageId("img-8000");

    // Remove img-8000 — its neighbour img-8001 survives
    mock.removedIds.add("img-8000");

    await actions().search("img-8000");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      5000,
      "deep neighbour fallback completes",
    );

    // Nearest neighbour (img-8001) should be focused
    expect(state().focusedImageId).toBe("img-8001");
    expect(state().loading).toBe(false);
    // Buffer should be repositioned around the neighbour, NOT at offset 0
    expect(state().results.some((r) => r?.id === "img-8001")).toBe(true);
    // Removed image must NOT be in the buffer.
    expect(state().results.every((r) => r?.id !== "img-8000")).toBe(true);
  });

  it("bumps _scrollReset.gen when no neighbour survives (audit #12)", async () => {
    // Scenario: focused image is in the first page (bufferOffset=0). User
    // scrolls down within that page. User then searches with a query that
    // excludes the focused image AND all its neighbours. fallbackFirstPage is
    // used but neither Effect #8 (bufferOffset 0→0, no transition) nor
    // Effect #7b (gen unchanged) would fire without an explicit gen bump.
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    // First search — lands at bufferOffset=0.
    await actions().search();
    expect(state().bufferOffset).toBe(0);

    // Focus img-50 (in the first page).
    actions().setFocusedImageId("img-50");
    expect(state().focusedImageId).toBe("img-50");

    // Remove img-50 AND all its neighbours (±20 range) so nothing survives.
    for (let i = 30; i <= 70; i++) {
      mock.removedIds.add(`img-${i}`);
    }

    // Capture gen after the initial search (it was bumped by that search).
    const genBefore = state()._scrollReset.gen;

    // Trigger sort-around-focus — image and neighbours are all gone.
    await actions().search("img-50");
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "fallback completes — audit #12",
    );

    // Sanity: fallback path was taken (no focus, first-page results).
    expect(state().focusedImageId).toBeNull();
    expect(state().bufferOffset).toBe(0);
    expect(state().loading).toBe(false);

    // The fix: _scrollReset.gen must be bumped so Effect #7b resets scrollTop.
    expect(state()._scrollReset.gen).toBeGreaterThan(genBefore);
  });
});

// ---------------------------------------------------------------------------
// Tests: seekToFocused (arrow snap-back)
// ---------------------------------------------------------------------------

describe("seekToFocused (arrow snap-back)", () => {
  it("seeks back to focused image after distant seek", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    // Focus an image near the start
    actions().setFocusedImageId("img-50");
    expect(state().imagePositions.has("img-50")).toBe(true);

    // Seek far away — focused image leaves the buffer
    await actions().seek(800);
    await waitPastCooldown();
    expect(state().imagePositions.has("img-50")).toBe(false);
    // Focus is still set (durable) but image is not in buffer
    expect(state().focusedImageId).toBe("img-50");

    const genBefore = state().sortAroundFocusGeneration;

    // seekToFocused should bring it back
    await actions().seekToFocused();
    await waitFor(
      () => state().sortAroundFocusGeneration > genBefore,
      3000,
      "seekToFocused completes",
    );

    expect(state().focusedImageId).toBe("img-50");
    expect(state().imagePositions.has("img-50")).toBe(true);
    expect(state().sortAroundFocusStatus).toBeNull();
    expect(state().loading).toBe(false);
  });

  it("clears focus when focused image no longer exists", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    actions().setFocusedImageId("img-50");

    // Seek away
    await actions().seek(800);
    await waitPastCooldown();

    // Simulate image deletion
    mock.removedIds.add("img-50");

    // seekToFocused should detect failure and clear focus
    await actions().seekToFocused();
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "seekToFocused failure clears status",
    );

    expect(state().focusedImageId).toBeNull();
    expect(state()._pendingFocusDelta).toBeNull();
  });

  it("succeeds immediately when focused image is already in buffer", async () => {
    await actions().search();
    actions().setFocusedImageId("img-50");

    // Image is in the buffer — seekToFocused should still work (isInBuffer path)
    const genBefore = state().sortAroundFocusGeneration;
    await actions().seekToFocused();

    expect(state().focusedImageId).toBe("img-50");
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
  });

  it("no-ops when focusedImageId is null", async () => {
    await actions().search();
    expect(state().focusedImageId).toBeNull();

    const genBefore = state().sortAroundFocusGeneration;
    await actions().seekToFocused();

    expect(state().sortAroundFocusGeneration).toBe(genBefore);
  });

  it("clears pending delta on search", async () => {
    useSearchStore.setState({ _pendingFocusDelta: 4 });
    expect(state()._pendingFocusDelta).toBe(4);

    await actions().search();

    expect(state()._pendingFocusDelta).toBeNull();
  });

  it("saves _focusedImageKnownOffset when focusing via setFocusedImageId", async () => {
    await actions().search();
    const globalIdx = state().imagePositions.get("img-50");
    expect(globalIdx).toBeDefined();

    actions().setFocusedImageId("img-50");
    expect(state()._focusedImageKnownOffset).toBe(globalIdx);
  });

  it("uses known offset so bufferOffset is correct after snap-back (no placeholder 0)", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    // Seek to position 500 so img-500 is in the buffer
    await actions().seek(500);
    await waitPastCooldown();
    expect(state().imagePositions.has("img-500")).toBe(true);

    // Focus the image — should save its known offset
    actions().setFocusedImageId("img-500");
    const knownOffset = state()._focusedImageKnownOffset;
    expect(knownOffset).toBe(500);

    // Seek far away
    await actions().seek(100);
    await waitPastCooldown();
    expect(state().imagePositions.has("img-500")).toBe(false);
    expect(state().focusedImageId).toBe("img-500");

    // seekToFocused should use hintOffset=500, not 0
    await actions().seekToFocused();
    await waitFor(
      () => state().imagePositions.has("img-500"),
      3000,
      "seekToFocused brings image back",
    );

    // bufferOffset should be close to 500 (not 0)
    // The buffer is ~300 items centred on img-500, so bufferOffset ≈ 500 - 150
    expect(state().bufferOffset).toBeGreaterThan(100);
    assertPositionsConsistent("snap-back offset");
  });

  it("clears _focusedImageKnownOffset when focus is cleared on failed snap-back", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    actions().setFocusedImageId("img-50");
    expect(state()._focusedImageKnownOffset).toBe(50);

    // Seek away and delete the image
    await actions().seek(800);
    await waitPastCooldown();
    mock.removedIds.add("img-50");

    await actions().seekToFocused();
    await waitFor(
      () => state().sortAroundFocusStatus === null,
      3000,
      "seekToFocused clears status",
    );

    expect(state().focusedImageId).toBeNull();
    expect(state()._focusedImageKnownOffset).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: restoreAroundCursor (image-detail reload)
// ---------------------------------------------------------------------------

describe("restoreAroundCursor", () => {
  it.each([0, 2, 9_999].flatMap(ordinal => [3, 4, 7].map(columns => ({ ordinal, columns }))))(
    "preserves edge target $ordinal and tuple alignment with $columns columns",
    async ({ ordinal, columns }) => {
      const geometry = getScrollGeometry();
      registerScrollGeometry({ ...geometry, columns });
      try {
        await actions().search();
        const targetId = `img-${ordinal}`;
        const target = await mock.searchAfter({ ...state().params, ids: targetId, length: 1 }, null);
        const pages = vi.spyOn(mock, "searchAfter");
        await actions().restoreAroundCursor(targetId, target.sortValues[0], 123, true);
        const restored = state();
        expect(pages).toHaveBeenCalledTimes(3);
        expect(restored.results[restored._seekTargetLocalIndex]?.id).toBe(targetId);
        expect(restored.bufferOffset % columns).toBe(0);
        expect(restored._seekTargetLocalIndex % columns).toBe(ordinal % columns);
        expect(restored._seekTargetGlobalIndex).toBe(ordinal);
        expect(restored._focusedImageKnownOffset).toBe(ordinal);
        expect(restored.bufferOffset + restored._seekTargetLocalIndex).toBe(ordinal);
        const searchKey = buildSearchKey(restored.params);
        expect(getRetainedSortValues(targetId, searchKey)).toEqual(target.sortValues[0]);
        expect(getRetainedSortValues(restored.results[0]!.id, searchKey)).toEqual(restored.startCursor);
        expect(getRetainedSortValues(restored.results.at(-1)!.id, searchKey)).toEqual(restored.endCursor);
        assertPositionsConsistent("restore edge alignment");
      } finally {
        registerScrollGeometry(geometry);
      }
    },
  );

  it.each([
    { total: 30_000, pageTotal: 0, mapReady: false },
    { total: 30_000, pageTotal: 0, mapReady: true },
    { total: 30_000, pageTotal: 75, mapReady: false },
    { total: 30_000, pageTotal: 75, mapReady: true },
    { total: 30_000, pageTotal: 70_000, mapReady: false },
    { total: 70_000, pageTotal: 0, mapReady: false },
    { total: 70_000, pageTotal: 75, mapReady: true },
    { total: 70_000, pageTotal: 30_000, mapReady: false },
    { total: 700, pageTotal: 0, mapReady: false },
    { total: 700, pageTotal: 75, mapReady: true },
    { total: 700, pageTotal: 30_000, mapReady: false },
  ])("KUP-024 uses retained $total with page total $pageTotal and map=$mapReady", async ({ total, pageTotal, mapReady }) => {
    mock = new MockDataSource(total === 700 ? 700 : 10_000);
    useSearchStore.setState({ dataSource: mock });
    await actions().search();
    const ordinal = total === 700 ? 350 : 4_200;
    const targetId = `img-${ordinal}`;
    const target = await mock.searchAfter({ ...state().params, ids: targetId, length: 1 }, null, null);
    const cursor = target.sortValues[0];
    const originalPage = mock.searchAfter.bind(mock);
    const pages = vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await originalPage(...args);
      return args[1] ? { ...result, total: pageTotal } : result;
    });
    const ranks = vi.spyOn(mock, "countBefore");
    const { extendForward, extendBackward } = state();
    const forwardFill = vi.spyOn(state(), "extendForward").mockResolvedValue();
    const backwardFill = vi.spyOn(state(), "extendBackward").mockResolvedValue();
    useSearchStore.setState({
      total,
      positionMap: mapReady ? { length: 1, ids: [targetId], sortValues: [cursor] } : null,
    });
    try {
      await actions().restoreAroundCursor(targetId, cursor, 123, true);
      const restored = state();
      expect(restored.total).toBe(total);
      expect(restored.results[restored._seekTargetLocalIndex]?.id).toBe(targetId);
      expect(restored.bufferOffset + restored._seekTargetLocalIndex).toBe(ordinal);
      expect(restored.imagePositions.get(targetId)).toBe(ordinal);
      expect(restored._focusedImageKnownOffset).toBe(ordinal);
      expect(restored._seekTargetGlobalIndex).toBe(total === 30_000 ? ordinal : -1);
      expect(ranks).toHaveBeenCalledTimes(1);
      expect(pages).toHaveBeenCalledTimes(3);
      assertPositionsConsistent("KUP-024 retained total");
    } finally {
      forwardFill.mockRestore();
      backwardFill.mockRestore();
      useSearchStore.setState({ extendForward, extendBackward });
    }
  });

  it("KUP-024 names the inserted target when the helper clamps its origin", async () => {
    await actions().search();
    const target = await mock.searchAfter({ ...state().params, ids: "img-500", length: 1 }, null, null);
    vi.spyOn(mock, "countBefore").mockResolvedValue(5);
    useSearchStore.setState({ total: 30_000, positionMap: null });

    await actions().restoreAroundCursor("img-500", target.sortValues[0], 999, true);

    const restored = state();
    const actualOrdinal = restored.bufferOffset + restored._seekTargetLocalIndex;
    expect(restored.results[restored._seekTargetLocalIndex]?.id).toBe("img-500");
    expect(actualOrdinal).toBe(100);
    expect(restored._seekTargetGlobalIndex).toBe(actualOrdinal);
    expect(restored._focusedImageKnownOffset).toBe(actualOrdinal);
    expect(restored.imagePositions.get("img-500")).toBe(actualOrdinal);
  });

  it.each([
    "-usagesDateAdded",
    "usagesDateAdded",
    "-dateAddedToCollection",
    "dateAddedToCollection",
  ])("forwards a complete %s cursor to countBefore", async (orderBy) => {
    mock = new MockDataSource(1000);
    const specialCursor = [
      1_700_000_000_000,
      1_600_000_000_000,
      "img-500",
    ];
    const countBeforeSpy = vi
      .spyOn(mock, "countBefore")
      .mockResolvedValue(500);
    const originalPage = mock.searchAfter.bind(mock);
    vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await originalPage(...args);
      return args[0].ids === "img-500" ? { ...result, sortValues: [specialCursor] } : result;
    });
    useSearchStore.setState({
      dataSource: mock,
      params: { orderBy, offset: 0, length: 200 },
    });

    await actions().search();
    await actions().restoreAroundCursor("img-500", specialCursor, 500);

    expect(countBeforeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy }),
      specialCursor,
      expect.any(AbortSignal),
    );
    expect(countBeforeSpy).toHaveBeenCalledTimes(1);
  });

  it("restores a centered buffer around a known image", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();

    // Pick an image in the buffer and grab its sort values as cursor
    const targetId = "img-500";
    // Seek to 500 so we can read img-500's sort values from the buffer
    await actions().seek(500);
    await waitPastCooldown();

    const targetIdx = state().results.findIndex((img) => img?.id === targetId);
    expect(targetIdx).toBeGreaterThanOrEqual(0);

    // Build cursor from the image's data (mock uses [uploadTime, id])
    const targetImg = state().results[targetIdx]!;
    const cursor = [new Date(targetImg.uploadTime).getTime(), targetImg.id];
    const cachedOffset = state().bufferOffset + targetIdx;

    const seekGenBefore = state()._seekGeneration;

    // Now restore — simulating what ImageDetail does on reload
    await actions().restoreAroundCursor(targetId, cursor, cachedOffset);

    // Buffer should be centered around the target
    const { results, bufferOffset, imagePositions, loading, _seekGeneration } = state();

    expect(loading).toBe(false);
    expect(_seekGeneration).toBeGreaterThan(seekGenBefore);

    // Target image must be in the buffer
    const localIdx = results.findIndex((img) => img?.id === targetId);
    expect(localIdx).toBeGreaterThanOrEqual(0);

    // Global offset correct
    const globalIdx = imagePositions.get(targetId);
    expect(globalIdx).toBe(bufferOffset + localIdx);
    expect(globalIdx).toBe(cachedOffset);

    // Buffer is reasonably sized (~201: 100 back + target + 100 forward)
    expect(results.length).toBeGreaterThanOrEqual(100);
    expect(results.length).toBeLessThanOrEqual(201);

    assertPositionsConsistent("restoreAroundCursor");
  });

  it("falls back gracefully when image not found", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();

    // Restore for a non-existent image
    await actions().restoreAroundCursor("img-nonexistent", [0, "img-nonexistent"], 500);

    expect(state().loading).toBe(false);
  });

  it("falls back to seek when cursor is null", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();

    const seekGenBefore = state()._seekGeneration;
    await actions().restoreAroundCursor("img-500", null, 500);
    await waitPastCooldown();

    // Should have used seek() fallback — seekGeneration bumped
    expect(state()._seekGeneration).toBeGreaterThan(seekGenBefore);
    assertPositionsConsistent("restoreAroundCursor null cursor");
  });

  // Bug #16: restoreAroundCursor should set focusedImageId in explicit mode
  // so that useReturnFromDetail's guard (previousFocus === null → early return)
  // does not fire when the user closes detail after a deep-link reload.
  it("sets focusedImageId when setFocus=true (explicit mode)", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock, focusedImageId: null });

    await actions().search();

    const targetId = "img-500";
    await actions().seek(500);
    await waitPastCooldown();

    const targetIdx = state().results.findIndex((img) => img?.id === targetId);
    const targetImg = state().results[targetIdx]!;
    const cursor = [new Date(targetImg.uploadTime).getTime(), targetImg.id];
    const cachedOffset = state().bufferOffset + targetIdx;

    await actions().restoreAroundCursor(targetId, cursor, cachedOffset, true);

    // In explicit mode, focusedImageId must be set so useReturnFromDetail
    // can centre the image when detail is closed.
    expect(state().focusedImageId).toBe(targetId);
  });

  it("does NOT set focusedImageId when setFocus=false (phantom mode)", async () => {
    mock = new MockDataSource(1000);
    useSearchStore.setState({ dataSource: mock, focusedImageId: null });

    await actions().search();

    const targetId = "img-500";
    await actions().seek(500);
    await waitPastCooldown();

    const targetIdx = state().results.findIndex((img) => img?.id === targetId);
    const targetImg = state().results[targetIdx]!;
    const cursor = [new Date(targetImg.uploadTime).getTime(), targetImg.id];
    const cachedOffset = state().bufferOffset + targetIdx;

    await actions().restoreAroundCursor(targetId, cursor, cachedOffset, false);

    // Phantom mode invariant: focusedImageId must stay null.
    expect(state().focusedImageId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchAggregations debounce
// ---------------------------------------------------------------------------

describe("KUP-025 restore tuple ownership", () => {
  function deferred<Value>() {
    let resolve!: (value: Value) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Value>((resolveValue, rejectValue) => {
      resolve = resolveValue;
      reject = rejectValue;
    });
    return { promise, resolve, reject };
  }

  async function drain() {
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  }

  const equalTuple = (first: SortValues, second: SortValues) =>
    first.length === second.length && first.every((value, index) => value === second[index]);
  let originalSeek: ReturnType<typeof state>["seek"];
  let recovery = vi.fn<ReturnType<typeof state>["seek"]>();
  let warning: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalSeek = state().seek;
    recovery = vi.fn<ReturnType<typeof state>["seek"]>().mockResolvedValue();
    useSearchStore.setState({ seek: recovery });
    warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    useSearchStore.setState({ seek: originalSeek });
    warning.mockRestore();
  });

  async function fixture(
    saved: SortValues = [1_700_000_000_000, 1_600_000_000_000, "img-6100"],
    effective: SortValues = [...saved],
  ) {
    await actions().search();
    const target = await mock.searchAfter({ ...state().params, ids: "img-6100", length: 1 }, null, null);
    const forward = await mock.searchAfter({ ...state().params, length: 100 }, target.sortValues[0], null);
    const backward = await mock.searchAfter({ ...state().params, length: 100 }, target.sortValues[0], null, undefined, true);
    const targetResult: SearchAfterResult = {
      ...target, sortValues: [[...effective]], enrichment: new Map([["img-6100", { valid: false }]]),
    };
    const forwardResult = { ...forward, total: 0, enrichment: new Map([[forward.hits[0].id, { valid: true }]]) };
    const backwardResult = { ...backward, total: 75, enrichment: new Map([[backward.hits[0].id, { valid: false }]]) };
    const savedOffset = equalTuple(saved, effective) ? 6_100 : 4_200;
    const savedRank = deferred<number>();
    const effectiveRank = deferred<number>();
    const lookup = deferred<SearchAfterResult>();
    const forwardPage = deferred<SearchAfterResult>();
    const backwardPage = deferred<SearchAfterResult>();
    const ranks = vi.spyOn(mock, "countBefore").mockImplementation((_params, tuple) => {
      if (equalTuple(tuple, saved)) return savedRank.promise;
      if (equalTuple(tuple, effective)) return effectiveRank.promise;
      throw new Error("Unexpected rank tuple");
    });
    const pages = vi.spyOn(mock, "searchAfter").mockImplementation((params, tuple, _pit, _signal, reverse) => {
      if (params.ids === "img-6100") return lookup.promise;
      if (!tuple || !equalTuple(tuple, effective)) throw new Error("Unexpected neighbour tuple");
      return reverse ? backwardPage.promise : forwardPage.promise;
    });
    useSearchStore.setState({ total: 30_000, positionMap: null, _focusedImageKnownOffset: null });
    const searchKey = buildSearchKey(state().params);
    const generation = state()._seekGeneration;
    const release = () => {
      savedRank.resolve(savedOffset);
      effectiveRank.resolve(6_100);
      lookup.resolve(targetResult);
      forwardPage.resolve(forwardResult);
      backwardPage.resolve(backwardResult);
    };
    return {
      saved, effective, savedOffset, savedRank, effectiveRank, lookup, forwardPage, backwardPage,
      targetResult, forwardResult, backwardResult, ranks, pages, searchKey, generation, release,
    };
  }

  function assertLanding(test: Awaited<ReturnType<typeof fixture>>, rankCalls: number) {
    const restored = state();
    expect(restored.results[restored._seekTargetLocalIndex]?.id).toBe("img-6100");
    expect(restored.bufferOffset + restored._seekTargetLocalIndex).toBe(6_100);
    expect(restored._seekTargetGlobalIndex).toBe(6_100);
    expect(restored._focusedImageKnownOffset).toBe(6_100);
    expect(restored._seekGeneration).toBe(test.generation + 1);
    expect(test.ranks).toHaveBeenCalledTimes(rankCalls);
    expect(test.pages).toHaveBeenCalledTimes(3);
    expect(test.pages.mock.calls.slice(1).map(call => call[1])).toEqual([test.effective, test.effective]);
    expect(test.pages.mock.calls.slice(1).map(call => !!call[4])).toEqual([false, true]);
    const expectedTuples = new Map([
      ...test.backwardResult.hits.map((image, index) => [image.id, test.backwardResult.sortValues[index]] as const),
      ["img-6100", test.effective] as const,
      ...test.forwardResult.hits.map((image, index) => [image.id, test.forwardResult.sortValues[index]] as const),
    ]);
    for (const image of restored.results) {
      expect(getRetainedSortValues(image!.id, test.searchKey)).toEqual(expectedTuples.get(image!.id));
    }
    expect(restored.startCursor).toEqual(expectedTuples.get(restored.results[0]!.id));
    expect(restored.endCursor).toEqual(expectedTuples.get(restored.results.at(-1)!.id));
    expect(useEnrichmentStore.getState().data.get("img-6100")).toEqual({ valid: false });
    expect(useEnrichmentStore.getState().data.get(test.forwardResult.hits[0].id)).toEqual({ valid: true });
    expect(useEnrichmentStore.getState().data.get(test.backwardResult.hits[0].id)).toEqual({ valid: false });
    expect(recovery).not.toHaveBeenCalled();
    assertPositionsConsistent("KUP-025 selected tuple");
  }

  it.each(["lookup", "rank"] as const)("starts unchanged work concurrently with %s finishing first", async (first) => {
    const test = await fixture();
    const operation = actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    try {
      expect(test.ranks).toHaveBeenCalledTimes(1);
      expect(test.pages).toHaveBeenCalledTimes(1);
      expect(test.pages.mock.calls[0].slice(1, 3)).toEqual([null, null]);
      expect(test.ranks.mock.calls[0][2]).toBe(test.pages.mock.calls[0][3]);
      if (first === "lookup") test.lookup.resolve(test.targetResult);
      else test.savedRank.resolve(6_100);
      await drain();
      expect(test.pages).toHaveBeenCalledTimes(1);
      expect(state()._seekGeneration).toBe(test.generation);
      test.lookup.resolve(test.targetResult);
      test.savedRank.resolve(6_100);
      await drain();
      expect(test.pages).toHaveBeenCalledTimes(3);
      test.forwardPage.resolve(test.forwardResult);
      await drain();
      expect(state()._seekGeneration).toBe(test.generation);
      test.backwardPage.resolve(test.backwardResult);
      await operation;
      assertLanding(test, 1);
    } finally {
      test.release();
      await operation;
    }
  });

  it.each(["pending", "resolved", "reject before lookup", "reject before landing", "reject after landing"])("corrects a changed tuple with obsolete rank %s", async (obsolete) => {
    const test = await fixture([1_700_000_000_000, 1_600_000_000_000, "img-6100"], [1_700_000_000_000, 1_500_000_000_000, "img-6100"]);
    const operation = actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    try {
      if (obsolete === "resolved") test.savedRank.resolve(4_200);
      if (obsolete === "reject before lookup") test.savedRank.reject(new Error("obsolete rank"));
      await drain();
      expect(recovery).not.toHaveBeenCalled();
      test.lookup.resolve(test.targetResult);
      await drain();
      expect(test.ranks.mock.calls.map(call => call[1])).toEqual([test.saved, test.effective]);
      expect(test.pages).toHaveBeenCalledTimes(1);
      if (obsolete === "reject before landing") test.savedRank.reject(new Error("obsolete rank"));
      test.effectiveRank.resolve(6_100);
      await drain();
      expect(test.pages).toHaveBeenCalledTimes(3);
      test.forwardPage.resolve(test.forwardResult);
      test.backwardPage.resolve(test.backwardResult);
      await operation;
      assertLanding(test, 2);
      const landed = state();
      if (obsolete === "reject after landing") test.savedRank.reject(new Error("obsolete rank"));
      else test.savedRank.resolve(4_200);
      await drain();
      expect(state()).toBe(landed);
      expect(recovery).not.toHaveBeenCalled();
      expect(warning).not.toHaveBeenCalled();
    } finally {
      test.release();
      await operation;
    }
  });

  it.each([
    { label: "equal null primary", saved: [null, 100, "img-6100"], effective: [null, 100, "img-6100"] },
    { label: "null to value", saved: [null, 100, "img-6100"], effective: [200, 100, "img-6100"] },
    { label: "value to null", saved: [200, 100, "img-6100"], effective: [null, 100, "img-6100"] },
    { label: "upload suffix", saved: [200, 100, "img-6100"], effective: [200, 101, "img-6100"] },
    { label: "id suffix", saved: [200, 100, "previous-id"], effective: [200, 100, "img-6100"] },
    { label: "added null suffix", saved: [200, 100, "img-6100"], effective: [200, 100, "img-6100", null] },
    { label: "removed suffix", saved: [200, 100, "img-6100", null], effective: [200, 100, "img-6100"] },
  ].flatMap(tuple => ["-usagesDateAdded", "usagesDateAdded", "-dateAddedToCollection", "dateAddedToCollection"].map(orderBy => ({ ...tuple, orderBy }))))("compares the whole tuple: $label under $orderBy", async ({ saved, effective, orderBy }) => {
    const test = await fixture(saved, effective);
    useSearchStore.setState({ params: { ...state().params, orderBy } });
    test.searchKey = buildSearchKey(state().params);
    test.release();
    await actions().restoreAroundCursor("img-6100", saved, 123, true);
    assertLanding(test, equalTuple(saved, effective) ? 1 : 2);
    expect(test.ranks.mock.calls.every(call => call[0].orderBy === orderBy)).toBe(true);
  });

  it("keeps the saved tuple fallback when the lookup omits its tuple", async () => {
    const test = await fixture([null, 100, "img-6100"]);
    test.targetResult.sortValues = [];
    test.release();
    await actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    assertLanding(test, 1);
  });

  it("keeps retained-total coordinates when the map arrives during lookup", async () => {
    const test = await fixture();
    const operation = actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    try {
      test.savedRank.resolve(6_100);
      await drain();
      useSearchStore.setState({ positionMap: { length: 1, ids: ["img-6100"], sortValues: [test.effective] } });
      test.release();
      await operation;
      assertLanding(test, 1);
    } finally {
      test.release();
      await operation;
    }
  });

  it.each([3, 4, 7])("aligns a corrected target with %s columns", async (columns) => {
    const geometry = getScrollGeometry();
    registerScrollGeometry({ ...geometry, columns });
    try {
      const test = await fixture([100, "img-6100"], [200, "img-6100"]);
      test.release();
      await actions().restoreAroundCursor("img-6100", test.saved, 123, true);
      assertLanding(test, 2);
      expect(state().bufferOffset % columns).toBe(0);
      expect(state()._seekTargetLocalIndex % columns).toBe(6_100 % columns);
    } finally {
      registerScrollGeometry(geometry);
    }
  });

  it.each([false, true])("discards superseded unchanged-rank completion (reject=%s)", async (reject) => {
    const test = await fixture();
    const operation = actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    try {
      test.lookup.resolve(test.targetResult);
      await drain();
      expect(test.pages).toHaveBeenCalledTimes(1);
      useSearchStore.setState({ dataSource: new MockDataSource(10_000) });
      await actions().search(null);
      await drain();
      useSearchStore.setState({ loading: true });
      const current = state();
      if (reject) test.savedRank.reject(new Error("stale saved rank"));
      else test.savedRank.resolve(6_100);
      await operation;
      expect(state()).toBe(current);
      expect(test.pages).toHaveBeenCalledTimes(1);
      expect(recovery).not.toHaveBeenCalled();
      expect(warning).not.toHaveBeenCalled();
    } finally {
      test.release();
      await operation;
    }
  });

  it("finishes a missing target before saved rank settles and ignores its late rejection", async () => {
    const test = await fixture();
    const initial = state();
    const operation = actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    let completed = false;
    void operation.then(() => { completed = true; });
    try {
      test.lookup.resolve({ ...test.targetResult, hits: [], sortValues: [] });
      await drain();
      expect(completed).toBe(true);
      expect(state().loading).toBe(false);
      expect(state().results).toBe(initial.results);
      expect(state().total).toBe(initial.total);
      expect(state()._seekGeneration).toBe(test.generation);
      expect(test.pages).toHaveBeenCalledTimes(1);
      expect(getRetainedSortValues("img-6100", test.searchKey)).toBeNull();
      const missingState = state();
      const warningsBefore = warning.mock.calls.length;
      test.savedRank.reject(new Error("obsolete missing-target rank"));
      await drain();
      expect(state()).toBe(missingState);
      expect(warning).toHaveBeenCalledTimes(warningsBefore);
      expect(recovery).not.toHaveBeenCalled();
      expect(useEnrichmentStore.getState().data.has("img-6100")).toBe(false);
    } finally {
      test.release();
      await operation;
    }
  });

  it.each(["lookup", "saved rank", "effective rank", "forward", "backward"])("preserves current recovery for selected %s failure without partial publication", async (failed) => {
    const changed = failed === "effective rank";
    const test = await fixture([100, "img-6100"], [changed ? 200 : 100, "img-6100"]);
    const initial = state();
    const operation = actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    try {
      if (failed === "lookup") test.lookup.reject(new Error("selected lookup"));
      else test.lookup.resolve(test.targetResult);
      if (failed === "saved rank") test.savedRank.reject(new Error("selected saved rank"));
      else test.savedRank.resolve(test.savedOffset);
      if (failed === "effective rank") {
        await drain();
        expect(test.ranks).toHaveBeenCalledTimes(2);
        test.effectiveRank.reject(new Error("selected effective rank"));
      }
      if (failed === "forward") test.forwardPage.reject(new Error("selected forward page"));
      else test.forwardPage.resolve(test.forwardResult);
      if (failed === "backward") test.backwardPage.reject(new Error("selected backward page"));
      else test.backwardPage.resolve(test.backwardResult);
      await operation;
      expect(recovery).toHaveBeenCalledExactlyOnceWith(123);
      expect(state().results).toBe(initial.results);
      expect(state()._seekGeneration).toBe(test.generation);
      expect(state().focusedImageId).toBeNull();
      expect(getRetainedSortValues("img-6100", test.searchKey)).toBeNull();
      expect(useEnrichmentStore.getState().data.has("img-6100")).toBe(false);
      expect(test.pages).toHaveBeenCalledTimes(failed === "forward" || failed === "backward" ? 3 : 1);
    } finally {
      test.release();
      await operation;
    }
  });

  it.each(["lookup", "rank", "pages"].flatMap(boundary =>
    ["search", "restore", "sort"].flatMap(owner => [false, true].map(reject => ({ boundary, owner, reject }))),
  ))("ignores superseded $boundary after $owner (reject=$reject)", async ({ boundary, owner, reject }) => {
    const test = await fixture([100, "img-6100"], [200, "img-6100"]);
    const operation = actions().restoreAroundCursor("img-6100", test.saved, 123, true);
    test.savedRank.resolve(4_200);
    try {
      if (boundary !== "lookup") test.lookup.resolve(test.targetResult);
      if (boundary === "pages") test.effectiveRank.resolve(6_100);
      await drain();
      if (boundary !== "lookup") expect(test.ranks).toHaveBeenCalledTimes(2);
      expect(test.pages).toHaveBeenCalledTimes(boundary === "pages" ? 3 : 1);
      const priorSignal = test.pages.mock.calls[0][3]!;
      const nextSource = new MockDataSource(10_000);
      useSearchStore.setState({ dataSource: nextSource });
      if (owner === "restore") {
        const target = await nextSource.searchAfter({ ...state().params, ids: "img-2500", length: 1 }, null);
        await actions().restoreAroundCursor("img-2500", target.sortValues[0], 2_500, true);
      } else {
        if (owner === "sort") actions().setParams({ orderBy: "uploadTime" });
        await actions().search(null);
      }
      await drain();
      expect(priorSignal.aborted).toBe(true);
      useSearchStore.setState({ loading: true });
      const current = state();
      const enrichment = new Map(useEnrichmentStore.getState().data);
      const tuple = getRetainedSortValues("img-6100", test.searchKey);
      const rankCount = test.ranks.mock.calls.length;
      const pageCount = test.pages.mock.calls.length;
      if (reject) {
        const failure = new Error("late non-abort failure");
        if (boundary === "lookup") test.lookup.reject(failure);
        else if (boundary === "rank") test.effectiveRank.reject(failure);
        else test.backwardPage.reject(failure);
      }
      test.release();
      await operation;
      await drain();
      expect(state()).toEqual(current);
      expect(useEnrichmentStore.getState().data).toEqual(enrichment);
      expect(getRetainedSortValues("img-6100", test.searchKey)).toEqual(tuple);
      expect(test.ranks).toHaveBeenCalledTimes(rankCount);
      expect(test.pages).toHaveBeenCalledTimes(pageCount);
      expect(recovery).not.toHaveBeenCalled();
      expect(warning).not.toHaveBeenCalled();
    } finally {
      test.release();
      await operation;
    }
  });
});

describe("KUP-007 expanded aggregation ownership", () => {
  const field = "metadata.credit";
  const otherField = "metadata.source";
  const buckets = (value: string) => ({ buckets: [{ key: value, count: 1 }], total: 1 });

  function deferredAgg() {
    let resolve!: (value: AggregationsResult) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<AggregationsResult>((accept, decline) => { resolve = accept; reject = decline; });
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    useSearchStore.setState({
      expandedAggs: {}, expandedAggsLoading: new Set(),
      aggregations: { fields: { [field]: buckets("ordinary-retained") } },
      params: { ...state().params, until: "2026-02-01T00:00:00Z" },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(["collapse", "search", "base-reset"] as const)("%s prevents obsolete success from resurrecting cache", async (invalidation) => {
    const old = deferredAgg();
    const fetch = vi.spyOn(mock, "getAggregations").mockReturnValueOnce(old.promise);
    const operation = actions().fetchExpandedAgg(field);
    const signal = fetch.mock.calls[0][2];
    const ordinary = state().aggregations;
    try {
      if (invalidation === "collapse") actions().collapseExpandedAgg(field);
      if (invalidation === "search") {
        vi.spyOn(mock, "searchAfter").mockResolvedValue({ hits: [], total: 0, sortValues: [] });
        await actions().search();
      }
      if (invalidation === "base-reset") {
        fetch.mockResolvedValueOnce({ fields: { [field]: buckets("new-base") } });
        await actions().fetchAggregations("force");
      } else {
        expect(state().aggregations).toBe(ordinary);
      }
      expect(signal?.aborted).toBe(true);
      expect(state().expandedAggsLoading.size).toBe(0);
    } finally {
      old.resolve({ fields: { [field]: buckets("obsolete") } });
      await operation;
    }
    expect(state().expandedAggs[field]).toBeUndefined();
    expect(state().expandedAggsLoading.size).toBe(0);
  });

  it.each(["success", "reject", "abort"] as const)("obsolete %s cannot publish or finalize a same-field successor", async (outcome) => {
    const old = deferredAgg();
    const current = deferredAgg();
    const fetch = vi.spyOn(mock, "getAggregations").mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = actions().fetchExpandedAgg(field);
    actions().collapseExpandedAgg(field);
    const second = actions().fetchExpandedAgg(field);
    try {
      expect(fetch).toHaveBeenCalledTimes(2);
      if (outcome === "success") old.resolve({ fields: { [field]: buckets("obsolete") } });
      else old.reject(outcome === "abort" ? new DOMException("obsolete", "AbortError") : new Error("obsolete"));
      await first;
      expect(state().expandedAggs[field]).toBeUndefined();
      expect(state().expandedAggsLoading).toEqual(new Set([field]));
    } finally {
      old.resolve({ fields: {} });
      current.resolve({ fields: { [field]: buckets("current") } });
      await Promise.all([first, second]);
    }
    expect(state().expandedAggs[field]).toEqual(buckets("current"));
    expect(state().expandedAggsLoading.size).toBe(0);
  });

  it.each(["success", "reject"] as const)("cross-field cancellation keeps only the successor busy after late %s", async (outcome) => {
    const old = deferredAgg();
    const current = deferredAgg();
    const fetch = vi.spyOn(mock, "getAggregations").mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = actions().fetchExpandedAgg(field);
    const second = actions().fetchExpandedAgg(otherField);
    try {
      expect(fetch.mock.calls[0][2]?.aborted).toBe(true);
      expect(state().expandedAggsLoading).toEqual(new Set([otherField]));
      if (outcome === "success") old.resolve({ fields: { [field]: buckets("obsolete") } });
      else old.reject(new Error("obsolete"));
      await first;
      expect(state().expandedAggs[field]).toBeUndefined();
      expect(state().expandedAggsLoading).toEqual(new Set([otherField]));
      actions().collapseExpandedAgg(field);
      expect(fetch.mock.calls[1][2]?.aborted).toBe(false);
    } finally {
      old.resolve({ fields: {} });
      current.resolve({ fields: { [otherField]: buckets("current") } });
      await Promise.all([first, second]);
    }
    expect(state().expandedAggs[otherField]).toEqual(buckets("current"));
    expect(state().expandedAggsLoading.size).toBe(0);
  });

  it.each(["search", "base-reset"] as const)("late rejection after %s leaves the successor loading", async (invalidation) => {
    const old = deferredAgg();
    const current = deferredAgg();
    const fetch = vi.spyOn(mock, "getAggregations").mockReturnValueOnce(old.promise);
    const first = actions().fetchExpandedAgg(field);
    if (invalidation === "search") {
      vi.spyOn(mock, "searchAfter").mockResolvedValue({ hits: [], total: 0, sortValues: [] });
      await actions().search();
    } else {
      fetch.mockResolvedValueOnce({ fields: {} });
      await actions().fetchAggregations("force");
    }
    fetch.mockReturnValueOnce(current.promise);
    const second = actions().fetchExpandedAgg(field);
    old.reject(new Error("late old producer"));
    await first;
    const loadingBeforeCurrent = new Set(state().expandedAggsLoading);
    current.resolve({ fields: { [field]: buckets("current") } });
    await second;
    expect(loadingBeforeCurrent).toEqual(new Set([field]));
    expect(state().expandedAggs[field]).toEqual(buckets("current"));
    expect(state().expandedAggsLoading.size).toBe(0);
  });

  it("a current missing-field success finishes and permits retry", async () => {
    const fetch = vi.spyOn(mock, "getAggregations").mockResolvedValueOnce({ fields: {} })
      .mockResolvedValueOnce({ fields: { [field]: buckets("retry") } });
    await actions().fetchExpandedAgg(field);
    expect(state().expandedAggsLoading.size).toBe(0);
    expect(state().expandedAggs[field]).toBeUndefined();
    await actions().fetchExpandedAgg(field);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state().expandedAggs[field]).toEqual(buckets("retry"));
  });

  it("ordinary completion reuses cache, collapse permits refetch, and current failure finishes", async () => {
    const fetch = vi.spyOn(mock, "getAggregations").mockResolvedValue({ fields: { [field]: buckets("current") } });
    await actions().fetchExpandedAgg(field);
    await actions().fetchExpandedAgg(field);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state().expandedAggsLoading.size).toBe(0);
    actions().collapseExpandedAgg(field);
    fetch.mockRejectedValueOnce(new Error("current failure"));
    await actions().fetchExpandedAgg(field);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state().expandedAggs[field]).toBeUndefined();
    expect(state().expandedAggsLoading.size).toBe(0);
  });
});

describe("fetchAggregations", () => {
  it("immediate skips only the debounce and still honours the circuit breaker and cache", async () => {
    mock = new MockDataSource(500);
    const getAggregations = vi.spyOn(mock, "getAggregations");
    useSearchStore.setState({
      dataSource: mock,
      aggCircuitOpen: true,
      _aggCacheKey: null,
    });

    await actions().fetchAggregations("immediate");
    expect(getAggregations).not.toHaveBeenCalled();

    useSearchStore.setState({ aggCircuitOpen: false });
    const immediate = actions().fetchAggregations("immediate");
    expect(getAggregations).toHaveBeenCalledTimes(1);
    await immediate;

    await actions().fetchAggregations("immediate");
    expect(getAggregations).toHaveBeenCalledTimes(1);
  });

  it("ordinary calls remain a trailing-edge debounce", async () => {
    vi.useFakeTimers();
    try {
      mock = new MockDataSource(500);
      const getAggregations = vi.spyOn(mock, "getAggregations");
      useSearchStore.setState({
        dataSource: mock,
        aggCircuitOpen: false,
        _aggCacheKey: null,
      });

      const first = actions().fetchAggregations();
      await vi.advanceTimersByTimeAsync(250);
      const second = actions().fetchAggregations();
      await Promise.resolve();
      expect(getAggregations).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(499);
      expect(getAggregations).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await Promise.all([first, second]);
      expect(getAggregations).toHaveBeenCalledTimes(1);
    } finally {
      await vi.runOnlyPendingTimersAsync();
      vi.useRealTimers();
    }
  });

  it("a cached context cancels a different in-flight aggregation before it can publish", async () => {
    mock = new MockDataSource(500);
    let resolveSlow!: () => void;
    const slowBarrier = new Promise<void>((resolve) => { resolveSlow = resolve; });
    const original = mock.getAggregations.bind(mock);
    let calls = 0;
    mock.getAggregations = async (...args: Parameters<typeof mock.getAggregations>) => {
      calls++;
      if (calls === 2) await slowBarrier; // Ignore abort deliberately; generation must guard publish.
      return original(...args);
    };
    useSearchStore.setState({ dataSource: mock });

    await actions().fetchAggregations("immediate"); // Cache context A.
    const cachedA = state().aggregations;

    actions().setParams({ query: "context-b" });
    const slowB = actions().fetchAggregations("immediate");
    await flush();

    actions().setParams({ query: undefined });
    await actions().fetchAggregations("immediate"); // Cache hit for A must still cancel B.
    resolveSlow();
    await slowB;

    expect(state().aggregations).toBe(cachedA);
    expect(state()._aggCacheKey).not.toContain("context-b");
  });

  it("AI aggregation cache is keyed by the settled result IDs", async () => {
    mock = new MockDataSource(500);
    const getAggregations = vi.spyOn(mock, "getAggregations");
    const initialHits = (await mock.searchRange({ offset: 0, length: 4 })).hits;
    useSearchStore.setState({
      dataSource: mock,
      params: { ...state().params, aiQuery: "mountains", useAISearch: "true" },
      results: initialHits.slice(0, 2),
    });

    await actions().fetchAggregations("immediate");
    expect(getAggregations).toHaveBeenCalledTimes(1);
    expect(getAggregations.mock.calls[0][0].ids).toBe("img-0,img-1");

    useSearchStore.setState({ results: initialHits.slice(0, 2).reverse() });
    await actions().fetchAggregations("immediate");
    expect(getAggregations).toHaveBeenCalledTimes(1);

    useSearchStore.setState({ results: initialHits.slice(2, 4) });
    await actions().fetchAggregations("immediate");
    expect(getAggregations).toHaveBeenCalledTimes(2);
    expect(getAggregations.mock.calls[1][0].ids).toBe("img-2,img-3");
  });

  it("does not schedule automatic aggregations while search results are loading", async () => {
    mock = new MockDataSource(500);
    const getAggregations = vi.spyOn(mock, "getAggregations");
    useSearchStore.setState({ dataSource: mock, loading: true });

    await actions().fetchAggregations("immediate");
    await actions().fetchAggregations("debounced");

    expect(getAggregations).not.toHaveBeenCalled();
  });

  it("does not start a debounced aggregation if loading begins before the timer expires", async () => {
    vi.useFakeTimers();
    try {
      mock = new MockDataSource(500);
      const getAggregations = vi.spyOn(mock, "getAggregations");
      useSearchStore.setState({ dataSource: mock, loading: false });

      const pending = actions().fetchAggregations("debounced");
      await vi.advanceTimersByTimeAsync(499);
      useSearchStore.setState({ loading: true });
      await vi.advanceTimersByTimeAsync(1);
      await pending;

      expect(getAggregations).not.toHaveBeenCalled();
    } finally {
      await vi.runOnlyPendingTimersAsync();
      vi.useRealTimers();
    }
  });

  it("second call during debounce does not leave first promise hanging", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    await flush();

    // Fire first call — enters 500ms debounce await
    const p1 = actions().fetchAggregations();

    // Before timer fires, fire second call — kills first timer
    await flush();
    const p2 = actions().fetchAggregations();

    // Both promises must resolve within a reasonable time.
    // Before the fix, p1 would hang forever (zombie promise).
    const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 3000));
    const result = await Promise.race([
      Promise.all([p1, p2]).then(() => "resolved" as const),
      timeout,
    ]);

    expect(result).toBe("resolved");
  });

  it("force mode bypasses debounce entirely", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    await flush();

    // Force should skip debounce and complete quickly.
    const getAggregations = vi.spyOn(mock, "getAggregations");
    const forced = actions().fetchAggregations("force");
    expect(getAggregations).toHaveBeenCalledTimes(1);
    await forced;
    expect(state().aggLoading).toBe(false);
  });

  it("fetches has: target fields in isolation — a failing dynamic field doesn't break the static batch", async () => {
    // Simulates the real ES failure mode (confirmed empirically): a terms
    // agg on a non-aggregatable field 400s the whole request. The dynamic
    // fetch must run each has: target as its own request so metadata.city
    // failing has zero effect on the static aggregations batch or on the
    // OTHER has: target (fileMetadata.xmp.dc:creator), which succeeds.
    class IsolationTestDataSource extends MockDataSource {
      async getAggregations(
        _params: SearchParams,
        fields: AggregationRequest[],
        _signal?: AbortSignal,
        _isFilters?: FilterAggRequest[],
        _usageFilters?: UsageFilterAggRequest[],
      ): Promise<AggregationsResult> {
        if (fields.length > 1) {
          // The static AGG_FIELDS batch call.
          return {
            fields: {
              "usageRights.category": { buckets: [{ key: "staff-photographer", count: 3 }], total: 3 },
            },
          };
        }
        const [{ field }] = fields;
        if (field === "metadata.city") {
          throw new Error("Fielddata is disabled on [metadata.city] — simulated non-aggregatable field");
        }
        if (field === "fileMetadata.xmp.dc:creator") {
          return { fields: { [field]: { buckets: [{ key: "Jane Doe", count: 2 }], total: 2 } } };
        }
        return { fields: {} };
      }
    }

    mock = new IsolationTestDataSource(50);
    useSearchStore.setState({
      dataSource: mock,
      params: {
        ...state().params,
        query: 'has:"metadata.city" has:"fileMetadata.xmp.dc:creator"',
      },
    });

    await actions().fetchAggregations("force");

    expect(state().dynamicFacetBuckets["fileMetadata.xmp.dc:creator"]).toEqual([
      { key: "Jane Doe", count: 2 },
    ]);
    expect(state().dynamicFacetBuckets["metadata.city"]).toBeUndefined();
    // The static batch must be unaffected by the failing dynamic field.
    expect(state().aggregations?.fields["usageRights.category"]?.buckets).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: pending-intent cleanup (audit #1, #2)
// ---------------------------------------------------------------------------

describe("pending-intent cleanup on search() and seek() (audit #1, #2)", () => {
  it("search() clears _pendingFocusAfterSeek (audit #1)", async () => {
    // Set the stale intent — simulates Home/End seek in flight when a new
    // query fires before the seek resolves.
    useSearchStore.setState({ _pendingFocusAfterSeek: "first" });

    await actions().search();

    expect(state()._pendingFocusAfterSeek).toBeNull();
  });

  it("seek() clears _pendingFocusDelta (audit #2)", async () => {
    // Prime the store with a valid buffer so seek() can execute.
    await actions().search(); // loads 200 items, total=10_000
    await waitPastCooldown();

    // Set the stale delta — simulates an arrow-key snap-back intent that
    // should not survive a concurrent scrubber seek.
    useSearchStore.setState({ _pendingFocusDelta: 2 });

    await actions().seek(100);

    expect(state()._pendingFocusDelta).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Search generation counter (staleness bailout)
// ---------------------------------------------------------------------------

describe("search generation counter", () => {
  it("first search is discarded when a second search overtakes it", async () => {
    mock = new MockDataSource(100);
    useSearchStore.setState({ dataSource: mock });

    // Intercept searchAfter to control resolution order.
    // First call will be delayed; second call resolves immediately.
    let resolveFirst!: () => void;
    const firstBarrier = new Promise<void>((r) => { resolveFirst = r; });
    let callCount = 0;
    const original = mock.searchAfter.bind(mock);
    mock.searchAfter = async (...args: Parameters<typeof mock.searchAfter>) => {
      callCount++;
      if (callCount <= 1) {
        // First search's first page — block until released
        await firstBarrier;
      }
      return original(...args);
    };

    // Fire first search (will block on firstBarrier)
    const search1 = actions().search("slow-query");
    await flush();

    // Fire second search — it will increment _searchGeneration
    const search2 = actions().search("fast-query");
    await search2;

    // Now release the first search — it should bail at the generation check
    resolveFirst();
    await search1;
    await flush();

    // The store should reflect the SECOND search's results, not the first.
    // The second search ran against a 100-image mock, so total should be 100.
    expect(state().total).toBe(100);
    // Buffer should be populated (not wiped by the stale first search)
    expect(state().results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: AI search — sortAroundFocusId (browser Back position restoration)
// ---------------------------------------------------------------------------

describe("AI search — sortAroundFocusId (Back-navigation restore)", () => {
  /** Build a minimal ImageDataSource with a working searchByAi. */
  function makeAiMock(count = 20, uploadOffsets?: number[]) {
    const base = new MockDataSource(count);
    const hits = Array.from({ length: count }, (_, i) => ({
      id: `ai-img-${i}`,
      uri: `https://example.com/ai-img-${i}`,
      metadata: { description: `AI image ${i}` },
      uploadTime: new Date(
        Date.now() - (uploadOffsets?.[i] ?? i * 1000),
      ).toISOString(),
      __aiScore: 1 - i * 0.01,
    })) as unknown as import("@/types/image").Image[];

    const k = hits.length;
    const sortValues = hits.map((_, i) => [k - i, hits[i].id] as import("@/dal").SortValues);

    return Object.assign(base, {
      searchByAi: async (_params: unknown, _signal?: AbortSignal) => ({
        hits,
        total: hits.length,
        sortValues,
        pitId: null,
        took: 5,
      }),
    });
  }

  beforeEach(() => {
    const aiMock = makeAiMock(20);
    useSearchStore.setState({
      dataSource: aiMock as unknown as import("@/dal").ImageDataSource,
      results: [],
      bufferOffset: 0,
      total: 0,
      loading: false,
      error: null,
      imagePositions: new Map(),
      startCursor: null,
      endCursor: null,
      pitId: null,
      focusedImageId: null,
      sortAroundFocusStatus: null,
      sortAroundFocusGeneration: 0,
      _extendForwardInFlight: false,
      _extendBackwardInFlight: false,
      _lastPrependCount: 0,
      _prependGeneration: 0,
      _seekGeneration: 0,
      _seekTargetLocalIndex: -1,
      params: {
        aiQuery: "snowy peaks",
        offset: 0,
        length: 200,
        orderBy: "-uploadTime",
        nonFree: "true",
      },
    });
  });

  it("sets focusedImageId when sortAroundFocusId is in AI results (Back restore)", async () => {
    const genBefore = state().sortAroundFocusGeneration;

    await actions().search("ai-img-5");
    await flush();

    expect(state().focusedImageId).toBe("ai-img-5");
    // sortAroundFocusGeneration must be bumped to trigger scroll-to-focused
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
    // _scrollReset must NOT be bumped (that would scroll to top instead)
    // We check by verifying focus is set — if _scrollReset fired exclusively
    // it would clear the focused image concept.
    expect(state().results.length).toBe(20);
    expect(state().total).toBe(20);
  });

  it.each(["explicit", "phantom", "none"] as const)("KUP-008 pending sort preserves %s completion focus and relevance", async (mode) => {
    const source = makeAiMock(3, [3000, 1000, 2000]);
    const result = await source.searchByAi({});
    let release!: (value: typeof result) => void;
    const pending = new Promise<typeof result>((resolve) => { release = resolve; });
    const ai = vi.spyOn(source, "searchByAi").mockReturnValueOnce(pending);
    useSearchStore.setState({ dataSource: source, params: { ...state().params, orderBy: "-relevance" } });
    const anchor = mode === "none" ? null : "ai-img-1";
    const operation = actions().search(anchor, { phantomOnly: mode === "phantom" });
    for (const orderBy of ["-uploadTime", "-relevance", "-uploadTime"]) {
      actions().setParams({ orderBy });
      actions().resortAiBuffer(orderBy, anchor, mode === "phantom");
    }
    release(result);
    await operation;
    expect(state().params.orderBy).toBe("-uploadTime");
    expect(state().results.map((image) => image?.id)).toEqual(["ai-img-1", "ai-img-2", "ai-img-0"]);
    expect(state().focusedImageId).toBe(mode === "explicit" ? anchor : null);
    expect(state()._phantomFocusImageId).toBe(mode === "phantom" ? anchor : null);
    expect(state().loading).toBe(false);
    assertPositionsConsistent();
    actions().setParams({ orderBy: "-relevance" });
    actions().resortAiBuffer("-relevance", anchor, mode === "phantom");
    expect(state().results.map((image) => image?.id)).toEqual(["ai-img-0", "ai-img-1", "ai-img-2"]);
    expect(ai).toHaveBeenCalledTimes(1);
    assertPositionsConsistent();
  });

  it("KUP-008 an abort-ignoring old query cannot publish over a newer query or its params", async () => {
    const source = makeAiMock(3, [3000, 1000, 2000]);
    const result = await source.searchByAi({});
    let release!: (value: typeof result) => void;
    const pending = new Promise<typeof result>((resolve) => { release = resolve; });
    const ai = vi.spyOn(source, "searchByAi").mockReturnValueOnce(pending);
    useSearchStore.setState({ dataSource: source, params: { ...state().params, orderBy: "-relevance" } });
    const old = actions().search();
    actions().setParams({ aiQuery: "different-query", query: "credit:fixture", orderBy: "-uploadTime" });
    await actions().search();
    const currentResults = state().results;
    const currentParams = state().params;
    release({ ...result, hits: [], total: 0, sortValues: [] });
    await old;
    expect(ai).toHaveBeenCalledTimes(2);
    expect(state().results).toBe(currentResults);
    expect(state().params).toBe(currentParams);
    expect(state().params).toMatchObject({ aiQuery: "different-query", query: "credit:fixture", orderBy: "-uploadTime" });
    expect(state().loading).toBe(false);
    assertPositionsConsistent();
  });

  it("scrolls to top (no focus) when sortAroundFocusId is absent from AI results", async () => {
    const resetGenBefore = state()._scrollReset.gen;

    await actions().search("ai-img-nonexistent");
    await flush();

    expect(state().focusedImageId).toBeNull();
    expect(state()._scrollReset.gen).toBeGreaterThan(resetGenBefore);
  });

  it("does not set focusedImageId when no sortAroundFocusId provided", async () => {
    await actions().search();
    await flush();

    expect(state().focusedImageId).toBeNull();
    expect(state().results.length).toBe(20);
  });

  it("applies Uploaded ordering before publishing an initial AI result", async () => {
    useSearchStore.setState({
      dataSource: makeAiMock(3, [3000, 1000, 2000]) as unknown as import("@/dal").ImageDataSource,
    });

    await actions().search();
    await flush();

    expect(state().results.map((image) => image?.id)).toEqual([
      "ai-img-1",
      "ai-img-2",
      "ai-img-0",
    ]);
  });

  it("resets position when resorting AI results without an anchor", async () => {
    await actions().search();
    const resetBefore = state()._scrollReset.gen;

    actions().resortAiBuffer("uploadTime");

    expect(state()._scrollReset).toEqual({
      gen: resetBefore + 1,
      sortOnly: true,
    });
    assertPositionsConsistent("AI resort");
  });

  it("sets _phantomFocusImageId when phantomOnly is true and anchor found", async () => {
    await actions().search("ai-img-3", { phantomOnly: true });
    await flush();

    expect(state().focusedImageId).toBeNull();
    expect(state()._phantomFocusImageId).toBe("ai-img-3");
  });

  it("total === results.length invariant holds", async () => {
    await actions().search("ai-img-0");
    await flush();

    expect(state().total).toBe(state().results.length);
  });

  it("pitId remains null (no PIT for AI search)", async () => {
    await actions().search();
    await flush();

    expect(state().pitId).toBeNull();
  });
});
