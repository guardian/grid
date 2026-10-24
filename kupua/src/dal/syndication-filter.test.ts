/**
 * Unit tests for buildSyndicationStatusFilter — SY-3 composite query builder.
 *
 * Covers all 5 syndicationStatus values and validates the ES query structure
 * matches the intent of SyndicationFilter.scala. Tests call the exported function
 * directly (no fetch mocking — pure query shape verification).
 *
 * Sources:
 *   - media-api/app/lib/elasticsearch/SyndicationFilter.scala
 *   - kupua/exploration/docs/00 Architecture and philosophy/07-syndication-and-leases.md §4.2
 */

import { describe, it, expect } from "vitest";
import { buildSyndicationStatusFilter } from "./es-adapter";

// ---------------------------------------------------------------------------
// Query-inspection helpers (structural traversal, not deep equality)
// ---------------------------------------------------------------------------

function findInObject(obj: unknown, predicate: (v: unknown) => boolean): boolean {
  if (predicate(obj)) return true;
  if (typeof obj !== "object" || obj === null) return false;
  return Object.values(obj as Record<string, unknown>).some((v) =>
    Array.isArray(v)
      ? v.some((item) => findInObject(item, predicate))
      : findInObject(v, predicate),
  );
}

function hasTerm(obj: unknown, field: string, value: unknown): boolean {
  return findInObject(obj, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const term = (v as Record<string, unknown>).term as Record<string, unknown> | undefined;
    return term?.[field] === value;
  });
}

function hasRange(obj: unknown, field: string, op: string): boolean {
  return findInObject(obj, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const range = (v as Record<string, unknown>).range as Record<string, unknown> | undefined;
    if (!range) return false;
    const fieldClause = range[field] as Record<string, unknown> | undefined;
    return fieldClause != null && op in fieldClause;
  });
}

function hasExistsMustNot(obj: unknown, field: string): boolean {
  return findInObject(obj, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const b = (v as Record<string, unknown>).bool as Record<string, unknown> | undefined;
    if (!b) return false;
    const mn = b.must_not as Record<string, unknown> | undefined;
    return (mn?.exists as Record<string, unknown> | undefined)?.field === field;
  });
}

function hasMustNotTerm(obj: unknown, field: string, value: unknown): boolean {
  return findInObject(obj, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const b = (v as Record<string, unknown>).bool as Record<string, unknown> | undefined;
    if (!b) return false;
    const mustNot = b.must_not as unknown[] | undefined;
    return Array.isArray(mustNot) && mustNot.some((c) => hasTerm(c, field, value));
  });
}

// ---------------------------------------------------------------------------
// 1. Unknown / empty status → null
// ---------------------------------------------------------------------------
describe("buildSyndicationStatusFilter — unknown status", () => {
  it("returns null for unrecognised values", () => {
    expect(buildSyndicationStatusFilter("not-a-status")).toBeNull();
    expect(buildSyndicationStatusFilter("")).toBeNull();
    expect(buildSyndicationStatusFilter("SENT")).toBeNull(); // case-sensitive
  });
});

