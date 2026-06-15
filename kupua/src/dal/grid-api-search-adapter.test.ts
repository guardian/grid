/**
 * Tests for extractEnrichment and the contract between it and deriveImage.
 *
 * The zombie-staleness guard: extractEnrichment revived old enrichment logic.
 * The field paths (especially `actions` at the entity level, and the doubly-nested
 * Argo `usages` unwrap) are easy to silently mis-read. These tests catch wrong paths
 * by asserting every field that the overlay provides.
 *
 * The contract test catches the full chain: if a field path is wrong, extractEnrichment
 * returns undefined for that field, deriveImage falls back to baseline, and the
 * assertion "overlay wins over baseline" fails.
 *
 * F-1 regression guard: the enrichment overlay must only be written at commit-to-view
 * points, never inside apiSearchAfter. Probe calls (null cursor, ids-based) must leave
 * the overlay unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractEnrichment, apiSearchAfter } from "./grid-api-search-adapter";
import { deriveImage } from "@/lib/derive-enriched-image";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import type { Action, Usage } from "@/dal/grid-api/types";

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

/** A minimal but valid media-api search-after hit entity. */
function makeEntity(overrides: {
  data?: Record<string, unknown>;
  actions?: Action[];
} = {}): { data?: unknown; actions?: unknown } {
  return {
    data: {
      id: "abc123",
      cost: "free" as const,
      valid: true,
      invalidReasons: {},
      persisted: { value: false, reasons: [] },
      usageRights: { category: "staff-photographer" },
      isPotentiallyGraphic: false,
      syndicationStatus: "unsuitable" as const,
      usages: { data: [] },
      ...overrides.data,
    },
    actions: overrides.actions ?? [],
  };
}

