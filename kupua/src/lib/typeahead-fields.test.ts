import { describe, it, expect, vi } from "vitest";
import { buildDynamicFieldFallback, buildTypeaheadFields, stripFieldFromQuery, queryContainsField } from "./typeahead-fields";
import { MockDataSource } from "@/dal/mock-data-source";
import type {
  SearchParams,
  AggregationRequest,
  AggregationsResult,
  FilterAggRequest,
  UsageFilterAggRequest,
} from "@/dal";

const literalCases = [
  ['"literal credit:inside text" credit:outside', '"literal credit:inside text"', true],
  ['credit:outside "literal credit:inside text"', '"literal credit:inside text"', true],
  ['"literal credit:inside text"', '"literal credit:inside text"', false],
  ["'literal credit:inside text' credit:outside", "'literal text'", true],
  ['"literal  credit:inside   text" +credit:"Synthetic  Credit" -credit:Other city:London', '"literal  credit:inside   text" city:London', true],
  ['  credit:first "literal  words" credit:second  city:London  ', '"literal  words" city:London', true],
  ['description:"credit:inside text" credit:outside', 'description:"credit:inside text"', true],
  ['notcredit:value metadata.credit:Other', 'notcredit:value metadata.credit:Other', false],
  ['"credit":outside city:London', 'city:London', true],
  ['+CREDIT:outside -credit:"Other Credit" city:London', 'city:London', true],
  ['city:London credit:', 'city:London', true],
  ['city:London credit:"unfinished', 'city:London', true],
  ['credit:outside "unfinished credit:inside', '"unfinished credit:inside', true],
  ['"unfinished credit:inside', '"unfinished credit:inside', false],
  ['city:London credit', 'city:London credit', false],
] as const;

