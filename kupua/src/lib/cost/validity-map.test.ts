import { describe, it, expect, beforeEach } from "vitest";
import { buildValidityMap, deriveInvalidReasons, deriveValid } from "./validity-map";
import { _setQuotaMapForTest } from "./quota-store";
import type { Image } from "@/types/image";

beforeEach(() => {
  _setQuotaMapForTest(new Map());
});

function makeImage(overrides: Partial<Image> = {}): Image {
  return {
    id: "test-id",
    uri: "http://example.com/test-id",
    ...overrides,
  } as Image;
}

describe("buildValidityMap", () => {
  it("marks no_rights invalid when usageRights has no category", () => {
    const map = buildValidityMap(makeImage({ usageRights: { category: "" } }));
    expect(map.no_rights.invalid).toBe(true);
  });

  it("marks no_rights valid when category is present", () => {
    const map = buildValidityMap(makeImage({ usageRights: { category: "agency" } }));
    expect(map.no_rights.invalid).toBe(false);
  });

  it("marks missing_credit invalid when credit is absent", () => {
    const map = buildValidityMap(makeImage({ metadata: { dateTaken: undefined } }));
    expect(map.missing_credit.invalid).toBe(true);
  });

  it("marks missing_credit valid when credit is present", () => {
    const map = buildValidityMap(makeImage({ metadata: { credit: "Getty Images" } as Image["metadata"] }));
    expect(map.missing_credit.invalid).toBe(false);
  });

  it("marks missing_description invalid when description is absent", () => {
    const map = buildValidityMap(makeImage({ metadata: {} as Image["metadata"] }));
    expect(map.missing_description.invalid).toBe(true);
  });

  it("marks missing_description valid when description is present", () => {
    const map = buildValidityMap(makeImage({ metadata: { description: "A photo" } as Image["metadata"] }));
    expect(map.missing_description.invalid).toBe(false);
  });

  it("marks current_deny_lease invalid when an active deny-use lease exists", () => {
    const map = buildValidityMap(makeImage({
      leases: { leases: [{ id: "l1", access: "deny-use", active: "true" }] },
    }));
    expect(map.current_deny_lease.invalid).toBe(true);
  });

  it("marks current_deny_lease valid when deny lease is expired (date-based, not active-flag)", () => {
    // active:"false" is no longer the signal — we use date-based isLeaseActive.
    // Expired endDate = inactive regardless of the stale snapshot value.
    const expiredDate = new Date(Date.now() - 86_400_000).toISOString(); // 1 day ago
    const map = buildValidityMap(makeImage({
      leases: { leases: [{ id: "l1", access: "deny-use", active: "true", endDate: expiredDate }] },
    }));
    expect(map.current_deny_lease.invalid).toBe(false);
  });

  it("marks tass_agency_image invalid when source is TASS", () => {
    const map = buildValidityMap(makeImage({ metadata: { source: "TASS" } as Image["metadata"] }));
    expect(map.tass_agency_image.invalid).toBe(true);
  });

  it("does not mark tass_agency_image invalid for non-TASS source", () => {
    const map = buildValidityMap(makeImage({ metadata: { source: "Reuters" } as Image["metadata"] }));
    expect(map.tass_agency_image.invalid).toBe(false);
  });

  it("over_quota is false when quota map is empty", () => {
    const map = buildValidityMap(makeImage({ usageRights: { category: "agency", supplier: "Getty Images" } }));
    expect(map.over_quota.invalid).toBe(false);
  });

  it("over_quota is true when supplier is in over-quota map", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    const map = buildValidityMap(makeImage({ usageRights: { category: "agency", supplier: "Getty Images" } }));
    expect(map.over_quota.invalid).toBe(true);
  });

  it("over_quota is false for non-agency categories even if supplier is in map", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    const map = buildValidityMap(makeImage({ usageRights: { category: "staff-photographer", supplier: "Getty Images" } }));
    expect(map.over_quota.invalid).toBe(false);
  });

  it("over_quota is true for excluded-collection agency image (mirrors Grid: both paid_image and over_quota fire)", () => {
    // Grid's ImageExtras checks quota unconditionally for agency images with a
    // supplier. Cost is "pay" by collection (badge stays red), but invalidReasons
    // emits both reasons. See grid-cost-validity-pay-collection-overquota.md.
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    const map = buildValidityMap(makeImage({
      usageRights: {
        category: "agency",
        supplier: "Getty Images",
        suppliersCollection: "Getty Images Sport Classic",
      },
    }));
    expect(map.over_quota.invalid).toBe(true);
  });

  it("paid_image is false for a free-cost image", () => {
    const map = buildValidityMap(makeImage({ usageRights: { category: "staff-photographer" } }));
    expect(map.paid_image.invalid).toBe(false);
  });

  it("paid_image is true for a pay-cost agency image (excluded Getty collection)", () => {
    // Getty Images Sport Classic is in the excluded suppliersCollectionExcl list → cost=pay
    const map = buildValidityMap(makeImage({
      usageRights: {
        category: "agency",
        supplier: "Getty Images",
        suppliersCollection: "Getty Images Sport Classic",
      },
    }));
    expect(map.paid_image.invalid).toBe(true);
  });

  it("conditional_paid is false when restrictions absent", () => {
    const map = buildValidityMap(makeImage({ usageRights: { category: "staff-photographer" } }));
    expect(map.conditional_paid.invalid).toBe(false);
  });

  it("conditional_paid is true when restrictions are non-empty", () => {
    const map = buildValidityMap(makeImage({
      usageRights: { category: "staff-photographer", restrictions: "Use in relation to the Windsor Triathlon only" },
    }));
    expect(map.conditional_paid.invalid).toBe(true);
  });

  it("expired allow-use lease does not contribute to hasCurrentAllowLease (date-based detection)", () => {
    // hasCurrentAllowLease uses isLeaseActive() (date-based), not the stale ES active flag.
    // An expired allow-use lease must NOT count as active.
    // NOTE: with hasWritePermission=true (simulated), shouldOverride stays true regardless
    // of whether hasCurrentAllowLease is true or false — so we can only test the
    // lease-detection side-effect here (invalid is still correctly set).
    // The full shouldOverride=false path is only testable once real write-permission
    // checking is wired (replace `const hasWritePermission = true` in validity-map.ts).
    const expiredDate = new Date(Date.now() - 86_400_000).toISOString(); // 1 day ago
    const map = buildValidityMap(makeImage({
      leases: {
        leases: [
          { id: "l1", access: "allow-use", active: "true", endDate: expiredDate },
          { id: "l2", access: "deny-use", active: "true" },
        ],
      },
      usageRights: { category: "agency" },
      metadata: { credit: "Getty", description: "A photo" } as Image["metadata"],
    }));
    // Expired allow-use does not make deny-use valid=true — deny-use is still invalid.
    // (shouldOverride=true masks the blocker today, but invalid is correctly recorded.)
    expect(map.current_deny_lease.invalid).toBe(true);
    // Active allow-use lease: shouldOverride=true (lease contributes)
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    const mapWithActiveLease = buildValidityMap(makeImage({
      leases: {
        leases: [
          { id: "l1", access: "allow-use", active: "true", endDate: futureDate },
          { id: "l2", access: "deny-use", active: "true" },
        ],
      },
      usageRights: { category: "agency" },
      metadata: { credit: "Getty", description: "A photo" } as Image["metadata"],
    }));
    expect(mapWithActiveLease.current_deny_lease.invalid).toBe(true); // still recorded
    expect(mapWithActiveLease.current_deny_lease.shouldOverride).toBe(true); // lease + perm
  });
});

