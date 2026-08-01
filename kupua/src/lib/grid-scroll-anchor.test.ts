import { describe, it, expect } from "vitest";
import {
  resolveAnchorVirtIndex,
  captureAnchorAtIndex,
  computeFallbackAnchor,
  restoreAnchorScrollTop,
} from "./grid-scroll-anchor";

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
