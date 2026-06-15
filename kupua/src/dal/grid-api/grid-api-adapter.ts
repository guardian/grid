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

import { mergeReconciledFields, parseArgoErrorBody, unwrapResponse } from "./argo";
import { ArgoError, AuthError, SessionExpiredError, WriteGuardBlockedError } from "./errors";
import type { ServiceDiscovery } from "./service-discovery";
import type { EntityResponse, ImageData } from "./types";

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

}
