import { describe, it, expect, beforeEach } from "vitest";
import {
  buildSearchKey,
  extractSortValues,
  storeImageOffset,
  getImageOffset,
} from "./image-offset-cache";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Fixture — same shape as field-registry.test.ts
// ---------------------------------------------------------------------------
const IMAGE: Image = {
  id: "test-img-001",
  uploadTime: "2026-03-20T14:30:00.000Z",
  uploadedBy: "jane.doe@guardian.co.uk",
  lastModified: "2026-03-21T09:15:00.000Z",
  source: {
    mimeType: "image/jpeg",
    dimensions: { width: 4000, height: 3000 },
  },
  metadata: {
    title: "A cat",
    dateTaken: "2026-03-19T10:00:00.000Z",
    credit: "Getty Images",
    source: "Rex Features",
    imageType: "Photograph",
  },
  usageRights: { category: "staff-photographer" },
  uploadInfo: { filename: "cat.jpg" },
};

const SPARSE_IMAGE: Image = {
  id: "sparse-001",
  uploadTime: "2026-01-01T00:00:00Z",
  uploadedBy: "test",
  source: { mimeType: "image/png", dimensions: { width: 100, height: 100 } },
  metadata: {},
};

// ---------------------------------------------------------------------------
// buildSearchKey
// ---------------------------------------------------------------------------
describe("buildSearchKey", () => {
  it("produces deterministic key regardless of param order", () => {
    const a = buildSearchKey({ query: "cats", orderBy: "width" });
    const b = buildSearchKey({ orderBy: "width", query: "cats" });
    expect(a).toBe(b);
  });

  it("strips image and density params", () => {
    const with_ = buildSearchKey({ query: "cats", image: "abc", density: "2" });
    const without = buildSearchKey({ query: "cats" });
    expect(with_).toBe(without);
  });

  it("strips offset param (position within results, not search context)", () => {
    const with_ = buildSearchKey({ query: "cats", offset: 0 });
    const without = buildSearchKey({ query: "cats" });
    expect(with_).toBe(without);
  });

  it("strips internal pagination fields (length, countAll)", () => {
    const with_ = buildSearchKey({ query: "cats", length: 200, countAll: true });
    const without = buildSearchKey({ query: "cats" });
    expect(with_).toBe(without);
  });

  it("strips null and empty-string values", () => {
    const key = buildSearchKey({ query: "cats", orderBy: null, nonFree: "" });
    expect(key).toBe(JSON.stringify([["query", "cats"]]));
  });
});

// ---------------------------------------------------------------------------
// extractSortValues
// ---------------------------------------------------------------------------
describe("extractSortValues", () => {
  it("extracts default sort (uploadTime desc, id asc)", () => {
    const sv = extractSortValues(IMAGE);
    expect(sv).toEqual([Date.parse("2026-03-20T14:30:00.000Z"), "test-img-001"]);
  });

  it("extracts width sort (source.dimensions.width asc, uploadTime desc, id asc)", () => {
    const sv = extractSortValues(IMAGE, "width");
    expect(sv).toEqual([4000, Date.parse("2026-03-20T14:30:00.000Z"), "test-img-001"]);
  });

  it("extracts credit sort (metadata.credit asc, uploadTime desc, id asc)", () => {
    const sv = extractSortValues(IMAGE, "credit");
    expect(sv).toEqual(["Getty Images", Date.parse("2026-03-20T14:30:00.000Z"), "test-img-001"]);
  });

  it("returns null values for missing nested fields", () => {
    // SPARSE_IMAGE has no metadata.dateTaken
    // taken -> metadata.dateTaken, then uploadTime fallback (asc for date sort), id
    const sv = extractSortValues(SPARSE_IMAGE, "taken");
    // dateTaken is missing -> null, uploadTime present (as epoch ms), id present
    expect(sv).toEqual([null, Date.parse("2026-01-01T00:00:00Z"), "sparse-001"]);
  });

  it("always has id as the last value", () => {
    const sv = extractSortValues(IMAGE, "width");
    expect(sv?.[sv.length - 1]).toBe(IMAGE.id);
  });
});

// ---------------------------------------------------------------------------
// sessionStorage round-trip
// ---------------------------------------------------------------------------
describe("storeImageOffset / getImageOffset", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips offset + cursor + searchKey", () => {
    const key = buildSearchKey({ query: "cats", orderBy: "width" });
    const cursor = [4000, "test-img-001"];
    storeImageOffset("img-1", 500, key, cursor);

    const result = getImageOffset("img-1", key);
    expect(result).toEqual({ offset: 500, cursor: [4000, "test-img-001"] });
  });

  it("returns null for mismatched searchKey", () => {
    const key1 = buildSearchKey({ query: "cats" });
    const key2 = buildSearchKey({ query: "dogs" });
    storeImageOffset("img-1", 42, key1, null);

    expect(getImageOffset("img-1", key2)).toBeNull();
  });

  it("returns null for unknown image", () => {
    const key = buildSearchKey({ query: "cats" });
    expect(getImageOffset("nonexistent", key)).toBeNull();
  });

  it("handles null cursor (backward compat with old cache format)", () => {
    const key = buildSearchKey({ query: "cats" });
    storeImageOffset("img-1", 99, key, null);

    const result = getImageOffset("img-1", key);
    expect(result).toEqual({ offset: 99, cursor: null });
  });

  it("handles old cache format without cursor field", () => {
    // Simulate old format stored before cursor was added
    const key = buildSearchKey({ query: "cats" });
    sessionStorage.setItem(
      "kupua:imgOffset:img-old",
      JSON.stringify({ offset: 200, searchKey: key }),
    );

    const result = getImageOffset("img-old", key);
    expect(result).toEqual({ offset: 200, cursor: null });
  });

  it("rejects malformed offset", () => {
    const key = buildSearchKey({ query: "cats" });
    sessionStorage.setItem(
      "kupua:imgOffset:bad",
      JSON.stringify({ offset: "not-a-number", searchKey: key }),
    );
    expect(getImageOffset("bad", key)).toBeNull();
  });

  it("rejects negative offset", () => {
    const key = buildSearchKey({ query: "cats" });
    sessionStorage.setItem(
      "kupua:imgOffset:neg",
      JSON.stringify({ offset: -5, searchKey: key }),
    );
    expect(getImageOffset("neg", key)).toBeNull();
  });
});

