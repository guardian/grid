import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deriveImage } from "./derive-enriched-image";
import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import { calculateCost } from "@/lib/cost/calculate-cost";
import { buildValidityMap, deriveInvalidReasons, deriveValid } from "@/lib/cost/validity-map";
import { calculateSyndicationStatus } from "@/lib/syndication/calculate-syndication-status";
import { _setQuotaMapForTest } from "@/lib/cost/quota-store";
import guardianConfig from "@/lib/cost/guardian-config.json";
import type { GuardianCostConfig } from "@/lib/cost/types";

// Real implementations wrapped in spies; validity-map's own cost import is counted too.
vi.mock("@/lib/cost/calculate-cost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cost/calculate-cost")>();
  return { ...actual, calculateCost: vi.fn(actual.calculateCost) };
});
vi.mock("@/lib/cost/validity-map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cost/validity-map")>();
  return {
    ...actual,
    buildValidityMap: vi.fn(actual.buildValidityMap),
    deriveInvalidReasons: vi.fn(actual.deriveInvalidReasons),
    deriveValid: vi.fn(actual.deriveValid),
  };
});
vi.mock("@/lib/syndication/calculate-syndication-status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/syndication/calculate-syndication-status")>();
  return { ...actual, calculateSyndicationStatus: vi.fn(actual.calculateSyndicationStatus) };
});

// ---------------------------------------------------------------------------
// Minimal Image fixture factory
// ---------------------------------------------------------------------------

