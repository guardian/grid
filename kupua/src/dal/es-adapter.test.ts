/**
 * Unit tests for ElasticsearchDataSource — adapter-layer behaviour.
 *
 * Uses vi.spyOn(global, "fetch") to simulate ES responses without a real
 * server. Tests cover error-handling paths that cannot be exercised through
 * the MockDataSource.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ElasticsearchDataSource } from "./es-adapter";
import { buildSortClause } from "./adapters/elasticsearch/sort-builders";

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
// Option 2 — exact special-date coverage, approximate bucket evidence
// ---------------------------------------------------------------------------

describe("getDateDistribution special-date provenance", () => {
  it("separates exact usage-parent coverage from repeated histogram evidence", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(okResponse({
        aggregations: {
          covered_parents: { doc_count: 3 },
          nested_agg: { range: { min: 1, max: 3, count: 5 } },
        },
      }))
      .mockResolvedValueOnce(okResponse({
        aggregations: {
          nested_agg: {
            timeline: {
              buckets: [
                { key_as_string: "2024-01-01T00:00:00.000Z", doc_count: 2, image_count: { doc_count: 2 } },
                { key_as_string: "2024-02-01T00:00:00.000Z", doc_count: 2, image_count: { doc_count: 2 } },
                { key_as_string: "2024-03-01T00:00:00.000Z", doc_count: 1, image_count: { doc_count: 1 } },
              ],
            },
          },
        },
      }));

    const result = await ds.getDateDistribution(
      {},
      "usages.dateAdded",
      "asc",
    );

    expect(result).toMatchObject({
      coveredCount: 3,
      evidenceCount: 5,
      bucketPositionKind: "approximate-evidence",
      buckets: [
        { startPosition: 0 },
        { startPosition: 2 },
        { startPosition: 4 },
      ],
    });

    const statsBody = JSON.parse(
      vi.mocked(global.fetch).mock.calls[0][1]?.body as string,
    );
    expect(statsBody.aggs.covered_parents).toEqual({
      filter: {
        nested: {
          path: "usages",
          query: { exists: { field: "usages.dateAdded" } },
        },
      },
    });
    const histogramBody = JSON.parse(
      vi.mocked(global.fetch).mock.calls[1][1]?.body as string,
    );
    expect(histogramBody.aggs.nested_agg).toMatchObject({
      nested: { path: "usages" },
      aggs: {
        timeline: {
          date_histogram: { field: "usages.dateAdded", order: { _key: "asc" } },
          aggs: { image_count: { reverse_nested: {} } },
        },
      },
    });
  });

  it("counts collection parents exactly at root scope", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(okResponse({
        aggregations: {
          covered_parents: { doc_count: 3 },
          range: { min: 1, max: 3, count: 5 },
        },
      }))
      .mockResolvedValueOnce(okResponse({
        aggregations: {
          timeline: {
            buckets: [
              { key_as_string: "2024-01-01T00:00:00.000Z", doc_count: 2 },
              { key_as_string: "2024-02-01T00:00:00.000Z", doc_count: 2 },
              { key_as_string: "2024-03-01T00:00:00.000Z", doc_count: 1 },
            ],
          },
        },
      }));

    const result = await ds.getDateDistribution(
      {},
      "collections.actionData.date",
      "desc",
    );

    expect(result).toMatchObject({
      coveredCount: 3,
      evidenceCount: 5,
      bucketPositionKind: "approximate-evidence",
    });
    const statsBody = JSON.parse(
      vi.mocked(global.fetch).mock.calls[0][1]?.body as string,
    );
    expect(statsBody.aggs.covered_parents).toEqual({
      filter: { exists: { field: "collections.actionData.date" } },
    });
  });
});

// ---------------------------------------------------------------------------
// Slice H — special-date position maps remain exact
// ---------------------------------------------------------------------------

describe("fetchPositionIndex special-date request shape", () => {
  it.each([
    {
      orderBy: "-usagesDateAdded",
      field: "usages.dateAdded",
      direction: "desc",
      existsFilter: {
        nested: {
          path: "usages",
          query: { exists: { field: "usages.dateAdded" } },
        },
      },
    },
    {
      orderBy: "usagesDateAdded",
      field: "usages.dateAdded",
      direction: "asc",
      existsFilter: {
        nested: {
          path: "usages",
          query: { exists: { field: "usages.dateAdded" } },
        },
      },
    },
    {
      orderBy: "-dateAddedToCollection",
      field: "collections.actionData.date",
      direction: "desc",
      existsFilter: { exists: { field: "collections.actionData.date" } },
    },
    {
      orderBy: "dateAddedToCollection",
      field: "collections.actionData.date",
      direction: "asc",
      existsFilter: { exists: { field: "collections.actionData.date" } },
    },
  ])(
    "$orderBy preserves exact max-date ordering across both phases",
    async ({ orderBy, field, direction, existsFilter }) => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(okResponse({ id: "position-map-pit" }))
        .mockResolvedValueOnce(okResponse({
          hits: {
            total: { value: 2 },
            hits: [{
              _id: "populated",
              sort: [1_700_000_000_000, 1_600_000_000_000, "populated", 1],
            }],
          },
        }))
        .mockResolvedValueOnce(okResponse({
          hits: {
            total: { value: 2 },
            hits: [{
              _id: "missing",
              sort: [1_500_000_000_000, "missing", 2],
            }],
          },
        }))
        .mockResolvedValueOnce(okResponse({ succeeded: true }));

      const result = await ds.fetchPositionIndex(
        { orderBy, nonFree: "true" },
        new AbortController().signal,
      );

      const searchBodies = vi.mocked(global.fetch).mock.calls
        .map(([, init]) => init?.body)
        .filter((body): body is string => typeof body === "string")
        .map((body) => JSON.parse(body))
        .filter((body) => Array.isArray(body.sort));
      expect(searchBodies).toHaveLength(2);

      const [phaseOne, phaseTwo] = searchBodies;
      expect(phaseOne.sort).toEqual(buildSortClause(orderBy));
      expect(phaseOne.query.bool.filter).toEqual([existsFilter]);
      expect(phaseOne.sort[0][field]).toMatchObject({
        order: direction,
        mode: "max",
        missing: "_last",
      });

      expect(phaseTwo.sort).toEqual([
        { uploadTime: direction },
        { id: "asc" },
      ]);
      expect(phaseTwo.query.bool.filter).toEqual([
        { bool: { must_not: [existsFilter] } },
      ]);
      expect(result).toEqual({
        length: 2,
        ids: ["populated", "missing"],
        sortValues: [
          [1_700_000_000_000, 1_600_000_000_000, "populated"],
          [null, 1_500_000_000_000, "missing"],
        ],
      });
    },
  );

  it("paginates both phases with refreshed PIT ids and complete PIT cursors", async () => {
    const populatedHits = Array.from({ length: 10_000 }, (_, index) => ({
      _id: `populated-${index}`,
      sort: [
        1_700_000_000_000 - index,
        1_600_000_000_000 - index,
        `populated-${index}`,
        index,
      ],
    }));
    const missingHits = Array.from({ length: 10_000 }, (_, index) => ({
      _id: `missing-${index}`,
      sort: [
        1_500_000_000_000 - index,
        `missing-${index}`,
        10_000 + index,
      ],
    }));

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(okResponse({ id: "pit-initial" }))
      .mockResolvedValueOnce(okResponse({
        pit_id: "pit-populated",
        hits: { total: { value: 20_000 }, hits: populatedHits },
      }))
      .mockResolvedValueOnce(okResponse({
        pit_id: "pit-before-missing",
        hits: { total: { value: 20_000 }, hits: [] },
      }))
      .mockResolvedValueOnce(okResponse({
        pit_id: "pit-missing",
        hits: { total: { value: 20_000 }, hits: missingHits },
      }))
      .mockResolvedValueOnce(okResponse({
        pit_id: "pit-final",
        hits: { total: { value: 20_000 }, hits: [] },
      }))
      .mockResolvedValueOnce(okResponse({ succeeded: true }));

    const result = await ds.fetchPositionIndex(
      { orderBy: "-usagesDateAdded", nonFree: "true" },
      new AbortController().signal,
    );

    const searchBodies = vi.mocked(global.fetch).mock.calls
      .map(([, init]) => init?.body)
      .filter((body): body is string => typeof body === "string")
      .map((body) => JSON.parse(body))
      .filter((body) => Array.isArray(body.sort));
    expect(searchBodies).toHaveLength(4);
    expect(searchBodies[1]).toMatchObject({
      pit: { id: "pit-populated", keep_alive: "1m" },
      search_after: populatedHits.at(-1)?.sort,
    });
    expect(searchBodies[2].pit).toEqual({
      id: "pit-before-missing",
      keep_alive: "1m",
    });
    expect(searchBodies[2].search_after).toBeUndefined();
    expect(searchBodies[3]).toMatchObject({
      pit: { id: "pit-missing", keep_alive: "1m" },
      search_after: missingHits.at(-1)?.sort,
    });
    expect(result?.length).toBe(20_000);
    expect(result?.sortValues[9_999]).toEqual(
      populatedHits[9_999].sort.slice(0, 3),
    );
    expect(result?.sortValues[10_000]).toEqual([
      null,
      ...missingHits[0].sort.slice(0, 2),
    ]);
  });
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
// Keyword-sorted seek fix — countBefore sentinel query shape (T4) and
// estimateSortValue scope → term filter (T6).
//
// See exploration/docs/scroll-and-position-preservation-testing-4.1-
// keyword-sorts-workplan.md §2, §5, §9. The regression (commit 61b042101)
// anchored the uploadTime secondary sort field at Number.MAX_SAFE_INTEGER,
// which countBefore turns into an equality range no real document can ever
// satisfy — collapsing the id-probe bisection this fix deletes into a
// no-op. T4 pins that query shape directly so the mechanism can't silently
// regress; a stronger, real-data proof (constant count across id probes)
// lives in mock-data-source.test.ts.
// ---------------------------------------------------------------------------

/** Recursively find the first `range: { [field]: {...} }` clause in a query body. */
function findRangeEquality(
  obj: unknown,
  field: string,
): { gte: unknown; lte: unknown } | null {
  if (obj == null || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  if (rec.range && typeof rec.range === "object") {
    const range = (rec.range as Record<string, unknown>)[field];
    if (range && typeof range === "object") {
      const r = range as Record<string, unknown>;
      if ("gte" in r && "lte" in r) return { gte: r.gte, lte: r.lte };
    }
  }
  for (const key of Object.keys(rec)) {
    const found = findRangeEquality(rec[key], field);
    if (found) return found;
  }
  return null;
}

/** Recursively find the first `term: { [field]: value }` clause in a query body. */
function findTermFilter(obj: unknown, field: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  if (rec.term && typeof rec.term === "object" && field in (rec.term as Record<string, unknown>)) {
    return (rec.term as Record<string, unknown>)[field];
  }
  for (const key of Object.keys(rec)) {
    const found = findTermFilter(rec[key], field);
    if (found !== undefined) return found;
  }
  return undefined;
}

function requestBody(callIndex = 0): Record<string, unknown> {
  const call = vi.mocked(global.fetch).mock.calls[callIndex];
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("countBefore sentinel query shape (keyword-sorts workplan T4)", () => {
  it("emits an unsatisfiable equality range for a sentinel-anchored secondary field", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(okResponse({ count: 5 }));

    await ds.countBefore(
      { orderBy: "-credit" },
      ["AAP", Number.MAX_SAFE_INTEGER, "000000000000"],
    );

    const equality = findRangeEquality(requestBody(), "uploadTime");
    expect(equality).not.toBeNull();
    // gte === lte === MAX_SAFE_INTEGER — no real document can ever match
    // this, which is why the deleted id-bisection was a no-op.
    expect(equality!.gte).toBe(Number.MAX_SAFE_INTEGER);
    expect(equality!.lte).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("emits a satisfiable equality range for a real secondary value", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(okResponse({ count: 5 }));

    const realUploadTime = 1_700_000_000_000;
    await ds.countBefore(
      { orderBy: "-credit" },
      ["AAP", realUploadTime, "000000000000"],
    );

    const equality = findRangeEquality(requestBody(), "uploadTime");
    expect(equality).not.toBeNull();
    expect(equality!.gte).toBe(realUploadTime);
    expect(equality!.lte).toBe(realUploadTime);
  });
});

describe("countBefore selected-maximum query shape (Slice I)", () => {
  it.each([
    {
      orderBy: "usagesDateAdded",
      field: "usages.dateAdded",
      wrap: (query: Record<string, unknown>) => ({
        nested: { path: "usages", query },
      }),
    },
    {
      orderBy: "dateAddedToCollection",
      field: "collections.actionData.date",
      wrap: (query: Record<string, unknown>) => query,
    },
  ])(
    "$orderBy excludes parents whose selected maximum reaches or crosses the cursor",
    async ({ orderBy, field, wrap }) => {
      vi.mocked(global.fetch).mockResolvedValueOnce(okResponse({ count: 2 }));
      const primaryValue = 1_700_000_000_000;

      await ds.countBefore(
        { orderBy, nonFree: "true" },
        [primaryValue, 1_600_000_000_000, "cursor"],
      );

      const should = (((requestBody().query as Record<string, unknown>).bool as {
        filter: Array<{ bool: { should: Record<string, unknown>[] } }>;
      }).filter[0].bool.should);
      expect(should[0]).toEqual({
        bool: {
          must: [wrap({ exists: { field } })],
          must_not: [wrap({ range: { [field]: { gte: primaryValue } } })],
        },
      });
      const equalityCondition = ((should[1].bool as {
        must: Record<string, unknown>[];
      }).must[0]);
      expect(equalityCondition).toEqual({
        bool: {
          must: [wrap({
            range: { [field]: { gte: primaryValue, lte: primaryValue } },
          })],
          must_not: [wrap({ range: { [field]: { gt: primaryValue } } })],
        },
      });
    },
  );

  it.each([
    ["-usagesDateAdded", "usages.dateAdded", "usages"],
    ["-dateAddedToCollection", "collections.actionData.date", null],
  ])(
    "%s counts selected maxima greater than the cursor in descending order",
    async (orderBy, field, nestedPath) => {
      vi.mocked(global.fetch).mockResolvedValueOnce(okResponse({ count: 2 }));
      const primaryValue = 1_700_000_000_000;

      await ds.countBefore(
        { orderBy, nonFree: "true" },
        [primaryValue, 1_600_000_000_000, "cursor"],
      );

      const should = (((requestBody().query as Record<string, unknown>).bool as {
        filter: Array<{ bool: { should: Record<string, unknown>[] } }>;
      }).filter[0].bool.should);
      const expectedRange = { range: { [field]: { gt: primaryValue } } };
      expect(should[0]).toEqual(
        nestedPath
          ? { nested: { path: nestedPath, query: expectedRange } }
          : expectedRange,
      );
    },
  );
});

describe("estimateSortValue scope → term filter (keyword-sorts workplan T6)", () => {
  it("compiles scope to an exact term filter", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse({ aggregations: { pct: { values: { "50.0": 123 } } } }),
    );

    await ds.estimateSortValue({}, "uploadTime", 50, undefined, [
      { field: "metadata.credit", value: "AAP" },
    ]);

    expect(findTermFilter(requestBody(), "metadata.credit")).toBe("AAP");
  });

  it("passes a value containing a double quote through unaffected (workplan §5 — CQL text-splicing silently drops these)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse({ aggregations: { pct: { values: { "50.0": 123 } } } }),
    );

    const trickyValue = 'Getty Images for Sean "Diddy" Combs';
    await ds.estimateSortValue({}, "uploadTime", 50, undefined, [
      { field: "metadata.credit", value: trickyValue },
    ]);

    expect(findTermFilter(requestBody(), "metadata.credit")).toBe(trickyValue);
  });

  it("passes a value containing a backslash through unaffected", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      okResponse({ aggregations: { pct: { values: { "50.0": 123 } } } }),
    );

    const trickyValue = "UNRWA \\ apaimages/Avalon";
    await ds.estimateSortValue({}, "uploadTime", 50, undefined, [
      { field: "metadata.credit", value: trickyValue },
    ]);

    expect(findTermFilter(requestBody(), "metadata.credit")).toBe(trickyValue);
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
