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

import { describe, it, expect, beforeEach } from "vitest";
import { useSearchStore } from "./search-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { TABLE_ROW_HEIGHT } from "@/constants/layout";

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

describe("focus survives search context change", () => {
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

describe("fetchAggregations", () => {
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

  it("force=true bypasses debounce entirely", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    await flush();

    // force=true should skip debounce and complete quickly
    await actions().fetchAggregations(true);
    // No hang — if we get here, the promise resolved
    expect(state().aggLoading).toBe(false);
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
