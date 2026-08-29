/**
 * MockDataSource — countBefore / getKeywordDistribution / estimateSortValue
 * fidelity tests for keyword-sorted seek.
 *
 * Companion to exploration/docs/scroll-and-position-preservation-testing-4.1-
 * keyword-sorts-workplan.md §8-9. Before this file existed, MockDataSource's
 * countBefore ignored every non-id cursor value, so the sentinel bug that
 * broke keyword seek (commit 61b042101) was structurally invisible to the
 * unit suite — the mock could never reproduce it. These tests pin that
 * mechanism directly (T4-equivalent), plus the mock's new scoped
 * estimateSortValue and truncatable getKeywordDistribution (workplan §9.0.3,
 * §9.0.4).
 */

import { describe, it, expect } from "vitest";
import { MockDataSource } from "./mock-data-source";

describe("MockDataSource.countBefore — sort-tuple comparison fidelity", () => {
  it("reproduces the sentinel bug: a MAX_SAFE_INTEGER-anchored secondary field makes the count constant regardless of the id probe", async () => {
    const mock = new MockDataSource(20_000, undefined, { skewedCredits: true });
    const params = { orderBy: "-credit" };

    const low = await mock.countBefore(params, ["AAP", Number.MAX_SAFE_INTEGER, "000000000000"]);
    const high = await mock.countBefore(params, ["AAP", Number.MAX_SAFE_INTEGER, "ffffffffffff"]);

    // This IS the regression: no real doc's uploadTime ever equals the
    // sentinel, so every id probe collapses to the same count.
    expect(low).toBe(high);
  });

  it("responds to a real (non-sentinel) secondary value", async () => {
    const mock = new MockDataSource(20_000, undefined, { skewedCredits: true });
    const params = { orderBy: "-credit" };

    const early = await mock.countBefore(params, ["AAP", new Date("2020-06-01").getTime(), ""]);
    const late = await mock.countBefore(params, ["AAP", new Date("2025-06-01").getTime(), ""]);

    expect(early).not.toBe(late);
  });

  it("still returns the correct position for the fast default-sort path (unchanged behaviour)", async () => {
    const mock = new MockDataSource(1_000);
    const count = await mock.countBefore({ orderBy: "-uploadTime" }, [0, "img-500"]);
    expect(count).toBe(500);
  });
});

describe("MockDataSource.getKeywordDistribution — real implementation", () => {
  it("returns exact per-bucket startPosition/count and a coveredCount matching the full corpus (no nulls)", async () => {
    const mock = new MockDataSource(10_000, undefined, { skewedCredits: true });
    const dist = await mock.getKeywordDistribution({}, "metadata.credit", "desc");

    expect(dist).not.toBeNull();
    expect(dist!.coveredCount).toBe(10_000);
    // Buckets are contiguous and sum to coveredCount.
    let cumulative = 0;
    for (const bucket of dist!.buckets) {
      expect(bucket.startPosition).toBe(cumulative);
      cumulative += bucket.count;
    }
    expect(cumulative).toBe(dist!.coveredCount);
  });

  it("returns a deliberately partial distribution when distributionCap is set", async () => {
    const full = await new MockDataSource(10_000, undefined, { skewedCredits: true })
      .getKeywordDistribution({}, "metadata.credit", "desc");
    const capped = await new MockDataSource(10_000, undefined, { skewedCredits: true, distributionCap: 2 })
      .getKeywordDistribution({}, "metadata.credit", "desc");

    expect(capped!.buckets.length).toBe(2);
    expect(capped!.coveredCount).toBeLessThan(full!.coveredCount);
  });

  it("returns null for fields it doesn't model", async () => {
    const mock = new MockDataSource(1_000);
    const dist = await mock.getKeywordDistribution({}, "metadata.source", "desc");
    expect(dist).toBeNull();
  });
});

describe("MockDataSource.estimateSortValue — scope handling", () => {
  it("unscoped calls are unaffected (existing linear-interpolation behaviour)", async () => {
    const mock = new MockDataSource(10_000);
    const value = await mock.estimateSortValue({}, "uploadTime", 50);
    expect(value).not.toBeNull();
    expect(Number.isInteger(value)).toBe(true);
  });

  it("scoped calls restrict to the matching subset and return a fractional value", async () => {
    const mock = new MockDataSource(20_000, undefined, { skewedCredits: true });
    const value = await mock.estimateSortValue(
      {},
      "uploadTime",
      50,
      undefined,
      [{ field: "metadata.credit", value: "AAP" }],
    );
    expect(value).not.toBeNull();
    expect(Number.isInteger(value)).toBe(false); // fractional — guards T5's rounding requirement
  });

  it("scoped calls at different percentiles return different (monotonic) values", async () => {
    const mock = new MockDataSource(20_000, undefined, { skewedCredits: true });
    const scope = [{ field: "metadata.credit", value: "AAP" }];
    const low = await mock.estimateSortValue({}, "uploadTime", 10, undefined, scope);
    const high = await mock.estimateSortValue({}, "uploadTime", 90, undefined, scope);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect(low as number).toBeLessThan(high as number);
  });

  it("returns null for an unscoped field this fix doesn't support", async () => {
    const mock = new MockDataSource(1_000);
    const value = await mock.estimateSortValue(
      {},
      "source.dimensions.width",
      50,
      undefined,
      [{ field: "metadata.credit", value: "AAP" }],
    );
    expect(value).toBeNull();
  });
});
