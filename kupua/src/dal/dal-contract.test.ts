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

  it("search() returns hits array and total ≥ 0", async () => {
    const result = await ds.search({});
    expect(Array.isArray(result.hits)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("search() respects offset/length", async () => {
    const result = await ds.search({ offset: 5, length: 3 });
    expect(result.hits.length).toBeLessThanOrEqual(3);
  });

  it("search() sortValues has same length as hits", async () => {
    const result = await ds.search({});
    expect(result.sortValues).toBeDefined();
    expect(result.sortValues!.length).toBe(result.hits.length);
  });

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