describe("literal-safe typeahead scope", () => {
  it("category suggestions list Grid's categories by search value, counting replaced values (Kahuna parity, kebab only)", async () => {
    const { useUsageRightsCatalogue } = await import("./usage-rights-catalogue");
    const dataSource = new MockDataSource(0);
    vi.spyOn(dataSource, "getAggregations").mockResolvedValue({ fields: { "usageRights.category": { buckets: [
      { key: "staff-photographer", count: 5 }, { key: "publisher-photographer", count: 1 },
      { key: "chargeable", count: 2 }, { key: "", count: 9 },
    ], total: 17 } } });
    let scope: SearchParams = { query: "category:" };
    const resolver = buildTypeaheadFields(dataSource, undefined, () => scope)
      .find((field) => field.fieldName === "category")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected category resolver");
    const catalogue = (legacy: boolean) => [
      { value: "", name: "Unknown Rights", ...(legacy ? { legacyCategories: [] } : {}) },
      { value: "pay-to-use", name: "Pay to use", ...(legacy ? { legacyCategories: ["chargeable"] } : {}) },
      { value: "publisher-photographer", name: "ACME Photographer", searchAlias: "acme-photographer",
        ...(legacy ? { legacyCategories: ["staff-photographer", "contract-photographer"] } : {}) },
      { value: "agency", name: "Agency", ...(legacy ? { legacyCategories: [] } : {}) },
    ];
    try {
      vi.stubEnv("VITE_USE_MEDIA_API", "true");
      useUsageRightsCatalogue.setState({ categories: catalogue(true) });
      expect(await resolver("")).toEqual([
        { value: "pay-to-use", count: 2 },
        { value: "acme-photographer", count: 6 },
        { value: "agency", count: 0 },
      ]);
      expect(await resolver("acme")).toEqual([{ value: "acme-photographer", count: 6 }]);

      // A full page may be truncated: a missing value is unknown, not zero.
      scope = { query: "category:", nonFree: "true" };
      vi.mocked(dataSource.getAggregations).mockResolvedValueOnce({ fields: { "usageRights.category": { buckets: [
        { key: "staff-photographer", count: 5 }, { key: "chargeable", count: 2 }, { key: "pay-to-use", count: 1 },
        ...Array.from({ length: 97 }, (_, i) => ({ key: `other-${i}`, count: 1 })),
      ] } } });
      expect(await resolver("")).toEqual([
        { value: "pay-to-use", count: 3 }, { value: "acme-photographer" }, { value: "agency" },
      ]);
      expect(vi.mocked(dataSource.getAggregations).mock.calls.at(-1)?.[1]).toEqual([{ field: "usageRights.category", size: 100 }]);
      scope = { query: "category:" };

      // An older server without replaced values: list stays, counts are omitted rather than wrong.
      useUsageRightsCatalogue.setState({ categories: catalogue(false) });
      expect(await resolver("")).toEqual([{ value: "pay-to-use" }, { value: "acme-photographer" }, { value: "agency" }]);

      // Direct-ES, or no catalogue: stored values with hits, kebab only.
      vi.unstubAllEnvs();
      expect(await resolver("")).toEqual([
        { value: "staff-photographer", count: 5 }, { value: "publisher-photographer", count: 1 }, { value: "chargeable", count: 2 },
      ]);
    } finally {
      vi.unstubAllEnvs();
      useUsageRightsCatalogue.setState({ categories: null });
    }
  });

  it("reuses completed equivalent buckets while filtering the latest prefix", async () => {
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockResolvedValue({
      fields: { "metadata.credit": { buckets: [{ key: "Alpha", count: 9 }, { key: "Beta", count: 4 }], total: 13 } },
    });
    let params: SearchParams = { query: "city:London credit:A", nonFree: "true" };
    const resolver = buildTypeaheadFields(dataSource, undefined, () => params)
      .find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    expect(await resolver("A")).toEqual([{ value: "Alpha", count: 9 }]);
    params = { ...params, query: "city:London credit:B" };
    expect(await resolver("B")).toEqual([{ value: "Beta", count: 4 }]);
    expect(aggregation).toHaveBeenCalledTimes(1);
  });

  it.each([
    { nonFree: "false" }, { payType: "pay" }, { ids: "synthetic-image" },
    { since: "2026-01-01" }, { until: "2026-02-01" }, { dateField: "taken" },
    { takenSince: "2026-01-01" }, { takenUntil: "2026-02-01" },
    { modifiedSince: "2026-01-01" }, { modifiedUntil: "2026-02-01" },
    { uploadedBy: "synthetic-uploader" }, { hasRightsAcquired: "true" },
    { hasCrops: "true" }, { persisted: "true" }, { syndicationStatus: "blocked" },
    { query: "city:Paris credit:B" }, { aiQuery: "synthetic" },
  ] satisfies SearchParams[])("isolates changed scope %j and reuses its restored predecessor", async (change) => {
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockResolvedValue({ fields: {
      "metadata.credit": { buckets: [{ key: "Alpha", count: 9 }], total: 9 },
    } });
    const original: SearchParams = { query: "city:London credit:A", nonFree: "true" };
    let params = original;
    const resolver = buildTypeaheadFields(dataSource, undefined, () => params)
      .find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    await resolver("");
    params = { ...original, ...change };
    await resolver("");
    expect(aggregation).toHaveBeenCalledTimes(2);
    params = { nonFree: "true", query: "city:London credit:B" };
    expect(await resolver("A")).toEqual([{ value: "Alpha", count: 9 }]);
    expect(aggregation).toHaveBeenCalledTimes(2);
  });

  it("only cancels shared work when its last consumer leaves and never caches a late aborted response", async () => {
    const dataSource = new MockDataSource(0);
    const requests: Array<{ signal?: AbortSignal; resolve: (result: AggregationsResult) => void }> = [];
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockImplementation((_params, _fields, signal) =>
      new Promise((resolve) => { requests.push({ signal, resolve }); }));
    const resolver = buildTypeaheadFields(dataSource, undefined, () => ({ query: "credit:" }))
      .find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    const first = new AbortController();
    const second = new AbortController();
    const firstResult = resolver("A", first.signal);
    const firstRejection = expect(firstResult).rejects.toMatchObject({ name: "AbortError" });
    const secondResult = resolver("B", second.signal);
    const secondRejection = expect(secondResult).rejects.toMatchObject({ name: "AbortError" });
    expect(aggregation).toHaveBeenCalledTimes(1);
    first.abort();
    await firstRejection;
    expect(requests[0].signal?.aborted).toBe(false);
    second.abort();
    await secondRejection;
    expect(requests[0].signal?.aborted).toBe(true);
    const successor = resolver("B");
    expect(requests).toHaveLength(2);
    requests[0].resolve({ fields: { "metadata.credit": { buckets: [{ key: "Bad stale", count: 99 }], total: 99 } } });
    requests[1].resolve({ fields: { "metadata.credit": { buckets: [{ key: "Beta", count: 4 }], total: 4 } } });
    expect(await successor).toEqual([{ value: "Beta", count: 4 }]);
    expect(await resolver("B")).toEqual([{ value: "Beta", count: 4 }]);
    expect(aggregation).toHaveBeenCalledTimes(2);
  });

  it("retries failed option reads but reuses successful empty buckets", async () => {
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations")
      .mockRejectedValueOnce(new TypeError("synthetic offline"))
      .mockResolvedValue({ fields: { "metadata.credit": { buckets: [], total: 0 } } });
    const resolver = buildTypeaheadFields(dataSource).find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    expect(await resolver("")).toEqual([]);
    expect(await resolver("")).toEqual([]);
    expect(await resolver("")).toEqual([]);
    expect(aggregation).toHaveBeenCalledTimes(2);
  });

  it("bounds completed scope retention to 32 option reads", async () => {
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockResolvedValue({ fields: {} });
    let params: SearchParams = {};
    const resolver = buildTypeaheadFields(dataSource, undefined, () => params)
      .find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    for (let scope = 0; scope < 33; scope++) {
      params = { query: `synthetic-${scope} credit:` };
      await resolver("");
    }
    await resolver("");
    expect(aggregation).toHaveBeenCalledTimes(33);
    params = { query: "synthetic-0 credit:" };
    await resolver("");
    expect(aggregation).toHaveBeenCalledTimes(34);
  });

  it.each(literalCases)("preserves literal contents in %s", (query, expected, contains) => {
    expect(queryContainsField("credit", query)).toBe(contains);
    expect(stripFieldFromQuery("credit", query)).toBe(expected);
  });

  it.each(literalCases)("uses the intended actual aggregation scope for %s", async (query, expected) => {
    const params: SearchParams = Object.freeze({ query, nonFree: "true", ids: "synthetic-image", until: "2026-01-01" });
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockResolvedValue({
      fields: { "metadata.credit": { buckets: [{ key: "Scoped credit", count: 3 }], total: 3 } },
    });
    const signal = new AbortController().signal;
    const resolver = buildTypeaheadFields(dataSource, undefined, () => params)
      .find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    expect(await resolver("Scoped", signal)).toEqual([{ value: "Scoped credit", count: 3 }]);
    expect(aggregation).toHaveBeenCalledExactlyOnceWith(
      { ...params, query: expected || undefined }, [{ field: "metadata.credit", size: 50 }], expect.any(AbortSignal), undefined,
    );
    expect(params.query).toBe(query);
  });

  it("keeps literal-only queries on the warm-cache fast path", async () => {
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations");
    const resolver = buildTypeaheadFields(dataSource,
      () => ({ fields: { "metadata.credit": { buckets: [{ key: "Cached", count: 7 }], total: 7 } } }),
      () => ({ query: '"literal credit:inside text"' }),
    ).find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    expect(await resolver("")).toEqual([{ value: "Cached", count: 7 }]);
    expect(aggregation).not.toHaveBeenCalled();
  });

  it("propagates the signal and keeps aggregation rejection quietly absent", async () => {
    const dataSource = new MockDataSource(0);
    const failure = new Error("cancelled");
    failure.name = "AbortError";
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockRejectedValue(failure);
    const signal = new AbortController().signal;
    const resolver = buildTypeaheadFields(dataSource, undefined, () => ({ query: "city:London credit:" }))
      .find((field) => field.fieldName === "credit")!.resolver;
    if (typeof resolver !== "function") throw new Error("Expected credit resolver");
    expect(await resolver("", signal)).toEqual([]);
    expect(aggregation).toHaveBeenCalledExactlyOnceWith(
      { query: "city:London" }, [{ field: "metadata.credit", size: 50 }], expect.any(AbortSignal), undefined,
    );
  });

  it.each([
    ['"literal  credit:inside   text" "fileMetadata.xmp.synthetic:struct.leaf[1]":"Synthetic Value"', '"literal  credit:inside   text"'],
    ['"fileMetadata.xmp.synthetic:struct.leaf[1]":first "literal  words" -"fileMetadata.xmp.synthetic:struct.leaf[1]":second city:London', '"literal  words" city:London'],
    ['city:London "fileMetadata.xmp.synthetic:struct.leaf[1]":"unfinished', 'city:London'],
    ['"unfinished fileMetadata.xmp.synthetic:struct.leaf[1]:inside', '"unfinished fileMetadata.xmp.synthetic:struct.leaf[1]:inside'],
  ])("preserves quoted deep-field scope in %s", async (query, expected) => {
    const field = "fileMetadata.xmp.synthetic:struct.leaf[1]";
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockResolvedValue({
      fields: { [field]: { buckets: [{ key: "Scoped value", count: 2 }], total: 2 } },
    });
    const signal = new AbortController().signal;
    const params: SearchParams = { query, nonFree: "true" };
    expect(await buildDynamicFieldFallback(dataSource, () => params)(field, "Scoped", signal))
      .toEqual([{ value: "Scoped value", count: 2, label: undefined }]);
    expect(aggregation).toHaveBeenCalledExactlyOnceWith(
      { ...params, query: expected }, [{ field, size: 50 }], expect.any(AbortSignal), undefined,
    );
    expect(params.query).toBe(query);
  });
});