function makeImage(overrides: Partial<Image> = {}): Image {
  return {
    id: "test-image-1",
    uploadTime: "2024-01-01T00:00:00Z",
    uploadedBy: "test@example.com",
    source: { mimeType: "image/jpeg", dimensions: { width: 100, height: 100 } },
    metadata: {
      credit: "Test Credit",
      description: "Test description",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deriveImage", () => {
  describe("baseline (no overlay)", () => {
    it("computes cost from usageRights — free category", () => {
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
      });
      const enriched = deriveImage(img, undefined);
      expect(enriched.cost).toBe("free");
      expect(enriched.noRights).toBe(false);
    });

    it("returns pay when no usageRights", () => {
      const img = makeImage({ usageRights: undefined });
      const enriched = deriveImage(img, undefined);
      expect(enriched.cost).toBe("pay");
      expect(enriched.noRights).toBe(true);
    });

    it("returns conditional when restrictions present", () => {
      const img = makeImage({
        usageRights: { category: "staff-photographer", restrictions: "Limited" },
      });
      const enriched = deriveImage(img, undefined);
      expect(enriched.cost).toBe("conditional");
    });

    it("computes validity from image fields", () => {
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
        metadata: { credit: "Photographer", description: "A photo" },
      });
      const enriched = deriveImage(img, undefined);
      expect(enriched.valid).toBe(true);
      expect(Object.keys(enriched.invalidReasons)).toHaveLength(0);
    });

    it("flags no_rights as invalid but valid=true (shouldOverride=true — write perm assumed ON)", () => {
      const img = makeImage({ usageRights: { category: "" } });
      const enriched = deriveImage(img, undefined);
      expect(enriched.valid).toBe(true); // overridden — warning, not blocker
      expect(enriched.invalidReasons).toHaveProperty("no_rights");
    });

    it("flags missing credit", () => {
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
        metadata: { description: "A photo" },
      });
      const enriched = deriveImage(img, undefined);
      expect(enriched.valid).toBe(false);
      expect(enriched.invalidReasons).toHaveProperty("missing_credit");
    });

    it("preserves all original Image fields via spread", () => {
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
        metadata: { title: "My Photo", credit: "Me", description: "Desc" },
      });
      const enriched = deriveImage(img, undefined);
      expect(enriched.id).toBe("test-image-1");
      expect(enriched.uploadTime).toBe("2024-01-01T00:00:00Z");
      expect(enriched.metadata.title).toBe("My Photo");
    });

    it("computes syndicationStatus baseline (no overlay, no syndicationRights → unsuitable)", () => {
      const img = makeImage({ usageRights: { category: "staff-photographer" } });
      const enriched = deriveImage(img, undefined);
      expect(enriched.leasesSummary).toBeUndefined();
      expect(enriched.persisted).toBeUndefined();
      expect(enriched.actions).toBeUndefined();
      // syndicationStatus is now always present — baseline from calculateSyndicationStatus.
      // Fixture has no syndicationRights → unsuitable.
      expect(enriched.syndicationStatus).toBe("unsuitable");
    });

    it("uses image.usages as fallback for enrichedUsages", () => {
      const usages = [
        { id: "u1", platform: "digital", status: "published" },
      ];
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
        usages: usages as Image["usages"],
      });
      const enriched = deriveImage(img, undefined);
      expect(enriched.enrichedUsages).toBe(usages);
    });
  });

  describe("overlay wins", () => {
    it("overlay cost overrides baseline", () => {
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
      });
      const overlay: EnrichmentFields = { cost: "overquota" };
      const enriched = deriveImage(img, overlay);
      expect(enriched.cost).toBe("overquota");
    });

    it("overlay valid overrides baseline", () => {
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
        metadata: { credit: "Yes", description: "Yes" },
      });
      // Baseline would be valid=true, but overlay says false
      const overlay: EnrichmentFields = { valid: false };
      const enriched = deriveImage(img, overlay);
      expect(enriched.valid).toBe(false);
    });

    it("overlay invalidReasons overrides baseline", () => {
      const img = makeImage({ usageRights: { category: "" } });
      // Baseline has no_rights. Overlay replaces with over_quota.
      const overlay: EnrichmentFields = {
        invalidReasons: { over_quota: "Quota exceeded" },
      };
      const enriched = deriveImage(img, overlay);
      expect(enriched.invalidReasons).toEqual({ over_quota: "Quota exceeded" });
      expect(enriched.invalidReasons).not.toHaveProperty("no_rights");
    });

    it("passes through API-only fields from overlay", () => {
      const img = makeImage({ usageRights: { category: "staff-photographer" } });
      const overlay: EnrichmentFields = {
        leasesSummary: { currentCount: 2, inactiveCount: 1, hasActiveAllowLease: false },
        persisted: { value: true, reasons: ["archived"] },
        actions: [],
        syndicationStatus: "sent",
      };
      const enriched = deriveImage(img, overlay);
      expect(enriched.leasesSummary).toEqual({ currentCount: 2, inactiveCount: 1, hasActiveAllowLease: false });
      expect(enriched.persisted).toEqual({ value: true, reasons: ["archived"] });
      expect(enriched.actions).toEqual([]);
      expect(enriched.syndicationStatus).toBe("sent");
    });

    it("overlay usages override image.usages in enrichedUsages", () => {
      const esUsages = [{ id: "u1", platform: "digital", status: "published" }];
      const apiUsages = [{ id: "u2", platform: "print", status: "published" }];
      const img = makeImage({
        usageRights: { category: "staff-photographer" },
        usages: esUsages as Image["usages"],
      });
      const overlay: EnrichmentFields = {
        usages: apiUsages as EnrichmentFields["usages"],
      };
      const enriched = deriveImage(img, overlay);
      expect(enriched.enrichedUsages).toBe(apiUsages);
      // Original usages still on the Image via spread
      expect(enriched.usages).toBe(esUsages);
    });
  });

  describe("noRights flag", () => {
    it("is true when category is empty string", () => {
      const img = makeImage({ usageRights: { category: "" } });
      expect(deriveImage(img, undefined).noRights).toBe(true);
    });

    it("is true when usageRights is undefined", () => {
      const img = makeImage({ usageRights: undefined });
      expect(deriveImage(img, undefined).noRights).toBe(true);
    });

    it("is false when category is present", () => {
      const img = makeImage({ usageRights: { category: "agency" } });
      expect(deriveImage(img, undefined).noRights).toBe(false);
    });

    it("is not affected by overlay — always computed from ES data", () => {
      const img = makeImage({ usageRights: undefined });
      const overlay: EnrichmentFields = {
        usageRights: { category: "staff-photographer" },
      };
      const enriched = deriveImage(img, overlay);
      // noRights is from the ES Image, not the overlay
      expect(enriched.noRights).toBe(true);
    });
  });

  describe("fallback is derived only for fields the overlay does not supply", () => {
    const NOW = Date.parse("2026-06-01T12:00:00Z");
    const DAY = 86_400_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const COST_CONFIG = guardianConfig as GuardianCostConfig;

    const spies = {
      calculateCost: vi.mocked(calculateCost),
      buildValidityMap: vi.mocked(buildValidityMap),
      deriveValid: vi.mocked(deriveValid),
      deriveInvalidReasons: vi.mocked(deriveInvalidReasons),
      calculateSyndicationStatus: vi.mocked(calculateSyndicationStatus),
    };
    const callCounts = () => ({
      calculateCost: spies.calculateCost.mock.calls.length,
      buildValidityMap: spies.buildValidityMap.mock.calls.length,
      deriveValid: spies.deriveValid.mock.calls.length,
      deriveInvalidReasons: spies.deriveInvalidReasons.mock.calls.length,
      calculateSyndicationStatus: spies.calculateSyndicationStatus.mock.calls.length,
    });

    // Local fallback: overquota cost, invalid (missing credit), three reasons, review status.
    const policyImage = () =>
      makeImage({
        usageRights: { category: "agency", supplier: "Getty Images" },
        metadata: { description: "A photo" },
        syndicationRights: { rights: [{ acquired: true }] },
        leases: {
          leases: [
            { id: "deny-use", access: "deny-use" },
            { id: "allow-synd", access: "allow-syndication", endDate: iso(NOW - DAY) },
            { id: "deny-synd", access: "deny-syndication", startDate: iso(NOW + DAY) },
          ],
        },
      });
    // Local fallback: free, valid, no reasons, unsuitable.
    const cleanImage = () =>
      makeImage({ usageRights: { category: "staff-photographer" } });

    /** The pre-change eager merge, built from the same real helpers. */
    function eagerReference(image: Image, overlay: EnrichmentFields | undefined) {
      const map = buildValidityMap(image);
      const result = {
        cost: overlay?.cost ?? calculateCost(image.usageRights, COST_CONFIG),
        valid: overlay?.valid ?? deriveValid(map),
        invalidReasons: overlay?.invalidReasons ?? deriveInvalidReasons(map),
        syndicationStatus: overlay?.syndicationStatus ?? calculateSyndicationStatus(image, Date.now()),
      };
      vi.clearAllMocks();
      return result;
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      _setQuotaMapForTest(new Map([["Getty Images", true]]));
      vi.clearAllMocks();
    });

    afterEach(() => {
      _setQuotaMapForTest(new Map());
      vi.useRealTimers();
    });

    it("a complete overlay triggers no local cost, validity or syndication derivation", () => {
      const overlay: EnrichmentFields = {
        cost: "pay",
        valid: true,
        invalidReasons: {},
        syndicationStatus: "sent",
      };
      const enriched = deriveImage(policyImage(), overlay);

      expect(enriched.cost).toBe("pay");
      expect(enriched.valid).toBe(true);
      expect(enriched.invalidReasons).toBe(overlay.invalidReasons);
      expect(enriched.syndicationStatus).toBe("sent");
      expect(enriched.noRights).toBe(false);
      expect(callCounts()).toEqual({
        calculateCost: 0,
        buildValidityMap: 0,
        deriveValid: 0,
        deriveInvalidReasons: 0,
        calculateSyndicationStatus: 0,
      });
    });

    it("a complete overlay with valid=false and populated reasons also skips derivation", () => {
      const overlay: EnrichmentFields = {
        cost: "overquota",
        valid: false,
        invalidReasons: { over_quota: "Server text" },
        syndicationStatus: "queued",
      };
      const enriched = deriveImage(cleanImage(), overlay);

      expect(enriched.cost).toBe("overquota");
      expect(enriched.valid).toBe(false);
      expect(enriched.invalidReasons).toEqual({ over_quota: "Server text" });
      expect(enriched.syndicationStatus).toBe("queued");
      expect(Object.values(callCounts()).every((n) => n === 0)).toBe(true);
    });

    it("no overlay derives every fallback once, with quota and lease-date inputs", () => {
      const enriched = deriveImage(policyImage(), undefined);

      expect(enriched.cost).toBe("overquota");
      expect(enriched.valid).toBe(false);
      expect(Object.keys(enriched.invalidReasons).sort()).toEqual(
        ["current_deny_lease", "missing_credit", "over_quota"],
      );
      expect(enriched.syndicationStatus).toBe("review");
      // Direct cost plus validity's own internal cost check.
      expect(callCounts()).toEqual({
        calculateCost: 2,
        buildValidityMap: 1,
        deriveValid: 1,
        deriveInvalidReasons: 1,
        calculateSyndicationStatus: 1,
      });
    });

    it("fallback follows the clock and quota state", () => {
      vi.setSystemTime(NOW + 2 * DAY);
      _setQuotaMapForTest(new Map());
      const enriched = deriveImage(policyImage(), { cost: "pay" });

      expect(enriched.cost).toBe("pay");
      expect(enriched.syndicationStatus).toBe("blocked");
      expect(Object.keys(enriched.invalidReasons).sort()).toEqual(
        ["current_deny_lease", "missing_credit"],
      );
      expect(spies.buildValidityMap).toHaveBeenCalledTimes(1);
      // Only validity's internal cost check runs; supplied cost is not recalculated.
      expect(spies.calculateCost).toHaveBeenCalledTimes(1);
    });

    it("fallback uses baseline rights, not overlay rights", () => {
      const enriched = deriveImage(makeImage({ usageRights: undefined }), {
        usageRights: { category: "staff-photographer" },
      });

      expect(enriched.cost).toBe("pay");
      expect(enriched.invalidReasons).toHaveProperty("no_rights");
      expect(spies.calculateCost.mock.calls.every(([rights]) => rights === undefined)).toBe(true);
    });

    type PolicyField = "cost" | "valid" | "invalidReasons" | "syndicationStatus";
    const FIELDS: PolicyField[] = ["cost", "valid", "invalidReasons", "syndicationStatus"];
    const subsets = Array.from({ length: 1 << FIELDS.length }, (_, mask) =>
      FIELDS.filter((_, i) => mask & (1 << i)),
    );
    const cases: [string, () => Image, Required<Pick<EnrichmentFields, PolicyField>>][] = [
      ["policy image", policyImage, { cost: "pay", valid: true, invalidReasons: {}, syndicationStatus: "sent" }],
      [
        "clean image",
        cleanImage,
        { cost: "overquota", valid: false, invalidReasons: { over_quota: "Server text" }, syndicationStatus: "queued" },
      ],
    ];

    for (const [label, makeFixture, full] of cases) {
      for (const supplied of subsets) {
        it(`${label}: supplying [${supplied.join(", ") || "none"}] matches eager output with only missing fields derived`, () => {
          const image = makeFixture();
          const overlay = Object.fromEntries(supplied.map((f) => [f, full[f]])) as EnrichmentFields;
          const expected = eagerReference(image, overlay);

          const enriched = deriveImage(image, overlay);

          expect({
            cost: enriched.cost,
            valid: enriched.valid,
            invalidReasons: enriched.invalidReasons,
            syndicationStatus: enriched.syndicationStatus,
          }).toEqual(expected);
          const has = (f: PolicyField) => supplied.includes(f);
          const needsValidity = !has("valid") || !has("invalidReasons");
          expect(callCounts()).toEqual({
            calculateCost: (has("cost") ? 0 : 1) + (needsValidity ? 1 : 0),
            buildValidityMap: needsValidity ? 1 : 0,
            deriveValid: has("valid") ? 0 : 1,
            deriveInvalidReasons: has("invalidReasons") ? 0 : 1,
            calculateSyndicationStatus: has("syndicationStatus") ? 0 : 1,
          });
        });
      }
    }

    // Wire nulls pass through extraction unchanged, so null must fall back like undefined.
    const nullCases: PolicyField[][] = [
      ["cost"],
      ["valid"],
      ["invalidReasons"],
      ["syndicationStatus"],
      ["valid", "invalidReasons"],
    ];
    for (const nulled of nullCases) {
      it(`explicit null [${nulled.join(", ")}] derives only those fields`, () => {
        const image = policyImage();
        const full = cases[0][2];
        const overlay = Object.fromEntries(
          FIELDS.map((f) => [f, nulled.includes(f) ? null : full[f]]),
        ) as unknown as EnrichmentFields;
        const expected = eagerReference(image, overlay);

        const enriched = deriveImage(image, overlay);

        expect({
          cost: enriched.cost,
          valid: enriched.valid,
          invalidReasons: enriched.invalidReasons,
          syndicationStatus: enriched.syndicationStatus,
        }).toEqual(expected);
        for (const f of nulled) expect(enriched[f]).not.toBeNull();
        const isNull = (f: PolicyField) => nulled.includes(f);
        const needsValidity = isNull("valid") || isNull("invalidReasons");
        expect(callCounts()).toEqual({
          calculateCost: (isNull("cost") ? 1 : 0) + (needsValidity ? 1 : 0),
          buildValidityMap: needsValidity ? 1 : 0,
          deriveValid: isNull("valid") ? 1 : 0,
          deriveInvalidReasons: isNull("invalidReasons") ? 1 : 0,
          calculateSyndicationStatus: isNull("syndicationStatus") ? 1 : 0,
        });
      });
    }
  });
});
