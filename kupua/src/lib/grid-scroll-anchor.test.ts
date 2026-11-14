import { describe, it, expect, vi } from "vitest";
import { chooseDensityAnchor, chooseReflowAnchor } from "./layout-anchor-policy";
import { getFixedRowCount, getItemColumn, getItemLayoutRow, getLayoutRow } from "./scroll-geometry-ref";
import {
  resolveAnchorVirtIndex,
  isFocusEligibleForLayoutAnchor,
  captureAnchorAtIndex,
  computeFallbackAnchor,
  restoreAnchorScrollTop,
  placeAnchor,
} from "./grid-scroll-anchor";

describe("layout anchor policy", () => {
  it("retains density intent without electing a new viewport image", () => {
    const retained = { id: "retained", globalIndex: 40 };
    const viewport = vi.fn(() => ({ id: "centre", globalIndex: 80 }));
    expect(chooseDensityAnchor({ retained, focus: { id: "focus", globalIndex: 20 },
      browsingDeparture: false, viewport })).toBe(retained);
    expect(viewport).not.toHaveBeenCalled();
  });

  it("uses only the departure viewport, never the focus, while browsing is pending", () => {
    const viewport = vi.fn<() => { id: string; globalIndex: number } | null>().mockReturnValue(null);
    expect(chooseDensityAnchor({ retained: null, focus: { id: "bookmark", globalIndex: 20 },
      browsingDeparture: true, viewport })).toBeNull();
    expect(viewport).toHaveBeenCalledOnce();
  });

  it.each(["selection", "focus"] as const)("keeps reflow's resolved %s at index zero without a viewport read", candidate => {
    const viewport = vi.fn(() => 80);
    expect(chooseReflowAnchor({ selection: candidate === "selection" ? 0 : null,
      focus: candidate === "focus" ? 0 : 20, viewport })).toBe(0);
    expect(viewport).not.toHaveBeenCalled();
  });
});

describe("layout focus eligibility", () => {
  it.each([
    { top: 68, visible: false },
    { top: 69, visible: true },
    { top: 100, visible: true },
    { top: 663, visible: true },
    { top: 664, visible: false },
  ])("requires partial intersection with the usable viewport for hidden focus, top=$top", ({ top, visible }) => {
    expect(isFocusEligibleForLayoutAnchor("phantom", { top, height: 32 }, 100, 600, 36)).toBe(visible);
  });

  it.each([-500, 1000])("keeps an offscreen explicit bookmark eligible, top=%s", top => {
    expect(isFocusEligibleForLayoutAnchor("explicit", { top, height: 32 }, 100, 600, 36)).toBe(true);
  });
});

describe("fixed-row window coordinates", () => {
  it.each([1, 3, 4, 5, 6, 7])("preserves every surviving row through arbitrary prepends and evictions with %i columns", columns => {
    for (const offset of [1, 2, 201, 533568]) {
      const geometry = { columns, rowHeight: 303, itemOffset: offset, itemCount: 300 };
      const prepend = Math.min(offset, 199);
      const nextOffset = offset - prepend;
      const prepended = { ...geometry, itemOffset: nextOffset, itemCount: 300 + prepend };
      const prependDelta = (Math.floor(offset / columns) - Math.floor(nextOffset / columns)) * 303;
      for (let index = 0; index < 24; index++) {
        const expectedTop = (Math.floor((offset + index) / columns) - Math.floor(offset / columns)) * 303;
        expect(getItemLayoutRow(geometry, index).top).toBe(expectedTop);
        expect(getItemLayoutRow(prepended, index + prepend).top - prependDelta).toBe(expectedTop);
      }
      const evicted = { ...geometry, itemOffset: offset + 137, itemCount: 163 };
      const evictionDelta = (Math.floor(offset / columns) - Math.floor((offset + 137) / columns)) * 303;
      for (let index = 137; index < 161; index++) {
        expect(getItemLayoutRow(evicted, index - 137).top - evictionDelta)
          .toBe(getItemLayoutRow(geometry, index).top);
      }
    }
  });

  it("reports only real items in partial first and last rows", () => {
    const geometry = { columns: 5, rowHeight: 303, itemOffset: 103, itemCount: 8 };
    expect(getLayoutRow(geometry, 0)).toEqual({ index: 0, top: 0, height: 303, firstItemIndex: 0, lastItemIndex: 1 });
    expect(getLayoutRow(geometry, 1)).toEqual({ index: 1, top: 303, height: 303, firstItemIndex: 2, lastItemIndex: 6 });
    expect(getLayoutRow(geometry, 2)).toEqual({ index: 2, top: 606, height: 303, firstItemIndex: 7, lastItemIndex: 7 });
    expect(getFixedRowCount(geometry, 8)).toBe(3);
    expect(getFixedRowCount(geometry, 0)).toBe(0);
    expect(Array.from({ length: 8 }, (_, index) => getItemColumn(geometry, index))).toEqual([3, 4, 0, 1, 2, 3, 4, 0]);
  });

  it.each([3, 4, 6])("restores the same image after resize and a changed window origin from %i columns", columns => {
    const globalIndex = 517;
    const offset = 501;
    const rowTop = (Math.floor(globalIndex / columns) - Math.floor(offset / columns)) * 303;
    const anchor = captureAnchorAtIndex(globalIndex - offset, columns, 303, rowTop - 123, 900, offset);
    expect(anchor.imageIndex).toBe(globalIndex);
    const nextOffset = 302;
    const expectedTop = (Math.floor(globalIndex / 5) - Math.floor(nextOffset / 5)) * 303;
    expect(restoreAnchorScrollTop(anchor, 5, 303, 900, 20000, nextOffset)).toBe(expectedTop - 123);
  });
});