describe("stripFieldFromQuery / queryContainsField", () => {
  it("strips a field with a value", () => {
    expect(stripFieldFromQuery("credit", "credit:Getty")).toBe("");
  });

  it("strips a field with NO value at all (regression repro — right after accepting a key suggestion)", () => {
    // Bug: selecting "credit" from the key-suggestion dropdown inserts
    // "credit:" with nothing typed after the colon yet. The old regex
    // required \S+ (one or more) after the colon, so it never matched a
    // valueless chip — the chip was never stripped, and "credit:" itself
    // got used as a literal free-text filter, matching ~0 documents.
    expect(stripFieldFromQuery("credit", "credit:")).toBe("");
  });

  it("queryContainsField detects a field with no value at all", () => {
    expect(queryContainsField("credit", "credit:")).toBe(true);
  });

  it("strips a no-value field from a longer query, keeping the rest", () => {
    expect(stripFieldFromQuery("credit", "cats credit: dogs")).toBe("cats dogs");
  });
});

describe("buildDynamicFieldFallback", () => {
  it("reuses completed own-chip-excluded buckets without mixing fields or rights", async () => {
    const dataSource = new MockDataSource(0);
    const aggregation = vi.spyOn(dataSource, "getAggregations").mockImplementation(async (_params, fields) => ({
      fields: Object.fromEntries(fields.map(({ field }) => [field, {
        buckets: [{ key: "Alpha", count: 9 }, { key: "Beta", count: 4 }], total: 13,
      }])),
    }));
    let params: SearchParams = { query: "city:London fileMetadata.synthetic:A", nonFree: "true" };
    const fallback = buildDynamicFieldFallback(dataSource, () => params);
    expect(await fallback("fileMetadata.synthetic", "A")).toEqual([{ value: "Alpha", count: 9, label: undefined }]);
    params = { ...params, query: "city:London fileMetadata.synthetic:B" };
    expect(await fallback("fileMetadata.synthetic", "B")).toEqual([{ value: "Beta", count: 4, label: undefined }]);
    expect(aggregation).toHaveBeenCalledTimes(1);
    params = { ...params, nonFree: "false" };
    await fallback("fileMetadata.synthetic", "");
    await fallback("fileMetadata.other", "");
    expect(aggregation).toHaveBeenCalledTimes(3);
    params = { ...params, nonFree: "true" };
    await fallback("fileMetadata.synthetic", "");
    expect(aggregation).toHaveBeenCalledTimes(3);
  });

  it("strips the field's own chip from the query before scoping the aggregation", async () => {
    // Bug repro: typing a value into a dynamic field's chip makes it a live,
    // committed query filter. Without stripping it first, the aggregation
    // used to suggest values for a field ends up scoped by the very value
    // the user is still typing/editing — confirmed live against real TEST
    // data typing "fileMetadata.xmp.dc:subject":London, then editing it.
    let receivedQuery: string | undefined;
    class RecordingDataSource extends MockDataSource {
      async getAggregations(
        params: SearchParams,
        fields: AggregationRequest[],
        _signal?: AbortSignal,
        _isFilters?: FilterAggRequest[],
        _usageFilters?: UsageFilterAggRequest[],
      ): Promise<AggregationsResult> {
        receivedQuery = params.query;
        const [{ field }] = fields;
        return {
          fields: {
            [field]: {
              buckets: [{ key: "London", count: 5 }, { key: "Leeds", count: 2 }],
              total: 7,
            },
          },
        };
      }
    }

    const dataSource = new RecordingDataSource(10);
    const fallback = buildDynamicFieldFallback(dataSource, () => ({
      query: 'credit:Getty "fileMetadata.xmp.dc:subject":Lon',
    }));

    const suggestions = await fallback("fileMetadata.xmp.dc:subject", "Lon");

    expect(receivedQuery).toBe("credit:Getty");
    expect(suggestions).toEqual([{ value: "London", count: 5 }]);
  });

  it("returns undefined when the field has no aggregatable data", async () => {
    class EmptyDataSource extends MockDataSource {
      async getAggregations(): Promise<AggregationsResult> {
        return { fields: {} };
      }
    }

    const fallback = buildDynamicFieldFallback(new EmptyDataSource(10), () => ({}));
    const suggestions = await fallback("fileMetadata.xmp.dc:subject", "");

    expect(suggestions).toBeUndefined();
  });
});
