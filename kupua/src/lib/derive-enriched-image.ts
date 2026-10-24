/**
 * deriveImage — the single merge point for ES baseline data + API enrichment.
 *
 * Pure function. Given an ES `Image` and an optional `EnrichmentFields` overlay
 * from an intent-driven single-image API fetch, produces an `EnrichedImage` that
 * every consumer reads. This is the ONLY place that knows both data sources exist.
 *
 * ES baseline (cost, valid, invalidReasons, usageRights, leases, usages, etc.)
 * is now authoritative for 99% of fields. SOURCE_INCLUDES was widened (10 May 2026)
 * to pull these directly from the search response — no background polling required.
 * Background enrichment (useEnrichment) was removed at the same time.
 *
 * When an API overlay is present (intent-driven single-image fetch), its fields
 * win for cost/valid/invalidReasons (server-authoritative, includes overquota).
 * API-only fields (persisted, actions) are only present
 * when the overlay provides them. syndicationStatus is computed from ES baseline
 * (always present) but the overlay wins when available.
 *
 * See kupua/exploration/docs/changelog.md (Session A, 10 May 2026) for rationale.
 */

import type { Image } from "@/types/image";
import type { Cost } from "@/dal/grid-api/types";
import type { SyndicationStatus } from "@/dal/grid-api/types";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import { calculateCost } from "@/lib/cost/calculate-cost";
import { buildValidityMap, deriveInvalidReasons, deriveValid } from "@/lib/cost/validity-map";
import guardianConfig from "@/lib/cost/guardian-config.json";
import type { GuardianCostConfig } from "@/lib/cost/types";
import { calculateSyndicationStatus } from "@/lib/syndication/calculate-syndication-status";

const GUARDIAN_COST_CONFIG = guardianConfig as GuardianCostConfig;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Baseline fields computed locally from ES data. */
interface ComputedBaseline {
  /** Cost computed from usageRights (never "overquota" — that's API-only). */
  cost: Cost;
  /** True when no active invalid reasons exist. */
  valid: boolean;
  /** Active invalid reasons keyed by check name. */
  invalidReasons: Record<string, string>;
  /** True when usageRights.category is absent or empty. */
  noRights: boolean;
}

/** API-sourced enrichment overlay (re-exported from enrichment-store). */
export type { EnrichmentFields } from "@/stores/enrichment-store";

/**
 * The merged view that all UI consumers read.
 * Extends the raw ES `Image` with computed baseline and API overlay fields.
 */
export interface EnrichedImage extends Image, ComputedBaseline {
  /**
   * Lease summary — API overlay only. Undefined when API is unavailable.
   * ES baseline leases are available on the raw `image.leases` field.
   */
  leasesSummary?: EnrichmentFields["leasesSummary"];
  /** Persisted (archiver) state — API only. */
  persisted?: EnrichmentFields["persisted"];
  /** HATEOAS action descriptors — API only. */
  actions?: EnrichmentFields["actions"];
  /**
   * Syndication status — always present (computed from ES baseline by
   * calculateSyndicationStatus). API overlay wins when present (server-authoritative).
   */
  syndicationStatus: SyndicationStatus;
  /** Usage list for print/digital icons — API preferred, ES fallback on Image.usages. */
  enrichedUsages?: Image["usages"];
}

// ---------------------------------------------------------------------------
// Derive function
// ---------------------------------------------------------------------------

/**
 * Merge an ES Image with an optional intent-driven API enrichment overlay.
 *
 * When `overlay` is undefined, baseline fields are computed from ES-sourced
 * rights, leases, usages, metadata, and configuration. The overlay is applied
 * only when media-api supplies server-authoritative enrichment.
 *
 * When `overlay` is present, its fields win for cost/valid/invalidReasons
 * (server-authoritative, includes overquota). API-only fields (persisted,
 * actions, syndicationStatus, leasesSummary) are
 * only present when the overlay provides them.
 */
export function deriveImage(
  image: Image,
  overlay: EnrichmentFields | undefined,
): EnrichedImage {
  // Each local fallback runs only when the overlay does not supply that field.
  const cost = overlay?.cost ?? calculateCost(image.usageRights, GUARDIAN_COST_CONFIG);
  let valid = overlay?.valid;
  let invalidReasons = overlay?.invalidReasons;
  if (valid == null || invalidReasons == null) {
    const validityMap = buildValidityMap(image);
    valid ??= deriveValid(validityMap);
    invalidReasons ??= deriveInvalidReasons(validityMap);
  }
  const noRights = !image.usageRights?.category;

  return {
    ...image,
    cost,
    valid,
    invalidReasons,
    noRights,
    usageRights: overlay?.usageRights ?? image.usageRights,
    leasesSummary: overlay?.leasesSummary,
    persisted: overlay?.persisted,
    actions: overlay?.actions,
    syndicationStatus: overlay?.syndicationStatus ?? calculateSyndicationStatus(image, Date.now()),
    enrichedUsages: overlay?.usages ?? image.usages,
  };
}
