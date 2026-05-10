/**
 * deriveImage — the single merge point for ES baseline data + API enrichment.
 *
 * Pure function. Given an ES `Image` and an optional `EnrichmentFields` overlay
 * from the API mirror-search, produces an `EnrichedImage` that every consumer
 * reads. This is the ONLY place that knows both data sources exist.
 *
 * Baseline fields (cost, invalidReasons, valid) are computed from ES data
 * using calculateCost/buildValidityMap. When an API overlay is present, its
 * fields win (server-authoritative, includes overquota/persisted/etc.).
 *
 * See worklog-current.md "Architectural review + revised plan (8 May 2026)"
 * for the design rationale.
 */

import type { Image } from "@/types/image";
import type { Cost } from "@/dal/grid-api/types";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import { calculateCost } from "@/lib/cost/calculate-cost";
import { buildValidityMap, deriveInvalidReasons } from "@/lib/cost/validity-map";
import guardianConfig from "@/lib/cost/guardian-config.json";
import type { GuardianCostConfig } from "@/lib/cost/types";

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
   * True when API enrichment overlay is present for this image.
   * When false, cost/valid/invalidReasons are baseline-only (ES-derived)
   * and may be inaccurate (e.g. SOURCE_INCLUDES canary makes baseline
   * cost always "pay"). Consumers should suppress cost badges when false
   * to avoid misleading flashes during seek transitions.
   */
  hasEnrichment: boolean;
  /**
   * Lease summary — API overlay only. Undefined when API is unavailable.
   * ES baseline leases are available on the raw `image.leases` field.
   */
  leasesSummary?: EnrichmentFields["leasesSummary"];
  /** Persisted (archiver) state — API only. */
  persisted?: EnrichmentFields["persisted"];
  /** HATEOAS action descriptors — API only. */
  actions?: EnrichmentFields["actions"];
  /** Graphic flag — API search-hit only (not on single-image detail). */
  isPotentiallyGraphic?: boolean;
  /** Syndication status — API only. */
  syndicationStatus?: EnrichmentFields["syndicationStatus"];
  /** Usage list for print/digital icons — API preferred, ES fallback on Image.usages. */
  enrichedUsages?: EnrichmentFields["usages"];
}

// ---------------------------------------------------------------------------
// Derive function
// ---------------------------------------------------------------------------

/**
 * Merge an ES Image with an optional API enrichment overlay.
 *
 * When `overlay` is undefined (API unavailable or not yet loaded), all
 * baseline fields are still computed — consumers get correct data for
 * every field that can be derived from ES alone.
 *
 * When `overlay` is present, its fields win for cost/valid/invalidReasons
 * (server-authoritative, includes overquota). API-only fields (persisted,
 * actions, isPotentiallyGraphic, syndicationStatus, leasesSummary) are
 * only present when the overlay provides them.
 */
export function deriveImage(
  image: Image,
  overlay: EnrichmentFields | undefined,
): EnrichedImage {
  // --- Baseline: compute from ES data ---
  const baselineCost = calculateCost(image.usageRights, GUARDIAN_COST_CONFIG);
  const validityMap = buildValidityMap(image);
  const baselineInvalidReasons = deriveInvalidReasons(validityMap);
  const baselineValid = Object.keys(baselineInvalidReasons).length === 0;
  const noRights = !image.usageRights?.category;

  // --- Merge: overlay wins when present ---
  const cost = overlay?.cost ?? baselineCost;
  const valid = overlay?.valid ?? baselineValid;
  const invalidReasons = overlay?.invalidReasons ?? baselineInvalidReasons;

  return {
    ...image,
    hasEnrichment: overlay !== undefined,
    cost,
    valid,
    invalidReasons,
    noRights,
    usageRights: overlay?.usageRights ?? image.usageRights,
    leasesSummary: overlay?.leasesSummary,
    persisted: overlay?.persisted,
    actions: overlay?.actions,
    isPotentiallyGraphic: overlay?.isPotentiallyGraphic,
    syndicationStatus: overlay?.syndicationStatus,
    enrichedUsages: overlay?.usages ?? image.usages,
  };
}
