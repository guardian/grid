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

  it("marks current_deny_lease valid when no deny lease is active", () => {
    const map = buildValidityMap(makeImage({
      leases: { leases: [{ id: "l1", access: "deny-use", active: "false" }] },
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

  it("sets paid_image and conditional_paid to invalid=false (derived by callers)", () => {
    const map = buildValidityMap(makeImage());
    expect(map.paid_image.invalid).toBe(false);
    expect(map.conditional_paid.invalid).toBe(false);
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

  it("returns false for over_quota with no lease (overrideable but not overridden)", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    const map = buildValidityMap(makeImage({
      usageRights: { category: "agency", supplier: "Getty Images" },
      metadata: { credit: "Getty", description: "A photo" } as Image["metadata"],
    }));
    expect(deriveValid(map)).toBe(false);
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
