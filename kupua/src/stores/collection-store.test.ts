import { afterEach, describe, it, expect, vi } from "vitest";
import { buildSubtreeCounts, useCollectionStore } from "./collection-store";
import type { ImageDataSource } from "@/dal";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadCollections", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useCollectionStore.setState({ tree: null, countsByScope: {}, status: "idle" });
  });

  it("loads only the tree; counts wait until the Collections section needs them", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { basename: "root", children: [] } })));
    vi.stubGlobal("fetch", fetchMock);

    await useCollectionStore.getState().loadCollections();

    expect(useCollectionStore.getState().status).toBe("ready");
    expect(useCollectionStore.getState().countsByScope).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hosted builds fetch collections only from Kahuna's injected address, never a laptop default", async () => {
    vi.stubEnv("VITE_HOSTED", "true");
    vi.stubGlobal("window", { __KUPUA_CONFIG__: undefined } as unknown as Window);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { basename: "root", children: [] } })));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await useCollectionStore.getState().loadCollections();
      expect(fetchMock).not.toHaveBeenCalled();

      globalThis.window.__KUPUA_CONFIG__ = { collectionsUri: "https://media-collections.example.test/" };
      await useCollectionStore.getState().loadCollections();
      expect(fetchMock).toHaveBeenCalledWith("https://media-collections.example.test/collections", { credentials: "include" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("loadCounts", () => {
  const buckets = (count: number) => ({
    fields: { "collections.pathId": { buckets: [{ key: "sport", count }, { key: "sport/football", count: 3 }] } },
  });
  const source = (getAggregations: ReturnType<typeof vi.fn>) =>
    ({ getAggregations } as unknown as Pick<ImageDataSource, "getAggregations">);

  afterEach(() => { useCollectionStore.setState({ countsByScope: {} }); });

  it("counts in the checkbox's scope: all-rights includes paid images, free-only uses the default filter", async () => {
    const getAggregations = vi.fn(async (params: { nonFree?: string }, _fields: unknown) => buckets(params.nonFree === "true" ? 4 : 2));

    await useCollectionStore.getState().loadCounts(source(getAggregations), "all");
    await useCollectionStore.getState().loadCounts(source(getAggregations), "free");

    expect(getAggregations.mock.calls.map(([params, fields]) => [params, fields])).toEqual([
      [{ nonFree: "true" }, [{ field: "collections.pathId", size: 6000 }]],
      [{}, [{ field: "collections.pathId", size: 6000 }]],
    ]);
    expect(useCollectionStore.getState().countsByScope).toEqual({
      all: { sport: 7, "sport/football": 3 },
      free: { sport: 5, "sport/football": 3 },
    });
  });

  it("fetches each scope once per session, including concurrent requests", async () => {
    const getAggregations = vi.fn(async () => buckets(1));

    await Promise.all([
      useCollectionStore.getState().loadCounts(source(getAggregations), "free"),
      useCollectionStore.getState().loadCounts(source(getAggregations), "free"),
    ]);
    await useCollectionStore.getState().loadCounts(source(getAggregations), "free");

    expect(getAggregations).toHaveBeenCalledOnce();
  });

  it("does not cache a failure, so the next need retries", async () => {
    const getAggregations = vi.fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(buckets(1));

    await useCollectionStore.getState().loadCounts(source(getAggregations), "all");
    expect(useCollectionStore.getState().countsByScope).toEqual({});

    await useCollectionStore.getState().loadCounts(source(getAggregations), "all");
    expect(useCollectionStore.getState().countsByScope.all).toEqual({ sport: 4, "sport/football": 3 });
  });
});

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
