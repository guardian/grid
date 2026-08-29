/**
 * Keyword-sorted seek — cached-distribution fast path.
 *
 * Companion to exploration/docs/scroll-and-position-preservation-testing-4.1-
 * keyword-sorts-workplan.md §9 (T1-T3, T5). T4 and T6 (adapter-level: the
 * countBefore sentinel/real-secondary query shape, and the scope→term
 * filter) live in es-adapter.test.ts and mock-data-source.test.ts.
 *
 * Uses a skewed-credit MockDataSource corpus (largest bucket ~45% of the
 * corpus, far bigger than PAGE_SIZE) so within-bucket drift is actually
 * exercised — the default even-cycling credits never produce a bucket big
 * enough to need refinement.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSearchStore } from "./search-store";
import { MockDataSource } from "@/dal/mock-data-source";
import type { SortValues } from "@/dal/types";

const state = () => useSearchStore.getState();
const actions = () => useSearchStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));

// Must exceed POSITION_MAP_THRESHOLD (default 65,000) so seek() takes the
// deep-seek/keyword path under test instead of the exact position-map fast
// path — the position map (when available) always wins and never touches
// findKeywordSortValue/estimateSortValue at all.
const TOTAL = 120_000;

let mock: MockDataSource;

function resetStore(ds: MockDataSource) {
  useSearchStore.setState({
    dataSource: ds,
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
    sortDistribution: null,
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
      orderBy: "-credit",
      nonFree: "true",
    },
  });
}

/** The largest bucket in the skewed corpus (AAP, ~45%) — well over PAGE_SIZE. */
async function largestBucket(ds: MockDataSource) {
  const dist = await ds.getKeywordDistribution({ orderBy: "-credit" }, "metadata.credit", "desc");
  if (!dist) throw new Error("expected a distribution");
  return dist.buckets.reduce((a, b) => (b.count > a.count ? b : a));
}

beforeEach(() => {
  mock = new MockDataSource(TOTAL, undefined, { skewedCredits: true });
  resetStore(mock);
});

describe("T1 — keyword seek lands within tolerance inside a large bucket", () => {
  it("lands within 5% of the bucket size — not at the bucket start", async () => {
    await actions().search();
    await actions().fetchSortDistribution();
    await flush();

    const bucket = await largestBucket(mock);
    const target = bucket.startPosition + Math.floor(bucket.count / 2);

    await actions().seek(target);
    await flush();

    expect(state().error).toBeNull();
    const drift = Math.abs(state().bufferOffset - target);
    expect(drift).toBeLessThan(bucket.count * 0.05);
  });
});

describe("T2 — keyword seek fast path issues ≤5 DAL calls (was ~54)", () => {
  it("issues at most 5 requests once the distribution is cached", async () => {
    await actions().search();
    await actions().fetchSortDistribution();
    await flush();

    const bucket = await largestBucket(mock);
    const target = bucket.startPosition + Math.floor(bucket.count / 2);

    mock.requestCount = 0;
    await actions().seek(target);
    await flush();

    expect(state().error).toBeNull();
    // 5, not 4: seek() always tries estimateSortValue on the raw primary
    // field first (a pre-existing, out-of-scope "type probe" — ES 400s on
    // percentiles-over-keyword, the mock now faithfully returns null too),
    // THEN this fix's scoped estimateSortValue + searchAfter + countBefore
    // (3) + the bidirectional backward-fetch searchAfter (1) = 5. Still an
    // order of magnitude below today's ~54-call bisection.
    expect(mock.requestCount).toBeLessThanOrEqual(5);
  });
});

describe("T3 — cached distribution vs composite-walk fallback branching", () => {
  it("does NOT call findKeywordSortValue when a complete distribution is cached", async () => {
    await actions().search();
    await actions().fetchSortDistribution();
    await flush();

    const bucket = await largestBucket(mock);
    const target = bucket.startPosition + Math.floor(bucket.count / 2);

    let called = false;
    const original = mock.findKeywordSortValue!.bind(mock);
    mock.findKeywordSortValue = (async (...args: Parameters<typeof original>) => {
      called = true;
      return original(...args);
    }) as typeof mock.findKeywordSortValue;

    await actions().seek(target);
    await flush();

    expect(state().error).toBeNull();
    expect(called).toBe(false);
  });

  it("DOES call findKeywordSortValue when the distribution is absent", async () => {
    // Force getKeywordDistribution to return null (simulates ES failure or
    // a field the distribution endpoint doesn't cover) — coveredCount then
    // defaults to `total`, so this doesn't trip the (separate, pre-existing,
    // out-of-scope) inNullZone/truncation interaction described in workplan
    // §11 Q1. That interaction is why this test uses an ABSENT distribution
    // rather than a TRUNCATED one to reach the fallback branch — a truncated
    // distribution's understated coveredCount would misroute the target
    // into the null-zone path before the keyword branch ever runs. The mock's
    // ability to produce a truncated distribution is covered separately in
    // mock-data-source.test.ts.
    mock.getKeywordDistribution = (async () => null) as typeof mock.getKeywordDistribution;

    await actions().search();
    await actions().fetchSortDistribution();
    await flush();
    expect(state().sortDistribution).toBeNull();

    let called = false;
    const original = mock.findKeywordSortValue!.bind(mock);
    mock.findKeywordSortValue = (async (...args: Parameters<typeof original>) => {
      called = true;
      return original(...args);
    }) as typeof mock.findKeywordSortValue;

    await actions().seek(20_000);
    await flush();

    expect(state().error).toBeNull();
    expect(called).toBe(true);
  });
});

describe("T5 — fractional percentile estimate is rounded before use as a cursor", () => {
  it("passes an integer uploadTime to searchAfter, not a fractional epoch", async () => {
    await actions().search();
    await actions().fetchSortDistribution();
    await flush();

    const bucket = await largestBucket(mock);
    const target = bucket.startPosition + Math.floor(bucket.count / 2);

    const capturedCursors: SortValues[] = [];
    const originalSearchAfter = mock.searchAfter.bind(mock);
    mock.searchAfter = (async (...args: Parameters<typeof originalSearchAfter>) => {
      const cursor = args[1];
      if (cursor) capturedCursors.push(cursor);
      return originalSearchAfter(...args);
    }) as typeof mock.searchAfter;

    await actions().seek(target);
    await flush();

    expect(state().error).toBeNull();
    // The bucket cursor is [creditValue, uploadTimeEstimate, ""].
    const bucketCursor = capturedCursors.find((c) => c.length === 3 && c[2] === "" && c[0] === bucket.key);
    expect(bucketCursor).toBeDefined();
    expect(Number.isInteger(bucketCursor![1])).toBe(true);
  });
});
