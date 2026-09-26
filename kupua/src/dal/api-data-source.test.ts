import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiDataSource, DEVELOPMENT_FALLBACK_METHODS } from "./api-data-source";
import type { ImageDataSource, SortValues } from "./types";

type Body = Record<string, unknown>;
type Route = (body: Body) => unknown;

function stubMediaApi(routes: Record<string, Route>) {
  const calls: Array<{ path: string; body: Body }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    init.signal?.throwIfAborted();
    const path = url.replace(/^\/api/, "");
    const body = JSON.parse(init.body as string) as Body;
    calls.push({ path, body });
    const route = routes[path];
    if (!route) return new Response(JSON.stringify({ errorKey: "not-found" }), { status: 404 });
    const out = await route(body);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const everyMethod: Record<Exclude<keyof ImageDataSource, "offsetReadLimit">, true> = {
  searchRange: true, count: true, countWithTickers: true, getById: true,
  getAggregations: true, openPit: true, searchByAi: true, closePit: true, searchAfter: true,
  countBefore: true, estimateSortValue: true, findKeywordSortValue: true, getKeywordDistribution: true,
  getDateDistribution: true, fetchPositionIndex: true, getByIds: true, getIdRange: true,
};
const ALL_METHODS = Object.keys(everyMethod) as Array<keyof typeof everyMethod>;

function makeFallback() {
  return Object.fromEntries(ALL_METHODS.map((m) => [m, vi.fn(async () => `fallback:${m}`)])) as unknown as
    ImageDataSource & Record<keyof typeof everyMethod, Mock>;
}

const entity = (id: string) => ({ data: { id, uploadTime: "2026-01-01T00:00:00Z" } });
const failure = (status: number, errorKey = "fixture") => new Response(JSON.stringify({ errorKey }), { status });
const params = { orderBy: "-uploadTime", nonFree: "true", length: 200 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ApiDataSource development fallback", () => {
  it.each([
    { flag: "true", expected: "ApiDataSource" },
    { flag: "false", expected: "ElasticsearchDataSource" },
    { flag: undefined, expected: "ElasticsearchDataSource" },
  ])("is what the factory builds when VITE_USE_MEDIA_API=$flag", async ({ flag, expected }) => {
    if (flag !== undefined) vi.stubEnv("VITE_USE_MEDIA_API", flag);
    const { createDataSource } = await import("./index");
    expect(createDataSource().constructor.name).toBe(expected);
  });
  it("lists exactly the reads that still use the development fallback", () => {
    expect([...DEVELOPMENT_FALLBACK_METHODS].sort()).toEqual(
      ["searchByAi"],
    );
  });

  it("delegates each listed read to the fallback with its arguments", async () => {
    const fallback = makeFallback();
    const ds = new ApiDataSource(fallback) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    for (const method of DEVELOPMENT_FALLBACK_METHODS) {
      await expect(ds[method]("a", "b")).resolves.toBe(`fallback:${method}`);
      expect(fallback[method]).toHaveBeenCalledWith("a", "b");
    }
  });

  it("omits AI search when the fallback has none", () => {
    const { searchByAi: _ai, ...withoutAi } = makeFallback();
    expect(new ApiDataSource(withoutAi as ImageDataSource).searchByAi).toBeUndefined();
  });

  it.each(["unreachable", "refusing"] as const)("never rescues a migrated read through the fallback when media-api is %s", async (mode) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (mode === "unreachable") throw new TypeError("Failed to fetch");
      return failure(503);
    }));
    const fallback = makeFallback();
    const ds = new ApiDataSource(fallback);
    const cursor: SortValues = [1, "img-1"];
    const signal = new AbortController().signal;

    await Promise.allSettled([
      ds.searchAfter(params, null, null, signal),
      ds.searchAfter(params, cursor, null, signal, true),
      ds.searchAfter({ ...params, offset: 400 }, null, null, signal),
      ds.searchRange({ ...params, offset: 400 }, signal),
      ds.countBefore(params, cursor, signal),
      ds.estimateSortValue(params, "uploadTime", 50, signal),
      ds.findKeywordSortValue(params, "metadata.credit", 10, "asc", signal),
      ds.getKeywordDistribution(params, "metadata.credit", "asc", signal),
      ds.getDateDistribution(params, "uploadTime", "desc", signal),
      ds.fetchPositionIndex(params, signal),
      ds.getIdRange(params, cursor, cursor, signal),
      ds.getById("img-1", signal),
      ds.getByIds(["img-1", "img-2"], signal),
      ds.count(params),
      ds.countWithTickers(params),
      ds.getAggregations(params, [{ field: "metadata.credit" }], signal, [{ name: "deleted", isFilter: "deleted" }]),
      ds.openPit("1m"),
      ds.closePit("pit"),
    ]);

    const migrated = ALL_METHODS.filter((m) => !(DEVELOPMENT_FALLBACK_METHODS as readonly string[]).includes(m));
    expect(migrated).toHaveLength(16);
    for (const method of migrated) expect(fallback[method], method).not.toHaveBeenCalled();
  });
});

