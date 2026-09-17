/**
 * P2-4 — Parallel PIT open tests.
 *
 * These tests run with IS_LOCAL_ES=false so they exercise the openPit()
 * code path (which is guarded by !IS_LOCAL_ES in production). A module-level
 * vi.mock ensures the mock is in place before search-store.ts is loaded.
 *
 * Covers:
 * 1. Promise.all rejection isolation — openPit rejects, search still succeeds.
 * 2. Extend after parallel-mode search — PIT id stored correctly, extend works.
 * 3. _pitGeneration bumps synchronously before the first await.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// Override IS_LOCAL_ES before search-store.ts is loaded so the openPit
// branch is exercised. Hoisted by Vitest, runs before all imports.
vi.mock("@/dal/es-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/dal/es-config")>();
  return { ...actual, IS_LOCAL_ES: false };
});

import { useSearchStore } from "./search-store";
import { MockDataSource } from "@/dal/mock-data-source";
import type { SearchAfterResult } from "@/dal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const state = () => useSearchStore.getState();
const actions = () => useSearchStore.getState();
const waitPastCooldown = () => new Promise((r) => setTimeout(r, 2100));

function deferredPage() {
  let resolve!: (result: SearchAfterResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<SearchAfterResult>((resolvePage, rejectPage) => {
    resolve = resolvePage;
    reject = rejectPage;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mock: MockDataSource;

function resetStore(ds: MockDataSource) {
  useSearchStore.setState({
    dataSource: ds,
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
    _pitGeneration: 0,
    params: {
      query: undefined,
      offset: 0,
      length: 200,
      orderBy: "-uploadTime",
      nonFree: "true",
    },
  });
}

beforeEach(() => {
  mock = new MockDataSource(10_000);
  resetStore(mock);
});

describe("PIT expiry recovery", () => {
  it("does not resurrect a PIT when focus waits for rank after its pages arrive", async () => {
    mock = new MockDataSource(70_000);
    resetStore(mock);
    await actions().search();
    let resolveRank!: (offset: number) => void;
    const rank = new Promise<number>((resolve) => { resolveRank = resolve; });
    vi.spyOn(mock, "countBefore").mockImplementationOnce(() => rank);
    const searchAfter = mock.searchAfter.bind(mock);
    let surroundingPages = 0;
    vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await searchAfter(...args);
      if (args[0].length === 100 && args[2]) surroundingPages++;
      return { ...result, pitId: args[5] ? null : args[2] };
    });

    await actions().search("img-15000");
    await vi.waitFor(() => expect(surroundingPages).toBe(2));
    await actions().seek(69_999);
    expect(state().pitId).toBeNull();
    resolveRank(15_000);
    await vi.waitFor(() => expect(state().results.some((image) => image?.id === "img-15000")).toBe(true));

    expect(state().pitId).toBeNull();
  });

  it("does not resurrect a PIT from a concurrent forward extension after backward recovery", async () => {
    await actions().search();
    await actions().seek(5000);
    await waitPastCooldown();
    const searchAfter = mock.searchAfter.bind(mock);
    const forward = deferredPage();
    const backward = deferredPage();
    const fetch = vi.spyOn(mock, "searchAfter").mockImplementation((...args) => args[4] ? backward.promise : forward.promise);
    const forwardOperation = actions().extendForward();
    const backwardOperation = actions().extendBackward();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const backwardArgs = fetch.mock.calls.find((args) => args[4])!;
    const forwardArgs = fetch.mock.calls.find((args) => !args[4])!;

    backward.resolve({ ...await searchAfter(...backwardArgs), pitId: null });
    await backwardOperation;
    expect(state().pitId).toBeNull();
    forward.resolve({ ...await searchAfter(...forwardArgs), pitId: "mock-pit-id" });
    await forwardOperation;

    expect(state().pitId).toBeNull();
  });

  it.each(["focus", "restore", "mapped seek", "deep seek"] as const)("keeps a recovered %s PIT cleared when the backward page fails", async (mode) => {
    const total = mode === "deep seek" ? 70_000 : 30_000;
    mock = new MockDataSource(total);
    resetStore(mock);
    await actions().search();
    if (total === 30_000) await vi.waitFor(() => expect(state().positionMap?.length).toBe(total));
    const searchAfter = mock.searchAfter.bind(mock);
    const target = await searchAfter({ ...state().params, ids: "img-15000", length: 1 }, null);
    const backward = deferredPage();
    let recovered = false;
    vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      if (args[4]) return backward.promise;
      const result = await searchAfter(...args);
      if (!args[2]) return result;
      recovered = true;
      return { ...result, pitId: null };
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const operation = mode === "focus"
        ? actions().search("img-15000")
        : mode === "restore"
          ? actions().restoreAroundCursor("img-15000", target.sortValues[0], 15000)
          : actions().seek(total / 2);
      await vi.waitFor(() => expect(recovered).toBe(true));
      backward.reject(new Error("deliberate refusal"));
      await operation;
      await vi.waitFor(() => expect(state().loading).toBe(false));

      expect(state().pitId).toBeNull();
    } finally {
      warning.mockRestore();
    }
  });

  it("does not resend an expired PIT in keyword end correction", async () => {
    mock = new MockDataSource(70_000);
    resetStore(mock);
    await actions().search();
    const landed = await mock.searchAfter({ ...state().params, offset: 50_000, length: 200 }, null);
    const fetchSortDistribution = state().fetchSortDistribution;
    useSearchStore.setState({
      params: { ...state().params, orderBy: "credit" },
      sortDistribution: null,
      fetchSortDistribution: async () => {},
    });
    vi.spyOn(mock, "estimateSortValue").mockResolvedValue(null);
    mock.findKeywordSortValue = vi.fn().mockResolvedValue("fixture");
    vi.spyOn(mock, "countBefore").mockResolvedValue(50_000);
    const fetch = vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => ({
      ...landed,
      sortValues: landed.hits.map((image) => ["fixture", Date.parse(image.uploadTime), image.id]),
      pitId: args[5] ? args[2] : null,
    }));
    try {
      await actions().seek(65_000);

      const correction = fetch.mock.calls.find((args) => args[5]);
      expect(correction).toBeDefined();
      expect(correction![2]).toBeNull();
      expect(state().pitId).toBeNull();
    } finally {
      useSearchStore.setState({ fetchSortDistribution });
    }
  });

  it("clears the PIT during scroll-mode fill and stops sending it on later chunks", async () => {
    mock = new MockDataSource(650);
    resetStore(mock);
    const searchAfter = mock.searchAfter.bind(mock);
    const fetch = vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await searchAfter(...args);
      return { ...result, pitId: args[1] ? null : undefined };
    });

    await actions().search();
    await vi.waitFor(() => expect(state().results).toHaveLength(650));

    expect(state().pitId).toBeNull();
    const chunks = fetch.mock.calls.filter((args) => args[1]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0][2]).toBe("mock-pit-id");
    expect(chunks.slice(1).every((args) => args[2] === null)).toBe(true);
  });

  it.each([
    { direction: "forward", empty: false }, { direction: "forward", empty: true },
    { direction: "backward", empty: false }, { direction: "backward", empty: true },
  ])("clears the PIT after $direction extension recovery (empty=$empty)", async ({ direction, empty }) => {
    await actions().search();
    await actions().seek(5000);
    await waitPastCooldown();
    const searchAfter = mock.searchAfter.bind(mock);
    vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await searchAfter(...args);
      return { ...result, ...(empty ? { hits: [], sortValues: [] } : {}), pitId: null };
    });

    if (direction === "forward") await actions().extendForward();
    else await actions().extendBackward();

    expect(state().pitId).toBeNull();
    expect(state().error).toBeNull();
  });

  it.each(["focus", "restore", "mapped seek", "deep seek"] as const)("does not retain the forward PIT when the backward %s page recovered", async (mode) => {
    const total = mode === "deep seek" ? 70_000 : 30_000;
    mock = new MockDataSource(total);
    resetStore(mock);
    await actions().search();
    if (total === 30_000) await vi.waitFor(() => expect(state().positionMap?.length).toBe(total));
    const searchAfter = mock.searchAfter.bind(mock);
    const target = await searchAfter({ ...state().params, ids: "img-15000", length: 1 }, null);
    vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const result = await searchAfter(...args);
      return { ...result, pitId: args[4] ? null : args[2] };
    });

    if (mode === "focus") {
      await actions().search("img-15000");
      await vi.waitFor(() => expect(state().loading).toBe(false));
    } else if (mode === "restore") {
      await actions().restoreAroundCursor("img-15000", target.sortValues[0], 15000);
    } else {
      await actions().seek(total / 2);
    }

    expect(state().pitId).toBeNull();
    expect(state().error).toBeNull();
    expect(state().results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 1 — Promise.all rejection isolation
// ---------------------------------------------------------------------------

describe("P2-4: openPit rejection isolation", () => {
  it("search succeeds with pitId=null when openPit rejects", async () => {
    // Replace openPit with a rejection
    mock.openPit = vi.fn().mockRejectedValue(new Error("PIT open failed (test)"));
    resetStore(mock);

    await actions().search();

    // Search must succeed — results loaded, no error state
    expect(state().results.length).toBeGreaterThan(0);
    expect(state().loading).toBe(false);
    expect(state().error).toBeNull();

    // pitId must be null — the .catch() returned null, no fallback pitId from result
    // (first search has no PIT, so result.pitId is undefined)
    expect(state().pitId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2 — PIT id stored correctly after parallel-mode search
// ---------------------------------------------------------------------------

describe("P2-4: PIT id stored after parallel search", () => {
  it("state.pitId equals the id returned by openPit after search()", async () => {
    // MockDataSource.openPit returns "mock-pit-id"
    await actions().search();

    expect(state().pitId).toBe("mock-pit-id");
    expect(state().results.length).toBeGreaterThan(0);
    expect(state().loading).toBe(false);
  });

  it("extendForward works after a parallel-mode search", async () => {
    await actions().search();
    await waitPastCooldown();

    const beforeCount = state().results.length;
    await actions().extendForward();

    // Buffer should have grown (more images loaded)
    expect(state().results.length).toBeGreaterThan(beforeCount);
    expect(state().loading).toBe(false);
    expect(state().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — _pitGeneration bumps synchronously before first await
// ---------------------------------------------------------------------------

describe("P2-4: _pitGeneration bumps synchronously", () => {
  it("_pitGeneration is already incremented before Promise.all resolves", () => {
    const gen0 = state()._pitGeneration;

    // Start search without awaiting — synchronous code runs up to first await
    const searchPromise = actions().search();

    // The set({ _pitGeneration: ... }) call is before await Promise.all(...)
    // so it must have already fired when we reach here.
    expect(state()._pitGeneration).toBe(gen0 + 1);

    // Let the promise settle to avoid leaking async work into the next test
    return searchPromise;
  });

  it("_pitGeneration increments on each search()", async () => {
    const gen0 = state()._pitGeneration;

    await actions().search();
    expect(state()._pitGeneration).toBe(gen0 + 1);

    await actions().search();
    expect(state()._pitGeneration).toBe(gen0 + 2);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — superseded search closes its own PIT instead of leaving it to expire
// ---------------------------------------------------------------------------

describe("Superseded search closes its PIT", () => {
  it("closes a stale search's PIT once it resolves after being superseded", async () => {
    const closeSpy = vi.spyOn(mock, "closePit");
    let resolveFirst!: (id: string) => void;
    const firstBarrier = new Promise<string>((r) => { resolveFirst = r; });
    let call = 0;
    mock.openPit = vi.fn(async () => {
      call++;
      return call === 1 ? firstBarrier : "fresh-pit-id";
    });

    const search1 = actions().search("stale-query");
    const search2 = actions().search("fresh-query"); // supersedes search1
    await search2;

    resolveFirst("stale-pit-id"); // search1's openPit resolves after being superseded
    await search1;

    expect(closeSpy).toHaveBeenCalledWith("stale-pit-id");
    // The winner's own PIT must not be closed by the loser's cleanup.
    expect(closeSpy).not.toHaveBeenCalledWith("fresh-pit-id");
    expect(state().pitId).toBe("fresh-pit-id");
  });
});
