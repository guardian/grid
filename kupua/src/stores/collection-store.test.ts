import { describe, it, expect } from "vitest";
import { buildSubtreeCounts } from "./collection-store";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildSubtreeCounts", () => {
  it("returns empty map for empty input", () => {
    const result = buildSubtreeCounts(new Map());
    expect(result.size).toBe(0);
  });

  it("returns own count for a leaf node", () => {
    const result = buildSubtreeCounts(new Map([["sport", 42]]));
    expect(result.get("sport")).toBe(42);
  });

  it("sums own count + children counts for a parent", () => {
    const direct = new Map([
      ["sport", 5],
      ["sport/football", 30],
      ["sport/tennis", 10],
    ]);

    const result = buildSubtreeCounts(direct);
    expect(result.get("sport/football")).toBe(30);
    expect(result.get("sport/tennis")).toBe(10);
    expect(result.get("sport")).toBe(45); // 5 + 30 + 10
  });

  it("handles missing intermediate counts (treats as zero)", () => {
    // Only the leaf has a count; parent has no direct count
    const result = buildSubtreeCounts(new Map([["sport/football", 8]]));
    expect(result.get("sport/football")).toBe(8);
    expect(result.get("sport")).toBe(8); // inherited from child
  });

  it("accumulates correctly across three levels of nesting", () => {
    const direct = new Map([
      ["sport", 1],
      ["sport/football", 2],
      ["sport/football/premier-league", 4],
    ]);
    const result = buildSubtreeCounts(direct);
    expect(result.get("sport/football/premier-league")).toBe(4);
    expect(result.get("sport/football")).toBe(6); // 2 + 4
    expect(result.get("sport")).toBe(7); // 1 + 2 + 4
  });

  it("handles multiple root-level children independently", () => {
    const direct = new Map([
      ["sport", 10],
      ["travel", 20],
    ]);
    const result = buildSubtreeCounts(direct);
    expect(result.get("sport")).toBe(10);
    expect(result.get("travel")).toBe(20);
  });

  it("skips empty pathId keys", () => {
    const direct = new Map([
      ["", 9],
      ["sport", 5],
    ]);
    const result = buildSubtreeCounts(direct);
    expect(result.get("sport")).toBe(5);
    expect(result.has("")).toBe(false);
  });

  it("counts orphaned subcollections into ancestors", () => {
    // culture/test/orphan exists in ES but might not be in the tree —
    // its count should still roll up to culture and culture/test
    const direct = new Map([
      ["culture", 1],
      ["culture/test", 2],
      ["culture/test/orphan", 12],
    ]);
    const result = buildSubtreeCounts(direct);
    expect(result.get("culture/test/orphan")).toBe(12);
    expect(result.get("culture/test")).toBe(14); // 2 + 12
    expect(result.get("culture")).toBe(15); // 1 + 2 + 12
  });
});
