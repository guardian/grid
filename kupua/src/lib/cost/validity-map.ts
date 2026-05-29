/**
 * ValidityMap — TypeScript port of media-api's ImageExtras.validityMap().
 *
 * Produces an ES-baseline validity map from an image's fields.
 * This is the standalone-mode computation. The API enrichment layer
 * (`useEnrichment`) will overwrite with server-authoritative values when
 * available.
 *
 * Source: media-api/app/lib/ImageExtras.scala
 *
 * IMPORTANT differences from the Scala version:
 *   - "over_quota": derived from quota-store (populated once at app startup).
 *     Empty quota map (dev, network failure) → no over_quota reason added.
 *   - "has_write_permission": always assumed ON. Kupua has no auth context but
 *     all users are authenticated Guardian editorial staff with implicit EditMetadata
 *     access. shouldOverride is therefore hardcoded true (same as is:deleted gate
 *     in es-adapter.ts). See deviations.md permissions table.
 *   - "current_allow_lease": derived from the ES leases[] array.
 *     Active lease detection: date-based via isLeaseActive() — does NOT trust
 *     the stale ES `active` snapshot. See 07-syndication-and-leases.md §3.2.1.
 *   - "tass_agency_image": non-critical validity warning (included as it's
 *     fully derivable from ES data without quota or write-permission state).
 */

import type { Image } from "@/types/image";
import { isLeaseActive } from "@/lib/syndication/calculate-syndication-status";
import { isSupplierOverQuota } from "./quota-store";
import { calculateCost } from "./calculate-cost";
import guardianConfig from "./guardian-config.json";
import type { GuardianCostConfig } from "./types";

const GUARDIAN_COST_CONFIG = guardianConfig as GuardianCostConfig;

export interface ValidityCheck {
  invalid: boolean;
  overrideable: boolean;
  shouldOverride: boolean;
}

export type ValidityMap = Record<string, ValidityCheck>;

/**
 * Descriptions matching Scala's `validityDescription` map.
 * Used for display in the Rights section of the metadata panel.
 */
export const VALIDITY_DESCRIPTIONS: Record<string, string> = {
  no_rights: "No rights to use this image",
  missing_credit: "Missing credit information *",
  missing_description: "Missing description *",
  paid_image: "Paid imagery requires a lease",
  over_quota: "The quota for this supplier has been exceeded",
  conditional_paid: "This image is restricted use",
  current_deny_lease: "Cropping has been denied using a lease",
  tass_agency_image:
    "Warning: TASS is Russian state-owned agency, information may not be accurate, including geographical names.",
};

/**
 * Build the ES-baseline validity map for an image.
 *
 * Returns true for `invalid` when the check fails (i.e. the condition IS present).
 * Keys with invalid=false are not meaningful — callers should filter to invalid=true.
 *
 * The server may return additional keys not computed here.
 * The API enrichment layer can overwrite `invalidReasons` with server-authoritative values.
 */
export function buildValidityMap(image: Image): ValidityMap {
  const leases = image.leases?.leases ?? [];
  const nowMs = Date.now();
  const hasCurrentAllowLease = leases.some(
    (l) => l.access === "allow-use" && isLeaseActive(l, nowMs),
  );
  const hasCurrentDenyLease = leases.some(
    (l) => l.access === "deny-use" && isLeaseActive(l, nowMs),
  );
  // SIMULATED PERMISSION — replace this one line when auth is wired:
  // const hasWritePermission = currentUser.hasPermission("EditMetadata");
  const hasWritePermission = true;
  // shouldOverride mirrors Scala: (hasCurrentAllowLease || hasWritePermission).
  // Full logic is here; only hasWritePermission above is simulated.
  // Note: banner colour (teal vs orange) is driven separately by hasActiveAllowLease
  // in ImageMetadata.tsx — unaffected by shouldOverride.
  const shouldOverride = hasCurrentAllowLease || hasWritePermission;

  function createCheck(invalid: boolean, overrideable = true): ValidityCheck {
    return { invalid, overrideable, shouldOverride };
  }

  const usageRights = image.usageRights;
  const category = usageRights?.category ?? "";
  const hasRights = category !== "" && category !== undefined;
  const hasCredit = !!image.metadata?.credit;
  const hasDescription = !!image.metadata?.description;

  // Mirror Scala's getCost for the paid_image and conditional_paid checks.
  // We use a simplified check here (category-only, no supplier lookup) because
  // the full cost calc is in calculateCost.ts. These checks only need a rough
  // signal for the baseline.
  const source = image.metadata?.source ?? image.originalMetadata?.source ?? "";
  const isTass =
    source.toUpperCase() === "TASS" ||
    (image.originalMetadata as { byline?: string } | undefined)?.byline ===
      "ITAR-TASS News Agency";

  return {
    // paid_image: true when cost=pay (mirrors Scala's cost.isPay check).
    paid_image: createCheck(calculateCost(usageRights, GUARDIAN_COST_CONFIG) === "pay"),
    // conditional_paid: true when usageRights.restrictions is non-empty (mirrors
    // Scala's cost.isConditional check). Uses shared shouldOverride like all other checks.
    conditional_paid: createCheck(!!usageRights?.restrictions),
    no_rights: createCheck(!hasRights, true),
    current_deny_lease: createCheck(hasCurrentDenyLease, true),
    missing_credit: createCheck(!hasCredit, false),
    missing_description: createCheck(!hasDescription, false),
    tass_agency_image: { invalid: isTass, overrideable: true, shouldOverride: true },
    // over_quota: per-supplier quota check, independent of cost. Mirrors
    // Grid's ImageExtras.scala — quota is checked unconditionally for any
    // agency image with a supplier, even if the image's cost is already "pay"
    // (e.g. excluded-collection Getty images). Both "paid_image" and
    // "over_quota" can appear in invalidReasons together; UI renders all
    // reasons, badge colour is driven by cost ("pay" wins, stays red).
    // See exploration/docs/01 Research/grid-cost-validity-pay-collection-overquota.md.
    over_quota: createCheck(
      usageRights?.category === "agency" &&
        !!usageRights.supplier &&
        isSupplierOverQuota(usageRights.supplier),
    ),
  };
}

/**
 * Derive invalidReasons from a ValidityMap.
 *
 * Returns Record<key, description> for ALL checks where invalid=true,
 * regardless of override state.
 *
 * Mirrors Scala's ImageExtras.invalidReasons() exactly:
 *   validityMap.filter { case (_, v) => v.invalid }.map(id → description)
 *
 * NOTE: Do NOT use this as a proxy for !valid. valid is computed
 * independently by deriveValid(). An overridden check appears in
 * invalidReasons (recording why a lease was needed) but does not
 * make valid=false. (contract-audit §6.7)
 */
export function deriveInvalidReasons(validityMap: ValidityMap): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, check] of Object.entries(validityMap)) {
    if (check.invalid) {
      const desc = VALIDITY_DESCRIPTIONS[key];
      if (desc) result[key] = desc;
    }
  }
  return result;
}

/**
 * Derive valid from a ValidityMap.
 *
 * An image is valid when every check passes isValid:
 *   !invalid || (overrideable && shouldOverride)
 *
 * Mirrors Scala's ImageExtras.isValid() exactly:
 *   validityMap.values.forall(_.isValid)
 *
 * Independent of deriveInvalidReasons — the two can diverge when
 * shouldOverride=true (e.g. active allow-use lease, or write permission).
 */
export function deriveValid(validityMap: ValidityMap): boolean {
  return Object.values(validityMap).every(
    (check) => !check.invalid || (check.overrideable && check.shouldOverride),
  );
}