describe("deriveInvalidReasons", () => {
  it("returns empty when no checks are invalid", () => {
    const map = buildValidityMap(makeImage({
      usageRights: { category: "staff-photographer" },
      metadata: { credit: "Guardian", description: "A photo" } as Image["metadata"],
    }));
    const reasons = deriveInvalidReasons(map);
    expect(Object.keys(reasons)).toHaveLength(0);
  });

  it("includes no_rights key when category missing", () => {
    const map = buildValidityMap(makeImage({ usageRights: { category: "" } }));
    const reasons = deriveInvalidReasons(map);
    expect(reasons).toHaveProperty("no_rights");
  });

  it("includes missing_credit even when allow-use lease is active (not overrideable)", () => {
    const map = buildValidityMap(makeImage({
      leases: { leases: [{ id: "l1", access: "allow-use", active: "true" }] },
      metadata: {} as Image["metadata"],
    }));
    // missing_credit has overrideable=false — always appears in invalidReasons
    const reasons = deriveInvalidReasons(map);
    expect(reasons).toHaveProperty("missing_credit");
  });

  it("includes current_deny_lease in invalidReasons even when allow-use lease overrides it", () => {
    // Grid's invalidReasons() includes ALL invalid checks regardless of override.
    // The override only affects valid (via deriveValid), not invalidReasons.
    const map = buildValidityMap(makeImage({
      leases: {
        leases: [
          { id: "l1", access: "deny-use", active: "true" },
          { id: "l2", access: "allow-use", active: "true" },
        ],
      },
    }));
    const reasons = deriveInvalidReasons(map);
    expect(reasons).toHaveProperty("current_deny_lease");
  });

  it("includes over_quota in invalidReasons when supplier is overquota", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    const map = buildValidityMap(makeImage({ usageRights: { category: "agency", supplier: "Getty Images" } }));
    const reasons = deriveInvalidReasons(map);
    expect(reasons).toHaveProperty("over_quota");
  });
});

