/**
 * Extended integration tests for the search-store state machine.
 *
 * Covers scenarios reported as bugs, plus edge cases around:
 * - Sort-context label (interpolation for different orderBy values)
 * - Seek + extend sequences (the exact flows that cause UI bugs)
 * - Sort changes (sort-around-focus with different sort orders)
 * - Buffer state after sort change (new search resets everything)
 * - Cursor integrity after sort change
 * - Search → seek → extend → seek chains
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSearchStore } from "./search-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { TABLE_ROW_HEIGHT } from "@/constants/layout";
import { interpolateSortLabel, getSortContextLabel } from "@/lib/sort-context";
import { buildSortClause, reverseSortClause } from "@/dal/adapters/elasticsearch/sort-builders";

// ---------------------------------------------------------------------------
// Helpers (shared with search-store.test.ts)
// ---------------------------------------------------------------------------

const state = () => useSearchStore.getState();
const actions = () => useSearchStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
const waitPastCooldown = () => new Promise((r) => setTimeout(r, 2100));

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
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

/** Assert focused image is in the buffer at the correct position. */
function assertFocusedImageInBuffer() {
  const { focusedImageId, imagePositions, bufferOffset, results } = state();
  if (!focusedImageId) return;
  const globalIdx = imagePositions.get(focusedImageId);
  expect(globalIdx, "focused image should be in imagePositions").toBeDefined();
  const localIdx = globalIdx! - bufferOffset;
  expect(localIdx, "focused image should be in buffer bounds").toBeGreaterThanOrEqual(0);
  expect(localIdx, "focused image should be in buffer bounds").toBeLessThan(results.length);
  expect(results[localIdx]?.id, "focused image at localIdx should match").toBe(focusedImageId);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mock: MockDataSource;

beforeEach(() => {
  mock = new MockDataSource(10_000);
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
// Sort-context label tests — exercise every orderBy value
// ---------------------------------------------------------------------------

describe("sort-context label — resolveSortMapping", () => {
  it("resolves -uploadTime to date label", async () => {
    await actions().search();
    const img = state().results[0]!;
    const label = getSortContextLabel("-uploadTime", img);
    expect(label).not.toBeNull();
    expect(label!.replace(/<[^>]+>/g, "")).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
  });

  it("resolves uploadTime (asc) to date label", async () => {
    await actions().search();
    const img = state().results[0]!;
    const label = getSortContextLabel("uploadTime", img);
    expect(label).not.toBeNull();
  });

  it("resolves -taken alias to dateTaken label", async () => {
    // "taken" → "metadata.dateTaken" via SORT_KEY_ALIASES
    await actions().search();
    const img = state().results[0]!;
    // Our mock images don't have dateTaken, so should be null
    const label = getSortContextLabel("-taken", img);
    expect(label).toBeNull(); // mock doesn't set dateTaken
  });

  it("resolves -lastModified to date label", async () => {
    await actions().search();
    const img = state().results[0]!;
    const label = getSortContextLabel("-lastModified", img);
    expect(label).not.toBeNull();
  });

  it("resolves -credit to keyword label", async () => {
    await actions().search();
    const img = state().results[0]!;
    const label = getSortContextLabel("-credit", img);
    expect(label).not.toBeNull();
    expect(["Getty", "Reuters", "AP", "EPA", "PA"]).toContain(label);
  });

  it("resolves uploadedBy to keyword label", async () => {
    await actions().search();
    const img = state().results[0]!;
    const label = getSortContextLabel("uploadedBy", img);
    expect(label).not.toBeNull();
    expect(label).toMatch(/^user-\d+$/);
  });

  it("returns null for _script:dimensions", async () => {
    await actions().search();
    const img = state().results[0]!;
    expect(getSortContextLabel("_script:dimensions", img)).toBeNull();
  });

  it("returns a date for undefined orderBy (defaults to -uploadTime)", async () => {
    await actions().search();
    const img = state().results[0]!;
    // undefined orderBy means default sort = -uploadTime, so we should get a date
    const label = getSortContextLabel(undefined, img);
    expect(label).not.toBeNull();
    expect(label!.replace(/<[^>]+>/g, "")).toMatch(/\d{1,2} \w{3} \d{4}/); // e.g. "1 Jan 2020"
  });
});

// ---------------------------------------------------------------------------
// interpolateSortLabel — deeper tests
// ---------------------------------------------------------------------------

describe("interpolateSortLabel — interpolation", () => {
  it("returns exact date for position inside buffer", async () => {
    await actions().search();
    const { results, bufferOffset } = state();
    const label = interpolateSortLabel("-uploadTime", 100, 10_000, bufferOffset, results);
    expect(label).not.toBeNull();
    // Calling again with same args should return the same value (deterministic)
    expect(label).toBe(interpolateSortLabel("-uploadTime", 100, 10_000, bufferOffset, results));
  });

  it("interpolates dates outside buffer (above)", async () => {
    await actions().search();
    const { results, bufferOffset, total } = state();
    const label = interpolateSortLabel("-uploadTime", 5000, total, bufferOffset, results);
    expect(label).not.toBeNull();
    expect(label!.replace(/<[^>]+>/g, "")).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
  });

  it("interpolates dates outside buffer (below — negative local)", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { results, bufferOffset, total } = state();
    // Position 0 is below the buffer (buffer starts at ~4900)
    const label = interpolateSortLabel("-uploadTime", 0, total, bufferOffset, results);
    expect(label).not.toBeNull();
  });

  it("returns null for empty results", () => {
    const label = interpolateSortLabel("-uploadTime", 0, 10_000, 0, []);
    expect(label).toBeNull();
  });

  it("returns null for total=0", async () => {
    const label = interpolateSortLabel("-uploadTime", 0, 0, 0, []);
    expect(label).toBeNull();
  });

  it("returns keyword from nearest edge for text sort outside buffer", async () => {
    await actions().search();
    const { results, bufferOffset, total } = state();
    const label = interpolateSortLabel("-credit", 5000, total, bufferOffset, results);
    expect(label).not.toBeNull();
    // Should be one of the credits
    expect(["Getty", "Reuters", "AP", "EPA", "PA"]).toContain(label);
  });
});

// ---------------------------------------------------------------------------
// Sort change resets buffer
// ---------------------------------------------------------------------------

describe("sort change — buffer reset", () => {
  it("search resets bufferOffset to 0", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();
    expect(state().bufferOffset).toBeGreaterThan(0);

    // Simulate sort change by searching again
    await actions().search();
    expect(state().bufferOffset).toBe(0);
  });

  it("search resets cursors", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const oldStart = state().startCursor;
    const oldEnd = state().endCursor;

    await actions().search();

    // Cursors should be from the new first page, not the old seek position
    expect(state().startCursor).not.toEqual(oldStart);
    expect(state().endCursor).not.toEqual(oldEnd);
  });

  it("search with new orderBy resets everything", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();
    actions().setFocusedImageId("img-5050");

    // Change orderBy and search
    useSearchStore.setState({
      params: { ...state().params, orderBy: "-credit" },
    });
    await actions().search();

    expect(state().bufferOffset).toBe(0);
    expect(state().results.length).toBe(200);
    expect(state().focusedImageId).toBeNull(); // cleared by search
    assertPositionsConsistent("after sort change search");
  });
});