describe("ApiDataSource PIT", () => {
  it("opens no PIT and closes nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ds = new ApiDataSource(makeFallback());

    await expect(ds.openPit("1m")).resolves.toBeNull();
    await expect(ds.closePit("pit")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries an expired PIT once without it and reports the PIT cleared", async () => {
    const calls = stubMediaApi({
      "/images/search-after": (body) => body.pitId
        ? failure(410, "search-after-pit-expired")
        : { data: [entity("img-2")], total: 0, sortValues: [[2, "img-2"]] },
    });
    const result = await new ApiDataSource(makeFallback()).searchAfter(params, [1, "img-1"], "old-pit");

    expect(calls.map((c) => c.body.pitId)).toEqual(["old-pit", undefined]);
    expect(result.pitId).toBeNull();
    expect(result.hits.map((h) => h.id)).toEqual(["img-2"]);
  });
});

describe("ApiDataSource page routing", () => {
  const page = { data: [entity("img-400"), entity("img-401")], sortValues: [[400, "img-400"], [401, "img-401"]], rawHitCount: 2 };

  it("reads a cursor-less offset through the window, with the offset and without cursor fields", async () => {
    const calls = stubMediaApi({ "/images/window": () => ({ ...page, offset: 400 }) });
    const result = await new ApiDataSource(makeFallback()).searchAfter({ ...params, offset: 400 }, null, null);

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/images/window");
    expect(calls[0].body).toMatchObject({ offset: 400, length: 200, countAll: false });
    expect(calls[0].body).not.toHaveProperty("sortValues");
    expect(calls[0].body).not.toHaveProperty("reverse");
    expect(result.hits.map((h) => h.id)).toEqual(["img-400", "img-401"]);
    expect(result.sortValues).toEqual(page.sortValues);
    expect(result.total).toBe(0);
    expect([...result.enrichment!.keys()]).toEqual(["img-400", "img-401"]);
  });

  it("reports the window's counted total when the caller asks", async () => {
    const calls = stubMediaApi({ "/images/window": () => ({ ...page, offset: 400, total: 1234 }) });
    const result = await new ApiDataSource(makeFallback()).searchRange({ ...params, offset: 400, trackTotalHits: true });

    expect(calls[0].body.countAll).toBe(true);
    expect(result.total).toBe(1234);
  });

  it("keeps both the offset and a supplied PIT on a window read", async () => {
    const calls = stubMediaApi({ "/images/window": () => ({ ...page, offset: 400, pitId: "refreshed-pit" }) });
    const result = await new ApiDataSource(makeFallback()).searchAfter({ ...params, offset: 400 }, null, "pit");

    expect(calls.map((c) => c.path)).toEqual(["/images/window"]);
    expect(calls[0].body).toMatchObject({ offset: 400, pitId: "pit" });
    expect(result.pitId).toBe("refreshed-pit");
  });

  it("retries an expired PIT on a window read once without it", async () => {
    const calls = stubMediaApi({
      "/images/window": (body) => body.pitId ? failure(410, "search-after-pit-expired") : { ...page, offset: 400 },
    });
    const result = await new ApiDataSource(makeFallback()).searchAfter({ ...params, offset: 400 }, null, "old-pit");

    expect(calls.map((c) => [c.path, c.body.offset, c.body.pitId])).toEqual([
      ["/images/window", 400, "old-pit"], ["/images/window", 400, undefined],
    ]);
    expect(result.pitId).toBeNull();
  });

  it.each([
    { name: "cursor page", cursor: [1, "img-1"], reverse: undefined, seekToEnd: undefined },
    { name: "backward page", cursor: [1, "img-1"], reverse: true, seekToEnd: undefined },
    { name: "End", cursor: null, reverse: true, seekToEnd: true },
  ])("reads a $name through search-after without an offset, even when params carry one", async ({ cursor, reverse, seekToEnd }) => {
    const calls = stubMediaApi({ "/images/search-after": () => ({ ...page, total: 0 }) });
    await new ApiDataSource(makeFallback()).searchAfter({ ...params, offset: 400 }, cursor, null, undefined, reverse, seekToEnd);

    expect(calls.map((c) => c.path)).toEqual(["/images/search-after"]);
    expect(calls[0].body).not.toHaveProperty("offset");
    expect(calls[0].body).toMatchObject({ reverse: reverse ?? false, seekToEnd: seekToEnd ?? false, countAll: false });
    if (cursor) expect(calls[0].body.sortValues).toEqual(cursor);
  });

  it("passes cancellation to media-api", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      controller.abort();
      init.signal?.throwIfAborted();
      return new Response("{}");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new ApiDataSource(makeFallback()).searchAfter({ ...params, offset: 400 }, null, null, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it("declares media-api's window limit for offset reads", () => {
    expect(new ApiDataSource(makeFallback()).offsetReadLimit).toBe(10_000);
  });
});

describe("ApiDataSource standalone image", () => {
  function stubSingleton(respond: (url: string) => Response | Promise<Response>) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return respond(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const singleton = (id: string) => new Response(JSON.stringify({
    uri: `/images/${id}`,
    data: {
      id, uploadTime: "2026-01-01T00:00:00Z", cost: "overquota", valid: false, invalidReasons: { quota: "Over quota" },
      persisted: { value: true, reasons: ["archived"] },
      userMetadata: { data: {
        archived: { data: false }, labels: { data: [{ data: "Priority" }] }, metadata: { data: {} },
        usageRights: {}, photoshoot: {}, lastModified: "2026-01-02T00:00:00Z",
      } },
      usages: { data: [{ data: { id: "usage-1", platform: "print" } }] },
    },
    links: [{ rel: "crops", href: "/crops" }],
    actions: [{ name: "delete", href: `/images/${id}`, method: "DELETE" }],
  }), { status: 200 });

  it("reads GET /images/:id and returns the normalized image with its overlay", async () => {
    const fetchMock = stubSingleton(() => singleton("img/1"));
    const fallback = makeFallback();
    const found = await new ApiDataSource(fallback).getById("img/1");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/images/img%2F1");
    expect(init?.method ?? "GET").toBe("GET");
    expect(found?.image.id).toBe("img/1");
    expect(found?.image.userMetadata?.labels).toEqual(["Priority"]);
    expect(found?.image.usages).toEqual([{ id: "usage-1", platform: "print" }]);
    expect(found?.enrichment).toMatchObject({
      cost: "overquota", valid: false, invalidReasons: { quota: "Over quota" },
      persisted: { value: true, reasons: ["archived"] },
      actions: [{ name: "delete", href: "/images/img/1", method: "DELETE" }],
    });
    expect(fallback.getById).not.toHaveBeenCalled();
  });

  it("reports a missing or hidden image as absent, quietly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubSingleton(() => failure(404, "image-not-found"));
    await expect(new ApiDataSource(makeFallback()).getById("img-1")).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats an image answered under another ID as absent", async () => {
    stubSingleton(() => singleton("img-2"));
    await expect(new ApiDataSource(makeFallback()).getById("img-1")).resolves.toBeUndefined();
  });

  it.each([
    { name: "refusing", respond: () => failure(503), expected: { kind: "refused", status: 503 } },
    { name: "unreachable", respond: () => { throw new TypeError("Failed to fetch"); }, expected: { kind: "unavailable" } },
  ])("fails rather than reporting absence when media-api is $name", async ({ respond, expected }) => {
    stubSingleton(respond);
    await expect(new ApiDataSource(makeFallback()).getById("img-1")).rejects.toMatchObject(expected);
  });

  it("passes cancellation to media-api", async () => {
    const controller = new AbortController();
    const fetchMock = stubSingleton(() => {
      controller.abort();
      return singleton("img-1");
    });
    await expect(new ApiDataSource(makeFallback()).getById("img-1", controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

describe("ApiDataSource images by ID", () => {
  const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `img-${from + i}`);
  const found = (body: Body) => ({ data: (body.ids as string[]).map(entity) });

  it("posts 200-ID requests, at most four at a time, and returns every found image, normalized", async () => {
    let inFlight = 0;
    let peak = 0;
    const calls = stubMediaApi({
      "/images/mget": async (body) => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { data: (body.ids as string[]).filter((id) => id !== "img-7").map((id) => ({
          data: { id, uploadTime: "2026-01-01T00:00:00Z", usages: { data: [{ data: { id: `usage-${id}` } }] } },
        })) };
      },
    });
    const fallback = makeFallback();
    const result = await new ApiDataSource(fallback).getByIds(ids(1050));

    expect(calls.map((c) => (c.body.ids as string[]).length)).toEqual([200, 200, 200, 200, 200, 50]);
    expect(calls.flatMap((c) => c.body.ids as string[])).toEqual(ids(1050));
    expect(calls.every((c) => Object.keys(c.body).join() === "ids")).toBe(true);
    expect(peak).toBe(4);
    expect(result.map((image) => image.id).sort()).toEqual(ids(1050).filter((id) => id !== "img-7").sort());
    expect(result.find((image) => image.id === "img-3")?.usages).toEqual([{ id: "usage-img-3" }]);
    expect(fallback.getByIds).not.toHaveBeenCalled();
  });

  it("asks nothing for no IDs", async () => {
    const calls = stubMediaApi({ "/images/mget": found });
    await expect(new ApiDataSource(makeFallback()).getByIds([])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it.each([
    { name: "refuses a request", respond: () => failure(503, "mget-incomplete"), expected: { kind: "refused", status: 503 } },
    { name: "is unreachable", respond: () => { throw new TypeError("Failed to fetch"); }, expected: { kind: "unavailable" } },
  ])("fails the whole lookup, never reporting IDs as missing, when media-api $name for one request", async ({ respond, expected }) => {
    const calls = stubMediaApi({
      "/images/mget": (body) => (body.ids as string[]).includes("img-200") ? respond() : found(body),
    });
    await expect(new ApiDataSource(makeFallback()).getByIds(ids(2000))).rejects.toMatchObject(expected);
    expect(calls.length).toBeLessThan(10);
  });

  it("rejects when cancelled, rather than resolving to no images", async () => {
    const controller = new AbortController();
    stubMediaApi({ "/images/mget": (body) => { controller.abort(); return found(body); } });
    await expect(new ApiDataSource(makeFallback()).getByIds(ids(3), controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("ApiDataSource rank", () => {
  it("sends the sort and tuple, without paging fields, and returns the rank", async () => {
    const calls = stubMediaApi({ "/images/rank": () => ({ rank: 4321 }) });
    const tuple: SortValues = [null, 1_700_000_000_000, "img-9"];
    await expect(new ApiDataSource(makeFallback()).countBefore({ ...params, orderBy: "-taken", offset: 50 }, tuple)).resolves.toBe(4321);

    expect(calls[0].body.sortValues).toEqual(tuple);
    expect(calls[0].body.sort).toEqual([{ "metadata.dateTaken": "desc" }, { uploadTime: "desc" }, { id: "asc" }]);
    for (const field of ["offset", "length", "countAll", "reverse", "seekToEnd"]) expect(calls[0].body).not.toHaveProperty(field);
  });

  it("fails rather than returning a count when rank is incomplete", async () => {
    stubMediaApi({ "/images/rank": () => failure(503, "rank-incomplete") });
    await expect(new ApiDataSource(makeFallback()).countBefore(params, [1, "img-1"]))
      .rejects.toMatchObject({ kind: "refused", status: 503 });
  });
});

describe("ApiDataSource scalar anchor", () => {
  it("asks for one percentile with an optional scope", async () => {
    const calls = stubMediaApi({ "/images/sort-profile": () => ({ value: 1_650_000_000_000.5 }) });
    const ds = new ApiDataSource(makeFallback());
    const scope = [{ field: "metadata.credit", value: "AAP" }];

    await expect(ds.estimateSortValue({ ...params, orderBy: "-credit" }, "uploadTime", 37.5, undefined, scope)).resolves.toBe(1_650_000_000_000.5);
    await ds.estimateSortValue(params, "uploadTime", 50);

    expect(calls[0].body).toMatchObject({ operation: "scalar-anchor", field: "uploadTime", percentile: 37.5, scope });
    expect(calls[1].body).not.toHaveProperty("scope");
  });

  it.each([
    { name: "no value", route: () => ({ value: null }) },
    { name: "a refusal", route: () => failure(422) },
    { name: "an incomplete profile", route: () => failure(503, "sort-profile-incomplete") },
  ])("returns null quietly for $name, as optional profile data", async ({ route }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubMediaApi({ "/images/sort-profile": route });
    await expect(new ApiDataSource(makeFallback()).estimateSortValue(params, "uploadTime", 50)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("still warns about an unexpected failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubMediaApi({ "/images/sort-profile": () => new Response("{") });
    await expect(new ApiDataSource(makeFallback()).estimateSortValue(params, "uploadTime", 50)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns null without a warning when cancelled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const controller = new AbortController();
    controller.abort();
    stubMediaApi({ "/images/sort-profile": () => ({ value: 1 }) });

    await expect(new ApiDataSource(makeFallback()).estimateSortValue(params, "uploadTime", 50, controller.signal)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("ApiDataSource keyword walks", () => {
  const credit = { ...params, orderBy: "credit" };
  // Three pages of two values each; the last is short, like a real composite walk.
  const pages: Record<string, { buckets: Array<{ key: string | number; count: number }>; after: string | number | null }> = {
    start: { buckets: [{ key: "AAP", count: 5 }, { key: "AP", count: 3 }], after: "AP" },
    AP: { buckets: [{ key: "EPA", count: 4 }, { key: "Getty", count: 6 }], after: "Getty" },
    Getty: { buckets: [{ key: "PA", count: 2 }], after: "PA" },
    PA: { buckets: [], after: null },
  };
  const keywordRoute = (body: Body) => ({
    ...pages[(body.after as string | undefined) ?? "start"],
    ...(body.includeCoveredCount ? { coveredCount: 20 } : {}),
  });

  it("finds the value at a position by walking pages with the returned continuation", async () => {
    vi.stubEnv("VITE_KEYWORD_SEEK_BUCKET_SIZE", "2");
    const calls = stubMediaApi({ "/images/sort-profile": keywordRoute });

    await expect(new ApiDataSource(makeFallback()).findKeywordSortValue(credit, "metadata.credit", 10, "asc")).resolves.toBe("EPA");

    expect(calls.map((c) => c.body.after)).toEqual([undefined, "AP"]);
    expect(calls[0].body).toMatchObject({ operation: "keyword-page", field: "metadata.credit", size: 2 });
    expect(calls[0].body).not.toHaveProperty("includeCoveredCount");
  });

  it("returns the last value when the walk runs out before the position", async () => {
    vi.stubEnv("VITE_KEYWORD_SEEK_BUCKET_SIZE", "2");
    const calls = stubMediaApi({ "/images/sort-profile": keywordRoute });

    await expect(new ApiDataSource(makeFallback()).findKeywordSortValue(credit, "metadata.credit", 500, "asc")).resolves.toBe("PA");
    expect(calls).toHaveLength(3);
  });

  it("stringifies numeric keys and continues from them unchanged", async () => {
    vi.stubEnv("VITE_KEYWORD_SEEK_BUCKET_SIZE", "1");
    const calls = stubMediaApi({
      "/images/sort-profile": (body) => body.after === undefined
        ? { buckets: [{ key: 1024, count: 3 }], after: 1024 }
        : { buckets: [{ key: 2048, count: 3 }], after: 2048 },
    });

    await expect(new ApiDataSource(makeFallback()).findKeywordSortValue({ ...params, orderBy: "width" }, "source.dimensions.width", 4, "asc"))
      .resolves.toBe("2048");
    expect(calls[1].body.after).toBe(1024);
  });

  it("returns the best value so far, quietly, when a later page fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VITE_KEYWORD_SEEK_BUCKET_SIZE", "2");
    stubMediaApi({ "/images/sort-profile": (body) => body.after ? failure(503) : pages.start });

    await expect(new ApiDataSource(makeFallback()).findKeywordSortValue(credit, "metadata.credit", 10, "asc")).resolves.toBe("AP");
    expect(warn).not.toHaveBeenCalled();
  });

  it("builds a distribution with exact coverage from the first page only", async () => {
    const calls = stubMediaApi({ "/images/sort-profile": keywordRoute });
    const dist = await new ApiDataSource(makeFallback()).getKeywordDistribution(credit, "metadata.credit", "asc");

    expect(calls.map((c) => c.body.includeCoveredCount)).toEqual([true, undefined, undefined, undefined]);
    expect(calls.every((c) => c.body.size === 10_000)).toBe(true);
    expect(dist).toEqual({
      buckets: [
        { key: "AAP", count: 5, startPosition: 0 }, { key: "AP", count: 3, startPosition: 5 },
        { key: "EPA", count: 4, startPosition: 8 }, { key: "Getty", count: 6, startPosition: 12 },
        { key: "PA", count: 2, startPosition: 18 },
      ],
      coveredCount: 20,
      representedCount: 20,
      complete: true,
    });
  });

  it("marks a distribution truncated after five pages", async () => {
    let n = 0;
    stubMediaApi({ "/images/sort-profile": () => ({ buckets: [{ key: `v${n}`, count: 1 }], after: `v${n++}`, coveredCount: 99 }) });
    const dist = await new ApiDataSource(makeFallback()).getKeywordDistribution(credit, "metadata.credit", "asc");

    expect(dist?.buckets).toHaveLength(5);
    expect(dist).toMatchObject({ coveredCount: 99, representedCount: 5, complete: false });
  });

  it("returns no distribution, quietly, when a page fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubMediaApi({ "/images/sort-profile": (body) => body.after ? failure(503) : pages.start });
    await expect(new ApiDataSource(makeFallback()).getKeywordDistribution(credit, "metadata.credit", "asc")).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("ApiDataSource date distribution", () => {
  const day = 86_400_000;

  it("chooses the interval from the stats and maps exact-rank buckets", async () => {
    const buckets = [
      { key: "2026-01-02T00:00:00.000Z", count: 7, startPosition: 0 },
      { key: "2026-01-01T00:00:00.000Z", count: 3, startPosition: 7 },
    ];
    const calls = stubMediaApi({
      "/images/sort-profile": (body) => body.operation === "date-stats"
        ? { valueCount: 10, min: 0, max: 30 * day }
        : { buckets, positionKind: "exact-rank", evidenceCount: 10 },
    });
    const dist = await new ApiDataSource(makeFallback()).getDateDistribution({ ...params, orderBy: "-lastModified" }, "uploadTime", "desc", undefined, "lastModified");

    expect(calls.map((c) => c.body.operation)).toEqual(["date-stats", "date-buckets"]);
    expect(calls[0].body).toMatchObject({ field: "uploadTime", missingField: "lastModified" });
    expect(calls[1].body).toMatchObject({ field: "uploadTime", missingField: "lastModified", interval: "day" });
    expect(dist).toEqual({ buckets, coveredCount: 10 });
  });

  it("keeps exact parent coverage separate from approximate evidence for max-mode dates", async () => {
    const buckets = [{ key: "2026-01-01T00:00:00.000Z", count: 9, startPosition: 0 }];
    stubMediaApi({
      "/images/sort-profile": (body) => body.operation === "date-stats"
        ? { valueCount: 12, min: 0, max: 3 * 365 * day, coveredCount: 6 }
        : { buckets, positionKind: "approximate-evidence", evidenceCount: 9 },
    });
    const dist = await new ApiDataSource(makeFallback()).getDateDistribution({ ...params, orderBy: "-usagesDateAdded" }, "usages.dateAdded", "desc");

    expect(dist).toEqual({ buckets, coveredCount: 6, bucketPositionKind: "approximate-evidence", evidenceCount: 9 });
  });

  it.each([
    { name: "plain", stats: { valueCount: 0, min: null, max: null }, expected: { buckets: [], coveredCount: 0 } },
    {
      name: "max-mode", stats: { valueCount: 0, min: null, max: null, coveredCount: 0 },
      expected: { buckets: [], coveredCount: 0, bucketPositionKind: "approximate-evidence", evidenceCount: 0 },
    },
  ])("returns an empty $name distribution without asking for buckets", async ({ stats, expected }) => {
    const calls = stubMediaApi({ "/images/sort-profile": () => stats });
    await expect(new ApiDataSource(makeFallback()).getDateDistribution(params, "uploadTime", "desc")).resolves.toEqual(expected);
    expect(calls).toHaveLength(1);
  });

  it.each([
    { name: "no buckets", route: (body: Body) => body.operation === "date-stats" ? { valueCount: 1, min: 0, max: 1 } : { buckets: [], positionKind: "exact-rank", evidenceCount: 0 } },
    { name: "failed stats", route: () => failure(503) },
    { name: "failed buckets", route: (body: Body) => body.operation === "date-stats" ? { valueCount: 1, min: 0, max: 1 } : failure(503) },
  ])("returns no distribution, quietly, for $name", async ({ route }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubMediaApi({ "/images/sort-profile": route });
    await expect(new ApiDataSource(makeFallback()).getDateDistribution(params, "uploadTime", "desc")).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("ApiDataSource key walks", () => {
  // Five images, the last two in the null tail of -lastModified.
  const keys: Array<{ id: string; sortValues: SortValues }> = [
    { id: "a", sortValues: [50, 5, "a"] }, { id: "b", sortValues: [40, 4, "b"] }, { id: "c", sortValues: [30, 3, "c"] },
    { id: "d", sortValues: [null, 2, "d"] }, { id: "e", sortValues: [null, 1, "e"] },
  ];
  const keysRoute = (body: Body) => {
    const start = body.sortValues ? keys.findIndex((k) => JSON.stringify(k.sortValues) === JSON.stringify(body.sortValues)) + 1 : 0;
    const pageKeys = keys.slice(start, start + (body.size as number));
    return { keys: pageKeys, after: pageKeys.length < (body.size as number) ? null : pageKeys[pageKeys.length - 1].sortValues };
  };
  const lastModified = { ...params, orderBy: "-lastModified" };

  it("builds the position map in one walk through the null tail, following each continuation", async () => {
    const calls = stubMediaApi({
      "/images/keys": (body) => {
        const start = body.sortValues ? keys.findIndex((k) => JSON.stringify(k.sortValues) === JSON.stringify(body.sortValues)) + 1 : 0;
        const pageKeys = keys.slice(start, start + 2);
        return { keys: pageKeys, after: start + 2 < keys.length ? pageKeys[pageKeys.length - 1].sortValues : null };
      },
    });
    const map = await new ApiDataSource(makeFallback()).fetchPositionIndex(lastModified, new AbortController().signal);

    expect(map).toEqual({ length: 5, ids: keys.map((k) => k.id), sortValues: keys.map((k) => k.sortValues) });
    expect(calls.map((c) => c.body.sortValues)).toEqual([undefined, [40, 4, "b"], [null, 2, "d"]]);
    for (const field of ["offset", "length", "countAll"]) expect(calls[0].body).not.toHaveProperty(field);
  });

  it("uses the map chunk size by default", async () => {
    const calls = stubMediaApi({ "/images/keys": keysRoute });
    await new ApiDataSource(makeFallback()).fetchPositionIndex(lastModified, new AbortController().signal);
    expect(calls[0].body.size).toBe(10_000);
  });

  it.each([
    { name: "an incomplete page", route: () => failure(503, "keys-incomplete") },
    { name: "no images", route: () => ({ keys: [], after: null }) },
  ])("returns no map, quietly, for $name", async ({ route }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubMediaApi({ "/images/keys": route });
    await expect(new ApiDataSource(makeFallback()).fetchPositionIndex(lastModified, new AbortController().signal)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns no map, quietly, when media-api is unreachable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(new ApiDataSource(makeFallback()).fetchPositionIndex(lastModified, new AbortController().signal)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns no map once cancelled", async () => {
    const controller = new AbortController();
    stubMediaApi({ "/images/keys": (body) => { controller.abort(); return keysRoute(body); } });
    await expect(new ApiDataSource(makeFallback()).fetchPositionIndex(lastModified, controller.signal)).resolves.toBeNull();
  });

  it("walks a range (from, to] across the null tail and stops past the end cursor", async () => {
    const calls = stubMediaApi({ "/images/keys": keysRoute });
    const result = await new ApiDataSource(makeFallback()).getIdRange(lastModified, keys[0].sortValues, keys[3].sortValues);

    expect(result).toEqual({ ids: ["b", "c", "d"], truncated: false, walked: 4 });
    expect(calls[0].body).toMatchObject({ sortValues: keys[0].sortValues, size: 1_000 });
  });

  it("truncates at the range cap with one image of lookahead", async () => {
    vi.stubEnv("VITE_RANGE_HARD_CAP", "2");
    stubMediaApi({ "/images/keys": keysRoute });
    const result = await new ApiDataSource(makeFallback()).getIdRange(lastModified, keys[0].sortValues, keys[4].sortValues);
    expect(result).toEqual({ ids: ["b", "c"], truncated: true, walked: 3 });
  });

  it("fails a range walk rather than returning a short selection", async () => {
    stubMediaApi({ "/images/keys": () => failure(503, "keys-incomplete") });
    await expect(new ApiDataSource(makeFallback()).getIdRange(lastModified, keys[0].sortValues, keys[4].sortValues))
      .rejects.toMatchObject({ status: 503 });
  });
});

describe("ApiDataSource counts", () => {
  const counted = {
    total: 1234,
    tickerCounts: {
      "GNM-owned": { value: 7, searchClause: "is:GNM-owned", backgroundColour: "#005689" },
      "agency picks": { value: 3, searchClause: "is:agency-pick", backgroundColour: "#7d0068", subCounts: { Reuters: 2, other: 1 } },
    },
  };

  it("counts through media-api with the read scope and no sort, keeping each ticker's value and sub-counts", async () => {
    const calls = stubMediaApi({ "/images/count": () => counted });
    const result = await new ApiDataSource(makeFallback()).countWithTickers({ ...params, since: "2026-09-25T10:00:00.000Z", offset: 0, length: 0 });

    expect(result).toEqual({
      count: 1234,
      tickerCounts: { "GNM-owned": { value: 7 }, "agency picks": { value: 3, subCounts: { Reuters: 2, other: 1 } } },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ orderBy: "-uploadTime", since: "2026-09-25T10:00:00.000Z" });
    for (const field of ["sort", "offset", "length", "countAll", "pitId"]) expect(calls[0].body).not.toHaveProperty(field);
  });

  it("returns the total alone for a plain count", async () => {
    stubMediaApi({ "/images/count": () => counted });
    await expect(new ApiDataSource(makeFallback()).count(params)).resolves.toBe(1234);
  });

  it.each([
    { name: "an incomplete count", route: () => failure(503, "count-incomplete"), status: 503 },
    { name: "a refusal", route: () => failure(422, "invalid-uri-parameters"), status: 422 },
  ])("rejects $name rather than reporting zero", async ({ route, status }) => {
    stubMediaApi({ "/images/count": route });
    await expect(new ApiDataSource(makeFallback()).countWithTickers(params)).rejects.toMatchObject({ status });
  });

  it("rejects when media-api is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(new ApiDataSource(makeFallback()).countWithTickers(params)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("ApiDataSource aggregations", () => {
  const aggregated = {
    fields: {
      "metadata.credit": { buckets: [{ key: "AAP", count: 5 }, { key: "Reuters", count: 2 }] },
      "fileMetadata.iptc.Edit Status": { buckets: [] },
      usagesPlatform: { buckets: [{ key: "digital", count: 4 }, { key: "print", count: 1 }] },
      usagesStatus: { buckets: [{ key: "published", count: 3 }] },
    },
    isFilterCounts: { deleted: 0, "under-quota": 6 },
  };

  it("counts fields verbatim, named is: filters and usage values through media-api with the read scope and no sort", async () => {
    const calls = stubMediaApi({ "/images/aggregations": () => aggregated });
    const signal = new AbortController().signal;
    const result = await new ApiDataSource(makeFallback()).getAggregations(
      { ...params, ids: "a,b" },
      [{ field: "metadata.credit", size: 10 }, { field: "fileMetadata.iptc.Edit Status" }],
      signal,
      [{ name: "deleted", isFilter: "deleted" }, { name: "quota", isFilter: "under-quota" }],
      [
        { name: "digital", subField: "platform", value: "digital" },
        { name: "syndication", subField: "platform", value: "syndication" },
        { name: "published", subField: "status", value: "published" },
      ],
    );

    expect(result.fields).toEqual({
      "metadata.credit": { buckets: [{ key: "AAP", count: 5 }, { key: "Reuters", count: 2 }] },
      "fileMetadata.iptc.Edit Status": { buckets: [] },
    });
    expect(result.filters).toEqual({ deleted: 0, quota: 6 });
    expect(result.usageFilters).toEqual({ digital: 4, syndication: 0, published: 3 });
    expect(result.took).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({
      orderBy: "-uploadTime",
      ids: "a,b",
      fields: [
        { field: "metadata.credit", size: 10 },
        { field: "fileMetadata.iptc.Edit Status", size: 10 },
        { field: "usagesPlatform", size: 20 },
        { field: "usagesStatus", size: 20 },
      ],
      isFilters: ["deleted", "under-quota"],
    });
    for (const field of ["sort", "offset", "length", "countAll", "pitId"]) expect(calls[0].body).not.toHaveProperty(field);
  });

  it("sends no is: filters and returns neither filter nor usage counts when none are asked for", async () => {
    const calls = stubMediaApi({ "/images/aggregations": () => ({ fields: { "metadata.credit": { buckets: [] } }, isFilterCounts: {} }) });
    const result = await new ApiDataSource(makeFallback()).getAggregations(params, [{ field: "metadata.credit", size: 100 }]);

    expect(result).toEqual({ fields: { "metadata.credit": { buckets: [] } }, fetchDuration: expect.any(Number) });
    expect(calls[0].body.fields).toEqual([{ field: "metadata.credit", size: 100 }]);
    expect(calls[0].body).not.toHaveProperty("isFilters");
  });

  it("reports a requested field media-api did not return as empty", async () => {
    stubMediaApi({ "/images/aggregations": () => ({ fields: {}, isFilterCounts: {} }) });
    const result = await new ApiDataSource(makeFallback()).getAggregations(params, [{ field: "collections.pathId", size: 6000 }]);
    expect(result.fields["collections.pathId"]).toEqual({ buckets: [] });
  });

  it.each([
    { name: "incomplete counts", route: () => failure(503, "aggregations-incomplete"), status: 503 },
    { name: "a field that cannot be aggregated", route: () => failure(422, "invalid-uri-parameters"), status: 422 },
  ])("rejects $name rather than reporting empty buckets", async ({ route, status }) => {
    stubMediaApi({ "/images/aggregations": route });
    await expect(new ApiDataSource(makeFallback()).getAggregations(params, [{ field: "metadata.title" }])).rejects.toMatchObject({ status });
  });

  it("rejects when media-api is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(new ApiDataSource(makeFallback()).getAggregations(params, [])).rejects.toMatchObject({ kind: "unavailable" });
  });
});