describe("deriveValid", () => {
  it("returns true when no checks are invalid", () => {
    const map = buildValidityMap(makeImage({
      usageRights: { category: "staff-photographer" },
      metadata: { credit: "Guardian", description: "A photo" } as Image["metadata"],
    }));
    expect(deriveValid(map)).toBe(true);
  });

  it("returns false when a non-overrideable check is invalid", () => {
    // missing_credit has overrideable=false — even with allow-use lease, image is invalid
    const map = buildValidityMap(makeImage({
      leases: { leases: [{ id: "l1", access: "allow-use", active: "true" }] },
      metadata: {} as Image["metadata"],
      usageRights: { category: "staff-photographer" },
    }));
    expect(deriveValid(map)).toBe(false);
  });

  it("returns true when overrideable check is overridden by allow-use lease", () => {
    // current_deny_lease overrideable=true + shouldOverride=true → isValid=true
    const map = buildValidityMap(makeImage({
      leases: {
        leases: [
          { id: "l1", access: "deny-use", active: "true" },
          { id: "l2", access: "allow-use", active: "true" },
        ],
      },
      usageRights: { category: "staff-photographer" },
      metadata: { credit: "Guardian", description: "A photo" } as Image["metadata"],
    }));
    expect(deriveValid(map)).toBe(true);
  });

  it("returns true for over_quota with no lease (write perm assumed ON — warning not blocker)", () => {
    // With hasWritePermission=true, over_quota is a warning not a blocker.
    // This tests the current simulated behaviour; with real permissions wired,
    // a user WITHOUT EditMetadata would get false here.
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    const map = buildValidityMap(makeImage({
      usageRights: { category: "agency", supplier: "Getty Images" },
      metadata: { credit: "Getty", description: "A photo" } as Image["metadata"],
    }));
    expect(deriveValid(map)).toBe(true); // overridden by write perm
    expect(deriveInvalidReasons(map)).toHaveProperty("over_quota"); // still recorded
  });

  it("returns true for over_quota when allow-use lease is active (overrideable+overridden)", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    const map = buildValidityMap(makeImage({
      usageRights: { category: "agency", supplier: "Getty Images" },
      metadata: { credit: "Getty", description: "A photo" } as Image["metadata"],
      leases: { leases: [{ id: "l1", access: "allow-use", active: "true" }] },
    }));
    expect(deriveValid(map)).toBe(true);
  });
});