// ---------------------------------------------------------------------------
// Seek → extend → seek chains (the exact flows causing UI bugs)
// ---------------------------------------------------------------------------

describe("seek → extend → seek chains", () => {
  it("seek then extendForward then extendBackward maintains consistency", async () => {
    await actions().search();
    await actions().seek(5000);
    await waitPastCooldown();

    await actions().extendForward();
    await flush();
    assertPositionsConsistent("after seek+extendForward");

    await actions().extendBackward();
    await flush();
    assertPositionsConsistent("after seek+extend both");
  });

  it("multiple seeks maintain consistency", async () => {
    await actions().search();

    for (const pos of [1000, 5000, 9000, 500, 7500]) {
      await actions().seek(pos);
      await flush();
      assertPositionsConsistent(`after seek to ${pos}`);

      const { bufferOffset, results } = state();
      expect(bufferOffset + results.length).toBeGreaterThanOrEqual(
        Math.min(pos, state().total - 1),
      );
    }
  });

  it("seek, extend forward x3, seek to start, extend forward again", async () => {
    await actions().search();
    await actions().seek(3000);
    await waitPastCooldown();

    // Extend forward 3 times
    for (let i = 0; i < 3; i++) {
      await actions().extendForward();
      await flush();
    }
    assertPositionsConsistent("after seek+3x extendForward");

    // Seek back to start
    await actions().seek(0);
    await waitPastCooldown();
    expect(state().bufferOffset).toBe(0);
    assertPositionsConsistent("after seek to 0");

    // Extend forward again
    await actions().extendForward();
    await flush();
    assertPositionsConsistent("final extend");
  });
});

