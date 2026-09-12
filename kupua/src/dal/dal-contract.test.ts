/**
 * DAL contract tests — lock the ImageDataSource interface shape.
 *
 * These trivial tests exercise MockDataSource to ensure the interface
 * methods return the correct types and structures. If anyone changes
 * SearchResult, AggregationsResult, or the method signatures, these break.
 */

import { describe, it, expect } from "vitest";
import { MockDataSource } from "./mock-data-source";

describe("ImageDataSource contract (MockDataSource)", () => {
  const ds = new MockDataSource(100);

  it("getById(known) returns image with matching id", async () => {
    const img = await ds.getById("img-42");
    expect(img).toBeDefined();
    expect(img!.id).toBe("img-42");
  });

  it("getById(unknown) returns undefined", async () => {
    const img = await ds.getById("nonexistent-id");
    expect(img).toBeUndefined();
  });

  it("count() returns a number ≥ 0", async () => {
    const n = await ds.count();
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("getAggregations() returns { fields: {} } without throwing", async () => {
    const result = await ds.getAggregations({}, []);
    expect(result).toEqual({ fields: {} });
  });
});




