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
import { getFieldRawValue } from "@/lib/field-registry";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import type { Action, ImageData, Usage } from "@/dal/grid-api/types";
import type { SearchAfterResult } from "./types";

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

function makeCanonicalImage(overrides: Partial<ImageData> = {}): ImageData {
  const id = overrides.id ?? "abc123";
  return {
    id,
    uploadTime: "2024-01-15T10:00:00Z",
    uploadedBy: "fixture-uploader",
    uploadInfo: { filename: "fixture.jpg" },
    identifiers: {},
    source: {
      file: "https://example.com/fixture.jpg",
      secureUrl: "https://example.com/preview.jpg",
      mimeType: "image/jpeg",
      dimensions: { width: 800, height: 600 },
    },
    metadata: { credit: "Effective credit", description: "Effective description" },
    originalMetadata: { credit: "Original credit" },
    usageRights: { category: "staff-photographer" },
    originalUsageRights: {},
    exports: [],
    usages: { uri: `/usages/media/${id}`, data: [] },
    leases: { uri: `/leases/media/${id}`, data: { leases: [] } },
    collections: [],
    userMetadata: {
      uri: `/metadata/${id}`,
      data: {
        archived: { uri: `/metadata/${id}/archived`, data: false },
        labels: {
          uri: `/metadata/${id}/labels`,
          data: [
            { uri: `/metadata/${id}/labels/Priority`, data: "Priority" },
            { uri: `/metadata/${id}/labels/Photo%20desk`, data: "Photo desk" },
          ],
        },
        metadata: {
          uri: `/metadata/${id}/metadata`,
          data: { description: "User edit", keywords: [] },
        },
        usageRights: {
          uri: `/metadata/${id}/usage-rights`,
          data: { category: "agency", restrictions: "" },
        },
        photoshoot: {
          uri: `/metadata/${id}/photoshoot`,
          data: { title: "Synthetic shoot" },
        },
        lastModified: "2026-09-17T10:00:00Z",
      },
    },
    cost: "free",
    valid: true,
    invalidReasons: {},
    persisted: { value: false, reasons: [] },
    syndicationStatus: "unsuitable",
    fromIndex: "fixture-index",
    embedding: null,
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
    expect(enriched.syndicationStatus).toBe("sent"); // not "unsuitable"
    expect(enriched.actions).toEqual(actions);
    expect(enriched.enrichedUsages).toEqual([usage]);
  });

  it("absent overlay fields fall through to baseline — no silent undefined bleed", () => {
    // Entity only provides cost; other fields absent.
    const entity: { data?: unknown; actions?: unknown } = {
      data: {
        id: "abc123",
        cost: "overquota",
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

describe("apiSearchAfter canonical image normalization", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("flattens canonical nested edits into consumable Image fields", async () => {
    const data = makeCanonicalImage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...makeApiResponse(data.id), data: [{ data }] }),
    }));

    const result = await apiSearchAfter(probeParams, null, null, undefined, false, false);
    const image = result.hits[0];

    expect(image.userMetadata).toEqual({
      archived: false,
      labels: ["Priority", "Photo desk"],
      metadata: { description: "User edit", keywords: [] },
      usageRights: { category: "agency", restrictions: "" },
      photoshoot: { title: "Synthetic shoot" },
      lastModified: "2026-09-17T10:00:00Z",
    });
    expect(getFieldRawValue("labels", image)).toBe("Priority, Photo desk");
    expect(image.metadata).toBe(data.metadata);
    expect(image.usageRights).toBe(data.usageRights);
  });

  it.each([{ labels: [] }, { labels: [""] }])("preserves empty edits and labels $labels with unset overrides", async ({ labels }) => {
    const data = makeCanonicalImage();
    data.userMetadata.data = {
      archived: { uri: "/metadata/abc123/archived", data: false },
      labels: {
        uri: "/metadata/abc123/labels",
        data: labels.map((label) => ({ uri: `/metadata/abc123/labels/${label}`, data: label })),
      },
      metadata: { uri: "/metadata/abc123/metadata", data: {} },
      usageRights: { uri: "/metadata/abc123/usage-rights" },
      photoshoot: { uri: "/metadata/abc123/photoshoot" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...makeApiResponse(data.id), data: [{ data }] }),
    }));

    const { hits: [image] } = await apiSearchAfter(probeParams, null, null, undefined, false, false);

    expect(image.userMetadata).toEqual({
      archived: false, labels, metadata: {},
      usageRights: undefined, photoshoot: undefined, lastModified: undefined,
    });
    expect(getFieldRawValue("labels", image)).toBe(labels.join(", "));
    expect(image.usages).toEqual([]);
    expect(image.leases).toEqual({ leases: [] });
    expect(image.collections).toEqual([]);
  });

  const fileMetadata = {
    iptc: { Caption: "" },
    exif: { "Exposure Time": "0" },
    xmp: { enabled: false, count: 0, keywords: [], layers: [["nested"]] },
    colourModel: "RGB",
  };

  it.each([
    { shape: "expanded", entity: { uri: "/images/abc123/fileMetadata", data: fileMetadata }, expected: fileMetadata },
    { shape: "empty expanded", entity: { uri: "/images/abc123/fileMetadata", data: {} }, expected: {} },
    { shape: "link-only", entity: { uri: "/images/abc123/fileMetadata" }, expected: undefined },
    { shape: "absent", entity: undefined, expected: undefined },
  ])("normalizes $shape file metadata without inventing data", async ({ entity, expected }) => {
    const data = makeCanonicalImage({ fileMetadata: entity });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...makeApiResponse(data.id), data: [{ data }] }),
    }));

    const { hits: [image] } = await apiSearchAfter(probeParams, null, null, undefined, false, false);

    expect(image.fileMetadata).toEqual(expected);
  });

  it("preserves alias JSON values without converting them to display strings", async () => {
    const aliases = {
      colourModel: "RGB", adultContentWarning: false, enabled: true, count: 0,
      empty: "", missing: null, list: [], values: ["", "value"], nested: { flag: false },
    };
    const data = makeCanonicalImage({ aliases });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...makeApiResponse(data.id), data: [{ data }] }),
    }));

    const { hits: [image] } = await apiSearchAfter(probeParams, null, null, undefined, false, false);

    expect(image.aliases).toBe(aliases);
    expect(image.aliases).toEqual(aliases);
  });

  it("preserves complete relationships, assets and root metadata without mutating the response", async () => {
    const usages: Usage[] = [
      {
        id: "usage-digital", platform: "digital", media: "image", status: "published",
        dateAdded: "2026-01-02T10:00:00Z", lastModified: "2026-01-03T10:00:00Z",
        title: "Synthetic article", references: [{ type: "content", uri: "https://example.com/article" }],
        digitalUsageMetadata: { webUrl: "https://example.com/article", webTitle: "Article", sectionId: "news" },
      },
      {
        id: "usage-print", platform: "print", media: "image", status: "removed",
        dateAdded: "2026-02-02T10:00:00Z", dateRemoved: "2026-02-04T10:00:00Z",
        lastModified: "2026-02-05T10:00:00Z", references: [],
        printUsageMetadata: { issueDate: "2026-02-03", pageNumber: 0, edition: 0, notes: "" },
      },
    ];
    const base = makeCanonicalImage();
    const data = makeCanonicalImage({
      lastModified: "2026-09-18T10:00:00Z",
      userMetadataLastModified: "2026-09-17T10:00:00Z",
      softDeletedMetadata: { deleteTime: "2026-09-19T10:00:00Z", deletedBy: "fixture-user" },
      identifiers: { fixture: "original-identifier" },
      source: {
        ...base.source, size: 0, orientation: "portrait",
        orientedDimensions: { width: 600, height: 800 }, orientationMetadata: { exifOrientation: 6 },
      },
      thumbnail: {
        file: "https://example.com/thumb.jpg", secureUrl: "https://example.com/thumb-preview.jpg",
        mimeType: "image/jpeg", dimensions: { width: 120, height: 160 },
      },
      optimisedPng: { ...base.source, file: "https://example.com/optimised.png", mimeType: "image/png" },
      exports: [{
        id: "export-1", author: "fixture-user", date: "2026-01-02T10:00:00Z",
        specification: { uri: "/images/abc123", type: "crop", bounds: { x: 0, y: 0, width: 800, height: 600 }, rotation: 0 },
        master: base.source, assets: [base.source],
      }],
      usages: {
        uri: "/usages/media/abc123",
        data: usages.map((usage) => ({ uri: `/usages/${usage.id}`, data: usage })),
      },
      leases: {
        uri: "/leases/media/abc123",
        data: {
          lastModified: "2026-03-04T10:00:00Z",
          leases: [
            {
              id: "lease-1", access: "allow-use", mediaId: "abc123", leasedBy: "fixture-user",
              createdAt: "2026-03-01T10:00:00Z", startDate: "2026-03-02T10:00:00Z",
              endDate: "2026-03-03T10:00:00Z", active: false, notes: "",
            },
            {
              id: "lease-2", access: "deny-syndication", mediaId: "abc123",
              createdAt: "2026-03-04T10:00:00Z", active: true,
            },
          ],
        },
      },
      collections: [
        {
          uri: "/collections/images/abc123/news",
          data: { path: ["News"], pathId: "news", description: "", cssColour: "#123456",
            actionData: { author: "fixture-user", date: "2026-04-01T10:00:00+01:00" } },
        },
        {
          uri: "/collections/images/abc123/news/selection",
          data: { path: ["News", "Selection"], pathId: "news~selection", description: "Synthetic selection",
            actionData: { author: "fixture-user", date: "2026-05-01T10:00:00+01:00" } },
        },
      ],
      syndicationRights: { published: "2026-01-01T10:00:00Z", suppliers: [], rights: [], isInferred: false },
    });
    const actions: Action[] = [{ name: "edit", href: "/metadata/abc123", method: "PUT" }];
    const response = { ...makeApiResponse(data.id), data: [{ data, actions }] };
    const before = structuredClone(response);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));

    const result = await apiSearchAfter(probeParams, null, null, undefined, false, false);
    const image = result.hits[0];

    expect(image).toMatchObject({
      id: data.id, uploadTime: data.uploadTime, uploadedBy: data.uploadedBy,
      lastModified: data.lastModified, uploadInfo: data.uploadInfo,
      softDeletedMetadata: data.softDeletedMetadata, identifiers: data.identifiers,
      source: data.source, thumbnail: data.thumbnail, optimisedPng: data.optimisedPng, exports: data.exports,
      metadata: data.metadata, originalMetadata: data.originalMetadata,
      usageRights: data.usageRights, originalUsageRights: data.originalUsageRights,
      syndicationRights: data.syndicationRights,
    });
    expect(image.usages).toEqual(usages);
    expect(image.leases).toEqual(data.leases.data);
    expect(image.collections).toEqual(data.collections.map((collection) => collection.data));
    expect(result.enrichment?.get(data.id)).toEqual({
      cost: data.cost, valid: data.valid, invalidReasons: data.invalidReasons,
      persisted: data.persisted, usageRights: data.usageRights, actions,
      syndicationStatus: data.syndicationStatus, usages,
    });
    expect(response).toEqual(before);
  });

  it.each([false, true])("preserves image order, cardinality and authoritative tuples with reverse=%s", async (reverse) => {
    const images = ["image-z", "image-a", "image-m"].map((id) => makeCanonicalImage({ id }));
    const sortValues: SearchAfterResult["sortValues"] = [[30, 1000, "image-z"], [0, 2000, "image-a"], [null, 3000, "image-m"]];
    const response = {
      data: (reverse ? [...images].reverse() : images).map((data) => ({ data })),
      sortValues: reverse ? [...sortValues].reverse() : sortValues,
      total: 23000,
      pitId: "response-pit",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));

    const result = await apiSearchAfter(
      { ...probeParams, orderBy: "-lastModified", length: 3 }, [40, 500, "cursor-id"], "request-pit", undefined, reverse, false,
    );

    expect(result.hits.map((image) => image.id)).toEqual(response.data.map(({ data }) => data.id));
    expect(result.hits.map((image) => image.userMetadata?.labels)).toEqual(images.map(() => ["Priority", "Photo desk"]));
    expect(result.sortValues).toBe(response.sortValues);
    expect(result.sortValues).toEqual(response.sortValues);
    expect(result.total).toBe(response.total);
    expect(result.pitId).toBe(response.pitId);
    expect([...result.enrichment!.keys()]).toEqual(result.hits.map((image) => image.id));
  });
});

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
    const esResult: SearchAfterResult = {
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

// ---------------------------------------------------------------------------
// media-api wire contract
// ---------------------------------------------------------------------------
// The server rejects a search-after request whose sort clause is missing or empty
// with a 422. Nothing else asserts what actually goes on the wire.

describe("apiSearchAfter request body — media-api wire contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always sends a non-empty sort array", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse("img-1"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiSearchAfter(probeParams, null, null, undefined, false, false);

    const init = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body) as { sort?: unknown };

    expect(Array.isArray(body.sort)).toBe(true);
    expect((body.sort as unknown[]).length).toBeGreaterThan(0);
  });

  it("sends a non-empty sort array even when orderBy is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse("img-1"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { orderBy: _orderBy, ...noOrderBy } = probeParams;
    await apiSearchAfter(noOrderBy, null, null, undefined, false, false);

    const init = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body) as { sort?: unknown };

    expect(Array.isArray(body.sort)).toBe(true);
    expect((body.sort as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("apiSearchAfter recovery classification", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { status: 410, errorKey: "search-after-pit-expired", kind: "pit-expired" },
    { status: 410, errorKey: "different-refusal", kind: "refused" },
    { status: 404, errorKey: "search-after-pit-expired", kind: "refused" },
    { status: 502, errorKey: "maintenance", kind: "refused" },
    ...[400, 401, 403, 404, 405, 409, 410, 419, 422, 429, 500, 501, 503]
      .map((status) => ({ status, errorKey: undefined, kind: "refused" })),
    ...[502, 504].map((status) => ({ status, errorKey: undefined, kind: "unavailable" })),
  ])("classifies HTTP $status/$errorKey as $kind", async ({ status, errorKey, kind }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      errorKey ? JSON.stringify({ errorKey }) : "gateway response", { status },
    )));

    await expect(apiSearchAfter(probeParams, null, "pit-id", undefined, undefined, undefined)).rejects.toMatchObject({ kind, status });
  });

  it("does not bypass gateway Retry-After refusals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("wait", {
      status: 502, headers: { "Retry-After": "60" },
    })));

    await expect(apiSearchAfter(probeParams, null, undefined, undefined, undefined, undefined)).rejects.toMatchObject({ kind: "refused", status: 502 });
  });

  it("classifies a fetch network failure as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiSearchAfter(probeParams, null, undefined, undefined, undefined, undefined)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("preserves unexpected failures instead of making them recoverable", async () => {
    const error = new Error("unexpected fixture error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    await expect(apiSearchAfter(probeParams, null, undefined, undefined, undefined, undefined)).rejects.toBe(error);
  });

  it("classifies a response-body transport failure as unavailable", async () => {
    const body = new ReadableStream({
      start(controller) { controller.error(new TypeError("connection closed")); },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));

    await expect(apiSearchAfter(probeParams, null, undefined, undefined, undefined, undefined))
      .rejects.toMatchObject({ kind: "unavailable" });
  });

  it("does not classify malformed response JSON as availability", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{")));

    await expect(apiSearchAfter(probeParams, null, undefined, undefined, undefined, undefined))
      .rejects.toBeInstanceOf(SyntaxError);
  });

  it("does not dispatch an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeApiResponse("late"))));
    vi.stubGlobal("fetch", fetch);

    await expect(apiSearchAfter(probeParams, null, null, controller.signal, undefined, undefined)).rejects.toBe(controller.signal.reason);
    expect(fetch).not.toHaveBeenCalled();
  });
});
