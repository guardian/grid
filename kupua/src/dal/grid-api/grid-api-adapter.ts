/**
 * GridApiDataSource — adapter for the Grid media-api HATEOAS surface.
 *
 * This adapter is SEPARATE from ElasticsearchDataSource. They don't share
 * code or implement the same interface. Each consumer chooses which to call.
 * See README.md for the decision matrix (which adapter handles which operation).
 *
 * Phase A scope: single `getImageDetail(id)` method.
 * Phase B+: satellite adapters (leases, usages, crops, edits, collections).
 * Phase C+: write operations via HATEOAS actions.
 *
 * Error handling contract (kupua "graceful API absence" directive):
 *   All API failure → caller receives null → UI renders ES-only view, unchanged.
 *   No error toasts, no broken layouts, no feature flags.
 *   Toasts are reserved for 401/419 (auth issues requiring user action).
 *
 * See grid-api-contract-audit-findings.md §6.2 (auth) and §6.5 (errors).
 */

import { mergeReconciledFields, parseArgoErrorBody, unwrapResponse, unwrapSearchHits } from "./argo";
import { ArgoError, AuthError, SessionExpiredError, WriteGuardBlockedError } from "./errors";
import type { ServiceDiscovery } from "./service-discovery";
import type { EntityResponse, ImageData, SearchHitImageData, SearchResponseRaw } from "./types";

/**
 * Max IDs per `?ids=` request. Default 46 — Pekko HTTP `max-uri-length=2048`
 * caps URL at ~46 IDs (40-char hex IDs + separators + base URL).
 * Raise to ~370 once `pekko.http.server.parsing.max-uri-length=16384` lands
 * in common-lib and nginx `large_client_header_buffers` is raised to match.
 * Override via VITE_ENRICHMENT_MAX_IDS_PER_REQUEST env var.
 */
const MAX_IDS_PER_REQUEST =
  Number(import.meta.env.VITE_ENRICHMENT_MAX_IDS_PER_REQUEST) || 46;

export class GridApiDataSource {
  constructor(private readonly discovery: ServiceDiscovery) {}

  /**
   * Fetches full image detail from `GET /api/images/{id}`.
   *
   * Returns `null` when:
   *   - The image is not found (404)
   *   - The caller lacks server-side permission (403 from media-api)
   *   - Network failure or request was aborted (AbortSignal)
   *
   * Throws for auth issues that require user action:
   *   - AuthError (401) — missing or invalid panda cookie
   *   - SessionExpiredError (419) — cookie present but expired
   *
   * Throws for developer-config issues:
   *   - WriteGuardBlockedError — non-GET blocked by the write guard plugin
   *
   * Throws for unexpected server errors:
   *   - ArgoError — all other non-2xx responses
   *
   * Kupua renders the ES-sourced view immediately and fires this in the
   * background. On null return, the ES view stays in place unchanged.
   * See contract §3.2.x for the rendering decision.
   */
  async getImageDetail(id: string, signal?: AbortSignal): Promise<ImageData | null> {
    const url = this.discovery.imageUrl(id);
    let response: Response;

    try {
      response = await fetch(url, { credentials: "include", signal });
    } catch {
      // AbortError, network failure, or any other fetch-level error.
      // Graceful absence — ES view stays in place.
      return null;
    }

    if (response.status === 404) {
      return null;
    }

    if (response.status === 401) {
      throw new AuthError();
    }

    if (response.status === 419) {
      throw new SessionExpiredError();
    }

    if (!response.ok) {
      const body = await response.text();

      // The Vite write-guard produces 403 with a plain-text body.
      // Distinguish this from a media-api 403 (Argo JSON body).
      if (body.startsWith("[grid-api-write-guard]")) {
        throw new WriteGuardBlockedError(body);
      }

      // 403 from media-api = server-side permission denied = data absence.
      // The `delete` action being absent is the correct way to check deletability.
      // Do not surface this as an error to the user. See contract §6.4.
      if (response.status === 403) {
        return null;
      }

      // All other non-2xx responses — parse the Argo error body.
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new ArgoError("unknown", body);
      }
      const { errorKey, errorMessage } = parseArgoErrorBody(parsed);
      throw new ArgoError(errorKey, errorMessage);
    }

    const json = (await response.json()) as EntityResponse<ImageData>;
    return mergeReconciledFields(unwrapResponse(json));
  }

  /**
   * Enrichment lookup by IDs: `GET /api/images?ids=id1,id2,…&length=N&orderBy=…`.
   *
   * Fetches enriched SearchHitImageData for the given ID list. IDs-based lookup
   * bypasses the ES `max_result_window` offset limit and is O(size) regardless
   * of scroll depth (~0.8s vs ~3.4s for the offset path).
   *
   * Chunks the ID list into batches of MAX_IDS_PER_REQUEST (default 46, limited
   * by Pekko HTTP `max-uri-length=2048`). All chunks run in parallel via
   * Promise.all with the same AbortSignal.
   *
   * Progressive merging: if `onChunk` is supplied, it is called as each chunk
   * resolves — before all other chunks complete. Callers can use this to update
   * the UI incrementally (visible-first chunks appear faster under HTTP/1.1).
   * Chunks that return null (fetch failure) do NOT call `onChunk`.
   *
   * Graceful absence: total failure (all chunks null) → returns null → caller
   * uses ES baseline. Partial failure: null chunks are skipped; non-null chunks
   * still populate (and have already called `onChunk`).
   *
   * @param ids     - Image IDs to enrich (typically the current buffer's IDs)
   * @param signal  - AbortSignal to cancel when buffer changes
   * @param onChunk - Optional callback fired per resolved chunk for progressive UI updates
   */
  async enrichByIds(
    ids: string[],
    signal?: AbortSignal,
    onChunk?: (hits: SearchHitImageData[]) => void,
  ): Promise<SearchHitImageData[] | null> {
    if (ids.length === 0) return [];

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
      chunks.push(ids.slice(i, i + MAX_IDS_PER_REQUEST));
    }

    const results = await Promise.all(
      chunks.map(async (chunk): Promise<SearchHitImageData[] | null> => {
        const params = new URLSearchParams({
          ids: chunk.join(","),
          length: String(chunk.length),
          orderBy: "-uploadTime",
        });
        const url = `/api/images?${params.toString()}`;

        let response: Response;
        try {
          response = await fetch(url, { credentials: "include", signal });
        } catch {
          return null;
        }

        if (!response.ok) return null;

        let chunkHits: SearchHitImageData[];
        try {
          const raw = (await response.json()) as SearchResponseRaw;
          chunkHits = unwrapSearchHits(raw);
        } catch {
          return null;
        }

        // Fire progressive callback before returning — callers see this chunk
        // immediately, without waiting for sibling chunks to complete.
        onChunk?.(chunkHits);
        return chunkHits;
      }),
    );

    // Per-chunk-tolerate-failure: drop failed chunks, return partial results.
    // A null chunk means that slice of IDs won't get enrichment overlay,
    // but other chunks still populate. Total failure → caller uses ES baseline.
    const successful = results.filter((r): r is SearchHitImageData[] => r !== null);
    if (successful.length === 0) return null;

    return successful.flat();
  }
}
