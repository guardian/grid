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
      { ...params, query: expected || undefined }, [{ field: "metadata.credit", size: 50 }], signal,
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
      { query: "city:London" }, [{ field: "metadata.credit", size: 50 }], signal,
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
      { ...params, query: expected }, [{ field, size: 50 }], signal,
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
