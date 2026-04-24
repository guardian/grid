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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const state = () => useSearchStore.getState();
const actions = () => useSearchStore.getState();
const waitPastCooldown = () => new Promise((r) => setTimeout(r, 2100));

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
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
