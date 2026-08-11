import { describe, it, expect } from "vitest";
import { buildDynamicFieldFallback, stripFieldFromQuery, queryContainsField } from "./typeahead-fields";
import { MockDataSource } from "@/dal/mock-data-source";
import type {
  SearchParams,
  AggregationRequest,
  AggregationsResult,
  FilterAggRequest,
  UsageFilterAggRequest,
} from "@/dal";

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
