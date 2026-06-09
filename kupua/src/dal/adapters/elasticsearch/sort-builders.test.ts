/**
 * Tests for the ES sort clause builder.
 *
 * These tests validate:
 * - Short alias expansion (taken → metadata.dateTaken, etc.)
 * - Universal uploadTime fallback (injected before id tiebreaker)
 * - Direction-aware fallback (date sorts inherit primary direction;
 *   keyword/numeric sorts always get uploadTime desc)
 * - Deduplication (uploadTime not doubled when already in chain)
 * - Deterministic id tiebreaker (always last)
 */

import { describe, it, expect } from "vitest";
import { buildSortClause, SORT_FIELD_EXTRACTORS } from "./sort-builders";

describe("buildSortClause", () => {
  // -----------------------------------------------------------------------
  // Default (no orderBy)
  // -----------------------------------------------------------------------

  it("returns default sort with tiebreaker when no orderBy", () => {
    const result = buildSortClause();
    expect(result).toEqual([{ uploadTime: "desc" }, { id: "asc" }]);
  });

  it("returns default sort with tiebreaker for undefined", () => {
    const result = buildSortClause(undefined);
    expect(result).toEqual([{ uploadTime: "desc" }, { id: "asc" }]);
  });

  // -----------------------------------------------------------------------
  // uploadTime (primary is uploadTime → no fallback needed, dedup)
  // -----------------------------------------------------------------------

  it("does not duplicate uploadTime when it is the primary sort (desc)", () => {
    const result = buildSortClause("-uploadTime");
    expect(result).toEqual([{ uploadTime: "desc" }, { id: "asc" }]);
  });

  it("does not duplicate uploadTime when it is the primary sort (asc)", () => {
    const result = buildSortClause("uploadTime");
    expect(result).toEqual([{ uploadTime: "asc" }, { id: "asc" }]);
  });

  // -----------------------------------------------------------------------
  // Date sorts — uploadTime fallback inherits primary direction
  // -----------------------------------------------------------------------

  it("expands 'taken' alias with uploadTime fallback inheriting asc direction", () => {
    // taken → metadata.dateTaken (asc). Date sort → fallback inherits asc.
    const result = buildSortClause("taken");
    expect(result).toEqual([
      { "metadata.dateTaken": "asc" },
      { uploadTime: "asc" },
      { id: "asc" },
    ]);
  });

  it("expands '-taken' alias with uploadTime fallback inheriting desc direction", () => {
    // -taken → metadata.dateTaken (desc). Date sort → fallback inherits desc.
    const result = buildSortClause("-taken");
    expect(result).toEqual([
      { "metadata.dateTaken": "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("lastModified desc gets uploadTime desc fallback", () => {
    const result = buildSortClause("-lastModified");
    expect(result).toEqual([
      { lastModified: "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("lastModified asc gets uploadTime asc fallback", () => {
    const result = buildSortClause("lastModified");
    expect(result).toEqual([
      { lastModified: "asc" },
      { uploadTime: "asc" },
      { id: "asc" },
    ]);
  });

  // -----------------------------------------------------------------------
  // Keyword/numeric sorts — uploadTime fallback always desc
  // -----------------------------------------------------------------------

  it("expands 'credit' alias with uploadTime desc fallback", () => {
    const result = buildSortClause("-credit");
    expect(result).toEqual([
      { "metadata.credit": "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'source' alias (asc) with uploadTime desc fallback", () => {
    const result = buildSortClause("source");
    expect(result).toEqual([
      { "metadata.source": "asc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'imageType' alias with uploadTime desc fallback", () => {
    const result = buildSortClause("-imageType");
    expect(result).toEqual([
      { "metadata.imageType": "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'category' alias with uploadTime desc fallback", () => {
    const result = buildSortClause("category");
    expect(result).toEqual([
      { "usageRights.category": "asc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'mimeType' alias with uploadTime desc fallback", () => {
    const result = buildSortClause("-mimeType");
    expect(result).toEqual([
      { "source.mimeType": "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'width' alias with uploadTime desc fallback", () => {
    const result = buildSortClause("-width");
    expect(result).toEqual([
      { "source.dimensions.width": "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'height' alias with uploadTime desc fallback", () => {
    const result = buildSortClause("height");
    expect(result).toEqual([
      { "source.dimensions.height": "asc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  // -----------------------------------------------------------------------
  // Multi-sort — uploadTime dedup + direction from primary
  // -----------------------------------------------------------------------

  it("multi-sort with uploadTime already present does not duplicate it", () => {
    const result = buildSortClause("-uploadTime,-credit");
    expect(result).toEqual([
      { uploadTime: "desc" },
      { "metadata.credit": "desc" },
      { id: "asc" },
    ]);
  });

  it("multi-sort date primary + keyword secondary: fallback inherits primary direction", () => {
    const result = buildSortClause("-lastModified,credit");
    expect(result).toEqual([
      { lastModified: "desc" },
      { "metadata.credit": "asc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("multi-sort keyword primary + date secondary: fallback is always desc", () => {
    const result = buildSortClause("credit,-taken");
    expect(result).toEqual([
      { "metadata.credit": "asc" },
      { "metadata.dateTaken": "desc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("does not duplicate tiebreaker if id is already the last field", () => {
    const result = buildSortClause("id");
    // id is in the chain → no duplicate id. uploadTime fallback is appended
    // after id (since the code appends uploadTime then id, and id dedup
    // skips the second push). Result ordering is technically suboptimal
    // (uploadTime after the unique id is a no-op) but harmless — nobody
    // sorts by id in practice.
    expect(result).toEqual([{ id: "asc" }, { uploadTime: "desc" }]);
  });

  it("tiebreaker is always the last element (except when id is primary)", () => {
    const cases: (string | undefined)[] = [
      undefined,
      "-uploadTime",
      "uploadTime",
      "-taken",
      "taken",
      "-credit",
      "-width",
      "-height",
      "-uploadTime,-credit",
      "-lastModified",
    ];

    for (const orderBy of cases) {
      const result = buildSortClause(orderBy);
      const last = result[result.length - 1];
      expect(last).toEqual({ id: "asc" });
    }
  });

  it("uploadTime fallback is always present (except when uploadTime is primary)", () => {
    const nonUploadTimeSorts = [
      "-taken", "taken", "-credit", "credit",
      "-lastModified", "lastModified", "-width", "height",
    ];

    for (const orderBy of nonUploadTimeSorts) {
      const result = buildSortClause(orderBy);
      const hasUploadTime = result.some((c) => "uploadTime" in c);
      expect(hasUploadTime).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Special array-field sorts: dateAddedToCollection and usagesDateAdded
  // -----------------------------------------------------------------------

  it("-dateAddedToCollection produces nested sort on collections.actionData.date desc", () => {
    const result = buildSortClause("-dateAddedToCollection");
    expect(result).toEqual([
      { "collections.actionData.date": { order: "desc", missing: "_last" } },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("dateAddedToCollection produces nested sort on collections.actionData.date asc", () => {
    const result = buildSortClause("dateAddedToCollection");
    expect(result).toEqual([
      { "collections.actionData.date": { order: "asc", missing: "_last" } },
      { uploadTime: "asc" },
      { id: "asc" },
    ]);
  });

  it("-usagesDateAdded produces nested sort on usages.dateAdded desc with mode:max", () => {
    const result = buildSortClause("-usagesDateAdded");
    expect(result).toEqual([
      { "usages.dateAdded": { order: "desc", mode: "max", nested: { path: "usages" }, missing: "_last" } },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("usagesDateAdded (asc) produces nested sort on usages.dateAdded asc with mode:max", () => {
    const result = buildSortClause("usagesDateAdded");
    expect(result).toEqual([
      { "usages.dateAdded": { order: "asc", mode: "max", nested: { path: "usages" }, missing: "_last" } },
      { uploadTime: "asc" },
      { id: "asc" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// SORT_FIELD_EXTRACTORS — array-max extractor functions
// These extractors mirror the ES mode:"max" nested sort semantics so that
// cursor values computed client-side match what ES stores as sort values.
// ---------------------------------------------------------------------------

const MINIMAL_IMAGE = {
  id: "img-test",
  uploadTime: "2026-01-01T00:00:00Z",
  uploadedBy: "test",
  source: { mimeType: "image/jpeg" as const, dimensions: { width: 100, height: 100 } },
  metadata: {},
};

describe("SORT_FIELD_EXTRACTORS", () => {
  describe("usages.dateAdded", () => {
    const extract = SORT_FIELD_EXTRACTORS["usages.dateAdded"];

    it("returns null when usages is undefined", () => {
      expect(extract({ ...MINIMAL_IMAGE })).toBeNull();
    });

    it("returns null when usages array is empty", () => {
      expect(extract({ ...MINIMAL_IMAGE, usages: [] })).toBeNull();
    });

    it("returns null when no usage has a dateAdded", () => {
      const img = {
        ...MINIMAL_IMAGE,
        usages: [{ id: "u1", platform: "digital" as const, status: "published" as const, media: "image", lastModified: "2026-01-01T00:00:00Z" }],
      };
      expect(extract(img)).toBeNull();
    });

    it("returns the single dateAdded when only one usage", () => {
      const img = {
        ...MINIMAL_IMAGE,
        usages: [{ id: "u1", platform: "digital" as const, status: "published" as const, media: "image", lastModified: "2026-01-01T00:00:00Z", dateAdded: "2026-03-15T12:00:00Z" }],
      };
      expect(extract(img)).toBe("2026-03-15T12:00:00Z");
    });

    it("returns the maximum dateAdded across multiple usages", () => {
      const img = {
        ...MINIMAL_IMAGE,
        usages: [
          { id: "u1", platform: "digital" as const, status: "published" as const, media: "image", lastModified: "2026-01-01T00:00:00Z", dateAdded: "2026-01-01T00:00:00Z" },
          { id: "u2", platform: "print" as const,   status: "published" as const, media: "image", lastModified: "2026-01-01T00:00:00Z", dateAdded: "2026-03-20T08:00:00Z" },
          { id: "u3", platform: "digital" as const, status: "removed" as const,   media: "image", lastModified: "2026-01-01T00:00:00Z", dateAdded: "2026-02-10T00:00:00Z" },
        ],
      };
      // "2026-03-20" is the latest — lexicographic ISO comparison is correct for dates
      expect(extract(img)).toBe("2026-03-20T08:00:00Z");
    });

    it("ignores usages without dateAdded when computing the max", () => {
      const img = {
        ...MINIMAL_IMAGE,
        usages: [
          { id: "u1", platform: "digital" as const, status: "published" as const, media: "image", lastModified: "2026-01-01T00:00:00Z", dateAdded: "2026-02-01T00:00:00Z" },
          { id: "u2", platform: "print" as const,   status: "published" as const, media: "image", lastModified: "2026-01-01T00:00:00Z" },
        ],
      };
      expect(extract(img)).toBe("2026-02-01T00:00:00Z");
    });
  });

  describe("collections.actionData.date", () => {
    const extract = SORT_FIELD_EXTRACTORS["collections.actionData.date"];

    it("returns null when collections is undefined", () => {
      expect(extract({ ...MINIMAL_IMAGE })).toBeNull();
    });

    it("returns null when collections array is empty", () => {
      expect(extract({ ...MINIMAL_IMAGE, collections: [] })).toBeNull();
    });

    it("returns null when no collection has actionData.date", () => {
      const img = {
        ...MINIMAL_IMAGE,
        collections: [{ path: ["news"] as string[], pathId: "news", description: "", actionData: { author: "alice" } }],
      };
      expect(extract(img)).toBeNull();
    });

    it("returns the maximum actionData.date across multiple collections", () => {
      const img = {
        ...MINIMAL_IMAGE,
        collections: [
          { path: ["sports"] as string[], pathId: "sports", description: "", actionData: { author: "alice", date: "2025-06-01T00:00:00Z" } },
          { path: ["news"]   as string[], pathId: "news",   description: "", actionData: { author: "bob",   date: "2026-01-20T00:00:00Z" } },
        ],
      };
      expect(extract(img)).toBe("2026-01-20T00:00:00Z");
    });
  });
});
