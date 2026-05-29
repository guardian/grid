import { describe, it, expect } from "vitest";
import { deriveImage } from "./derive-enriched-image";
import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";

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
      expect(enriched.isPotentiallyGraphic).toBeUndefined();
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
        leasesSummary: { currentCount: 2, inactiveCount: 1 },
        persisted: { value: true, reasons: ["archived"] },
        actions: [],
        isPotentiallyGraphic: true,
        syndicationStatus: "sent",
      };
      const enriched = deriveImage(img, overlay);
      expect(enriched.leasesSummary).toEqual({ currentCount: 2, inactiveCount: 1 });
      expect(enriched.persisted).toEqual({ value: true, reasons: ["archived"] });
      expect(enriched.actions).toEqual([]);
      expect(enriched.isPotentiallyGraphic).toBe(true);
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
});
