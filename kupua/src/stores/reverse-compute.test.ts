/**
 * Unit tests for computeScrollTarget() — the reverse-compute pure function
 * extracted from seek() in search-store.ts.
 *
 * These test the exact edge cases from the Agent 11–13 swimming saga:
 * - scrollTop=0 with backward headroom (the cold-start bug)
 * - Half-row sub-pixel preservation
 * - Deep scroll (10+ rows)
 * - Shallow seek (no backward items)
 * - End key (at-real-end path)
 * - Fractional boundary row (100/6 = 16.67)
 * - Buffer-shrink clamping
 *
 */

import { describe, it, expect } from "vitest";
import {
  computeScrollTarget,
  type ComputeScrollTargetInput,
} from "./search-store";

// ---------------------------------------------------------------------------
// Helpers — common input shapes
// ---------------------------------------------------------------------------

/** Standard grid viewport: 1280px wide → floor(1280/280) = 4 cols. */
const GRID_COLS_4 = 1280;
/** Wide grid viewport: 1680px wide → floor(1680/280) = 6 cols. */
const GRID_COLS_6 = 1680;
/** Standard viewport height. */
const VIEWPORT_HEIGHT = 800;

function gridInput(overrides: Partial<ComputeScrollTargetInput> = {}): ComputeScrollTargetInput {
  return {
    currentScrollTop: 0,
    isTable: false,
    clientWidth: GRID_COLS_4,
    clientHeight: VIEWPORT_HEIGHT,
    backwardItemCount: 100,
    bufferLength: 300,
    total: 10000,
    actualOffset: 5000,
    clampedOffset: 5100,
    ...overrides,
  };
}

