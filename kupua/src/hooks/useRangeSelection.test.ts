/**
 * @vitest-environment jsdom
 */

/**
 * Tests for the `resolveInBufferRange` pure function from useRangeSelection.
 *
 * The hook itself is not unit-tested here (it requires full store + dataSource
 * mocks); the behaviour of the in-buffer path is captured via this pure function,
 * which is the performance-critical and logic-dense part.
 *
 * The `add()` over-marks-pending fix is tested via selection-store.test.ts
 * (already covers add() behaviour; updated assertions are there).
 */

import { describe, it, expect } from "vitest";
import type { Image } from "@/types/image";
import { resolveInBufferRange } from "./useRangeSelection";

// ---------------------------------------------------------------------------
// Minimal Image stub
// ---------------------------------------------------------------------------

function makeImage(id: string): Image {
  return { id } as unknown as Image;
}

// ---------------------------------------------------------------------------
// resolveInBufferRange
// ---------------------------------------------------------------------------

describe("resolveInBufferRange", () => {
  it("returns ids in order when anchor < target and all loaded", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
      makeImage("d"),
      makeImage("e"),
    ];
    const ids = resolveInBufferRange(1, 3, 0, results);
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("returns ids in order when target < anchor (reversed range)", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
      makeImage("d"),
      makeImage("e"),
    ];
    // anchor=3, target=1 → min=1, max=3 → same range
    const ids = resolveInBufferRange(3, 1, 0, results);
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("includes single item when anchor === target", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(1, 1, 0, results);
    expect(ids).toEqual(["b"]);
  });

  it("respects bufferOffset — uses global indices", () => {
    const results: (Image | undefined)[] = [
      makeImage("x"),
      makeImage("y"),
      makeImage("z"),
    ];
    // Buffer starts at global index 10. Image "y" is at global 11.
    const ids = resolveInBufferRange(10, 12, 10, results);
    expect(ids).toEqual(["x", "y", "z"]);
  });

  it("returns null when anchor is before buffer start", () => {
    const results: (Image | undefined)[] = [makeImage("a"), makeImage("b")];
    // bufferOffset=5, anchorGlobal=4 (before buffer)
    const ids = resolveInBufferRange(4, 6, 5, results);
    expect(ids).toBeNull();
  });

  it("returns null when target is after buffer end", () => {
    const results: (Image | undefined)[] = [makeImage("a"), makeImage("b")];
    // bufferOffset=0, length=2, targetGlobal=2 (out of range)
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when anchor is after buffer end", () => {
    const results: (Image | undefined)[] = [makeImage("a"), makeImage("b")];
    const ids = resolveInBufferRange(5, 0, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when any item in range is a skeleton (undefined)", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      undefined, // skeleton
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when skeleton is at the start of the range", () => {
    const results: (Image | undefined)[] = [
      undefined,
      makeImage("b"),
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("returns null when skeleton is at the end of the range", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      undefined,
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toBeNull();
  });

  it("handles empty results array", () => {
    const ids = resolveInBufferRange(0, 2, 0, []);
    expect(ids).toBeNull();
  });

  it("handles single-item buffer", () => {
    const results: (Image | undefined)[] = [makeImage("solo")];
    const ids = resolveInBufferRange(5, 5, 5, results);
    expect(ids).toEqual(["solo"]);
  });

  it("full range: returns all ids when range spans entire buffer", () => {
    const results: (Image | undefined)[] = [
      makeImage("a"),
      makeImage("b"),
      makeImage("c"),
    ];
    const ids = resolveInBufferRange(0, 2, 0, results);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});
