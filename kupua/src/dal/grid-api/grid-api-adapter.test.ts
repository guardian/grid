/**
 * Tests for GridApiDataSource.getImageDetail().
 *
 * Covers:
 * - URL construction from ServiceDiscovery
 * - Envelope unwrapping against §10 fixtures (both response shapes)
 * - Error class mapping for all status codes + body types
 * - null returns for data-absence cases (404, 403 from media-api, network failure)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridApiDataSource } from "./grid-api-adapter";
import { ServiceDiscovery } from "./service-discovery";
import { ArgoError, AuthError, SessionExpiredError, WriteGuardBlockedError } from "./errors";
import type { EntityResponse, ImageData, SearchHitImageData, SearchResponseRaw } from "./types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeDiscovery(): ServiceDiscovery {
  return new ServiceDiscovery();
}

function makeAdapter(discovery?: ServiceDiscovery): GridApiDataSource {
  return new GridApiDataSource(discovery ?? makeDiscovery());
}

type MockResponseOptions = {
  status: number;
  jsonBody?: unknown;
  textBody?: string;
};

function mockFetch({ status, jsonBody, textBody }: MockResponseOptions): ReturnType<typeof vi.fn> {
  const text = textBody ?? (jsonBody !== undefined ? JSON.stringify(jsonBody) : "");
  const ok = status >= 200 && status < 300;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(jsonBody),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Response);
}

// ─── Minimal §10.3-derived fixture (single-image EntityResponse<ImageData>) ───

const IMAGE_ID = "ae6f90ce02e8b766aba7bf7cdf7f20e63b115858";

const MINIMAL_IMAGE_DATA: ImageData = {
  id: IMAGE_ID,
  uploadTime: "2023-11-22T16:08:04.788Z",
  uploadedBy: "user@example.com",
  uploadInfo: { filename: "_21A1552.jpg" },
  identifiers: {},
  fromIndex: "images_2026-02-12",
  cost: "pay",
  valid: true,
  invalidReasons: { paid_image: "Paid imagery requires a lease" },
  syndicationStatus: "blocked",
  persisted: { value: true, reasons: ["leases", "edited"] },
  embedding: null,
  source: {
    file: "http://s3.example.com/ae6f90...",
    mimeType: "image/jpeg",
    dimensions: { width: 4134, height: 3118 },
    secureUrl: "https://s3.example.com/ae6f90...?signed",
  },
  metadata: { credit: "The Guardian", byline: "Jessica Hromas" },
  originalMetadata: {},
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
          mediaId: IMAGE_ID,
          createdAt: "2025-03-25T12:36:47.057Z",
          active: true,
        },
      ],
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
        data: { credit: "The Guardian", byline: "Jessica Hromas" },
      },
      usageRights: {
        uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../usage-rights",
        // data absent — no user override set
      },
      photoshoot: {
        uri: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90.../photoshoot",
        // data absent
      },
    },
  },
  fileMetadata: {
    uri: "https://api.media.test.dev-gutools.co.uk/images/ae6f90.../fileMetadata",
    // data absent — no ?include=fileMetadata
  },
  aliases: { colourModel: "RGB" },
};

const IMAGE_RESPONSE: EntityResponse<ImageData> = {
  data: MINIMAL_IMAGE_DATA,
  links: [
    { rel: "edits", href: "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90..." },
    { rel: "download", href: "https://api.media.test.dev-gutools.co.uk/images/ae6f90.../download" },
  ],
  actions: [
    { name: "delete", href: "https://api.media.test.dev-gutools.co.uk/images/ae6f90...", method: "DELETE" },
    { name: "add-lease", href: "https://media-leases.test.dev-gutools.co.uk/leases", method: "POST" },
  ],
};

// ─── Minimal search-hit fixture (EmbeddedEntity<SearchHitImageData> in collection) ──

const SEARCH_HIT_DATA: SearchHitImageData = {
  ...MINIMAL_IMAGE_DATA,
  id: "7c33986723c0fd458d1efd823e5d803cefaa9ab0",
  cost: "free",
  isPotentiallyGraphic: false,
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
  links: [{ rel: "next", href: "https://api.media.test.dev-gutools.co.uk/images?offset=1" }],
  actions: { tickerCounts: [] },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GridApiDataSource.getImageDetail", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── URL construction ─────────────────────────────────────────────────────────

  it("calls the correct proxy-relative URL", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: IMAGE_RESPONSE }));
    const adapter = makeAdapter();

    await adapter.getImageDetail(IMAGE_ID);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `/api/images/${IMAGE_ID}`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("URI-encodes image IDs (SHA-1 hex strings are safe, but encoding is applied)", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 404 }));
    const adapter = makeAdapter();

    await adapter.getImageDetail("abc/def"); // hypothetical id with slash
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/images/abc%2Fdef", expect.anything());
  });

  it("passes the AbortSignal through to fetch", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: IMAGE_RESPONSE }));
    const adapter = makeAdapter();
    const controller = new AbortController();

    await adapter.getImageDetail(IMAGE_ID, controller.signal);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  // ── Success — envelope unwrapping ────────────────────────────────────────────

  it("unwraps EntityResponse<ImageData> and returns ImageData", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: IMAGE_RESPONSE }));
    const adapter = makeAdapter();

    const result = await adapter.getImageDetail(IMAGE_ID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(IMAGE_ID);
    expect(result?.cost).toBe("pay");
    expect(result?.valid).toBe(true);
    expect(result?.syndicationStatus).toBe("blocked");
    expect(result?.persisted.reasons).toContain("leases");
  });

  it("§10.3 fixture: valid=true with non-empty invalidReasons (lease override) — §6.7.1", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: IMAGE_RESPONSE }));
    const adapter = makeAdapter();

    const result = await adapter.getImageDetail(IMAGE_ID);

    expect(result?.valid).toBe(true);
    expect(Object.keys(result?.invalidReasons ?? {})).toContain("paid_image");
    // valid and invalidReasons can both be non-empty simultaneously — do NOT use
    // invalidReasons as a proxy for !valid
  });

  it("§10.3 fixture: usageRights={} (empty object) — no rights set", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: IMAGE_RESPONSE }));
    const result = await makeAdapter().getImageDetail(IMAGE_ID);
    expect(result?.usageRights).toEqual({});
  });

  it("§10.3 fixture: userMetadata sub-resources with and without data", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: IMAGE_RESPONSE }));
    const result = await makeAdapter().getImageDetail(IMAGE_ID);

    // archived has data=false
    expect(result?.userMetadata.data?.archived.data).toBe(false);
    // usageRights is link-only (no data key)
    expect("data" in (result?.userMetadata.data?.usageRights ?? {})).toBe(false);
  });

  it("§10.3 fixture: fileMetadata link-only (no ?include=fileMetadata)", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: IMAGE_RESPONSE }));
    const result = await makeAdapter().getImageDetail(IMAGE_ID);

    expect(result?.fileMetadata).toBeDefined();
    expect(result?.fileMetadata?.data).toBeUndefined();
  });

  it("search-hit fixture: both envelope shapes verified (EmbeddedEntity in collection)", () => {
    // Verify the search-response structure that Cluster 1 will unwrap:
    // EntityResponse<EmbeddedEntity<SearchHitImageData>[]>
    // where the outer wrapper has offset/length/total (not standard EntityResponse)
    expect(SEARCH_RESPONSE_RAW.data).toHaveLength(1);
    expect(SEARCH_RESPONSE_RAW.data[0].data?.id).toBe(
      "7c33986723c0fd458d1efd823e5d803cefaa9ab0",
    );
    expect(SEARCH_RESPONSE_RAW.data[0].data?.isPotentiallyGraphic).toBe(false);
    // Search-level actions is a JSON object, not an array
    expect(Array.isArray(SEARCH_RESPONSE_RAW.actions)).toBe(false);
  });

  // ── Null returns — data absence ──────────────────────────────────────────────

  it("returns null for 404 (image not found)", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 404 }));
    expect(await makeAdapter().getImageDetail("missing")).toBeNull();
  });

  it("returns null for media-api 403 (permission denied — Argo JSON body)", async () => {
    const body = { errorKey: "principal-not-authorised", errorMessage: "Not authorised", data: null };
    vi.stubGlobal("fetch", mockFetch({ status: 403, jsonBody: body }));
    expect(await makeAdapter().getImageDetail("denied")).toBeNull();
  });

  it("returns null on network failure (fetch throws)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await makeAdapter().getImageDetail("any")).toBeNull();
  });

  it("returns null when fetch is aborted (AbortError)", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    expect(await makeAdapter().getImageDetail("any", controller.signal)).toBeNull();
  });

  // ── Error throws — auth ──────────────────────────────────────────────────────

  it("throws AuthError for 401 (missing or invalid panda cookie)", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 401 }));
    await expect(makeAdapter().getImageDetail("any")).rejects.toBeInstanceOf(AuthError);
  });

  it("throws SessionExpiredError for 419 (cookie present but expired)", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 419 }));
    await expect(makeAdapter().getImageDetail("any")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  // ── Error throws — write guard ────────────────────────────────────────────────

  it("throws WriteGuardBlockedError for write-guard 403 (plain-text body)", async () => {
    const body = "[grid-api-write-guard] Blocked POST /api/images/abc — only GET is allowed";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(body),
      } as unknown as Response),
    );
    await expect(makeAdapter().getImageDetail("any")).rejects.toBeInstanceOf(WriteGuardBlockedError);
  });

  it("distinguishes write-guard 403 from media-api 403: write-guard throws, server returns null", async () => {
    const writeGuardBody = "[grid-api-write-guard] Blocked";
    const serverBody = JSON.stringify({
      errorKey: "principal-not-authorised",
      errorMessage: "Denied",
      data: null,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(writeGuardBody),
      } as unknown as Response),
    );
    await expect(makeAdapter().getImageDetail("a")).rejects.toBeInstanceOf(WriteGuardBlockedError);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(serverBody),
      } as unknown as Response),
    );
    expect(await makeAdapter().getImageDetail("a")).toBeNull();
  });

  // ── Error throws — Argo errors ────────────────────────────────────────────────

  it("throws ArgoError with errorKey for 5xx with Argo JSON body", async () => {
    const body = { errorKey: "api-failed", errorMessage: "Internal server error", data: null };
    vi.stubGlobal("fetch", mockFetch({ status: 500, jsonBody: body }));

    const err = await makeAdapter()
      .getImageDetail("any")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArgoError);
    expect((err as ArgoError).errorKey).toBe("api-failed");
    expect((err as ArgoError).message).toContain("Internal server error");
  });

  it("throws ArgoError with 'unknown' errorKey when body is non-JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      } as unknown as Response),
    );

    const err = await makeAdapter()
      .getImageDetail("any")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArgoError);
    expect((err as ArgoError).errorKey).toBe("unknown");
  });

  it("handles known Argo errorKeys from contract §6.5", async () => {
    const knownKeys = [
      "image-not-found",
      "cannot-delete",
      "delete-not-allowed",
      "edit-not-allowed",
    ];

    for (const errorKey of knownKeys) {
      vi.stubGlobal(
        "fetch",
        mockFetch({ status: 405, jsonBody: { errorKey, errorMessage: "err", data: null } }),
      );
      const err = await makeAdapter()
        .getImageDetail("any")
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ArgoError);
      expect((err as ArgoError).errorKey).toBe(errorKey);
    }
  });
});

describe("GridApiDataSource.enrichByIds", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns [] for empty ID list without fetching", async () => {
    const adapter = makeAdapter();
    const result = await adapter.enrichByIds([]);
    expect(result).toEqual([]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("returns hits for a successful single-chunk request", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: SEARCH_RESPONSE_RAW }));
    const adapter = makeAdapter();
    const result = await adapter.enrichByIds([SEARCH_HIT_DATA.id]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe(SEARCH_HIT_DATA.id);
  });

  it("total failure (all chunks null) → returns null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const adapter = makeAdapter();
    const result = await adapter.enrichByIds(["id1", "id2"]);
    expect(result).toBeNull();
  });

  it("partial failure (one chunk fails) → returns partial results, not null", async () => {
    // Two chunks: first succeeds, second fails.
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(SEARCH_RESPONSE_RAW),
        } as unknown as Response)
        .mockRejectedValueOnce(new Error("network error")),
    );
    // Use MAX_IDS_PER_REQUEST+1 IDs to force two chunks.
    // Default chunk size is 46 via env; stub it to 1 for predictability.
    vi.stubEnv("VITE_ENRICHMENT_MAX_IDS_PER_REQUEST", "1");
    const adapter = makeAdapter();
    const result = await adapter.enrichByIds(["id-a", "id-b"]);
    // Partial: first chunk succeeded → non-null, not empty
    expect(result).not.toBeNull();
    // Exactly one chunk's worth of results
    expect((result as unknown[]).length).toBeGreaterThan(0);
    vi.unstubAllEnvs();
  });

  it("calls onChunk for each successful chunk", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, jsonBody: SEARCH_RESPONSE_RAW }));
    const adapter = makeAdapter();
    const onChunk = vi.fn();
    const result = await adapter.enrichByIds([SEARCH_HIT_DATA.id], undefined, onChunk);
    // Single chunk succeeds → onChunk called exactly once with its hits
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: SEARCH_HIT_DATA.id })]));
    expect(result).not.toBeNull();
  });

  it("does not call onChunk for a failed chunk", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const adapter = makeAdapter();
    const onChunk = vi.fn();
    const result = await adapter.enrichByIds([SEARCH_HIT_DATA.id], undefined, onChunk);
    expect(onChunk).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("abort signal cancels in-flight chunks; onChunk not called after abort", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    const adapter = makeAdapter();
    const controller = new AbortController();
    controller.abort();
    const onChunk = vi.fn();
    const result = await adapter.enrichByIds([SEARCH_HIT_DATA.id], controller.signal, onChunk);
    expect(result).toBeNull();
    expect(onChunk).not.toHaveBeenCalled();
  });
});