function tableInput(overrides: Partial<ComputeScrollTargetInput> = {}): ComputeScrollTargetInput {
  return {
    currentScrollTop: 0,
    isTable: true,
    clientWidth: 1280,
    clientHeight: VIEWPORT_HEIGHT,
    backwardItemCount: 100,
    bufferLength: 300,
    total: 10000,
    actualOffset: 5000,
    clampedOffset: 5100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeScrollTarget", () => {
  // -------------------------------------------------------------------------
  // Case 1: scrollTop=0 with backward headroom (the cold-start bug)
  //
  // The user is at scrollTop=0 (fresh app or Home key) and seeks to 50%.
  // Bidirectional seek prepends 100 backward items. Without the headroom
  // offset, reverseIndex=0 → user sees backward items (wrong content).
  // With the fix, reverseIndex += backwardItemCount → reverseIndex=100.
  // -------------------------------------------------------------------------

  it("scrollTop=0 with 100 backward items → index 100, no sub-row offset", () => {
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 0,
      backwardItemCount: 100,
    }));

    expect(result.scrollTargetIndex).toBe(100);
    expect(result.seekSubRowOffset).toBe(0);
  });

  it("scrollTop=0 with 100 backward items in table → index 100", () => {
    const result = computeScrollTarget(tableInput({
      currentScrollTop: 0,
      backwardItemCount: 100,
    }));

    expect(result.scrollTargetIndex).toBe(100);
    expect(result.seekSubRowOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Case 2: Half-row sub-pixel preservation
  //
  // User at scrollTop=150 (half a grid row of 303px). Round(150/303)=0,
  // so reverseIndex=0 < backwardItemCount=100 → headroom fires.
  // Sub-row offset = 150 - 0*303 = 150.
  // reverseIndex = 0 + 100 = 100.
  // -------------------------------------------------------------------------

  it("scrollTop=150 (half-row) preserves sub-row offset", () => {
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 150,
      backwardItemCount: 100,
    }));

    expect(result.scrollTargetIndex).toBe(100);
    expect(result.seekSubRowOffset).toBe(150);
  });

  it("scrollTop=150 in table preserves sub-row offset", () => {
    // TABLE_ROW_HEIGHT=32. round(150/32)=5. reverseIndex=5*1=5.
    // 5 < 100 → headroom fires. subRow = 150 - 5*32 = 150-160 = -10.
    // Actually Math.round(150/32) = Math.round(4.6875) = 5.
    // subRow = 150 - 5*32 = -10. That's negative...
    // Let me recalculate: 150/32 = 4.6875, round = 5, 5*32=160.
    // subRow = 150 - 160 = -10. This is because Math.round overshoots.
    // This is the existing behaviour — the sub-row offset can be negative
    // (effect #6 handles it). The important thing is it's preserved.
    const result = computeScrollTarget(tableInput({
      currentScrollTop: 150,
      backwardItemCount: 100,
    }));

    // reverseIndex = round(150/32) * 1 = 5. 5 < 100 → headroom.
    // target = 5 + 100 = 105.
    expect(result.scrollTargetIndex).toBe(105);
    // subRow = 150 - 5*32 = -10
    expect(result.seekSubRowOffset).toBe(-10);
  });

  // -------------------------------------------------------------------------
  // Case 3: Deep scroll (10 rows deep, 6 cols)
  //
  // scrollTop=3030. Grid 6-col: round(3030/303)=10. reverseIndex=10*6=60.
  // 60 < 100 → headroom fires. subRow = 3030 - 10*303 = 0.
  // reverseIndex = 60 + 100 = 160.
  // -------------------------------------------------------------------------

  it("scrollTop=3030 (10 rows deep, 6 cols) → index 160", () => {
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 3030,
      clientWidth: GRID_COLS_6,
      backwardItemCount: 100,
    }));

    expect(result.scrollTargetIndex).toBe(160);
    expect(result.seekSubRowOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Case 4: Shallow seek (no backward items)
  //
  // When DEEP_SEEK_THRESHOLD isn't reached, no backward fetch happens.
  // backwardItemCount=0. scrollTop=0 → reverseIndex=0.
  // No headroom adjustment. scrollTargetIndex = reverseIndex = 0.
  // -------------------------------------------------------------------------

  it("scrollTop=0 with no backward items (shallow seek) → index 0", () => {
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 0,
      backwardItemCount: 0,
    }));

    expect(result.scrollTargetIndex).toBe(0);
    expect(result.seekSubRowOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Case 5: End key (at-real-end path)
  //
  // actualOffset + bufferLength >= total → atRealEnd=true.
  // clampedOffset >= total - bufferLength → soughtNearEnd=true.
  // scrollTargetIndex = bufferLength - 1.
  // -------------------------------------------------------------------------

  it("End key: at-real-end with soughtNearEnd → last item", () => {
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 0,
      backwardItemCount: 100,
      bufferLength: 300,
      total: 10000,
      actualOffset: 9700,  // 9700 + 300 = 10000 ≥ 10000 → atRealEnd
      clampedOffset: 9800, // 9800 ≥ 10000 - 300 = 9700 → soughtNearEnd
    }));

    expect(result.scrollTargetIndex).toBe(299); // bufferLength - 1
    // seekSubRowOffset still set because headroom fires (reverseIndex=0 < 100)
    expect(result.seekSubRowOffset).toBe(0);
  });

  it("End key in table: at-real-end → last item", () => {
    const result = computeScrollTarget(tableInput({
      currentScrollTop: 0,
      backwardItemCount: 100,
      bufferLength: 300,
      total: 10000,
      actualOffset: 9700,
      clampedOffset: 9800,
    }));

    expect(result.scrollTargetIndex).toBe(299);
  });

  // -------------------------------------------------------------------------
  // Case 5b: at-real-end but NOT soughtNearEnd — use reverse-compute
  //
  // This covers a mid-range seek that happens to land at the end
  // (shouldn't normally happen, but the function handles it).
  // -------------------------------------------------------------------------

  it("at-real-end but not soughtNearEnd → clamp reverseIndex", () => {
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 0,
      backwardItemCount: 100,
      bufferLength: 300,
      total: 10000,
      actualOffset: 9700,  // atRealEnd
      clampedOffset: 5000, // 5000 < 9700 → NOT soughtNearEnd
    }));

    // reverseIndex = 0 + 100 = 100 (headroom). clamped to [0, 299].
    expect(result.scrollTargetIndex).toBe(100);
  });

  // -------------------------------------------------------------------------
  // Case 6: Fractional boundary row (100/cols not integer)
  //
  // 6 cols, 100 backward items. 100/6 = 16.67.
  // Row 16: reverseIndex = 16*6 = 96. 96 < 100 → headroom fires.
  // Row 17: reverseIndex = 17*6 = 102. 102 ≥ 100 → no headroom.
  // Both should produce correct positions.
  // -------------------------------------------------------------------------

  it("fractional boundary: row 16 (96 < 100) → headroom fires", () => {
    // scrollTop for row 16 = 16 * 303 = 4848
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 4848,
      clientWidth: GRID_COLS_6,
      backwardItemCount: 100,
    }));

    // round(4848/303) = round(16.0) = 16. reverseIndex = 16*6 = 96.
    // 96 < 100 → headroom. reverseIndex = 96 + 100 = 196.
    expect(result.scrollTargetIndex).toBe(196);
    expect(result.seekSubRowOffset).toBe(0); // exactly on row boundary
  });

  it("fractional boundary: row 17 (102 ≥ 100) → no headroom", () => {
    // scrollTop for row 17 = 17 * 303 = 5151
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 5151,
      clientWidth: GRID_COLS_6,
      backwardItemCount: 100,
    }));

    // round(5151/303) = round(17.0) = 17. reverseIndex = 17*6 = 102.
    // 102 ≥ 100 → no headroom. reverseIndex stays 102.
    expect(result.scrollTargetIndex).toBe(102);
    expect(result.seekSubRowOffset).toBe(0);
  });

  it("fractional boundary: row 16 with sub-row offset (sub-row preserved)", () => {
    // 6 cols, 100 backward items. 100/6 = 16.67 rows.
    // scrollTop=4948 → 4948/303 = 16.33, round=16. reverseIndex=16*6=96.
    // 96 < 100 → headroom fires. reverseIndex = 96 + 100 = 196.
    // subRow = 4948 - 16*303 = 4948 - 4848 = 100.
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 4948,
      clientWidth: GRID_COLS_6,
      backwardItemCount: 100,
    }));

    expect(result.scrollTargetIndex).toBe(196);
    expect(result.seekSubRowOffset).toBe(100);
  });

  // -------------------------------------------------------------------------
  // Case 7: Buffer-shrink clamping
  //
  // When the user's scroll position exceeds the new buffer's maxScroll
  // (e.g. buffer went from 1000 to 200 items), the function clamps to
  // the last visible row.
  // -------------------------------------------------------------------------

  it("buffer-shrink: reversePixelTop exceeds maxScroll → clamp", () => {
    // Grid 4 cols, 200 items = 50 rows. scrollHeight = 50 * 303 = 15150.
    // viewport 800 → maxScroll = 15150 - 800 = 14350.
    // User at scrollTop = 15000 (row ~49.5). round(15000/303) = round(49.5) = 50.
    // reverseIndex = 50 * 4 = 200. No backward items.
    // reversePixelTop = floor(200/4)*303 = 50*303 = 15150 ≥ 14350 → clamp.
    // lastVisibleRow = floor(14350/303) = floor(47.36) = 47.
    // scrollTargetIndex = min(47*4, 199) = min(188, 199) = 188.
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 15000,
      backwardItemCount: 0,
      bufferLength: 200,
    }));

    expect(result.scrollTargetIndex).toBe(188);
    expect(result.seekSubRowOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Case 8: Past headroom with large scrollTop (second seek)
  //
  // After the first seek, the user scrolled down. scrollTop is large,
  // reverseIndex >= backwardItemCount. No headroom adjustment needed.
  // -------------------------------------------------------------------------

  it("large scrollTop past headroom → no headroom adjustment", () => {
    // 4 cols. scrollTop = 10000. round(10000/303) = round(33.0) = 33.
    // reverseIndex = 33*4 = 132. 132 ≥ 100 → no headroom.
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 10000,
      backwardItemCount: 100,
    }));

    expect(result.scrollTargetIndex).toBe(132);
    expect(result.seekSubRowOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Table-specific edge cases
  // -------------------------------------------------------------------------

  it("table: deep scroll past headroom", () => {
    // TABLE_ROW_HEIGHT=32. scrollTop=5000. round(5000/32)=round(156.25)=156.
    // reverseIndex=156*1=156. 156 ≥ 100 → no headroom.
    const result = computeScrollTarget(tableInput({
      currentScrollTop: 5000,
      backwardItemCount: 100,
    }));

    expect(result.scrollTargetIndex).toBe(156);
    expect(result.seekSubRowOffset).toBe(0);
  });

  it("table: buffer-shrink clamp", () => {
    // 1 col, 200 items. scrollHeight = 200 * 32 = 6400.
    // viewport 800 → maxScroll = 5600.
    // scrollTop = 6000. round(6000/32)=round(187.5)=188.
    // reverseIndex = 188. No backward items.
    // reversePixelTop = 188*32 = 6016 ≥ 5600 → clamp.
    // lastVisibleRow = floor(5600/32) = 175.
    // scrollTargetIndex = min(175, 199) = 175.
    const result = computeScrollTarget(tableInput({
      currentScrollTop: 6000,
      backwardItemCount: 0,
      bufferLength: 200,
    }));

    expect(result.scrollTargetIndex).toBe(175);
    expect(result.seekSubRowOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Regression guard: the exact values from the E2E test
  // -------------------------------------------------------------------------

  it("matches E2E observed values: scrollTop=7725, offset=5057, len=300", () => {
    // From Phase 1 test output: scrollTop=7725, offset=5057, len=300, visiblePos=5157.
    // 4-col grid. round(7725/303) = round(25.495) = 25.
    // reverseIndex = 25*4 = 100. With backwardItemCount=100: 100 ≥ 100 → no headroom.
    // reversePixelTop = floor(100/4)*303 = 25*303 = 7575.
    // totalRows = ceil(300/4) = 75. scrollHeight = 75*303 = 22725.
    // maxScroll = 22725 - 800 = 21925.
    // 7575 < 21925 → fits. scrollTargetIndex = 100.
    const result = computeScrollTarget(gridInput({
      currentScrollTop: 7725,
      backwardItemCount: 100,
      bufferLength: 300,
      actualOffset: 5057,
      clampedOffset: 5157,
    }));

    expect(result.scrollTargetIndex).toBe(100);
    expect(result.seekSubRowOffset).toBe(0);
  });
});


