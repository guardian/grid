/**
 * Tests for argo.ts — pure envelope helper functions.
 *
 * Fixtures derived from contract audit §10 real responses (annotated TEST samples).
 * Fixtures use null for embedding (no-embedding path, as in §10.3).
 */

import { describe, expect, it } from "vitest";
import {
  findAction,
  findLink,
  mergeReconciledFields,
  parseArgoErrorBody,
  unwrapEntity,
  unwrapResponse,
  unwrapSearchHits,
} from "./argo";
import type {
  EmbeddedEntity,
  EntityResponse,
  ImageData,
  SearchHitImageData,
  SearchResponseRaw,
} from "./types";

// ─── Minimal §10.3-derived single-image fixture ───────────────────────────────
// (Staff photo, no exports, no usages — the cleaner of the two §10 samples)

const IMAGE_ID_10_3 = "ae6f90ce02e8b766aba7bf7cdf7f20e63b115858";

const SINGLE_IMAGE_DATA: ImageData = {
  id: IMAGE_ID_10_3,
  uploadTime: "2023-11-22T16:08:04.788Z",
  uploadedBy: "user@example.com",
  uploadInfo: { filename: "_21A1552.jpg" },
  identifiers: {},
  fromIndex: "images_2026-02-12",
  cost: "pay",
  valid: true,
  invalidReasons: {
    paid_image: "Paid imagery requires a lease",
    no_rights: "No rights to use this image",
  },
  syndicationStatus: "blocked",
  persisted: { value: true, reasons: ["leases", "edited"] },
  embedding: null,
  source: {
    file: "http://s3.example.com/ae6f90...",
    size: 1041507,
    mimeType: "image/jpeg",
    dimensions: { width: 4134, height: 3118 },
    orientation: "landscape",
    secureUrl: "https://s3.example.com/ae6f90...?signed",
  },
  thumbnail: {
    file: "http://s3-thumb.example.com/ae6f90...",
    mimeType: "image/jpeg",
    dimensions: { width: 256, height: 193 },
    secureUrl: "https://cdn.example.com/ae6f90...",
  },
  metadata: {
    dateTaken: "2023-07-21T11:43:21.580Z",
    description: "Liberal MP Julian Lesser...",
    credit: "The Guardian",
    byline: "Jessica Hromas",
    copyright: "The Guardian",
    keywords: [],
    subjects: [],
    peopleInImage: [],
  },
  originalMetadata: {
    dateTaken: "2023-07-21T11:43:21.580Z",
    keywords: [],
    subjects: [],
    peopleInImage: [],
  },
  usageRights: {},
  originalUsageRights: {},
  exports: [],
  usages: {
    uri: "https://media-usage.test.dev-gutools.co.uk/usages/media/ae6f90...",
    data: [],
  },
  leases: {
    uri: "https://media-leases.test.dev-gutools.co.uk/leases/media/ae6f90...",
    data: {
      leases: [
        {
          id: "d4935b02-dfc5-44f1-bf5d-d48cddd7a1c5",
          leasedBy: "user@example.com",
          access: "deny-syndication",
          mediaId: IMAGE_ID_10_3,
          createdAt: "2025-03-25T12:36:47.057Z",
          active: true,
        },
      ],
      lastModified: "2025-03-25T12:36:47.057Z",
    },
  },
  collections: [],
  userMetadata: {
    uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90...",
    data: {
      archived: {
        uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../archived",
        data: false,
      },
      labels: {
        uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../labels",
        data: [],
      },
      metadata: {
        uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../metadata",
        data: {
          description: "Liberal MP Julian Lesser...",
          credit: "The Guardian",
          byline: "Jessica Hromas",
          copyright: "The Guardian",
        },
        actions: [
          {
            name: "set-from-usage-rights",
            href: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../metadata/set-from-usage-rights",
            method: "POST",
          },
        ],
      },
      // usageRights: link-only (no data key) — user has not set an override
      usageRights: {
        uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../usage-rights",
      },
      // photoshoot: link-only (no data key)
      photoshoot: {
        uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../photoshoot",
      },
      lastModified: "2023-11-22T16:11:29.760Z",
    },
  },
  fileMetadata: {
    uri: "https://api.media.test.dev-gutools.co.uk/images/ae6f90.../fileMetadata",
    // data absent — no ?include=fileMetadata requested
  },
  aliases: {
    colourProfile: "Adobe RGB (1998)",
    colourModel: "RGB",
    hasAlpha: "false",
    bitsPerSample: "8",
  },
  syndicationRights: {
    published: "2022-01-27T00:10:00.000+00:00",
    suppliers: [{ supplierName: "TEST SUPPLIER", supplierId: "DO NOT SYNDICATE", prAgreement: true }],
    rights: [
      {
        rightCode: "LICENSINGNONSUBSALES",
        acquired: true,
        properties: [{ propertyCode: "TERM", expiresOn: "1980-07-31T00:00:00.000+00:00", value: "IGNORED" }],
      },
    ],
    isInferred: false,
  },
};

