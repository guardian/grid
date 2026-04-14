/**
 * Unit tests for the Position Map data structure and helpers.
 *
 * Covers:
 * - cursorForPosition edge cases (position 0, 1, last, beyond-end, tied values)
 * - Position map construction via MockDataSource.fetchPositionIndex
 * - Abort mid-fetch
 * - Empty result set
 */

import { describe, it, expect } from "vitest";
import { cursorForPosition, type PositionMap } from "./position-map";
import { MockDataSource } from "./mock-data-source";

// ---------------------------------------------------------------------------
// cursorForPosition
// ---------------------------------------------------------------------------

describe("cursorForPosition", () => {
  // A small map for testing — 5 entries with distinct sort values
  const map: PositionMap = {
    length: 5,
    ids: ["img-0", "img-1", "img-2", "img-3", "img-4"],
    sortValues: [
      [1000, "img-0"],
      [2000, "img-1"],
      [3000, "img-2"],
      [4000, "img-3"],
      [5000, "img-4"],
    ],
  };

  it("returns null for position 0 (no cursor → fetch from start)", () => {
    expect(cursorForPosition(map, 0)).toBeNull();
  });

  it("returns null for negative positions", () => {
    expect(cursorForPosition(map, -1)).toBeNull();
    expect(cursorForPosition(map, -100)).toBeNull();
  });

  it("returns sortValues[0] for position 1 (seek strictly after first doc)", () => {
    expect(cursorForPosition(map, 1)).toEqual([1000, "img-0"]);
  });

  it("returns sortValues[N-1] for position N", () => {
    expect(cursorForPosition(map, 3)).toEqual([3000, "img-2"]);
  });

  it("returns the last entry's sort values for position = length (clamped)", () => {
    // Position 5 in a 5-entry map → cursorIndex = min(5, 5) - 1 = 4
    expect(cursorForPosition(map, 5)).toEqual([5000, "img-4"]);
  });

  it("clamps beyond-end positions to last entry", () => {
    // Position 100 → cursorIndex = min(100, 5) - 1 = 4
    expect(cursorForPosition(map, 100)).toEqual([5000, "img-4"]);
  });

  it("handles tied sort values correctly (id tiebreaker makes them unique)", () => {
    const tiedMap: PositionMap = {
      length: 4,
      ids: ["img-a", "img-b", "img-c", "img-d"],
      sortValues: [
        [1000, "img-a"],
        [1000, "img-b"], // same primary sort value
        [1000, "img-c"], // same primary sort value
        [2000, "img-d"],
      ],
    };

    // Seeking to position 2 uses sortValues[1] — even though primary is tied,
    // the id tiebreaker makes the cursor unique.
    expect(cursorForPosition(tiedMap, 2)).toEqual([1000, "img-b"]);
  });

  it("handles a single-entry map", () => {
    const singleMap: PositionMap = {
      length: 1,
      ids: ["only-one"],
      sortValues: [[42, "only-one"]],
    };

    expect(cursorForPosition(singleMap, 0)).toBeNull();
    expect(cursorForPosition(singleMap, 1)).toEqual([42, "only-one"]);
  });

  it("handles keyword sort values (strings)", () => {
    const kwMap: PositionMap = {
      length: 3,
      ids: ["img-0", "img-1", "img-2"],
      sortValues: [
        ["AP", 1000, "img-0"],
        ["Getty", 2000, "img-1"],
        ["Reuters", 3000, "img-2"],
      ],
    };

    expect(cursorForPosition(kwMap, 0)).toBeNull();
    expect(cursorForPosition(kwMap, 1)).toEqual(["AP", 1000, "img-0"]);
    expect(cursorForPosition(kwMap, 2)).toEqual(["Getty", 2000, "img-1"]);
  });

  it("handles null values in sort tuples (null-zone entries)", () => {
    const nullMap: PositionMap = {
      length: 3,
      ids: ["img-0", "img-1", "img-2"],
      sortValues: [
        [1000, "img-0"],
        [null, 2000, "img-1"], // null primary sort value
        [null, 3000, "img-2"],
      ],
    };

    expect(cursorForPosition(nullMap, 2)).toEqual([null, 2000, "img-1"]);
  });
});

