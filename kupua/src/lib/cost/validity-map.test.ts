import { describe, it, expect } from "vitest";
import { buildValidityMap, deriveInvalidReasons } from "./validity-map";
import type { Image } from "@/types/image";

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

  it("does not include over_quota key", () => {
    const map = buildValidityMap(makeImage());
    expect(Object.keys(map)).not.toContain("over_quota");
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

  it("overrides missing_credit when allow-use lease is active", () => {
    const map = buildValidityMap(makeImage({
      leases: { leases: [{ id: "l1", access: "allow-use", active: "true" }] },
      metadata: {} as Image["metadata"],
    }));
    // missing_credit is not overrideable (overrideable: false), so allow-lease does NOT suppress it
    const reasons = deriveInvalidReasons(map);
    expect(reasons).toHaveProperty("missing_credit");
  });

  it("suppresses current_deny_lease when allow-use lease is active (overrideable)", () => {
    // active deny-use + active allow-use → shouldOverride=true, current_deny_lease.overrideable=true → suppressed
    const map = buildValidityMap(makeImage({
      leases: {
        leases: [
          { id: "l1", access: "deny-use", active: "true" },
          { id: "l2", access: "allow-use", active: "true" },
        ],
      },
    }));
    const reasons = deriveInvalidReasons(map);
    expect(reasons).not.toHaveProperty("current_deny_lease");
  });
});
