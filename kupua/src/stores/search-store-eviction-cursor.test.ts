/**
 * Regression tests for audit bug #14:
 *   extractSortValues returning null during buffer eviction must not
 *   overwrite startCursor / endCursor with null.
 *
 * Root cause: both extendForward and extendBackward recompute the opposite-
 * direction cursor after eviction via extractSortValues. If extraction
 * returns null (e.g. malformed sort clause), the previous code assigns null
 * directly — permanently blocking the opposite-direction extend via its
 * `if (!startCursor) return` / `if (!endCursor) return` guard.
 *
 * Fix (symmetric): fall back to the previous cursor value rather than
 * overwriting with null.
 *
 *   extendForward eviction:  newStartCursor = evicted ?? state.startCursor
 *   extendBackward eviction: newEndCursor   = evicted ?? state.endCursor
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSearchStore } from "./search-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { registerScrollGeometry } from "@/lib/scroll-geometry-ref";

// ---------------------------------------------------------------------------
// vi.mock — wrap extractSortValues so tests can inject a null return.
//
// _simulateNullCursor: when true, the next call to extractSortValues returns
// null and the flag auto-resets (fires once). Module-level so the closure
// captures the live binding.
// ---------------------------------------------------------------------------

import { vi } from "vitest";

let _simulateNullCursor = false;

vi.mock("@/lib/image-offset-cache", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-offset-cache")>();
  return {
    ...real,
    extractSortValues: (...args: Parameters<typeof real.extractSortValues>) => {
      if (_simulateNullCursor) {
        _simulateNullCursor = false; // auto-reset — fires exactly once
        return null;
      }
      return real.extractSortValues(...args);
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const state = () => useSearchStore.getState();
const actions = () => useSearchStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Wait past the 2000ms SEARCH_FETCH_COOLDOWN_MS set by search(). */
const waitPastSearchCooldown = () => new Promise((r) => setTimeout(r, 2100));
/** Wait past the 50ms POST_EXTEND_COOLDOWN_MS set by extendBackward(). */
const waitPastExtendCooldown = () => new Promise((r) => setTimeout(r, 60));

let mock: MockDataSource;

beforeEach(() => {
  _simulateNullCursor = false; // safety reset between tests
  mock = new MockDataSource(10_000);
  // Single column so eviction count is rawEvict (no column rounding)
  registerScrollGeometry({ rowHeight: 303, columns: 1 });

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
    params: {
      query: undefined,
      offset: 0,
      length: 200,
      orderBy: "-uploadTime",
      nonFree: "true",
    },
  });
});

// ---------------------------------------------------------------------------
// Bug #14 — forward eviction
// ---------------------------------------------------------------------------

describe("bug #14 — forward eviction cursor preservation", () => {
  it("startCursor is preserved when extractSortValues returns null during forward eviction", async () => {
    // Setup: search (200 items) + waitPastCooldown + 4 extends → 1000 items
    // (exactly at BUFFER_CAPACITY=1000, no eviction yet)
    await actions().search();
    await waitPastSearchCooldown();

    for (let i = 0; i < 4; i++) {
      await actions().extendForward();
      await flush();
    }

    expect(state().results.length).toBe(1000);
    const cursorBeforeEviction = state().startCursor;
    expect(cursorBeforeEviction).not.toBeNull();

    // Simulate the failure: next extractSortValues call returns null.
    // The 5th extend pushes buffer to 1200 > 1000 → eviction of 200 from
    // start → extractSortValues is called on the new first item → returns null.
    _simulateNullCursor = true;
    await actions().extendForward();
    await flush();

    // Eviction should have happened (buffer still at capacity)
    expect(state().results.length).toBe(1000);
    expect(state().bufferOffset).toBeGreaterThan(0);

    // BUG: with current code, startCursor is null after eviction when
    //      extractSortValues returns null → extendBackward is permanently blocked.
    // FIX: startCursor should be preserved from the pre-eviction value.
    expect(state().startCursor).not.toBeNull();

    // Consequence test: extendBackward must not be blocked by the null guard.
    // bufferOffset > 0 so the "already at start" guard doesn't fire.
    // The preserved cursor points to position 0 (pre-eviction start), so ES
    // returns 0 items before it — but the key point is that a fetch was made
    // (guard didn't short-circuit at `!startCursor`).
    const requestsBefore = mock.requestCount;
    await actions().extendBackward();
    await flush();

    // If extendBackward was blocked at !startCursor (bug), no request is made.
    // If it ran (fix), a searchAfter request was issued.
    expect(mock.requestCount).toBeGreaterThan(requestsBefore);
  });
});

// ---------------------------------------------------------------------------
// Bug #14 — backward eviction (symmetric)
// ---------------------------------------------------------------------------

describe("bug #14 — backward eviction cursor preservation", () => {
  it("endCursor is preserved when extractSortValues returns null during backward eviction", async () => {
    // Search first to establish total, then seek mid-corpus.
    // seek() clamps to [0, total-1] so total must be known.
    await actions().search();
    await waitPastSearchCooldown();

    // Seek to position 5000 so there are 5000 items to extend backward into.
    // seek() fetches PAGE_SIZE=200 items centered around 5000.
    await actions().seek(5000);
    await new Promise((r) => setTimeout(r, 200)); // wait past SEEK_COOLDOWN_MS=100ms

    // 4 backward extends (200 items each) → 200 + 4×200 = 1000 (at capacity).
    // Wait > POST_EXTEND_COOLDOWN_MS=50ms between each.
    for (let i = 0; i < 4; i++) {
      await actions().extendBackward();
      await waitPastExtendCooldown();
    }

    expect(state().results.length).toBe(1000);
    const cursorBeforeEviction = state().endCursor;
    expect(cursorBeforeEviction).not.toBeNull();

    // Simulate the failure: next extractSortValues call returns null.
    // The 5th backward extend pushes buffer to 1200 > 1000 → eviction of
    // 200 from end → extractSortValues called on new last item → returns null.
    _simulateNullCursor = true;
    await actions().extendBackward();
    await waitPastExtendCooldown();

    expect(state().results.length).toBe(1000);

    // BUG: endCursor is null → extendForward is permanently blocked.
    // FIX: endCursor should be preserved.
    expect(state().endCursor).not.toBeNull();

    // Consequence test: extendForward must not be blocked by a null endCursor.
    // Wait past the POST_EXTEND_COOLDOWN_MS set by the last extendBackward.
    await waitPastExtendCooldown();

    const totalBefore = state().bufferOffset + state().results.length;
    await actions().extendForward();
    await flush();

    // If extendForward was blocked (bug), the global end doesn't advance.
    // If it ran (fix), the buffer end advances.
    const totalAfter = state().bufferOffset + state().results.length;
    expect(totalAfter).toBeGreaterThan(totalBefore);
  });
});
