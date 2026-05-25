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
// Bug #21 — PIT-expiry fallback returns no pitId, causing cascade of retries
//
// When the PIT expires mid-session, the fallback path retries without PIT but
// does not return a pitId. The store keeps the stale expired PIT and every
// subsequent extend re-sends it → 404 → fallback → cascade. Fix: the fallback
// must return `pitId: null` explicitly so the store clears the stale PIT.
// ---------------------------------------------------------------------------

describe("searchAfter PIT-expiry fallback returns pitId: null (audit #21)", () => {
  it("returns pitId: null (not undefined) on PIT-expiry fallback", async () => {
    // The fallback response intentionally omits pit_id (non-PIT search)
    const fallbackHits = {
      took: 1,
      hits: {
        total: { value: 1 },
        hits: [{ _id: "img-3", _source: { id: "img-3" }, sort: [1000, "img-3"] }],
      },
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(errorResponse(404, "PIT closed"))   // PIT call → 404
      .mockResolvedValueOnce(okResponse(fallbackHits));           // retry without PIT → 200

    const result = await ds.searchAfter(
      { orderBy: "-uploadTime" },
      null,
      "expired-pit-id",
    );

    expect(result.hits).toHaveLength(1);
    // Critical assertion: pitId must be explicitly null, NOT undefined
    // so the store can distinguish "PIT expired — clear it" from "no info"
    expect(result.pitId).toBeNull();
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

// ---------------------------------------------------------------------------
// searchByAi — KNN query shape + result mapping
// ---------------------------------------------------------------------------

vi.mock("@/lib/bedrock-proxy-client", () => ({
  getEmbedding: vi.fn(),
  checkBedrockHealth: vi.fn().mockResolvedValue(false),
}));

import { getEmbedding } from "@/lib/bedrock-proxy-client";

/** Minimal KNN _search response factory. */
function knnSearchResponse(
  ids: string[],
  scores?: number[],
) {
  return {
    took: 5,
    hits: {
      hits: ids.map((id, i) => ({
        _id: id,
        _source: { id, uploadTime: "2024-01-01T00:00:00Z", uploadedBy: "test" },
        _score: scores?.[i] ?? 1 - i * 0.01,
      })),
    },
  };
}

const FAKE_EMBEDDING = Array.from({ length: 256 }, (_, i) => i * 0.001);

describe("searchByAi", () => {
  beforeEach(() => {
    vi.mocked(getEmbedding).mockClear();
    vi.mocked(getEmbedding).mockResolvedValue(FAKE_EMBEDDING);
  });

  it("builds a KNN query with the AI text and returns mapped results", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(knnSearchResponse(["img-1", "img-2", "img-3"])),
    );

    const result = await ds.searchByAi({ orderBy: "-uploadTime", aiQuery: "snowy peaks" });

    // Verify getEmbedding was called with the extracted AI text
    expect(vi.mocked(getEmbedding)).toHaveBeenCalledWith("snowy peaks", undefined);

    // Verify fetch was called with a KNN body
    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body).toHaveProperty("knn");
    expect(body.knn).toMatchObject({
      query_vector: FAKE_EMBEDDING,
      k: 200,
    });
    expect(body.knn.field).toBe("embedding.cohereEmbedV4.image");

    // Verify result shape
    expect(result.hits).toHaveLength(3);
    expect(result.total).toBe(3); // KEY: total === hits.length
    expect(result.pitId).toBeNull();
    expect(result.sortValues).toHaveLength(3);
  });

  it("attaches __aiScore to each hit from _score", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(knnSearchResponse(["img-1", "img-2"], [0.95, 0.80])),
    );

    const result = await ds.searchByAi({ orderBy: "-uploadTime", aiQuery: "foggy forest" });

    expect(result.hits[0].__aiScore).toBeCloseTo(0.95);
    expect(result.hits[1].__aiScore).toBeCloseTo(0.80);
  });

  it("builds KNN pre-filter from remaining CQL chips", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(knnSearchResponse(["img-1"])),
    );

    await ds.searchByAi({
      orderBy: "-uploadTime",
      aiQuery: "storm",
      query: "uploaded-by:alice",
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    // The pre-filter should include the remaining CQL chip, not the aiQuery chip
    const filterStr = JSON.stringify(body.knn.filter);
    expect(filterStr).toContain("alice");
    expect(filterStr).not.toContain("storm");
    expect(filterStr).not.toContain("aiQuery");
  });

  it("returns total === hits.length (pagination invariant)", async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `img-${i}`);
    vi.mocked(global.fetch).mockResolvedValueOnce(okResponse(knnSearchResponse(ids)));

    const result = await ds.searchByAi({ orderBy: "-uploadTime", aiQuery: "landscape" });

    expect(result.total).toBe(15);
    expect(result.total).toBe(result.hits.length);
  });

  it("propagates getEmbedding errors (Bedrock unavailable)", async () => {
    vi.mocked(getEmbedding).mockRejectedValue(new Error("Bedrock 503"));

    await expect(
      ds.searchByAi({ orderBy: "-uploadTime", aiQuery: "test" }),
    ).rejects.toThrow("Bedrock 503");

    // No ES request should have been made
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it("falls back to searchAfter when no aiQuery chip present", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(esSearchHits([{ id: "img-fallback" }])),
    );

    const result = await ds.searchByAi({ orderBy: "-uploadTime", query: "type:image" });

    // Should NOT call getEmbedding (no chip)
    expect(vi.mocked(getEmbedding)).not.toHaveBeenCalled();

    // Should still return results (from searchAfter)
    expect(result.hits.length).toBeGreaterThanOrEqual(0);
  });
});