// ---------------------------------------------------------------------------
// resolveAnchorVirtIndex
// ---------------------------------------------------------------------------

describe("resolveAnchorVirtIndex", () => {
  it("returns null when imageId is null", () => {
    expect(resolveAnchorVirtIndex(null, new Map(), 0, false)).toBeNull();
  });

  it("returns null when the image isn't in imagePositions", () => {
    expect(resolveAnchorVirtIndex("img-missing", new Map([["img-0", 5]]), 0, false)).toBeNull();
  });

  it("subtracts bufferOffset in non-two-tier (buffer-local) mode", () => {
    const positions = new Map([["img-x", 6850]]);
    expect(resolveAnchorVirtIndex("img-x", positions, 6744, false)).toBe(106);
  });

  it("uses the raw global index directly in two-tier mode", () => {
    const positions = new Map([["img-x", 6850]]);
    expect(resolveAnchorVirtIndex("img-x", positions, 6744, true)).toBe(6850);
  });

  it("returns null when the resolved buffer-local index is negative (image before buffer start)", () => {
    const positions = new Map([["img-x", 100]]);
    expect(resolveAnchorVirtIndex("img-x", positions, 200, false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// captureAnchorAtIndex / restoreAnchorScrollTop — round-trip correctness
// ---------------------------------------------------------------------------

describe("captureAnchorAtIndex + restoreAnchorScrollTop", () => {
  it("round-trips exactly when the column count is unchanged", () => {
    const virtIdx = 6850;
    const cols = 5;
    const rowHeight = 300;
    const scrollTop = 518435;
    const clientHeight = 813;

    const anchor = captureAnchorAtIndex(virtIdx, cols, rowHeight, scrollTop, clientHeight);
    const restored = restoreAnchorScrollTop(anchor, cols, rowHeight, clientHeight, /* scrollHeight */ 10_000_000);

    expect(restored).toBe(scrollTop);
  });

  it("does not compound drift across repeated resize cycles when the SAME real image is used as the anchor every time", () => {
    // Simulates: RHS panel open (A->B), close (B->A), LHS panel open (A->B),
    // close (B->A) — the exact repro sequence from the live bug report —
    // re-resolving virtIdx fresh at every step. This proves the ARITHMETIC
    // is exact given a stable anchor identity — true by construction for
    // the focused-image path. The phantom-anchor path is NOT structurally
    // guaranteed to resolve the same ID at both ends of a cycle (see the
    // module doc comment and review R-2026-08-01-panel-toggle-anchor-fix-
    // review.md, concern C1); this test doesn't model that case.
    const rowHeight = 300;
    const clientHeight = 813;
    const scrollHeight = 10_000_000;
    const colsA = 5;
    const colsB = 4;
    const virtIdx = 6850; // this image's identity never changes across the sequence

    let scrollTop = 518435;
    const columnSequence = [colsB, colsA, colsB, colsA, colsB, colsA];
    let prevCols = colsA;

    for (const cols of columnSequence) {
      const anchor = captureAnchorAtIndex(virtIdx, prevCols, rowHeight, scrollTop, clientHeight);
      scrollTop = restoreAnchorScrollTop(anchor, cols, rowHeight, clientHeight, scrollHeight);
      prevCols = cols;
    }

    // Every time we land back on colsA, we must land on the EXACT same
    // scrollTop — no progressive drift, however many cycles run.
    expect(scrollTop).toBe(518435);
  });

  it("keeps the true result start across a column round trip that clamps the anchor", () => {
    let scrollTop = 0;
    let prevCols = 7;
    for (const cols of [8, 7, 8, 7]) {
      const anchor = captureAnchorAtIndex(7, prevCols, 196, scrollTop, 900);
      scrollTop = restoreAnchorScrollTop(anchor, cols, 196, 900, 100_000);
      prevCols = cols;
      expect(scrollTop).toBe(0);
    }
  });

  it("regression: the OLD fallback (row-arithmetic, no stable identity) leaves a PERSISTENT residual at every checkpoint — not a one-off blip that self-corrects", () => {
    // This reproduces the actual bug: computeFallbackAnchor invents a fresh
    // "first image of the centre row" index from the CURRENT scrollTop at
    // every resize event, instead of tracking one real image. Runs the
    // IDENTICAL 6-transition sequence as the id-based test above (not a
    // shorter one) so the two are a direct, apples-to-apples contrast:
    // the id-based path returns to EXACTLY the original scrollTop at every
    // colsA checkpoint; this path does not, at ANY of them — proving the
    // discrepancy persists rather than resolving itself after one cycle.
    const rowHeight = 300;
    const clientHeight = 813;
    const scrollHeight = 10_000_000;
    const colsA = 5;
    const colsB = 4;
    const initialScrollTop = 518435;

    let scrollTop = initialScrollTop;
    const columnSequence = [colsB, colsA, colsB, colsA, colsB, colsA];
    let prevCols = colsA;
    const residualsAtColsA: number[] = [];

    for (const cols of columnSequence) {
      const anchor = computeFallbackAnchor(prevCols, rowHeight, scrollTop, clientHeight);
      scrollTop = restoreAnchorScrollTop(anchor, cols, rowHeight, clientHeight, scrollHeight);
      prevCols = cols;
      if (cols === colsA) residualsAtColsA.push(scrollTop - initialScrollTop);
    }

    expect(
      residualsAtColsA.every((r) => r !== 0),
      `residuals at each colsA checkpoint (expect all non-zero): ${residualsAtColsA.join(", ")}`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeFallbackAnchor — last-resort path, no known anchor image
// ---------------------------------------------------------------------------

describe("pinch point placement", () => {
  const anchor = { imageIndex: 42, viewportRatio: 0.25, point: { ratio: 0.35, inset: 4 } };

  it("keeps the same fractional thumbnail point rather than the row top", () => {
    expect(placeAnchor(anchor, 1000, 200, 800, 10000)).toBe(874);
    expect(placeAnchor(anchor, 1200, 300, 800, 10000)).toBe(1109);
  });

  it("clamps the pinned point only at physical scroll boundaries", () => {
    expect(placeAnchor(anchor, 0, 200, 800, 10000)).toBe(0);
    expect(placeAnchor(anchor, 9900, 200, 800, 10000)).toBe(9200);
  });
});

describe("computeFallbackAnchor", () => {
  it("picks the first image of the row nearest viewport centre", () => {
    const anchor = computeFallbackAnchor(5, 300, 518435, 813);
    expect(anchor.imageIndex % 5).toBe(0);
  });

  it("round-trips exactly when the column count is unchanged (same as the id-based path)", () => {
    const anchor = computeFallbackAnchor(5, 300, 518435, 813);
    const restored = restoreAnchorScrollTop(anchor, 5, 300, 813, 10_000_000);
    expect(restored).toBe(518435);
  });
});