// ---------------------------------------------------------------------------
// 2. unsuitable
// Mirrors: noRightsAcquired = field absent OR field = false
// ---------------------------------------------------------------------------
describe("buildSyndicationStatusFilter('unsuitable')", () => {
  it("produces a bool.should with minimum_should_match: 1", () => {
    const q = buildSyndicationStatusFilter("unsuitable")!;
    const bool = (q as Record<string, unknown>).bool as Record<string, unknown>;
    expect(Array.isArray(bool.should)).toBe(true);
    expect(bool.minimum_should_match).toBe(1);
  });

  it("includes acquired=false term clause", () => {
    const q = buildSyndicationStatusFilter("unsuitable")!;
    expect(hasTerm(q, "syndicationRights.rights.acquired", false)).toBe(true);
  });

  it("includes must_not exists for rights.acquired (absent = unsuitable)", () => {
    const q = buildSyndicationStatusFilter("unsuitable")!;
    expect(hasExistsMustNot(q, "syndicationRights.rights.acquired")).toBe(true);
  });

  it("does NOT include acquired=true anywhere", () => {
    const q = buildSyndicationStatusFilter("unsuitable")!;
    expect(hasTerm(q, "syndicationRights.rights.acquired", true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. sent
// Mirrors: hasRightsAcquired AND hasAllowLease AND hasSyndicationUsage
// ---------------------------------------------------------------------------
describe("buildSyndicationStatusFilter('sent')", () => {
  it("requires rights acquired", () => {
    expect(hasTerm(buildSyndicationStatusFilter("sent")!, "syndicationRights.rights.acquired", true)).toBe(true);
  });

  it("requires allow-syndication lease", () => {
    expect(hasTerm(buildSyndicationStatusFilter("sent")!, "leases.leases.access", "allow-syndication")).toBe(true);
  });

  it("requires syndication usage via usagesPlatform", () => {
    expect(hasTerm(buildSyndicationStatusFilter("sent")!, "usagesPlatform", "syndication")).toBe(true);
  });

  it("does NOT include deny-syndication", () => {
    expect(hasTerm(buildSyndicationStatusFilter("sent")!, "leases.leases.access", "deny-syndication")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. queued
// Mirrors: hasRightsAcquired AND NOT hasSyndicationUsage AND hasAllowLease
//          AND leaseHasStarted AND syndicationRightsPublished
// ---------------------------------------------------------------------------
describe("buildSyndicationStatusFilter('queued')", () => {
  it("requires rights acquired and allow-syndication lease", () => {
    const q = buildSyndicationStatusFilter("queued")!;
    expect(hasTerm(q, "syndicationRights.rights.acquired", true)).toBe(true);
    expect(hasTerm(q, "leases.leases.access", "allow-syndication")).toBe(true);
  });

  it("must_not syndication usage (images not yet sent)", () => {
    const q = buildSyndicationStatusFilter("queued")!;
    expect(hasMustNotTerm(q, "usagesPlatform", "syndication")).toBe(true);
  });

  it("includes leaseHasStarted: startDate absent OR startDate <= now", () => {
    const q = buildSyndicationStatusFilter("queued")!;
    expect(hasExistsMustNot(q, "leases.leases.startDate")).toBe(true);
    expect(hasRange(q, "leases.leases.startDate", "lte")).toBe(true);
  });

  it("includes syndicationRightsPublished: published absent OR published <= now", () => {
    const q = buildSyndicationStatusFilter("queued")!;
    expect(hasExistsMustNot(q, "syndicationRights.published")).toBe(true);
    expect(hasRange(q, "syndicationRights.published", "lte")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. blocked
// Mirrors: hasRightsAcquired AND hasDenyLease (existence only at query level)
// ---------------------------------------------------------------------------
describe("buildSyndicationStatusFilter('blocked')", () => {
  it("requires rights acquired and deny-syndication lease", () => {
    const q = buildSyndicationStatusFilter("blocked")!;
    expect(hasTerm(q, "syndicationRights.rights.acquired", true)).toBe(true);
    expect(hasTerm(q, "leases.leases.access", "deny-syndication")).toBe(true);
  });

  it("does NOT include endDate range checks (existence-only filter at query level)", () => {
    const q = buildSyndicationStatusFilter("blocked")!;
    expect(hasRange(q, "leases.leases.endDate", "gte")).toBe(false);
    expect(hasRange(q, "leases.leases.endDate", "lte")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. review — no syndicationStartDate (null explicit, mirrors TEST/CODE default)
// Mirrors: hasRightsAcquired AND syndicatableCategory
//          AND NOT hasAllowLease
//          AND NOT (hasDenyLease AND leaseHasNotExpired)
// ---------------------------------------------------------------------------
describe("buildSyndicationStatusFilter('review') — no start date", () => {
  it("requires rights acquired", () => {
    expect(hasTerm(buildSyndicationStatusFilter("review", null)!, "syndicationRights.rights.acquired", true)).toBe(true);
  });

  it("includes syndicatable-category terms filter (staff/contract/commissioned)", () => {
    const q = buildSyndicationStatusFilter("review", null)!;
    expect(
      findInObject(q, (v) => {
        if (typeof v !== "object" || v === null) return false;
        const terms = (v as Record<string, unknown>).terms as Record<string, unknown> | undefined;
        const cats = terms?.["usageRights.category"] as string[] | undefined;
        return (
          Array.isArray(cats) &&
          cats.includes("staff-photographer") &&
          cats.includes("contract-photographer") &&
          cats.includes("commissioned-photographer")
        );
      }),
    ).toBe(true);
  });

  it("must_not include allow-syndication lease", () => {
    expect(hasMustNotTerm(buildSyndicationStatusFilter("review", null)!, "leases.leases.access", "allow-syndication")).toBe(true);
  });

  it("must_not include active deny-syndication (deny lease term inside a must_not)", () => {
    const q = buildSyndicationStatusFilter("review", null)!;
    expect(
      findInObject(q, (v) => {
        if (typeof v !== "object" || v === null) return false;
        const b = (v as Record<string, unknown>).bool as Record<string, unknown> | undefined;
        if (!b) return false;
        const mustNot = b.must_not as unknown[] | undefined;
        if (!Array.isArray(mustNot)) return false;
        return mustNot.some((clause) => hasTerm(clause, "leases.leases.access", "deny-syndication"));
      }),
    ).toBe(true);
  });

  it("includes endDate range for expired-deny-syndication detection (option b)", () => {
    const q = buildSyndicationStatusFilter("review", null)!;
    expect(hasExistsMustNot(q, "leases.leases.endDate")).toBe(true);
    expect(hasRange(q, "leases.leases.endDate", "gte")).toBe(true);
  });

  it("does NOT include uploadTime gate when syndicationStartDate is null", () => {
    expect(hasRange(buildSyndicationStatusFilter("review", null)!, "uploadTime", "gte")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. review — WITH syndicationStartDate (PROD gate)
// Mirrors: SyndicationFilter.scala's `config.syndicationStartDate match { case Some(date) if config.isProd => ... }`
// ---------------------------------------------------------------------------
describe("buildSyndicationStatusFilter('review') — with start date", () => {
  const PROD_CUTOFF = "2018-07-01T00:00:00Z";

  it("includes uploadTime >= startDate outer filter", () => {
    expect(hasRange(buildSyndicationStatusFilter("review", PROD_CUTOFF)!, "uploadTime", "gte")).toBe(true);
  });

  it("the uploadTime gte value matches the configured start date", () => {
    const q = buildSyndicationStatusFilter("review", PROD_CUTOFF)!;
    let found: unknown = undefined;
    findInObject(q, (v) => {
      if (typeof v !== "object" || v === null) return false;
      const range = (v as Record<string, unknown>).range as Record<string, unknown> | undefined;
      const upload = range?.uploadTime as Record<string, unknown> | undefined;
      if (upload?.gte != null) { found = upload.gte; return true; }
      return false;
    });
    expect(found).toBe(PROD_CUTOFF);
  });

  it("still includes rights acquired inside the date gate", () => {
    expect(hasTerm(buildSyndicationStatusFilter("review", PROD_CUTOFF)!, "syndicationRights.rights.acquired", true)).toBe(true);
  });

  it("still includes syndicatable category inside the date gate", () => {
    const q = buildSyndicationStatusFilter("review", PROD_CUTOFF)!;
    expect(
      findInObject(q, (v) => {
        if (typeof v !== "object" || v === null) return false;
        const terms = (v as Record<string, unknown>).terms as Record<string, unknown> | undefined;
        const cats = terms?.["usageRights.category"] as string[] | undefined;
        return Array.isArray(cats) && cats.includes("staff-photographer");
      }),
    ).toBe(true);
  });
});

