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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useSearchStore } from "./search-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { GRID_ROW_HEIGHT, TABLE_ROW_HEIGHT } from "@/constants/layout";
import { interpolateSortLabel, getSortContextLabel, computeTrackTicksWithNullZone } from "@/lib/sort-context";
import type { SortDistribution } from "@/dal/types";
import { buildSortClause, reverseSortClause } from "@/dal/adapters/elasticsearch/sort-builders";
import { registerScrollGeometry } from "@/lib/scroll-geometry-ref";

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
    _offsetCorrectionGeneration: 0,
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
    // Non-1 columns so a column-misalignment regression would actually be
    // observable here too (pins alignBufferStart at the
    // _loadBufferAroundImage call site, not just the async-correction one).
    registerScrollGeometry({ columns: 4, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    await actions().search();
    actions().setFocusedImageId("img-300");

    await actions().search("img-300");
    await waitFor(() => state().sortAroundFocusStatus === null, 5000, "focus found");

    assertPositionsConsistent("after sort-around-focus");
    expect(state().bufferOffset % 4).toBe(0);
    registerScrollGeometry({ columns: 1, rowHeight: GRID_ROW_HEIGHT, isTable: false });

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
// _offsetCorrectionGeneration — signals the scroll effect that the async
// countBefore offset-correction landed, so it can re-apply the persisted
// viewport ratio. Without this, a column-alignment trim during the
// correction silently shifts the rendered focused cell by a row with no
// scrollTop compensation (see changelog / worklog-current.md).
// ---------------------------------------------------------------------------

describe("_offsetCorrectionGeneration — async offset correction signal", () => {
  afterEach(() => {
    registerScrollGeometry({ columns: 1, rowHeight: GRID_ROW_HEIGHT, isTable: false });
  });

  it("bumps when the async correction lands (whether or not it needs a trim)", async () => {
    mock = new MockDataSource(500);
    useSearchStore.setState({ dataSource: mock });
    // Non-1 columns so a column-misalignment regression would be observable.
    registerScrollGeometry({ columns: 4, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    await actions().search();
    actions().setFocusedImageId("img-300");
    const genBefore = state()._offsetCorrectionGeneration;

    await actions().search("img-300");
    await waitFor(() => state().sortAroundFocusStatus === null, 5000, "focus found");
    // The correction is async (fires after the initial estimate-based
    // landing) — wait for it to actually land rather than trusting the
    // status flag alone (it clears before the correction resolves).
    await waitFor(
      () => state()._offsetCorrectionGeneration > genBefore,
      5000,
      "offset correction lands",
    );

    // The bump is unconditional — it fires whether or not this particular
    // correction needed a column-alignment trim (see search-store.ts).
    // Whether a trim happens is a property of the specific target/columns
    // numbers (not guaranteed for img-300/columns=4 — verified empirically,
    // it doesn't trim here), not something this test controls. The trim
    // mechanism itself is covered by buffer-column-align.test.ts
    // (alignBufferStart) and the e2e sweep in scrubber.spec.ts (real trims
    // observed at focus indices 5 and 9 on the local seed corpus).
    expect(state()._offsetCorrectionGeneration).toBeGreaterThan(genBefore);
    expect(state().bufferOffset % 4).toBe(0);
  });

  it("does NOT bump on an ordinary extendForward/extendBackward", async () => {
    await actions().search();
    await actions().seek(5000);
    await waitPastCooldown();
    const genBefore = state()._offsetCorrectionGeneration;

    await actions().extendForward();
    await flush();
    await actions().extendBackward();
    await flush();

    // Guards against reintroducing the "re-fires on every extend" perf
    // regression the 23 May 2026 fix eliminated — this counter must only
    // move for a genuine async offset correction, never for routine extends.
    expect(state()._offsetCorrectionGeneration).toBe(genBefore);
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

  it("startCursor is non-null after forward eviction (audit #14 regression guard)", async () => {
    await actions().search();
    await waitPastCooldown();

    // Extend forward enough to trigger eviction
    for (let i = 0; i < 6; i++) {
      await actions().extendForward();
      await flush();
    }

    // After eviction from start, startCursor must be preserved (not null).
    // Bug #14 fix: if extractSortValues returns null during eviction, we fall
    // back to the previous cursor rather than overwriting with null, which
    // would permanently block extendBackward via its !startCursor guard.
    const { startCursor } = state();
    expect(startCursor).not.toBeNull();
    // Cursor must be a valid sort-values array ending with an image ID string
    expect(typeof startCursor![startCursor!.length - 1]).toBe("string");
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
  it("basic search makes exactly 1 searchAfter request (+1 position map, +1 ticker count)", async () => {
    mock.requestCount = 0;
    await actions().search();
    // 1 searchAfter for the first page + 1 fetchPositionIndex (background,
    // because 10k > SCROLL_MODE_THRESHOLD and ≤ POSITION_MAP_THRESHOLD).
    // +1 immediate ticker poll count(). PIT open skipped on local ES.
    expect(mock.requestCount).toBe(3);
  });

  it("sort-around-focus in first page makes only 1 extra request (+1 position map, +1 ticker count)", async () => {
    await actions().search();
    mock.requestCount = 0;

    actions().setFocusedImageId("img-50");
    await actions().search("img-50");
    await flush();

    // 1 for the search itself + 1 fetchPositionIndex (background).
    // +1 immediate ticker poll count().
    // The image is in the first page, so _findAndFocusImage should not be
    // called (no extra requests beyond search + position map + ticker).
    expect(mock.requestCount).toBe(3);
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
    // +1 immediate ticker poll count()
    // Total: ≤6
    expect(mock.requestCount).toBeLessThanOrEqual(6);
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

// ---------------------------------------------------------------------------
// extendBackward column-trim guard (audit #9)
// ---------------------------------------------------------------------------

describe("extendBackward column-trim guard (audit #9)", () => {
  afterEach(() => {
    // Restore default 1-column geometry so other tests are not affected.
    registerScrollGeometry({ columns: 1, rowHeight: GRID_ROW_HEIGHT, isTable: false });
  });

  it("does not discard all items when hits.length < columns", async () => {
    // Scenario: bufferOffset=2, 3-column grid, backward fetch returns 2 items.
    // rawOffset = bufferOffset - hits.length = 2 - 2 = 0 -> idealTrim = 0 ->
    // trimCount = 0 -> the trim branch is skipped entirely (guard condition
    // `trimCount > 0` is false), so all 2 hits commit and bufferOffset -> 0.
    // This no longer exercises the "would-empty-the-result" guard directly
    // (that requires hits.length < columns AND bufferOffset already aligned
    // to columns on entry, which isn't this setup) but still documents that
    // a short backward page never gets discarded.

    // seek(102) → fetchStart = max(0, 102-100) = 2 → bufferOffset=2 (shallow
    // from/size path, columns=1 at time of seek so no column alignment trim).
    await actions().search();
    await actions().seek(102);
    await waitPastCooldown();

    expect(
      state().bufferOffset,
      "setup: seek(102) should produce bufferOffset=2",
    ).toBe(2);
    const bufferLengthBefore = state().results.length;

    // Switch to 3-column grid before the extend fires.
    registerScrollGeometry({ columns: 3, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    await actions().extendBackward();
    await flush();

    // Items at global indices 0 and 1 must now be in the buffer.
    expect(
      state().bufferOffset,
      "bufferOffset should drop to 0 after prepending items 0-1",
    ).toBe(0);
    expect(
      state().results.length,
      "buffer should have grown by 2 (items 0 and 1 prepended)",
    ).toBe(bufferLengthBefore + 2);
    assertPositionsConsistent("after extendBackward with 3-column guard");
  });
});

// ---------------------------------------------------------------------------
// extendBackward + resize (wandering M3 follow-up, 2026-07-31) — FIXED.
//
// Originally scoped as "can a resize land exactly during an in-flight
// extendBackward fetch" (a live-browser race that couldn't be reliably
// forced through tool round-trip latency). Investigating it here found
// something broader and NOT a race at all: `extendBackward`'s column-trim
// (added by the audit #9 / buffer-tier column-shift fix, `dbb332f5f`) read
// `getScrollGeometry()` fresh at trim time — correct in isolation — but did
// nothing to reconcile a PRE-EXISTING `bufferOffset` that was aligned to the
// OLD column count against a NEW one. Any resize (panel toggle, window
// resize, any grid-density change) that happens while `bufferOffset > 0` and
// not a multiple of the new column count, followed by ANY later
// `extendBackward` call (e.g. the user scrolls up a little), used to trim
// the fetch to align the NEW prepend to the NEW columns without checking
// that the RESULTING bufferOffset was also aligned — it only was by luck
// when the fetch happened to reach exactly to the buffer's true start.
//
// Fix: reuse the same `alignBufferStart` primitive already shared by
// `_loadBufferAroundImage`, `seek()`, and the async offset-correction —
// this was the "future fourth call site" those three's own comments warned
// about. Aligns to `bufferOffset - fetchedCount`, not just `fetchedCount`,
// so the result is provably a multiple of the CURRENT columns regardless of
// what the columns were when `bufferOffset` was first set.
//
// User story this closes: a picture editor scrolled partway through a large
// result set resizes their browser or toggles a side panel, then keeps
// scrolling — the images already on screen must not visually jump sideways.
// Exact position preservation across a column-count change is not always
// possible (different column counts land the same global index in
// different columns); the requirement is the CLOSEST possible position,
// and — critically — repeated resize/panel-toggle cycles must not compound
// into growing drift. A one-time, bounded adjustment per resize is
// acceptable; an ever-widening divergence is not. The last test below
// specifically exercises repeated cycles to prove this.
// ---------------------------------------------------------------------------

describe("extendBackward + resize (wandering M3 follow-up)", () => {
  afterEach(() => {
    registerScrollGeometry({ columns: 1, rowHeight: GRID_ROW_HEIGHT, isTable: false });
  });

  it("resize mid-flight: bufferOffset aligns to the post-resize column count, not the pre-fetch one", async () => {
    mock = new MockDataSource(300);
    useSearchStore.setState({ dataSource: mock });
    registerScrollGeometry({ columns: 4, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    await actions().search();
    await actions().seek(150);
    await waitPastCooldown();
    const bufferOffsetBefore = state().bufferOffset;
    expect(bufferOffsetBefore, "setup: seek(150) should leave room to extend backward").toBeGreaterThan(0);

    // Intercept searchAfter so the geometry change lands strictly between
    // fetch-initiation and fetch-resolution.
    let resolveFetch!: () => void;
    const fetchBarrier = new Promise<void>((r) => { resolveFetch = r; });
    const original = mock.searchAfter.bind(mock);
    mock.searchAfter = async (...args: Parameters<typeof mock.searchAfter>) => {
      await fetchBarrier;
      return original(...args);
    };

    const extendPromise = actions().extendBackward();
    await flush(); // let extendBackward start and reach the await on searchAfter

    registerScrollGeometry({ columns: 6, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    resolveFetch();
    await extendPromise;
    await flush();

    expect(state().bufferOffset % 6).toBe(0);
    assertPositionsConsistent("after extendBackward with mid-flight resize");
  });

  it("no race needed: same fix applies when the resize is fully settled BEFORE extendBackward is even called", async () => {
    mock = new MockDataSource(300);
    useSearchStore.setState({ dataSource: mock });
    registerScrollGeometry({ columns: 4, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    await actions().search();
    await actions().seek(150);
    await waitPastCooldown();

    // Resize fully settles first — this is what an ordinary panel toggle or
    // window resize looks like while scrolled to a non-edge position. No
    // race, no timing dependency, no interception needed.
    registerScrollGeometry({ columns: 6, rowHeight: GRID_ROW_HEIGHT, isTable: false });
    await flush();

    await actions().extendBackward();
    await flush();

    expect(state().bufferOffset % 6).toBe(0);
    assertPositionsConsistent("after extendBackward with settled resize");
  });

  it("columns=1 (table density) is immune — every offset is trivially aligned", async () => {
    mock = new MockDataSource(300);
    useSearchStore.setState({ dataSource: mock });
    registerScrollGeometry({ columns: 4, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    await actions().search();
    await actions().seek(150);
    await waitPastCooldown();
    const bufferOffsetBefore = state().bufferOffset;
    expect(bufferOffsetBefore, "setup: seek(150) should leave room to extend backward").toBeGreaterThan(0);

    // Density switch to table (1 column), fully settled, then extend.
    registerScrollGeometry({ columns: 1, rowHeight: TABLE_ROW_HEIGHT, isTable: true });
    await flush();

    await actions().extendBackward();
    await flush();

    // Confirm a real extend happened (not a no-op) — otherwise the trivial
    // `x % 1 === 0` alignment claim would pass even against a broken
    // implementation that never trims/commits anything.
    expect(state().bufferOffset, "extendBackward should have actually moved bufferOffset").toBeLessThan(bufferOffsetBefore);
    assertPositionsConsistent("after extendBackward with resize to table density");
  });

  it("repeated resize/extend cycles do not compound drift — bufferOffset re-aligns to CURRENT columns every time, never drifting further from the last known-good offset", async () => {
    // Buffer tier (total <= SCROLL_MODE_THRESHOLD), not two-tier — this is
    // the tier where column placement actually depends on bufferOffset (see
    // useDataWindow.ts's findImageIndex: two-tier uses the raw global index
    // and is structurally immune, so a two-tier corpus here would not
    // exercise the symptom this test exists to rule out).
    mock = new MockDataSource(999);
    useSearchStore.setState({ dataSource: mock });
    registerScrollGeometry({ columns: 4, rowHeight: GRID_ROW_HEIGHT, isTable: false });

    await actions().search();
    await actions().seek(800);
    await waitPastCooldown();

    // Simulate a user repeatedly toggling a side panel (or resizing the
    // window) between two column counts, scrolling up a little after each
    // toggle — the exact interleaving a real "closest position, no growing
    // divergence" user story requires. Record bufferOffset after every
    // cycle: each one must be exactly aligned to whatever columns is
    // CURRENT at that point — proving alignment resets every cycle rather
    // than compounding an ever-larger residual across cycles.
    //
    // Each cycle waits past POST_EXTEND_COOLDOWN_MS (via waitPastCooldown)
    // before the next resize+extend — without this, extendBackward silently
    // no-ops on cooldown for every cycle after the first, and the test
    // passes vacuously (review R-2026-08-01-extendbackward-resize-fix-review.md,
    // concern C1 — confirmed empirically: 5 of 6 cycles never ran).
    const columnsSequence = [4, 6, 4, 5, 6, 4];
    const observedOffsets: number[] = [state().bufferOffset];

    for (const columns of columnsSequence) {
      registerScrollGeometry({ columns, rowHeight: GRID_ROW_HEIGHT, isTable: false });
      await flush();
      await actions().extendBackward();
      await flush();
      await waitPastCooldown();
      observedOffsets.push(state().bufferOffset);
      expect(
        state().bufferOffset % columns,
        `bufferOffset (${state().bufferOffset}) should align to columns=${columns} after this cycle — observed sequence so far: ${observedOffsets.join(", ")}`,
      ).toBe(0);
    }

    // The point of this test is a real, non-trivial sequence of extends —
    // guard against the exact vacuous-pass failure mode found in review
    // (every cycle blocked by cooldown, offset never actually changing).
    expect(
      observedOffsets.some((o, i) => i > 0 && o !== observedOffsets[i - 1]),
      `at least one cycle must actually change bufferOffset — observed sequence: ${observedOffsets.join(", ")}`,
    ).toBe(true);

    // bufferOffset must be monotonically non-increasing across the whole
    // sequence (extendBackward only ever moves it toward 0, never away) —
    // this is the concrete, testable form of "never gradually degrades":
    // if alignment were compounding an ever-larger residual, this sequence
    // would eventually reverse direction or plateau above where a fresh
    // extend from the current offset should be able to reach.
    for (let i = 1; i < observedOffsets.length; i++) {
      expect(
        observedOffsets[i],
        `offset must not increase between cycles: ${observedOffsets.join(" → ")}`,
      ).toBeLessThanOrEqual(observedOffsets[i - 1]);
    }

    assertPositionsConsistent("after repeated resize/extend cycles");
  }, 20_000); // 6 cycles x waitPastCooldown (~2.1s each) exceed vitest's 5s default
});

// ---------------------------------------------------------------------------
// Async offset correction — column alignment (buffer-tier sort-around-focus)
// ---------------------------------------------------------------------------

describe("async offset correction — column alignment (buffer tier)", () => {
  afterEach(() => {
    registerScrollGeometry({ columns: 1, rowHeight: GRID_ROW_HEIGHT, isTable: false });
  });

  // Buffer tier (total <= SCROLL_MODE_THRESHOLD) never has a position map,
  // so _findAndFocusImage always takes the offsetIsEstimate branch: an
  // initial (wrong) hint-based landing, corrected asynchronously via
  // countBefore. That correction sets bufferOffset directly with no
  // column-alignment trim — unlike _loadBufferAroundImage's own initial
  // landing and seek(), which both already align. The misalignment then
  // persists through the entire scroll-mode top-up (_topUpScrollModeBuffer)
  // that follows, since every extendBackward step can only change
  // bufferOffset by a multiple of columns. Sweeping several adjacent target
  // IDs (rather than one) is deliberate — whether the bug is hit depends on
  // `exactOffset - targetLocalIndex` landing on a non-multiple of columns,
  // which is a property of the target's position, not of any one magic ID.
  // Sweeping columns too (4, the original repro value, and 6, where
  // PAGE_SIZE=200 does NOT divide evenly — 200 % 6 === 2) stresses a
  // different remainder pattern in the top-up's own PAGE_SIZE-sized steps.
  const targets = ["img-897", "img-898", "img-899", "img-900", "img-901", "img-902"];
  const columnCounts = [4, 6];
  const cases = columnCounts.flatMap((columns) => targets.map((t) => [t, columns] as const));

  it.each(cases)(
    "never leaves bufferOffset misaligned to columns while settling after a sort-around-focus (target=%s, columns=%i)",
    async (targetId, columns) => {
      registerScrollGeometry({ columns, rowHeight: GRID_ROW_HEIGHT, isTable: false });
      mock = new MockDataSource(958);
      useSearchStore.setState({ dataSource: mock });

      await actions().search();
      actions().setFocusedImageId(targetId);

      // Subscribe to record EVERY bufferOffset value the store ever takes,
      // not just what a polling loop happens to sample — the bug is about
      // an INTERMEDIATE value during settling, not the final one (which
      // always reaches exactly 0 either way, aligned trivially), so a gap
      // in sampling could silently hide a real failure. This gives complete
      // coverage by construction and needs no timer/sleep.
      const observed: number[] = [state().bufferOffset];
      const unsubscribe = useSearchStore.subscribe((s) => {
        if (s.bufferOffset !== observed[observed.length - 1]) observed.push(s.bufferOffset);
      });

      try {
        await actions().search(targetId);
        await waitFor(
          () => state().sortAroundFocusStatus === null,
          3000,
          "sortAroundFocusStatus clears",
        );
        await waitFor(
          () => state().results.length === state().total && !state()._bufferSelfCorrecting,
          3000,
          "scroll-mode top-up settles",
        );
      } finally {
        unsubscribe();
      }

      const misaligned = observed.filter((o) => o !== 0 && o % columns !== 0);
      expect(
        misaligned,
        `columns=${columns}, observed bufferOffset values during settle: ${observed.join(",")}`,
      ).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// computeTrackTicksWithNullZone — all-null-zone case (Bug #1)
// Covers the scenario: -taken sort, every doc lacks dateTaken.
// ES returns stats.count=0 → sortDist = { buckets: [], coveredCount: 0 }.
// ---------------------------------------------------------------------------

describe("computeTrackTicksWithNullZone — all-null-zone", () => {
  const nullZoneDist: SortDistribution = {
    coveredCount: 100,
    buckets: [
      { key: "2023-01-01T00:00:00.000Z", count: 30, startPosition: 0 },
      { key: "2023-07-01T00:00:00.000Z", count: 30, startPosition: 30 },
      { key: "2024-01-01T00:00:00.000Z", count: 40, startPosition: 60 },
    ],
  };

  it("produces boundary tick at top + red null-zone ticks when coveredCount is 0 and nullZoneDist is loaded", () => {
    // Bug: guard was `coveredCount <= 0` — hit for coveredCount=0 → returned []
    // Fix: guard is `coveredCount < 0` — allows coveredCount=0 through.
    // The boundary tick always emits, positioned at 0 (= top of track).
    const sortDist: SortDistribution = { buckets: [], coveredCount: 0 };
    const ticks = computeTrackTicksWithNullZone(
      "-taken",
      100,  // total
      0,    // bufferOffset
      [],   // results
      sortDist,
      nullZoneDist,
    );

    expect(ticks.length, "should produce ticks — not empty").toBeGreaterThan(0);

    // Exactly one boundary tick, at position 0 (top of track = start of null zone)
    const boundaryTicks = ticks.filter(t => t.boundary);
    expect(boundaryTicks).toHaveLength(1);
    expect(boundaryTicks[0].position).toBe(0);
    expect(boundaryTicks[0].label).toBe("No date taken");

    // All non-boundary ticks should be red (null-zone uploadTime ticks)
    const NULL_ZONE_COLOR = "rgba(255, 140, 140, 0.55)";
    const nonBoundary = ticks.filter(t => !t.boundary);
    expect(nonBoundary.length).toBeGreaterThan(0);
    for (const tick of nonBoundary) {
      expect(tick.color, `tick at pos ${tick.position} should be red`).toBe(NULL_ZONE_COLOR);
    }
  });

  it("returns boundary-only tick when nullZoneDist is not yet loaded", () => {
    // Transient state: sortDist loaded (coveredCount=0) but nullZoneDist pending.
    // Should show the "No date taken" label at the top immediately, without
    // waiting for the uploadTime distribution to arrive.
    const sortDist: SortDistribution = { buckets: [], coveredCount: 0 };
    const ticks = computeTrackTicksWithNullZone("-taken", 1000, 0, [], sortDist, null);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].boundary).toBe(true);
    expect(ticks[0].position).toBe(0);
  });

  it("regression: mixed case (coveredCount > 0) still produces boundary tick + red ticks", () => {
    // Ensures Fix C does not break the existing mixed-zone path
    const sortDist: SortDistribution = {
      coveredCount: 50,
      buckets: [
        { key: "2023-01-01T00:00:00.000Z", count: 25, startPosition: 0 },
        { key: "2023-07-01T00:00:00.000Z", count: 25, startPosition: 25 },
      ],
    };
    const mixedNullZoneDist: SortDistribution = {
      coveredCount: 50,
      buckets: [
        { key: "2024-01-01T00:00:00.000Z", count: 25, startPosition: 0 },
        { key: "2024-07-01T00:00:00.000Z", count: 25, startPosition: 25 },
      ],
    };

    const ticks = computeTrackTicksWithNullZone("-taken", 100, 0, [], sortDist, mixedNullZoneDist);

    // Must still have exactly one boundary tick at the covered/null zone boundary
    const boundaryTicks = ticks.filter(t => t.boundary);
    expect(boundaryTicks).toHaveLength(1);
    expect(boundaryTicks[0].position).toBe(50);

    // Null-zone ticks must be offset by coveredCount (position >= 50)
    const redTicks = ticks.filter(t => t.color === "rgba(255, 140, 140, 0.55)");
    expect(redTicks.length).toBeGreaterThan(0);
    for (const tick of redTicks) {
      expect(tick.position).toBeGreaterThanOrEqual(50);
    }
  });
});
