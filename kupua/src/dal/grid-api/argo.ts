/**
 * Argo envelope helpers — pure utility functions for unwrapping Grid API responses.
 *
 * All functions are side-effect-free and testable without network access.
 * See grid-api-contract-audit-findings.md §6.1 for the EmbeddedEntity nesting rules.
 */

import type {
  Action,
  ArgoErrorResponse,
  EmbeddedEntity,
  EntityResponse,
  ImageData,
  Link,
  SearchHitImageData,
  SearchResponseRaw,
} from "./types";

// ─── Envelope unwrapping ──────────────────────────────────────────────────────

/**
 * Unwraps an `EmbeddedEntity<T>`, returning `data` or `null` when absent.
 *
 * `data` is absent when the resource is link-only:
 *   - `fileMetadata` without `?include=fileMetadata`
 *   - `userMetadata.data.usageRights` when no user override is set
 *   - `userMetadata.data.photoshoot` when not set
 */
export function unwrapEntity<T>(entity: EmbeddedEntity<T>): T | null {
  return entity.data ?? null;
}

/**
 * Unwraps an `EntityResponse<T>`, returning `data`.
 * Use for top-level API responses (GET /images/{id}, GET /images?q=…, etc.).
 */
export function unwrapResponse<T>(response: EntityResponse<T>): T {
  return response.data;
}

// ─── Link and action lookups ──────────────────────────────────────────────────

/**
 * Finds a link by `rel` in an entity's links array.
 * Returns `undefined` when the link is absent (permission-gated or unavailable).
 */
export function findLink(entity: { links?: Link[] }, rel: string): Link | undefined {
  return entity.links?.find((l) => l.rel === rel);
}

/**
 * Finds an action by `name` in a per-image actions array.
 *
 * Note: the search-response top-level `actions` is a JSON object (`SearchResponseActions`),
 * not an `Action[]`. This function is only for the per-image HATEOAS actions array.
 */
export function findAction(entity: { actions?: Action[] }, name: string): Action | undefined {
  return entity.actions?.find((a) => a.name === name);
}

// ─── Field normalization ──────────────────────────────────────────────────────

/**
 * Normalizes an `ImageData` after unwrapping — seam for future client-side field
 * normalization or validation.
 *
 * The server (Thrall + ImageResponse.scala) already pre-computes merged fields
 * (`metadata`, `usageRights`, `cost`, `valid`, `invalidReasons`, `persisted`,
 * `syndicationStatus`) via painless scripts and request-time computation.
 * This function is currently an identity passthrough.
 *
 * Merge direction (permanent rule, not scaffolding):
 *   ES baseline → API overwrite, never the inverse.
 *   The `useEnrichment` hook (Cluster 1) will apply API values over ES-sourced fields.
 *   This function operates on the API side after unwrapping.
 *
 * Future callers (Cluster 1+) may add:
 *   - Sanity checks on required fields
 *   - Normalization of empty objects vs null
 *   - Defaults for absent optional fields
 */
export function mergeReconciledFields(image: ImageData): ImageData {
  return image;
}

// ─── Search response helpers ──────────────────────────────────────────────────

/**
 * Unwraps each search hit from its EmbeddedEntity wrapper.
 * Silently drops hits where `data` is absent (link-only entities, unexpected).
 *
 * Returns a plain array of `SearchHitImageData` for further processing.
 * Re-sort by request order if using `?ids=` — the API does not preserve order.
 * See enrichment-strategy.md §A "?ids= ordering NOT preserved".
 */
export function unwrapSearchHits(raw: SearchResponseRaw): SearchHitImageData[] {
  return raw.data
    .filter((entity): entity is typeof entity & { data: SearchHitImageData } => entity.data !== undefined)
    .map((entity) => ({ ...entity.data, actions: entity.actions }));
}

// ─── Error parsing ────────────────────────────────────────────────────────────

/**
 * Parses an Argo error response body (already JSON-parsed).
 * Falls back to generic values when the shape is unexpected.
 */
export function parseArgoErrorBody(body: unknown): { errorKey: string; errorMessage: string } {
  if (typeof body === "object" && body !== null) {
    const err = body as Partial<ArgoErrorResponse>;
    return {
      errorKey: typeof err.errorKey === "string" ? err.errorKey : "unknown",
      errorMessage: typeof err.errorMessage === "string" ? err.errorMessage : "Unknown error",
    };
  }
  return { errorKey: "unknown", errorMessage: String(body) };
}