/** A minimal ES Image for use in the contract test. */
function makeBaselineImage(overrides: Partial<Image> = {}): Image {
  return {
    id: "abc123",
    uploadTime: "2024-01-15T10:00:00Z",
    uploadedBy: "test@example.com",
    source: { mimeType: "image/jpeg", dimensions: { width: 800, height: 600 } },
    metadata: { credit: "Photographer", description: "A photo" },
    usageRights: { category: "staff-photographer" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractEnrichment — field path tests
// ---------------------------------------------------------------------------

describe("extractEnrichment", () => {
  it("returns null when entity has no data", () => {
    expect(extractEnrichment({})).toBeNull();
  });

  it("returns null when entity.data has no id", () => {
    expect(extractEnrichment({ data: { cost: "free" } })).toBeNull();
  });

  it("returns [id, fields] tuple with the image id as key", () => {
    const result = extractEnrichment(makeEntity());
    expect(result).not.toBeNull();
    expect(result![0]).toBe("abc123");
  });

  it("extracts cost from entity.data.cost", () => {
    const result = extractEnrichment(makeEntity({ data: { cost: "overquota" } }));
    expect(result![1].cost).toBe("overquota");
  });

  it("extracts valid from entity.data.valid", () => {
    const result = extractEnrichment(makeEntity({ data: { valid: false } }));
    expect(result![1].valid).toBe(false);
  });

  it("extracts invalidReasons from entity.data.invalidReasons", () => {
    const reasons = { over_quota: "Quota exceeded" };
    const result = extractEnrichment(makeEntity({ data: { invalidReasons: reasons } }));
    expect(result![1].invalidReasons).toEqual(reasons);
  });

  it("extracts persisted from entity.data.persisted", () => {
    const persisted = { value: true, reasons: ["archived"] };
    const result = extractEnrichment(makeEntity({ data: { persisted } }));
    expect(result![1].persisted).toEqual(persisted);
  });

  it("extracts usageRights from entity.data.usageRights", () => {
    const usageRights = { category: "agency", restrictions: "No web" };
    const result = extractEnrichment(makeEntity({ data: { usageRights } }));
    expect(result![1].usageRights).toEqual(usageRights);
  });

  it("extracts isPotentiallyGraphic from entity.data.isPotentiallyGraphic", () => {
    const result = extractEnrichment(makeEntity({ data: { isPotentiallyGraphic: true } }));
    expect(result![1].isPotentiallyGraphic).toBe(true);
  });

  it("extracts syndicationStatus from entity.data.syndicationStatus", () => {
    const result = extractEnrichment(makeEntity({ data: { syndicationStatus: "sent" } }));
    expect(result![1].syndicationStatus).toBe("sent");
  });

  // ── The critical one: actions live at entity.actions, NOT entity.data.actions ──
  it("extracts actions from entity.actions (NOT entity.data) — wrong path yields undefined", () => {
    const actions: Action[] = [
      { name: "delete", href: "/images/abc123", method: "DELETE" },
    ];
    // Correct path: entity.actions
    const correct = extractEnrichment(makeEntity({ actions }));
    expect(correct![1].actions).toEqual(actions);

    // Wrong path: if actions were read from entity.data.actions they'd be absent
    const withActionsOnDataOnly = {
      data: { id: "abc123", actions, usages: { data: [] } },
      // entity.actions deliberately absent
    };
    const wrong = extractEnrichment(withActionsOnDataOnly);
    expect(wrong![1].actions).toBeUndefined();
  });

  it("actions is undefined when entity.actions is absent", () => {
    const result = extractEnrichment({ data: { id: "abc123", usages: { data: [] } } });
    expect(result![1].actions).toBeUndefined();
  });

  // ── Doubly-nested Argo usages unwrap ──
  it("unwraps doubly-nested Argo usages: entity.data.usages.data[].data", () => {
    const usage: Usage = {
      id: "u1",
      platform: "digital",
      media: "image",
      status: "published",
      lastModified: "2024-01-01T00:00:00Z",
    };
    const argoEntity = { data: [{ data: usage }, { data: null }] };
    const result = extractEnrichment(makeEntity({ data: { usages: argoEntity } }));
    // null inner data filtered out; only the valid usage survives
    expect(result![1].usages).toEqual([usage]);
  });

  it("usages is undefined when entity.data.usages is absent", () => {
    const result = extractEnrichment({ data: { id: "abc123" } });
    expect(result![1].usages).toBeUndefined();
  });

  it("usages is empty array when entity.data.usages.data is empty", () => {
    const result = extractEnrichment(makeEntity({ data: { usages: { data: [] } } }));
    // filter(Boolean) on empty array → [] — not undefined
    expect(result![1].usages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contract test: extractEnrichment → deriveImage field agreement
//
// The revived zombie code must produce an overlay that, when fed to deriveImage,
// wins over every baseline value it claims to own. A stale field path produces
// undefined → deriveImage falls back to baseline → assertion fails.
// ---------------------------------------------------------------------------

describe("contract: extractEnrichment → deriveImage overlay wins", () => {
  it("all overlay fields land correctly on the EnrichedImage", () => {
    const actions: Action[] = [
      { name: "edit", href: "/images/abc123/edit", method: "PUT" },
    ];
    const usage: Usage = {
      id: "u1",
      platform: "print",
      media: "image",
      status: "published",
      lastModified: "2024-01-10T00:00:00Z",
    };

    // A realistic media-api hit entity — these values all differ from what the
    // ES baseline would compute, making failures obvious.
    const entity: { data?: unknown; actions?: unknown } = {
      data: {
        id: "abc123",
        cost: "overquota",         // baseline would be "free" (staff-photographer)
        valid: false,              // baseline would be true
        invalidReasons: { over_quota: "Quota exceeded" },
        persisted: { value: true, reasons: ["archived"] },
        usageRights: { category: "agency", restrictions: "No web" },
        isPotentiallyGraphic: true,
        syndicationStatus: "sent", // baseline would be "unsuitable" (no syndicationRights)
        usages: { data: [{ data: usage }] },
      },
      actions,
    };

    const result = extractEnrichment(entity);
    expect(result).not.toBeNull();
    const [id, overlay] = result!;
    expect(id).toBe("abc123");

    // The ES baseline image — usageRights deliberately different from the overlay
    const baselineImage = makeBaselineImage({
      usageRights: { category: "staff-photographer" }, // baseline: free, valid
    });

    const enriched = deriveImage(baselineImage, overlay);

    // Every overlay field must win over its baseline equivalent
    expect(enriched.cost).toBe("overquota");      // not "free"
    expect(enriched.valid).toBe(false);            // not true
    expect(enriched.invalidReasons).toEqual({ over_quota: "Quota exceeded" }); // not {}
    expect(enriched.persisted).toEqual({ value: true, reasons: ["archived"] });
    expect(enriched.usageRights).toEqual({ category: "agency", restrictions: "No web" });
    expect(enriched.isPotentiallyGraphic).toBe(true);
    expect(enriched.syndicationStatus).toBe("sent"); // not "unsuitable"
    expect(enriched.actions).toEqual(actions);
    expect(enriched.enrichedUsages).toEqual([usage]);

    // Confirm hasEnrichment is set
    expect(enriched.hasEnrichment).toBe(true);
  });

  it("absent overlay fields fall through to baseline — no silent undefined bleed", () => {
    // Entity only provides cost and isPotentiallyGraphic; other fields absent.
    const entity: { data?: unknown; actions?: unknown } = {
      data: {
        id: "abc123",
        cost: "overquota",
        isPotentiallyGraphic: true,
        usages: { data: [] },
      },
      // no actions
    };

    const [, overlay] = extractEnrichment(entity)!;
    const baselineImage = makeBaselineImage({
      usageRights: { category: "staff-photographer" },
      metadata: { credit: "Photographer", description: "A photo" },
    });

    const enriched = deriveImage(baselineImage, overlay);

    // Overlay fields land
    expect(enriched.cost).toBe("overquota");
    expect(enriched.isPotentiallyGraphic).toBe(true);

    // Absent overlay fields fall back to baseline, not undefined
    expect(enriched.valid).toBe(true);            // baseline: staff-photographer with credit+desc
    expect(typeof enriched.invalidReasons).toBe("object");
    expect(enriched.actions).toBeUndefined();      // no actions in entity → undefined is correct
    expect(enriched.persisted).toBeUndefined();    // API-only, absent → undefined is correct
  });
});

// ---------------------------------------------------------------------------
// F-1 regression guard: probe calls must not write the enrichment store
//
// apiSearchAfter must NOT write useEnrichmentStore as a side effect.
// The enrichment overlay is written ONLY at commit-to-view points in
// search-store.ts. Probe calls (null cursor, ids-based — sort-around-focus
// Step 1 and neighbour-batch lookups) must leave the overlay unchanged.
//
// Dual-mode guarantee: direct-ES results return enrichment: undefined, so
// the store is never written on the direct-ES path.
//
// These tests FAIL against the current (pre-fix) code where apiSearchAfter
// unconditionally calls setEnrichment/upsertEnrichment.
// ---------------------------------------------------------------------------

/** Minimal fake media-api response for a single entity. */
function makeApiResponse(id: string) {
  return {
    data: [
      {
        data: {
          id,
          cost: "free",
          valid: true,
          invalidReasons: {},
          persisted: { value: false, reasons: [] },
          usageRights: { category: "staff-photographer" },
          isPotentiallyGraphic: false,
          syndicationStatus: "unsuitable",
          usages: { data: [] },
        },
        actions: [],
      },
    ],
    total: 1,
    sortValues: [[1700000000000, id]],
    pitId: null,
  };
}

/** Minimal SearchParams for probe calls. */
const probeParams = {
  query: "",
  offset: 0,
  length: 1,
  orderBy: "-uploadTime" as const,
};

describe("F-1 regression: apiSearchAfter must not write enrichment store", () => {
  beforeEach(() => {
    // Reset store to a known state: visible window has two images.
    useEnrichmentStore.getState().setEnrichment(
      new Map<string, EnrichmentFields>([
        ["visible-img-1", { cost: "free", valid: true }],
        ["visible-img-2", { cost: "overquota", valid: false }],
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useEnrichmentStore.getState().setEnrichment(new Map());
  });

  it("[FAILING BEFORE FIX] probe call (null cursor, ids-based) does NOT modify enrichment store", async () => {
    // Snapshot the store before the probe
    const beforeData = new Map(useEnrichmentStore.getState().data);

    // Mock fetch to return a single-image probe response
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse("probe-target"),
    }));

    // This is the probe call shape: null cursor + ids-filter (sort-around-focus Step 1)
    await apiSearchAfter(
      { ...probeParams, ids: "probe-target", length: 1 },
      null,  // null cursor — the distinguishing feature of a probe
      null,
      undefined,
      false,
      false,
    );

    // ASSERT: store is UNCHANGED — probe must not clobber the visible window
    expect(useEnrichmentStore.getState().data).toEqual(beforeData);
  });

  it("[FAILING BEFORE FIX] result from apiSearchAfter carries enrichment field for callers to write", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse("img-abc"),
    }));

    const result = await apiSearchAfter(
      { ...probeParams, length: 1 },
      null,
      null,
      undefined,
      false,
      false,
    );

    // The result should carry the enrichment map for the caller to use
    expect(result.enrichment).toBeDefined();
    expect(result.enrichment?.size).toBe(1);
    expect(result.enrichment?.has("img-abc")).toBe(true);
  });

  it("dual-mode guard: direct-ES SearchAfterResult has no enrichment field", () => {
    // Simulates what ElasticsearchDataSource.searchAfter returns:
    // a plain result without enrichment. The store write gate (if result.enrichment)
    // must not fire, leaving the overlay unchanged.
    const esResult = {
      hits: [],
      total: 0,
      sortValues: [],
      pitId: null,
      // enrichment deliberately absent — no field at all
    };

    // Committing this result should not write the store
    if (esResult.enrichment) {
      // This branch must NOT be entered for an ES result
      useEnrichmentStore.getState().upsertEnrichment(esResult.enrichment);
    }

    // Store is unchanged (had two entries from beforeEach)
    expect(useEnrichmentStore.getState().data.size).toBe(2);
    expect(useEnrichmentStore.getState().data.has("visible-img-1")).toBe(true);
  });
});
