/**
 * Phase S0 — DAL tests for getByIds and getIdRange.
 *
 * ES-adapter tests use vi.spyOn(global, "fetch") to simulate ES responses.
 * MockDataSource tests exercise the mock implementation directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ElasticsearchDataSource } from "./es-adapter";
import { MockDataSource } from "./mock-data-source";

// ---------------------------------------------------------------------------
// Helpers
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

/** Minimal valid ES _mget response. */
function esMgetResponse(
  hits: Array<{ id: string; found?: boolean }>,
): { docs: Array<{ _id: string; found: boolean; _source?: { id: string } }> } {
  return {
    docs: hits.map((h) => ({
      _id: h.id,
      found: h.found ?? true,
      ...(h.found !== false ? { _source: { id: h.id } } : {}),
    })),
  };
}

/** Minimal valid ES _search response for a search_after walk (no _source). */
function esSearchAfterIdsOnly(
  hits: Array<{ id: string; sortValues?: (string | number)[] }>,
  params?: { took?: number },
): unknown {
  return {
    took: params?.took ?? 1,
    hits: {
      total: { value: hits.length },
      hits: hits.map((h, i) => ({
        _id: h.id,
        sort: h.sortValues ?? [Date.now() - i * 1000, h.id],
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// Suppress scheduler (browser API not present in Node/Vitest).
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
// getByIds — ES adapter
// ---------------------------------------------------------------------------

describe("ElasticsearchDataSource.getByIds", () => {
  it("returns empty array for empty id list without making a fetch", async () => {
    const result = await ds.getByIds([]);
    expect(result).toEqual([]);
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it("fetches a single batch of IDs via _mget", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(esMgetResponse([{ id: "img-1" }, { id: "img-2" }])),
    );

    const result = await ds.getByIds(["img-1", "img-2"]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["img-1", "img-2"]);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toContain("_mget");
    expect(init?.method).toBe("POST");
  });

  it("omits missing IDs (found: false) from the result", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(
        esMgetResponse([
          { id: "img-1", found: true },
          { id: "img-99", found: false },
          { id: "img-2", found: true },
        ]),
      ),
    );

    const result = await ds.getByIds(["img-1", "img-99", "img-2"]);
    expect(result.map((r) => r.id)).toEqual(["img-1", "img-2"]);
  });

  it("batches into parallel chunks of 1000", async () => {
    // 1001 IDs → 2 batches. Return the same minimal response for each.
    const ids1000 = Array.from({ length: 1000 }, (_, i) => `img-${i}`);
    const ids1 = ["img-1000"];

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(okResponse(esMgetResponse(ids1000.map((id) => ({ id })))))
      .mockResolvedValueOnce(okResponse(esMgetResponse(ids1.map((id) => ({ id })))));

    const result = await ds.getByIds([...ids1000, ...ids1]);
    expect(result).toHaveLength(1001);
    // Both fetch calls should have happened (in parallel — we can't control
    // order, but both must have been called)
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
  });

  it("returns empty array on abort", async () => {
    const ac = new AbortController();
    ac.abort();
    // Signal already aborted — getByIds returns early before calling fetch
    const result = await ds.getByIds(["img-1"], ac.signal);
    expect(result).toEqual([]);
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it("throws on ES errors (non-abort)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      errorResponse(500, "internal error"),
    );
    await expect(ds.getByIds(["img-1"])).rejects.toThrow("500");
  });
});

// ---------------------------------------------------------------------------
// getIdRange — ES adapter
// ---------------------------------------------------------------------------

describe("ElasticsearchDataSource.getIdRange", () => {
  it("returns empty result when first page is empty", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(esSearchAfterIdsOnly([])),
    );

    const result = await ds.getIdRange(
      { orderBy: "-uploadTime" },
      [2000, "img-0"],
      [1000, "img-10"],
    );

    expect(result.ids).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.walked).toBe(0);
  });

  it("collects all IDs up to toCursor inclusive", async () => {
    // Desc sort: img-0 (ts=3000) → img-1 (ts=2000) → img-2 (ts=1000)
    // fromCursor = [3000, "img-0"], toCursor = [1000, "img-2"]
    // The walk starts after fromCursor, so img-1 and img-2 are in range.
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(
        esSearchAfterIdsOnly([
          { id: "img-1", sortValues: [2000, "img-1"] },
          { id: "img-2", sortValues: [1000, "img-2"] },
        ]),
      ),
    ).mockResolvedValueOnce(
      okResponse(esSearchAfterIdsOnly([])), // empty next page → done
    );

    const result = await ds.getIdRange(
      { orderBy: "-uploadTime" },
      [3000, "img-0"],
      [1000, "img-2"],
    );

    expect(result.ids).toEqual(["img-1", "img-2"]);
    expect(result.truncated).toBe(false);
    expect(result.walked).toBe(2);
  });

  it("stops when a hit sorts past toCursor", async () => {
    // Desc sort: fromCursor=[3000,"img-0"], toCursor=[2000,"img-1"]
    // img-2 has ts=1500 which is AFTER (less than) toCursor ts=2000 → stop
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(
        esSearchAfterIdsOnly([
          { id: "img-1", sortValues: [2000, "img-1"] }, // in range
          { id: "img-2", sortValues: [1500, "img-2"] }, // past toCursor → stop
        ]),
      ),
    );

    const result = await ds.getIdRange(
      { orderBy: "-uploadTime" },
      [3000, "img-0"],
      [2000, "img-1"],
    );

    expect(result.ids).toEqual(["img-1"]);
    expect(result.truncated).toBe(false);
    expect(result.walked).toBe(2); // walked 2 docs before stopping
  });

  it("returns truncated=false when fewer hits than chunk size", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(
        esSearchAfterIdsOnly(
          Array.from({ length: 5 }, (_, i) => ({
            id: `img-${i}`,
            sortValues: [1000 - i * 10, `img-${i}`],
          })),
        ),
      ),
    ).mockResolvedValueOnce(okResponse(esSearchAfterIdsOnly([]))); // empty = done

    const result = await ds.getIdRange(
      { orderBy: "-uploadTime" },
      [2000, "img-start"],
      [900, "img-end"],
    );

    expect(result.truncated).toBe(false);
    expect(result.ids).toHaveLength(5);
  });

  it("returns truncated=true when RANGE_HARD_CAP+1 IDs collected", async () => {
    // Override RANGE_HARD_CAP via env (set to 5 for this test)
    vi.stubEnv("VITE_RANGE_HARD_CAP", "5");

    // Serve 6 in-range hits in one page (cap=5 → truncated)
    const inRangeHits = Array.from({ length: 6 }, (_, i) => ({
      id: `img-${i}`,
      sortValues: [1000 - i * 10, `img-${i}`],
    }));

    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse(esSearchAfterIdsOnly(inRangeHits)),
    );

    // RANGE_HARD_CAP is read dynamically inside getIdRange — vi.stubEnv works
    const result = await ds.getIdRange(
      { orderBy: "-uploadTime" },
      [2000, "start"],
      [900, "end"],
    );

    expect(result.truncated).toBe(true);
    expect(result.ids).toHaveLength(5);

    vi.unstubAllEnvs();
  });

  it("returns empty on abort", async () => {
    const ac = new AbortController();
    ac.abort();

    const result = await ds.getIdRange(
      { orderBy: "-uploadTime" },
      [2000, "a"],
      [1000, "b"],
      ac.signal,
    );

    expect(result.ids).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.walked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getByIds — MockDataSource
// ---------------------------------------------------------------------------

describe("MockDataSource.getByIds", () => {
  const mock = new MockDataSource(100);

  it("returns images for known IDs", async () => {
    const result = await mock.getByIds(["img-0", "img-5", "img-99"]);
    expect(result.map((r) => r.id).sort()).toEqual(["img-0", "img-5", "img-99"]);
  });

  it("omits unknown IDs silently", async () => {
    const result = await mock.getByIds(["img-0", "nonexistent-id"]);
    expect(result.map((r) => r.id)).toEqual(["img-0"]);
  });

  it("returns empty array for empty input", async () => {
    const result = await mock.getByIds([]);
    expect(result).toEqual([]);
  });

  it("returns empty array on abort", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await mock.getByIds(["img-0"], ac.signal);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getIdRange — MockDataSource
// ---------------------------------------------------------------------------

describe("MockDataSource.getIdRange", () => {
  // Default sort: uploadTime desc → img-0 is newest, img-N is oldest.
  // img index corresponds directly to sort position (0 = first in desc order).

  it("returns IDs in range (img-2 to img-4 from dataset of 10)", async () => {
    const mock = new MockDataSource(10);
    // Sorted desc: img-0, img-1, img-2, img-3, img-4, img-5, img-6, img-7, img-8, img-9
    const img1 = await mock.getById("img-1");
    const img4 = await mock.getById("img-4");
    const img5 = await mock.getById("img-5");
    expect(img1).toBeDefined();
    expect(img4).toBeDefined();
    expect(img5).toBeDefined();

    // fromCursor = sort values of img-1 (exclusive), toCursor = img-4 (inclusive)
    // Expected: img-2, img-3, img-4
    const fromSv = [new Date(img1!.uploadTime).getTime(), img1!.id];
    const toSv = [new Date(img4!.uploadTime).getTime(), img4!.id];

    const result = await mock.getIdRange({}, fromSv, toSv);
    expect(result.ids).toEqual(["img-2", "img-3", "img-4"]);
    expect(result.truncated).toBe(false);
    expect(result.walked).toBe(3);
  });

  it("returns empty when toCursor is before fromCursor", async () => {
    const mock = new MockDataSource(10);
    const img5 = await mock.getById("img-5");
    const img2 = await mock.getById("img-2");
    // img-5 sorts later (smaller index in desc sort → actually img-5 has
    // lower uploadTime → sorts further in desc order). fromCursor=img-5,
    // toCursor=img-2: in desc order img-2 comes BEFORE img-5, so range is empty.
    const fromSv = [new Date(img5!.uploadTime).getTime(), img5!.id];
    const toSv = [new Date(img2!.uploadTime).getTime(), img2!.id];

    const result = await mock.getIdRange({}, fromSv, toSv);
    expect(result.ids).toEqual([]);
    expect(result.walked).toBe(0);
  });

  it("respects RANGE_HARD_CAP and sets truncated=true", async () => {
    vi.stubEnv("VITE_RANGE_HARD_CAP", "3");
    const mock = new MockDataSource(20);
    const img0 = await mock.getById("img-0");
    const img9 = await mock.getById("img-9");
    // Range img-1..img-9 (8 items), cap=3 → truncated
    const fromSv = [new Date(img0!.uploadTime).getTime(), img0!.id];
    const toSv = [new Date(img9!.uploadTime).getTime(), img9!.id];

    const result = await mock.getIdRange({}, fromSv, toSv);
    expect(result.ids).toHaveLength(3);
    expect(result.truncated).toBe(true);
    vi.unstubAllEnvs();
  });

  it("does not set truncated when range equals cap exactly", async () => {
    vi.stubEnv("VITE_RANGE_HARD_CAP", "3");
    const mock = new MockDataSource(20);
    const img0 = await mock.getById("img-0");
    const img3 = await mock.getById("img-3");
    // Range img-1..img-3 (3 items) — exactly at cap → truncated=false
    const fromSv = [new Date(img0!.uploadTime).getTime(), img0!.id];
    const toSv = [new Date(img3!.uploadTime).getTime(), img3!.id];

    const result = await mock.getIdRange({}, fromSv, toSv);
    expect(result.ids).toHaveLength(3);
    expect(result.truncated).toBe(false);
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// getIdRange — null-zone correctness (ES adapter, fetch-mocked)
// ---------------------------------------------------------------------------

describe("ElasticsearchDataSource.getIdRange — null-zone", () => {
  // Sort: -lastModified → [{lastModified: "desc"}, {uploadTime: "desc"}, {id: "asc"}]
  // Sentinel: 9223372036854776000 (Long.MAX_VALUE as JS float64)
  const SENTINEL = 9223372036854776000;

  it("sanitises cursor pass-back — sentinels in sort values don't break next page", async () => {
    // Page 1: returns 2 hits — second hit has sentinel (boundary doc).
    // Page 2: should receive a null-zone query (detectNullZoneCursor fires)
    //         and return one more doc.
    // Page 3: empty → done.
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        okResponse({
          took: 1,
          hits: {
            total: { value: 3 },
            hits: [
              { _id: "img-1", sort: [1700000000000, 1700000000000, "img-1"] },
              { _id: "img-2", sort: [SENTINEL, 1690000000000, "img-2"] },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        // Phase 2: null-zone query has 2-field sort [uploadTime, id]
        okResponse({
          took: 1,
          hits: {
            total: { value: 1 },
            hits: [
              { _id: "img-3", sort: [1685000000000, "img-3"] },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(okResponse({ took: 1, hits: { total: { value: 0 }, hits: [] } }));

    const result = await ds.getIdRange(
      { orderBy: "-lastModified" },
      [1705000000000, 1705000000000, "img-0"], // fromCursor: populated zone
      [null, 1680000000000, "img-end"],         // toCursor: null zone
    );

    expect(result.ids).toEqual(["img-1", "img-2", "img-3"]);
    expect(result.truncated).toBe(false);
  });

  it("handles fromCursor already in null zone", async () => {
    // fromCursor is [null, ...] → detectNullZoneCursor fires on first iteration.
    // Phase-2 query issued immediately.
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        okResponse({
          took: 1,
          hits: {
            total: { value: 2 },
            hits: [
              { _id: "img-5", sort: [1690000000000, "img-5"] },
              { _id: "img-6", sort: [1685000000000, "img-6"] },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(okResponse({ took: 1, hits: { total: { value: 0 }, hits: [] } }));

    const result = await ds.getIdRange(
      { orderBy: "-lastModified" },
      [null, 1695000000000, "img-start"], // null-zone fromCursor
      [null, 1680000000000, "img-end"],   // null-zone toCursor
    );

    expect(result.ids).toEqual(["img-5", "img-6"]);
    expect(result.truncated).toBe(false);
  });

  it("does not stop at boundary when toCursor is in null zone", async () => {
    // Walk starts in populated zone, crosses boundary, must continue into null zone.
    // toCursor is a null-zone cursor — walk must NOT stop at the boundary.
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        okResponse({
          took: 1,
          hits: {
            total: { value: 2 },
            hits: [
              { _id: "img-A", sort: [1700000000000, 1700000000000, "img-A"] },
              // Boundary doc: sentinel sort value
              { _id: "img-B", sort: [SENTINEL, 1695000000000, "img-B"] },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        // Phase 2 null-zone response (2-field sort)
        okResponse({
          took: 1,
          hits: {
            total: { value: 1 },
            hits: [
              { _id: "img-C", sort: [1693000000000, "img-C"] },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(okResponse({ took: 1, hits: { total: { value: 0 }, hits: [] } }));

    const result = await ds.getIdRange(
      { orderBy: "-lastModified" },
      [1710000000000, 1710000000000, "img-start"],
      [null, 1690000000000, "img-end"], // toCursor in null zone
    );

    // Must include both populated-zone and null-zone docs
    expect(result.ids).toEqual(["img-A", "img-B", "img-C"]);
    expect(result.truncated).toBe(false);
  });

  it("stops correctly when toCursor is in populated zone", async () => {
    // Walk entirely in populated zone — a hit past toCursor triggers stop.
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse({
        took: 1,
        hits: {
          total: { value: 3 },
          hits: [
            { _id: "img-1", sort: [1700000000000, 1700000000000, "img-1"] },
            { _id: "img-2", sort: [1695000000000, 1695000000000, "img-2"] },
            { _id: "img-3", sort: [1690000000000, 1690000000000, "img-3"] }, // past toCursor
          ],
        },
      }),
    );

    const result = await ds.getIdRange(
      { orderBy: "-lastModified" },
      [1705000000000, 1705000000000, "img-0"],
      [1695000000000, 1695000000000, "img-2"], // toCursor = img-2
    );

    expect(result.ids).toEqual(["img-1", "img-2"]);
    expect(result.walked).toBe(3); // walked 3 (2 in-range + 1 past)
  });

  it("verifies phase-2 search uses extraFilter and sortOverride", async () => {
    // Start in null zone → first fetch should have must_not exists filter
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        okResponse({
          took: 1,
          hits: { total: { value: 1 }, hits: [{ _id: "img-1", sort: [1690000000000, "img-1"] }] },
        }),
      )
      .mockResolvedValueOnce(okResponse({ took: 1, hits: { total: { value: 0 }, hits: [] } }));

    await ds.getIdRange(
      { orderBy: "-lastModified" },
      [null, 1695000000000, "img-start"],
      [null, 1680000000000, "img-end"],
    );

    // Inspect what was sent in the first fetch call
    const calls = vi.mocked(global.fetch).mock.calls;
    const firstBody = JSON.parse(calls[0][1]?.body as string);

    // extraFilter: must_not exists lastModified
    expect(firstBody.query.bool.filter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bool: { must_not: { exists: { field: "lastModified" } } },
        }),
      ]),
    );

    // sortOverride: [uploadTime desc, id asc] (not the full 3-field sort)
    expect(firstBody.sort).toEqual([{ uploadTime: "desc" }, { id: "asc" }]);

    // search_after: stripped cursor [uploadTime, id] (no null primary)
    expect(firstBody.search_after).toEqual([1695000000000, "img-start"]);
  });
});

// ---------------------------------------------------------------------------
// getIdRange — null-zone correctness (MockDataSource with sparse fields)
// ---------------------------------------------------------------------------

describe("MockDataSource.getIdRange — sparse fields", () => {
  // 20 images, 20% have lastModified (img-0, img-5, img-10, img-15).
  // Sort: -lastModified → populated first (desc), then null zone (uploadTime desc).
  const makeSparse = () => new MockDataSource(20, [{ field: "lastModified", ratio: 0.2 }]);

  it("range entirely in populated zone", async () => {
    const mock = makeSparse();
    // Populated sorted: img-15, img-10, img-5, img-0 (desc lastModified)
    const img15 = await mock.getById("img-15");
    const img5 = await mock.getById("img-5");
    // Range from img-15 to img-5 (exclusive start, inclusive end): img-10, img-5
    const fromSv = [new Date(img15!.uploadTime).getTime(), new Date(img15!.uploadTime).getTime(), img15!.id];
    const toSv = [new Date(img5!.uploadTime).getTime(), new Date(img5!.uploadTime).getTime(), img5!.id];

    const result = await mock.getIdRange({ orderBy: "-lastModified" }, fromSv, toSv);
    expect(result.ids).toContain("img-10");
    expect(result.ids).toContain("img-5");
    expect(result.ids).not.toContain("img-15"); // exclusive start
    expect(result.truncated).toBe(false);
  });

  it("range entirely in null zone", async () => {
    const mock = makeSparse();
    // Null-zone docs sorted by uploadTime desc: img-19, img-18, ..., img-1 (skipping 15,10,5,0)
    // Get sort values for null-zone docs via the mock
    const img19 = await mock.getById("img-19");
    const img16 = await mock.getById("img-16");
    // fromCursor = img-19 (null zone), toCursor = img-16 (null zone)
    // Expected: img-18, img-17, img-16
    const fromSv = [null, new Date(img19!.uploadTime).getTime(), img19!.id];
    const toSv = [null, new Date(img16!.uploadTime).getTime(), img16!.id];

    const result = await mock.getIdRange({ orderBy: "-lastModified" }, fromSv, toSv);
    expect(result.ids).toEqual(["img-18", "img-17", "img-16"]);
    expect(result.truncated).toBe(false);
  });

  it("range crossing boundary — populated tail into null zone", async () => {
    const mock = makeSparse();
    // img-0 is last populated doc. Null zone starts after it.
    // fromCursor = img-5 (populated), toCursor = img-19 (first null-zone doc, uploadTime desc)
    const img5 = await mock.getById("img-5");
    const img19 = await mock.getById("img-19");
    // Range from img-5 (excl) → img-19 (incl): img-0 (last populated) + all null-zone down to img-19
    const fromSv = [new Date(img5!.uploadTime).getTime(), new Date(img5!.uploadTime).getTime(), img5!.id];
    const toSv = [null, new Date(img19!.uploadTime).getTime(), img19!.id];

    const result = await mock.getIdRange({ orderBy: "-lastModified" }, fromSv, toSv);
    expect(result.ids).toContain("img-0"); // last populated doc
    expect(result.ids).toContain("img-19"); // toCursor inclusive
    expect(result.ids.length).toBeGreaterThan(1);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract test — both implementations satisfy the interface shape
// ---------------------------------------------------------------------------

describe("getByIds and getIdRange interface contract", () => {
  it("MockDataSource.getByIds returns Image[]", async () => {
    const mock = new MockDataSource(10);
    const result = await mock.getByIds(["img-0"]);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("id", "img-0");
  });

  it("MockDataSource.getIdRange returns IdRangeResult shape", async () => {
    const mock = new MockDataSource(10);
    const result = await mock.getIdRange({}, [99999, ""], [0, ""]);
    expect(result).toHaveProperty("ids");
    expect(result).toHaveProperty("truncated");
    expect(result).toHaveProperty("walked");
    expect(Array.isArray(result.ids)).toBe(true);
    expect(typeof result.truncated).toBe("boolean");
    expect(typeof result.walked).toBe("number");
  });
});
