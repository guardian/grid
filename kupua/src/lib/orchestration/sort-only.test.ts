/**
 * Tests for the sort-only change detection logic from useUrlSearchSync.ts.
 *
 * The inline `isSortOnly` computation is replicated here as a pure helper so
 * it can be tested without spinning up the full React hook environment.
 *
 * Audit reference: bug #18 — "sort-only misclassification on key-removal"
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Pure helper — mirrors the inline computation in useUrlSearchSync.ts lines
// 152-158 exactly. Any change to the production code must be reflected here.
// ---------------------------------------------------------------------------

function computeIsSortOnly(
  prev: Record<string, unknown>,
  searchOnly: Record<string, unknown>,
  prevSerialized: string
): boolean {
  return (
    prevSerialized !== "" && // not the first search
    searchOnly.orderBy !== prev.orderBy &&
    Object.keys({ ...prev, ...searchOnly }).every(
      (k) => k === "orderBy" || searchOnly[k] === prev[k]
    )
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isSortOnly detection (audit #18)", () => {
  // -------------------------------------------------------------------------
  // True sort-only: only orderBy changed — these MUST be classified as sort-only
  // -------------------------------------------------------------------------

  it("classifies as sort-only when only orderBy changed (minimal objects)", () => {
    const prev = { orderBy: "date" };
    const searchOnly = { orderBy: "credit" };
    expect(computeIsSortOnly(prev, searchOnly, '{"orderBy":"date"}')).toBe(true);
  });

  it("classifies as sort-only when only orderBy changed (with unrelated filter stable)", () => {
    const prev = { orderBy: "date", query: "cats" };
    const searchOnly = { orderBy: "credit", query: "cats" };
    expect(computeIsSortOnly(prev, searchOnly, '{"orderBy":"date","query":"cats"}')).toBe(true);
  });

  it("classifies as sort-only when only orderBy changed (all schema keys with undefined)", () => {
    // Scenario: TanStack Router + Zod v4 returns ALL schema keys, absent ones as undefined.
    // Both prev and searchOnly include all keys; only orderBy differs.
    const allUndefined = {
      query: undefined, ids: undefined, since: undefined, until: undefined,
      nonFree: undefined, payType: undefined, uploadedBy: undefined,
      useAISearch: undefined, dateField: undefined, takenSince: undefined,
      takenUntil: undefined, modifiedSince: undefined, modifiedUntil: undefined,
      hasRightsAcquired: undefined, hasCrops: undefined,
      syndicationStatus: undefined, persisted: undefined,
    };
    const prev = { ...allUndefined, orderBy: "date" };
    const searchOnly = { ...allUndefined, orderBy: "credit" };
    expect(computeIsSortOnly(prev, searchOnly, '{"orderBy":"date"}')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // NOT sort-only: key removed — audit #18 scenario
  // These MUST NOT be classified as sort-only (the current bug claim)
  // -------------------------------------------------------------------------

  it("does NOT classify as sort-only when filter key is removed alongside sort change (minimal objects)", () => {
    // Audit scenario: prev = {orderBy:"date", query:"X"}, next = {orderBy:"credit"} (query cleared)
    const prev = { orderBy: "date", query: "cats" };
    const searchOnly = { orderBy: "credit" }; // query key absent
    expect(
      computeIsSortOnly(prev, searchOnly, '{"orderBy":"date","query":"cats"}')
    ).toBe(false);
  });

  it("does NOT classify as sort-only when filter cleared (key present→undefined in all-keys object)", () => {
    // Scenario where Zod produces all keys: filter was "true", now cleared to undefined.
    const allUndefined = {
      ids: undefined, since: undefined, until: undefined,
      payType: undefined, uploadedBy: undefined, useAISearch: undefined,
      dateField: undefined, takenSince: undefined, takenUntil: undefined,
      modifiedSince: undefined, modifiedUntil: undefined, hasRightsAcquired: undefined,
      hasCrops: undefined, syndicationStatus: undefined, persisted: undefined,
    };
    const prev = { ...allUndefined, query: "cats", orderBy: "date", nonFree: undefined };
    const searchOnly = { ...allUndefined, query: undefined, orderBy: "credit", nonFree: undefined };
    // query was "cats" in prev, undefined in searchOnly — key-removal scenario
    expect(
      computeIsSortOnly(prev, searchOnly, '{"orderBy":"date","query":"cats"}')
    ).toBe(false);
  });

  it("does NOT classify as sort-only when nonFree is cleared alongside sort change", () => {
    const prev = { orderBy: "date", nonFree: "true" };
    const searchOnly = { orderBy: "credit" }; // nonFree cleared
    expect(
      computeIsSortOnly(prev, searchOnly, '{"orderBy":"date","nonFree":"true"}')
    ).toBe(false);
  });

  it("does NOT classify as sort-only when a filter key is ADDED alongside sort change", () => {
    // Adding a new key is also a non-sort-only change
    const prev = { orderBy: "date" };
    const searchOnly = { orderBy: "credit", query: "cats" }; // query added
    expect(
      computeIsSortOnly(prev, searchOnly, '{"orderBy":"date"}')
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("returns false when prevSerialized is empty (first search)", () => {
    const prev = {};
    const searchOnly = { orderBy: "credit" };
    expect(computeIsSortOnly(prev, searchOnly, "")).toBe(false);
  });

  it("returns false when orderBy did NOT change (same sort, filter changed)", () => {
    const prev = { orderBy: "date", query: "cats" };
    const searchOnly = { orderBy: "date", query: "dogs" };
    expect(
      computeIsSortOnly(prev, searchOnly, '{"orderBy":"date","query":"cats"}')
    ).toBe(false);
  });

  it("handles both prev and searchOnly having undefined for the same key (truly no change)", () => {
    // Both have undefined for "query" — this is a genuine sort-only change
    const prev = { orderBy: "date", query: undefined, nonFree: "true" };
    const searchOnly = { orderBy: "credit", query: undefined, nonFree: "true" };
    expect(
      computeIsSortOnly(prev, searchOnly, '{"orderBy":"date","nonFree":"true"}')
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // The specific key-in-prev-with-undefined scenario the audit describes:
  // "key missing from searchOnly but present in prev (with undefined value)"
  // -------------------------------------------------------------------------

  it("does NOT misclassify when prev has key with undefined value but searchOnly lacks the key", () => {
    // This is the exact audit claim: a key present in prev (as undefined)
    // but missing from searchOnly. With the current check, both evaluate to
    // undefined, making them "equal" — is this a misclassification?
    //
    // Answer: NO. If prev[k] = undefined (filter was NOT set in prev),
    // and the key is absent from searchOnly (filter is STILL not set),
    // then the filter genuinely hasn't changed. isSortOnly = true is CORRECT.
    const prev = { orderBy: "date", query: undefined }; // query present but undefined
    const searchOnly = { orderBy: "credit" };            // query absent
    // Both represent "no query filter" → truly sort-only
    expect(
      computeIsSortOnly(prev, searchOnly, '{"orderBy":"date"}')
    ).toBe(true);
  });
});
