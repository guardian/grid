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
 *   - "has_write_permission": always false in standalone mode (no auth context).
 *   - "current_allow_lease": derived from the ES leases[] array.
 *     Active lease detection: lease.active === "true" && lease.access === "allow-use".
 *     Note: in the ES Image type, lease.active is a string, not boolean.
 *   - "tass_agency_image": non-critical validity warning (included as it's
 *     fully derivable from ES data without quota or write-permission state).
 */

import type { Image } from "@/types/image";
import { isSupplierOverQuota } from "./quota-store";

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
  const hasCurrentAllowLease = leases.some(
    (l) => l.active === "true" && l.access === "allow-use",
  );
  const hasCurrentDenyLease = leases.some(
    (l) => l.active === "true" && l.access === "deny-use",
  );
  const shouldOverride = hasCurrentAllowLease;

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
    paid_image: createCheck(false), // Requires calculateCost — omit from pure map; UI derives
    conditional_paid: createCheck(false), // Same — derived by caller from calculateCost result
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