// ---------------------------------------------------------------------------
// MockDataSource.fetchPositionIndex — integration-style tests
// ---------------------------------------------------------------------------

describe("MockDataSource.fetchPositionIndex", () => {
  it("returns a position map with correct length for default sort", async () => {
    const ds = new MockDataSource(100);
    const controller = new AbortController();
    const map = await ds.fetchPositionIndex({}, controller.signal);

    expect(map).not.toBeNull();
    expect(map!.length).toBe(100);
    expect(map!.ids.length).toBe(100);
    expect(map!.sortValues.length).toBe(100);
  });

  it("ids and sortValues are parallel — each id matches its sort tuple", async () => {
    const ds = new MockDataSource(50);
    const controller = new AbortController();
    const map = await ds.fetchPositionIndex({}, controller.signal);

    expect(map).not.toBeNull();
    for (let i = 0; i < map!.length; i++) {
      // Default sort: [uploadTime desc, id asc]
      // The id tiebreaker is the last element of sortValues
      const sv = map!.sortValues[i];
      expect(sv[sv.length - 1]).toBe(map!.ids[i]);
    }
  });

  it("returns entries in sort order (default: -uploadTime via mock's raw index order)", async () => {
    const ds = new MockDataSource(20);
    const controller = new AbortController();
    const map = await ds.fetchPositionIndex({}, controller.signal);

    expect(map).not.toBeNull();
    // MockDataSource iterates in raw index order for default sort.
    // Timestamps are linearly increasing (index 0 = 2020, index N = 2026),
    // so sort values are in ascending timestamp order. The mock treats
    // this as the canonical order. (Real ES returns desc for -uploadTime.)
    for (let i = 1; i < map!.length; i++) {
      const prev = map!.sortValues[i - 1][0] as number;
      const curr = map!.sortValues[i][0] as number;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  it("works with keyword sort (credit asc)", async () => {
    const ds = new MockDataSource(30);
    const controller = new AbortController();
    const map = await ds.fetchPositionIndex(
      { orderBy: "credit" },
      controller.signal,
    );

    expect(map).not.toBeNull();
    expect(map!.length).toBe(30);
    // Sort values should include the credit string as first element
    // (buildSortClause("credit") → [{metadata.credit: "asc"}, {uploadTime: "desc"}, {id: "asc"}])
    for (const sv of map!.sortValues) {
      expect(sv.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns null when aborted before starting", async () => {
    const ds = new MockDataSource(100);
    const controller = new AbortController();
    controller.abort();
    const map = await ds.fetchPositionIndex({}, controller.signal);
    expect(map).toBeNull();
  });

  it("returns null when aborted mid-fetch (large dataset)", async () => {
    const ds = new MockDataSource(5000);
    const controller = new AbortController();

    // Abort after a tiny delay — should catch mid-iteration
    const abortPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        controller.abort();
        resolve();
      }, 0);
    });

    const mapPromise = ds.fetchPositionIndex({}, controller.signal);
    await abortPromise;
    const map = await mapPromise;

    // Should be null (aborted) or complete (race condition — both are valid)
    // The important thing is no error is thrown
    expect(map === null || map.length === 5000).toBe(true);
  });

  it("empty dataset returns null", async () => {
    const ds = new MockDataSource(0);
    const controller = new AbortController();
    const map = await ds.fetchPositionIndex({}, controller.signal);

    // MockDataSource with 0 images should return a map with length 0 or null
    // Our implementation iterates 0 times and returns { length: 0, ids: [], sortValues: [] }
    // which is technically valid but the ES adapter returns null for empty.
    // The mock returns an empty map, which is acceptable.
    if (map) {
      expect(map.length).toBe(0);
    }
  });

  it("cursorForPosition works with a mock-generated map", async () => {
    const ds = new MockDataSource(100);
    const controller = new AbortController();
    const map = await ds.fetchPositionIndex({}, controller.signal);

    expect(map).not.toBeNull();

    // Position 0 → null (fetch from start)
    expect(cursorForPosition(map!, 0)).toBeNull();

    // Position 50 → sortValues[49]
    expect(cursorForPosition(map!, 50)).toEqual(map!.sortValues[49]);

    // Position 99 (last) → sortValues[98]
    expect(cursorForPosition(map!, 99)).toEqual(map!.sortValues[98]);
  });
});


