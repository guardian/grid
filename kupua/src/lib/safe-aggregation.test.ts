import { describe, it, expect } from "vitest";
import { isolateAggregationFailure } from "./safe-aggregation";

describe("isolateAggregationFailure", () => {
  it("returns the run() result on success", async () => {
    const result = await isolateAggregationFailure(async () => 42, 0);
    expect(result).toBe(42);
  });

  it("returns the fallback when run() throws a generic error", async () => {
    const result = await isolateAggregationFailure(async () => {
      throw new Error("Fielddata is disabled on [metadata.city]");
    }, "fallback");
    expect(result).toBe("fallback");
  });

  it("rethrows AbortError instead of swallowing it", async () => {
    const abort = () =>
      isolateAggregationFailure(async () => {
        throw new DOMException("Aborted", "AbortError");
      }, "fallback");
    await expect(abort()).rejects.toThrow("Aborted");
  });
});
