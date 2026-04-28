/**
 * Unit tests for ElasticsearchDataSource — adapter-layer behaviour.
 *
 * Uses vi.spyOn(global, "fetch") to simulate ES responses without a real
 * server. Tests cover error-handling paths that cannot be exercised through
 * the MockDataSource.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ElasticsearchDataSource } from "./es-adapter";

// ---------------------------------------------------------------------------
// Minimal fetch-response factory helpers
// ---------------------------------------------------------------------------

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errorResponse(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    json: async () => { throw new Error("not ok"); },
    text: async () => body,
  } as unknown as Response;
}

/** Minimal valid ES _search response for searchAfter (PIT or non-PIT). */
function esSearchHits(hits: Array<{ id: string }> = []) {
  return {
    took: 1,
    pit_id: "new-pit-id",
    hits: {
      total: { value: hits.length },
      hits: hits.map((h, i) => ({
        _id: h.id,
        _source: { id: h.id },
        sort: [Date.now() - i, h.id],
      })),
    },
  };
}

/** Minimal composite agg response with a single bucket page. */
function esCompositeAgg(
  buckets: Array<{ key: string; count: number }>,
  afterKey?: string,
) {
  return {
    took: 1,
    hits: { total: { value: 0 }, hits: [] },
    aggregations: {
      pos: {
        after_key: afterKey ? { _sort_field: afterKey } : undefined,
        buckets: buckets.map((b) => ({
          key: { _sort_field: b.key },
          doc_count: b.count,
        })),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// `scheduler` is a browser Scheduler API global not present in Node/Vitest.
// The es-adapter uses `scheduler?.yield?.()` with optional chaining, but that
// only guards against null/undefined — it still throws ReferenceError when
// `scheduler` is not declared at all. Declare it as undefined so the optional
// chain short-circuits to the setTimeout fallback.
declare const scheduler: undefined;
(global as Record<string, unknown>).scheduler = undefined;

let ds: ElasticsearchDataSource;

beforeEach(() => {
  ds = new ElasticsearchDataSource();
  vi.spyOn(global, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Bug #19 — PIT retry regex /40[04]/ does not match HTTP 410
//
// Repro: searchAfter with a pitId; first esRequestRaw call returns 410;
// with the bug the error is rethrown (no retry); with the fix it retries
// without PIT and succeeds.
// ---------------------------------------------------------------------------

describe("searchAfter PIT expiry retry (audit #19)", () => {
  it("retries without PIT when ES returns 404", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(errorResponse(404, "PIT closed"))   // PIT call → 404
      .mockResolvedValueOnce(okResponse(esSearchHits([{ id: "img-1" }]))); // retry → 200

    const result = await ds.searchAfter(
      { orderBy: "-uploadTime" },
      null,
      "a-pit-id",
    );

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].id).toBe("img-1");
    // Two fetch calls: first with PIT, second without
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
  });

  it("retries without PIT when ES returns 410 (audit #19 — was broken)", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(errorResponse(410, "PIT expired"))  // PIT call → 410
      .mockResolvedValueOnce(okResponse(esSearchHits([{ id: "img-2" }]))); // retry → 200

    const result = await ds.searchAfter(
      { orderBy: "-uploadTime" },
      null,
      "a-pit-id",
    );

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].id).toBe("img-2");
    // Two fetch calls: first with PIT, second without
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Bug #20 — findKeywordSortValue returns null on mid-walk error, discarding
//           the best-known approximation (lastKeywordValue).
//
// Repro: composite agg succeeds on page 1 (returns buckets + afterKey so
// there is a known lastKeywordValue), then throws on page 2. Before the fix
// the method returns null; after the fix it returns the last page-1 value.
// ---------------------------------------------------------------------------

describe("findKeywordSortValue mid-walk error (audit #20)", () => {
  it("returns lastKeywordValue (not null) when page 2 fetch throws", async () => {
    // Force BUCKET_SIZE=2 inside findKeywordSortValue so that a 2-bucket
    // page 1 response is considered "full" (buckets.length >= BUCKET_SIZE)
    // and the walk proceeds to page 2 rather than returning early.
    vi.stubEnv("VITE_KEYWORD_SEEK_BUCKET_SIZE", "2");

    // Page 1: exactly BUCKET_SIZE (2) buckets totalling 50 docs, afterKey
    // present — signals there are more pages.
    const page1 = esCompositeAgg(
      [
        { key: "Alice", count: 30 },
        { key: "Bob",   count: 20 },
      ],
      "Bob", // afterKey: walk should continue to page 2
    );

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(okResponse(page1))                  // page 1 OK
      .mockResolvedValueOnce(errorResponse(500, "upstream err")); // page 2 fails

    // targetPosition=60: beyond the 50 docs on page 1, so the walk proceeds
    // to page 2 where the error occurs. lastKeywordValue at that point is "Bob".
    const value = await (ds as unknown as {
      findKeywordSortValue: (
        params: object,
        field: string,
        target: number,
        direction: "asc" | "desc",
      ) => Promise<string | null>;
    }).findKeywordSortValue({}, "metadata.byline", 60, "asc");

    expect(value).toBe("Bob"); // should return last known value, not null

    vi.unstubAllEnvs();
  });
});