// ---------------------------------------------------------------------------
// Focused image survives seek
// ---------------------------------------------------------------------------

describe("focused image after seek", () => {
  it("focusedImageId survives seek that includes the image", async () => {
    await actions().search();
    actions().setFocusedImageId("img-100");

    // Seek to position near the focused image
    await actions().seek(100);
    await flush();

    // img-100 should still be focused and in the buffer
    expect(state().focusedImageId).toBe("img-100");
    // Note: seek doesn't clear focusedImageId. The image should still be
    // in the buffer because seek(100) centers around 100.
  });

  it("focusedImageId persists after seek away (no auto-clear)", async () => {
    await actions().search();
    actions().setFocusedImageId("img-50");

    // Seek far away — img-50 won't be in the new buffer
    await actions().seek(8000);
    await flush();

    // focusedImageId is NOT cleared by seek — it persists
    // (it's up to the view to handle the image not being visible)
    expect(state().focusedImageId).toBe("img-50");
  });
});

// ---------------------------------------------------------------------------
// _seekGeneration chain
// ---------------------------------------------------------------------------

describe("_seekGeneration chain", () => {
  it("only bumps on seek, not on search or extend", async () => {
    await actions().search();
    const genAfterSearch = state()._seekGeneration;

    await waitPastCooldown();
    await actions().extendForward();
    await flush();
    expect(state()._seekGeneration).toBe(genAfterSearch);

    await actions().seek(3000);
    await flush();
    expect(state()._seekGeneration).toBe(genAfterSearch + 1);
  });

  it("_seekTargetLocalIndex is within buffer bounds", async () => {
    await actions().search();

    for (const pos of [0, 100, 5000, 9990]) {
      await actions().seek(pos);
      await flush();
      const { _seekTargetLocalIndex, results } = state();
      expect(_seekTargetLocalIndex).toBeGreaterThanOrEqual(0);
      expect(_seekTargetLocalIndex).toBeLessThan(results.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Sort-around-focus with different sort fields
// ---------------------------------------------------------------------------

describe("sort-around-focus — different sorts", () => {
  it("works with default -uploadTime sort", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    actions().setFocusedImageId("img-250");

    await actions().search("img-250");
    await waitFor(() => state().sortAroundFocusStatus === null, 5000, "focus found");

    expect(state().focusedImageId).toBe("img-250");
    assertFocusedImageInBuffer();
  });

  it("buffer positions are correct after sort-around-focus", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    actions().setFocusedImageId("img-300");

    await actions().search("img-300");
    await waitFor(() => state().sortAroundFocusStatus === null, 5000, "focus found");

    assertPositionsConsistent("after sort-around-focus");

    // The focused image should be at a known position
    const { imagePositions, focusedImageId } = state();
    expect(focusedImageId).toBe("img-300");
    const globalIdx = imagePositions.get("img-300");
    expect(globalIdx).toBeDefined();
  });

  it("sort-around-focus bumps sortAroundFocusGeneration when outside buffer", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    const genBefore = state().sortAroundFocusGeneration;
    actions().setFocusedImageId("img-400");

    await actions().search("img-400");
    await waitFor(() => state().sortAroundFocusStatus === null, 5000, "focus found");

    // Should have bumped sortAroundFocusGeneration (needed reposition).
    // NOTE: _seekGeneration is intentionally NOT bumped — see Bug #15 fix.
    // sortAroundFocusGeneration is the sole scroll trigger for sort-around-focus.
    expect(state().sortAroundFocusGeneration).toBeGreaterThan(genBefore);
  });

  it("sort-around-focus does NOT bump _seekGeneration when in first page", async () => {
    await actions().search();
    const genBefore = state()._seekGeneration;
    actions().setFocusedImageId("img-50");

    await actions().search("img-50");
    await flush();

    // Image was in first page — no seek needed
    expect(state()._seekGeneration).toBe(genBefore);
  });
});

// ---------------------------------------------------------------------------
// Density-switch viewport ratio — more comprehensive
// ---------------------------------------------------------------------------

describe("density-switch viewport ratio — comprehensive", () => {
  const ROW_HEIGHT = TABLE_ROW_HEIGHT;
  const CLIENT_HEIGHT = 600;

  it("ratio is small and reasonable for focused image at various scroll positions", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, imagePositions, results } = state();

    // Test several local indices
    for (const localIdx of [0, 50, 100, results.length - 1]) {
      if (localIdx >= results.length) continue;
      const image = results[localIdx]!;
      if (!image) continue;

      actions().setFocusedImageId(image.id);
      const globalIdx = imagePositions.get(image.id)!;

      // Simulate scroll to that row
      const scrollTop = localIdx * ROW_HEIGHT;

      // Correct calculation (buffer-local)
      const correctRatio = (localIdx * ROW_HEIGHT - scrollTop) / CLIENT_HEIGHT;

      // Buggy calculation (global index)
      const buggyRatio = (globalIdx * ROW_HEIGHT - scrollTop) / CLIENT_HEIGHT;

      expect(
        Math.abs(correctRatio),
        `localIdx=${localIdx}: correct ratio should be small`,
      ).toBeLessThan(2);

      if (bufferOffset > 0) {
        expect(
          Math.abs(buggyRatio),
          `localIdx=${localIdx}: buggy ratio should be huge`,
        ).toBeGreaterThan(10);
      }
    }
  });

  it("ratio round-trip: save then restore at same scroll position", async () => {
    await actions().search();
    await actions().seek(5000);
    await flush();

    const { bufferOffset, imagePositions, results } = state();
    const localIdx = 50;
    const image = results[localIdx]!;
    actions().setFocusedImageId(image.id);

    // Simulate: user is looking at localIdx=50, scrollTop=1600px (50 * 32)
    const scrollTop = localIdx * ROW_HEIGHT;

    // SAVE (unmount): compute ratio using buffer-local index
    const globalIdx = imagePositions.get(image.id)!;
    const localForSave = globalIdx - bufferOffset;
    const savedRatio = (localForSave * ROW_HEIGHT - scrollTop) / CLIENT_HEIGHT;

    // RESTORE (mount): use findImageIndex (returns buffer-local)
    const localForRestore = localForSave; // same — buffer hasn't changed
    const restoredRowTop = localForRestore * ROW_HEIGHT;
    const restoredScroll = restoredRowTop - savedRatio * CLIENT_HEIGHT;

    // Should restore to approximately the same scrollTop
    expect(Math.abs(restoredScroll - scrollTop)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// buildSortClause and reverseSortClause
// ---------------------------------------------------------------------------

describe("buildSortClause + reverseSortClause", () => {
  it("taken alias expands to dateTaken + uploadTime fallback + id tiebreaker", () => {
    const sort = buildSortClause("-taken");
    // -taken → metadata.dateTaken desc. Date sort → uploadTime fallback
    // inherits primary direction (desc). Then id tiebreaker.
    expect(sort).toEqual([
      { "metadata.dateTaken": "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("reverseSortClause flips all directions", () => {
    const sort = buildSortClause("-uploadTime");
    // [{ uploadTime: "desc" }, { id: "asc" }]
    const reversed = reverseSortClause(sort);
    expect(reversed).toEqual([{ uploadTime: "asc" }, { id: "desc" }]);
  });

  it("reverseSortClause handles multi-field sort", () => {
    const sort = buildSortClause("-taken");
    const reversed = reverseSortClause(sort);
    // Each field should have its direction flipped
    for (let i = 0; i < sort.length; i++) {
      const origKey = Object.keys(sort[i])[0];
      const revKey = Object.keys(reversed[i])[0];
      expect(origKey).toBe(revKey);
      expect(sort[i][origKey]).not.toBe(reversed[i][revKey]);
    }
  });

});

// ---------------------------------------------------------------------------
// Cursor integrity after search
// ---------------------------------------------------------------------------

describe("cursor integrity", () => {
  it("startCursor and endCursor are set after search", async () => {
    await actions().search();
    expect(state().startCursor).not.toBeNull();
    expect(state().endCursor).not.toBeNull();
  });

  it("startCursor corresponds to first image", async () => {
    await actions().search();
    const { startCursor, results } = state();
    const firstImg = results[0]!;
    // startCursor should contain the first image's ID as the tiebreaker
    expect(startCursor).not.toBeNull();
    const lastVal = startCursor![startCursor!.length - 1];
    expect(lastVal).toBe(firstImg.id);
  });

  it("endCursor corresponds to last image", async () => {
    await actions().search();
    const { endCursor, results } = state();
    const lastImg = results[results.length - 1]!;
    expect(endCursor).not.toBeNull();
    const lastVal = endCursor![endCursor!.length - 1];
    expect(lastVal).toBe(lastImg.id);
  });

  it("cursors update after extendForward", async () => {
    await actions().search();
    await waitPastCooldown();

    const endBefore = state().endCursor;
    await actions().extendForward();
    await flush();

    // endCursor should now point to the new last image
    const { endCursor, results } = state();
    expect(endCursor).not.toEqual(endBefore);
    const lastImg = results[results.length - 1]!;
    expect(endCursor![endCursor!.length - 1]).toBe(lastImg.id);
  });

  it("cursors update after extendBackward", async () => {
    await actions().search();
    await actions().seek(5000);
    await waitPastCooldown();

    const startBefore = state().startCursor;
    await actions().extendBackward();
    await flush();

    // startCursor should now point to the new first image
    const { startCursor, results } = state();
    expect(startCursor).not.toEqual(startBefore);
    const firstImg = results[0]!;
    expect(startCursor![startCursor!.length - 1]).toBe(firstImg.id);
  });

  it("startCursor is null-safe after forward eviction invalidation", async () => {
    await actions().search();
    await waitPastCooldown();

    // Extend forward enough to trigger eviction
    for (let i = 0; i < 6; i++) {
      await actions().extendForward();
      await flush();
    }

    // After eviction from start, startCursor may be invalidated (set to null)
    // This is acceptable — extendBackward guards against null cursor
    // The important thing is that it doesn't crash
    const { startCursor } = state();
    // startCursor can be null or valid — both are fine
    if (startCursor) {
      // If set, it should contain an image ID
      expect(typeof startCursor[startCursor.length - 1]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Large-scale consistency (stress test)
// ---------------------------------------------------------------------------

describe("large-scale consistency", () => {
  it("seek to 100 random positions maintains consistency", async () => {
    mock = new MockDataSource(100_000);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();

    // Random positions including edges
    const positions = [
      0, 1, 50_000, 99_999, 99_998,
      ...Array.from({ length: 15 }, () => Math.floor(Math.random() * 100_000)),
    ];

    for (const pos of positions) {
      await actions().seek(pos);
      await flush();
      assertPositionsConsistent(`seek to ${pos}`);

      const { bufferOffset, results, total } = state();
      expect(results.length).toBeGreaterThan(0);
      expect(bufferOffset).toBeGreaterThanOrEqual(0);
      expect(bufferOffset + results.length).toBeLessThanOrEqual(total);
    }
  });

  it("extend chain never corrupts imagePositions", async () => {
    await actions().search();
    await waitPastCooldown();

    // Alternate forward and backward extends
    await actions().seek(5000);
    await waitPastCooldown();

    for (let i = 0; i < 5; i++) {
      await actions().extendForward();
      await flush();
      assertPositionsConsistent(`extend forward ${i}`);

      await actions().extendBackward();
      await flush();
      assertPositionsConsistent(`extend backward ${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// ES request count (load concerns)
// ---------------------------------------------------------------------------

describe("ES request count", () => {
  it("basic search makes exactly 1 searchAfter request (+1 position map)", async () => {
    mock.requestCount = 0;
    await actions().search();
    // 1 searchAfter for the first page + 1 fetchPositionIndex (background,
    // because 10k > SCROLL_MODE_THRESHOLD and ≤ POSITION_MAP_THRESHOLD).
    // PIT open skipped on local ES.
    expect(mock.requestCount).toBe(2);
  });

  it("sort-around-focus in first page makes only 1 extra request (+1 position map)", async () => {
    await actions().search();
    mock.requestCount = 0;

    actions().setFocusedImageId("img-50");
    await actions().search("img-50");
    await flush();

    // 1 for the search itself + 1 fetchPositionIndex (background).
    // The image is in the first page, so _findAndFocusImage should not be
    // called (no extra requests beyond search + position map).
    expect(mock.requestCount).toBe(2);
  });

  it("sort-around-focus outside first page makes ≤5 requests", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });

    await actions().search();
    actions().setFocusedImageId("img-300");
    mock.requestCount = 0;

    await actions().search("img-300");
    await waitFor(() => state().sortAroundFocusStatus === null, 5000, "focus found");

    // search: 1 searchAfter
    // _findAndFocusImage: 1 searchAfter(ids) + 1 countBefore + 2 searchAfter (fwd+back)
    // Total: ≤5
    expect(mock.requestCount).toBeLessThanOrEqual(5);
  });
});


// ---------------------------------------------------------------------------
// Null-zone seek + extend — sparse field tests
// ---------------------------------------------------------------------------

describe("null-zone seek (sparse lastModified)", () => {
  // 50,000 images, 20% have lastModified (10,000 with the field).
  // With -lastModified sort: positions 0–9,999 = covered zone (have field),
  // positions 10,000–49,999 = null zone (no field, sorted by uploadTime fallback).
  // DEEP_SEEK_THRESHOLD is 10,000 in .env.test, so seeking to 25,000
  // triggers the deep path + null-zone detection.
  const TOTAL = 50_000;
  const RATIO = 0.2;
  const COVERED = TOTAL * RATIO; // 10,000

  let sparseMock: MockDataSource;

  beforeEach(() => {
    sparseMock = new MockDataSource(TOTAL, [{ field: "lastModified", ratio: RATIO }]);
    useSearchStore.setState({
      dataSource: sparseMock,
      params: {
        query: undefined,
        offset: 0,
        length: 200,
        orderBy: "-lastModified",
        nonFree: "true",
      },
    });
  });

  it("seek to 50% lands in the null zone with no error", async () => {
    await actions().search();
    await flush();
    expect(state().total).toBe(TOTAL);
    expect(state().error).toBeNull();

    // Seek to 50% — well into the null zone (position 25,000 > coveredCount 10,000)
    await actions().seek(Math.floor(TOTAL / 2));
    await flush();

    expect(state().error).toBeNull();
    expect(state().results.length).toBeGreaterThan(0);
    // bufferOffset should be in the null zone (past covered count)
    expect(state().bufferOffset).toBeGreaterThanOrEqual(COVERED);
    assertPositionsConsistent("after null-zone seek");
  });

  it("endCursor after null-zone seek has null in primary field position", async () => {
    await actions().search();
    await actions().seek(Math.floor(TOTAL / 2));
    await flush();

    const { endCursor } = state();
    expect(endCursor).not.toBeNull();
    // Sort clause for -lastModified: [lastModified desc, uploadTime desc, id asc]
    // Null-zone remapping puts null at position 0 (the primary field)
    expect(endCursor![0]).toBeNull();
    // uploadTime and id should be concrete values
    expect(endCursor![1]).not.toBeNull();
    expect(endCursor![2]).not.toBeNull();
  });

  it("extendForward after null-zone seek succeeds (no ES 500)", async () => {
    await actions().search();
    await actions().seek(Math.floor(TOTAL / 2));
    await waitPastCooldown();

    const beforeLen = state().results.length;

    await actions().extendForward();
    await flush();

    expect(state().error).toBeNull();
    // Buffer should have grown (or stayed same if at end — but 25k is not at end)
    expect(state().results.length).toBeGreaterThanOrEqual(beforeLen);
    assertPositionsConsistent("after null-zone extendForward");
  });

  it("extendBackward after null-zone seek succeeds", async () => {
    await actions().search();
    await actions().seek(Math.floor(TOTAL / 2));
    await waitPastCooldown();

    const beforeOffset = state().bufferOffset;

    await actions().extendBackward();
    await flush();

    expect(state().error).toBeNull();
    // bufferOffset should have decreased (prepend)
    expect(state().bufferOffset).toBeLessThanOrEqual(beforeOffset);
    assertPositionsConsistent("after null-zone extendBackward");
  });

  it("seek + extend chain across null zone maintains consistency", async () => {
    await actions().search();
    await actions().seek(Math.floor(TOTAL / 2));
    await waitPastCooldown();

    // Extend forward 3 times
    for (let i = 0; i < 3; i++) {
      await actions().extendForward();
      await flush();
      expect(state().error).toBeNull();
    }
    assertPositionsConsistent("after 3x extendForward in null zone");

    // Extend backward 2 times
    for (let i = 0; i < 2; i++) {
      await actions().extendBackward();
      await flush();
      expect(state().error).toBeNull();
    }
    assertPositionsConsistent("after 2x extendBackward in null zone");
  });

  it("null-zone images have no lastModified field", async () => {
    await actions().search();
    await actions().seek(Math.floor(TOTAL / 2));
    await flush();

    // All images in the buffer should lack lastModified (we're deep in null zone)
    const { results } = state();
    const nullZoneImages = results.filter(Boolean);
    expect(nullZoneImages.length).toBeGreaterThan(0);

    for (const img of nullZoneImages) {
      const imgAny = img as unknown as Record<string, unknown>;
      expect(imgAny.lastModified).toBeUndefined();
    }
  });

  it("seek to covered zone (position 0) works normally", async () => {
    await actions().search();
    await actions().seek(0);
    await flush();

    expect(state().error).toBeNull();
    expect(state().bufferOffset).toBe(0);

    // First image should have lastModified (covered zone)
    const img = state().results[0] as unknown as Record<string, unknown>;
    expect(img?.lastModified).toBeDefined();
    assertPositionsConsistent("seek to covered zone");
  });

  it("null-zone seek preserves total (regression: 45k bug)", async () => {
    // The 45k bug: seeking into the null zone used a filtered query
    // (must_not:exists), whose result.total is the filtered count (null-zone
    // size), not the full corpus. extendForward/extendBackward also wrote
    // result.total from filtered queries. All must preserve the original total.
    await actions().search();
    await flush();
    const originalTotal = state().total;
    expect(originalTotal).toBe(TOTAL);

    // Seek into the null zone
    await actions().seek(Math.floor(TOTAL * 0.75));
    await flush();

    expect(state().total, "total after null-zone seek").toBe(originalTotal);
    expect(state().error).toBeNull();
  });

  it("extendBackward after null-zone seek preserves total", async () => {
    await actions().search();
    await flush();
    const originalTotal = state().total;

    // Seek into the null zone
    await actions().seek(Math.floor(TOTAL * 0.75));
    await flush();
    expect(state().total, "total after seek").toBe(originalTotal);

    // Wait past cooldown so extendBackward is allowed
    await waitPastCooldown();

    // Extend backward (this was the actual vector for the 45k bug —
    // the seek was fixed but extendBackward wrote the filtered total)
    if (state().bufferOffset > 0) {
      await actions().extendBackward();
      await flush();
      expect(state().total, "total after extendBackward").toBe(originalTotal);
    }
  });

  it("extendForward after null-zone seek preserves total", async () => {
    await actions().search();
    await flush();
    const originalTotal = state().total;

    // Seek into the null zone
    await actions().seek(Math.floor(TOTAL * 0.75));
    await flush();
    expect(state().total, "total after seek").toBe(originalTotal);

    // Wait past cooldown
    await waitPastCooldown();

    // Extend forward
    await actions().extendForward();
    await flush();
    expect(state().total, "total after extendForward").toBe(originalTotal);
  });
});
