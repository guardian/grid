/**
 * Tests for kupua/src/lib/sort-context.ts — the boundary arithmetic behind
 * the null-zone scrubber tick offset and the binary-search bucket lookup.
 *
 * Part A: computeTrackTicksWithNullZone boundary cases (documented past
 *         regression — null-zone boundary tick, changelog.md ~line 1998).
 * Part B: fast-check property covering the private lookupSortDistribution
 *         binary search, driven transitively via interpolateSortLabel.
 * Part C: enumerated pure-function cases for the small sort-key resolvers.
 *
 * All functions under test are pure — no mocking needed.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  computeTrackTicksWithNullZone,
  interpolateSortLabel,
  resolvePrimarySortKey,
  resolveDateSortInfo,
  resolveKeywordSortInfo,
} from "@/lib/sort-context";
import type { Image } from "@/types/image";
import type { SortDistribution } from "@/dal/types";

describe("computeTrackTicksWithNullZone — boundary cases (Part A)", () => {
  it("A1: coveredCount >= total → no boundary tick (keyword orderBy, empty result)", () => {
    const sortDist: SortDistribution = { buckets: [], coveredCount: 10 };
    const result = computeTrackTicksWithNullZone("credit", 10, 0, [], sortDist, null);
    expect(result).toEqual([]);
    expect(result.some((t) => t.boundary)).toBe(false);
  });

  it("A2: sortDist === null → returns covered ticks unchanged (keyword orderBy → [])", () => {
    const result = computeTrackTicksWithNullZone("credit", 10, 0, [], null, null);
    expect(result).toEqual([]);
  });

  it("A3: coveredCount = total - 1 → exactly one boundary tick at position = coveredCount", () => {
    const sortDist: SortDistribution = { buckets: [], coveredCount: 9 };
    const result = computeTrackTicksWithNullZone("credit", 10, 0, [], sortDist, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ position: 9, type: "major", boundary: true });
  });

  it("A4: coveredCount = 0 → boundary tick at position 0 (entire set is null zone)", () => {
    const sortDist: SortDistribution = { buckets: [], coveredCount: 0 };
    const result = computeTrackTicksWithNullZone("credit", 10, 0, [], sortDist, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ position: 0, boundary: true });
  });

  it("A5: null-zone tick positions are offset by coveredCount", () => {
    const sortDist: SortDistribution = { buckets: [], coveredCount: 5 };
    const nullZoneDist: SortDistribution = {
      coveredCount: 20,
      buckets: [
        { key: "2024-01-01T00:00:00.000Z", count: 10, startPosition: 0 },
        { key: "2024-02-01T00:00:00.000Z", count: 10, startPosition: 10 },
      ],
    };
    const result = computeTrackTicksWithNullZone(
      "credit", 100, 0, [], sortDist, nullZoneDist,
    );
    // Second bucket (startPosition 10) offset into global space by coveredCount (5) = 15
    const nonBoundary = result.find((t) => !t.boundary && t.position === 15);
    expect(nonBoundary).toBeDefined();
  });
});

describe("interpolateSortLabel — binary search property (Part B)", () => {
  const img = { id: "x" } as unknown as Image;

  it("resolves the correct bucket key for every covered position (and null beyond)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 7 }),
        fc.integer({ min: 1, max: 50 }),
        (gaps, tail) => {
          const starts = gaps.reduce<number[]>((acc, g) => {
            acc.push(acc[acc.length - 1] + g);
            return acc;
          }, [0]);
          const buckets = starts.map((startPosition, i) => ({
            key: `k${i}`,
            count: 1,
            startPosition,
          }));
          const coveredCount = starts[starts.length - 1] + tail;
          const dist: SortDistribution = { buckets, coveredCount };
          const total = coveredCount + 10;

          for (let p = 0; p <= coveredCount + 5; p++) {
            const label = interpolateSortLabel(
              "credit", p, total, 1_000_000, [img], dist,
            );
            if (p >= coveredCount) {
              expect(label).toBe(null);
            } else {
              let idx = 0;
              for (let b = 0; b < buckets.length; b++) {
                if (buckets[b].startPosition <= p) idx = b;
                else break;
              }
              expect(label).toBe(`k${idx}`);
            }
          }
        },
      ),
    );
  });

  it("example: buckets at [0,5,10], coveredCount 15", () => {
    const dist: SortDistribution = {
      coveredCount: 15,
      buckets: [
        { key: "k0", count: 1, startPosition: 0 },
        { key: "k1", count: 1, startPosition: 5 },
        { key: "k2", count: 1, startPosition: 10 },
      ],
    };
    expect(interpolateSortLabel("credit", 5, 25, 1_000_000, [img], dist)).toBe("k1");
    expect(interpolateSortLabel("credit", 14, 25, 1_000_000, [img], dist)).toBe("k2");
    expect(interpolateSortLabel("credit", 15, 25, 1_000_000, [img], dist)).toBe(null);
  });
});

describe("sort-key resolvers — enumerated cases (Part C)", () => {
  it("C1: resolvePrimarySortKey strips leading '-' and takes the first comma-separated field", () => {
    expect(resolvePrimarySortKey("-uploadTime,taken")).toBe("uploadTime");
    expect(resolvePrimarySortKey(undefined)).toBe("uploadTime"); // default -uploadTime
  });

  it("C2: interpolateSortLabel returns null (not throw) for a date sort with missing dateTaken", () => {
    const imageWithNoDateTaken = { id: "y", metadata: {} } as unknown as Image;
    expect(
      interpolateSortLabel("-taken", 0, 100, 0, [imageWithNoDateTaken]),
    ).toBe(null);
  });

  it("C3: unknown sort field resolves to null for both date and keyword info", () => {
    expect(resolveDateSortInfo("unknownField")).toBe(null);
    expect(resolveKeywordSortInfo("unknownField")).toBe(null);
  });

  it("C4: known sort fields resolve to their ES field path and direction", () => {
    expect(resolveDateSortInfo("-taken")).toEqual({
      field: "metadata.dateTaken",
      direction: "desc",
    });
    expect(resolveKeywordSortInfo("credit")).toEqual({
      field: "metadata.credit",
      direction: "asc",
    });
  });
});
