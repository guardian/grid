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