const SINGLE_IMAGE_RESPONSE: EntityResponse<ImageData> = {
  data: SINGLE_IMAGE_DATA,
  links: [
    { rel: "edits", href: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90..." },
    { rel: "crops", href: "https://cropper.media.test.dev-gutools.co.uk/crops/ae6f90..." },
    { rel: "ui:image", href: "https://media.test.dev-gutools.co.uk/images/ae6f90..." },
    { rel: "usages", href: "https://media-usage.test.dev-gutools.co.uk/usages/media/ae6f90..." },
    { rel: "leases", href: "https://media-leases.test.dev-gutools.co.uk/leases/media/ae6f90..." },
    { rel: "download", href: "https://api.media.test.dev-gutools.co.uk/images/ae6f90.../download" },
    {
      rel: "downloadOptimised",
      href: "https://api.media.test.dev-gutools.co.uk/images/ae6f90.../downloadOptimised?{&width,height,quality}",
    },
  ],
  actions: [
    { name: "delete", href: "https://api.media.test.dev-gutools.co.uk/images/ae6f90...", method: "DELETE" },
    { name: "add-lease", href: "https://media-leases.test.dev-gutools.co.uk/leases", method: "POST" },
    {
      name: "add-collection",
      href: "https://media-collections.test.dev-gutools.co.uk/images/ae6f90...",
      method: "POST",
    },
  ],
};

// ─── Minimal search response fixture (EmbeddedEntity<SearchHitImageData>[]) ───
// Represents a single hit from GET /images?q=... (search-hit envelope nesting)

const SEARCH_HIT_DATA: SearchHitImageData = {
  ...SINGLE_IMAGE_DATA,
  id: "7c33986723c0fd458d1efd823e5d803cefaa9ab0",
  cost: "free",
  isPotentiallyGraphic: false, // only present on search hits, not single-image
};

const SEARCH_RESPONSE_RAW: SearchResponseRaw = {
  offset: 0,
  length: 1,
  total: 1175881,
  data: [
    {
      uri: "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
      data: SEARCH_HIT_DATA,
    },
  ],
  links: [{ rel: "next", href: "https://api.media.test.dev-gutools.co.uk/images?offset=1&length=1" }],
  actions: { tickerCounts: [] },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("unwrapEntity", () => {
  it("returns data when present", () => {
    const entity: EmbeddedEntity<number> = { uri: "https://example.com", data: 42 };
    expect(unwrapEntity(entity)).toBe(42);
  });

  it("returns null when data is absent (link-only)", () => {
    const entity: EmbeddedEntity<number> = { uri: "https://example.com" };
    expect(unwrapEntity(entity)).toBeNull();
  });

  it("returns null when data is undefined", () => {
    const entity: EmbeddedEntity<string> = { uri: "https://example.com", data: undefined };
    expect(unwrapEntity(entity)).toBeNull();
  });

  it("returns false when data is boolean false (archived=false)", () => {
    const entity: EmbeddedEntity<boolean> = { uri: "https://example.com", data: false };
    expect(unwrapEntity(entity)).toBe(false);
  });

  it("§10.3 fixture: userMetadata.data.usageRights — link-only (no user override set)", () => {
    const entity = SINGLE_IMAGE_DATA.userMetadata.data!.usageRights;
    expect(unwrapEntity(entity)).toBeNull();
  });

  it("§10.3 fixture: userMetadata.data.archived — data=false", () => {
    const entity = SINGLE_IMAGE_DATA.userMetadata.data!.archived;
    expect(unwrapEntity(entity)).toBe(false);
  });

  it("§10.3 fixture: leases.data — LeasesByMedia object", () => {
    const leases = unwrapEntity(SINGLE_IMAGE_DATA.leases);
    expect(leases).not.toBeNull();
    expect(leases?.leases).toHaveLength(1);
    expect(leases?.leases[0].access).toBe("deny-syndication");
    expect(leases?.leases[0].active).toBe(true);
  });

  it("§10.3 fixture: fileMetadata — data absent (no ?include=fileMetadata)", () => {
    expect(unwrapEntity(SINGLE_IMAGE_DATA.fileMetadata!)).toBeNull();
  });

  it("§10.3 fixture: usages.data — empty array", () => {
    const usages = unwrapEntity(SINGLE_IMAGE_DATA.usages);
    expect(Array.isArray(usages)).toBe(true);
    expect(usages).toHaveLength(0);
  });
});

describe("unwrapResponse", () => {
  it("returns data from EntityResponse", () => {
    const response: EntityResponse<string> = { data: "hello", links: [] };
    expect(unwrapResponse(response)).toBe("hello");
  });

  it("§10.3 fixture: unwraps single-image EntityResponse correctly", () => {
    const result = unwrapResponse(SINGLE_IMAGE_RESPONSE);
    expect(result.id).toBe(IMAGE_ID_10_3);
    expect(result.cost).toBe("pay");
    expect(result.valid).toBe(true);
    // valid=true with non-empty invalidReasons (lease override) — §6.7.1
    expect(Object.keys(result.invalidReasons)).toContain("paid_image");
    expect(result.syndicationStatus).toBe("blocked");
    expect(result.persisted.reasons).toContain("leases");
    expect(result.exports).toHaveLength(0);
    expect(result.collections).toHaveLength(0);
  });
});

describe("findLink", () => {
  it("finds a link by rel", () => {
    const link = findLink(SINGLE_IMAGE_RESPONSE, "edits");
    expect(link).toBeDefined();
    expect(link?.href).toContain("media-metadata");
  });

  it("returns undefined for absent rel", () => {
    expect(findLink(SINGLE_IMAGE_RESPONSE, "nonexistent")).toBeUndefined();
  });

  it("returns undefined when links array is undefined", () => {
    expect(findLink({ links: undefined }, "any")).toBeUndefined();
  });

  it("returns undefined when links array is empty", () => {
    expect(findLink({ links: [] }, "any")).toBeUndefined();
  });

  it("finds the download link (always present for Internal-tier users)", () => {
    const link = findLink(SINGLE_IMAGE_RESPONSE, "download");
    expect(link?.href).toContain("/download");
  });

  it("finds the downloadOptimised link (contains RFC 6570 template)", () => {
    const link = findLink(SINGLE_IMAGE_RESPONSE, "downloadOptimised");
    expect(link?.href).toContain("{&width,height,quality}");
  });
});

describe("findAction", () => {
  it("finds an action by name", () => {
    const action = findAction(SINGLE_IMAGE_RESPONSE, "delete");
    expect(action).toBeDefined();
    expect(action?.method).toBe("DELETE");
  });

  it("returns undefined for absent action name", () => {
    // reindex is a dead link (§8 correction 9) — should NOT be invoked; but may be present in response
    expect(findAction(SINGLE_IMAGE_RESPONSE, "nonexistent")).toBeUndefined();
  });

  it("returns undefined when actions array is undefined", () => {
    expect(findAction({ actions: undefined }, "any")).toBeUndefined();
  });

  it("§10.3 fixture: add-lease action present for all authenticated users", () => {
    const action = findAction(SINGLE_IMAGE_RESPONSE, "add-lease");
    expect(action).toBeDefined();
    expect(action?.method).toBe("POST");
    expect(action?.href).toContain("media-leases");
  });

  it("finds action on userMetadata.data.metadata (set-from-usage-rights)", () => {
    const metadataEntity = SINGLE_IMAGE_DATA.userMetadata.data!.metadata;
    const action = findAction(metadataEntity, "set-from-usage-rights");
    expect(action).toBeDefined();
    expect(action?.method).toBe("POST");
  });
});

describe("mergeReconciledFields", () => {
  it("is an identity passthrough (seam for future normalization)", () => {
    const result = mergeReconciledFields(SINGLE_IMAGE_DATA);
    expect(result).toBe(SINGLE_IMAGE_DATA); // referential equality — not a copy
  });
});

describe("unwrapSearchHits", () => {
  it("unwraps search hit entities and returns plain image data array", () => {
    const hits = unwrapSearchHits(SEARCH_RESPONSE_RAW);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("7c33986723c0fd458d1efd823e5d803cefaa9ab0");
    expect(hits[0].cost).toBe("free");
  });

  it("search hits carry isPotentiallyGraphic; single-image responses do not", () => {
    const hit = unwrapSearchHits(SEARCH_RESPONSE_RAW)[0];
    // Runtime check: the field is present on the search hit fixture
    expect("isPotentiallyGraphic" in hit).toBe(true);
    expect(hit.isPotentiallyGraphic).toBe(false);

    // Runtime check: the field is absent from the single-image fixture
    // (TypeScript also catches this — adding isPotentiallyGraphic to ImageData
    // would break the SearchHitImageData type definition)
    expect("isPotentiallyGraphic" in SINGLE_IMAGE_DATA).toBe(false);
  });

  it("silently drops hits where data is absent", () => {
    const rawWithMissing: SearchResponseRaw = {
      ...SEARCH_RESPONSE_RAW,
      data: [
        { uri: "https://api.media.test.dev-gutools.co.uk/images/missing" }, // no data key
        SEARCH_RESPONSE_RAW.data[0],
      ],
    };
    const hits = unwrapSearchHits(rawWithMissing);
    expect(hits).toHaveLength(1); // only the hit with data survives
    expect(hits[0].id).toBe("7c33986723c0fd458d1efd823e5d803cefaa9ab0");
  });

  it("returns empty array for response with no hits", () => {
    const empty: SearchResponseRaw = { ...SEARCH_RESPONSE_RAW, data: [], total: 0, length: 0 };
    expect(unwrapSearchHits(empty)).toHaveLength(0);
  });

  it("search response actions object is distinct from per-image actions array", () => {
    // The search-level `actions` is a SearchResponseActions object, not Action[]
    const searchActions = SEARCH_RESPONSE_RAW.actions;
    expect(Array.isArray(searchActions)).toBe(false);
    expect(typeof searchActions).toBe("object");
    // The per-image actions[] IS an array
    expect(Array.isArray(SINGLE_IMAGE_RESPONSE.actions)).toBe(true);
  });
});

describe("parseArgoErrorBody", () => {
  it("extracts errorKey and errorMessage from an Argo error body", () => {
    const body = { errorKey: "image-not-found", errorMessage: "No image found", data: null };
    const result = parseArgoErrorBody(body);
    expect(result.errorKey).toBe("image-not-found");
    expect(result.errorMessage).toBe("No image found");
  });

  it("falls back to 'unknown' for missing errorKey", () => {
    const body = { errorMessage: "Something went wrong", data: null };
    const result = parseArgoErrorBody(body);
    expect(result.errorKey).toBe("unknown");
    expect(result.errorMessage).toBe("Something went wrong");
  });

  it("handles non-object body gracefully", () => {
    const result = parseArgoErrorBody("plain text error");
    expect(result.errorKey).toBe("unknown");
    expect(result.errorMessage).toBe("plain text error");
  });

  it("handles null body gracefully", () => {
    const result = parseArgoErrorBody(null);
    expect(result.errorKey).toBe("unknown");
    expect(result.errorMessage).toBe("null");
  });

  it("known errorKeys from contract §6.5", () => {
    const keys = [
      "authentication-failure",
      "authentication-expired",
      "principal-not-authorised",
      "permission-denied",
      "image-not-found",
      "cannot-delete",
      "api-failed",
    ];
    for (const key of keys) {
      const result = parseArgoErrorBody({ errorKey: key, errorMessage: "msg", data: null });
      expect(result.errorKey).toBe(key);
    }
  });
});
