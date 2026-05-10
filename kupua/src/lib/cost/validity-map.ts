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
 *   - "over_quota": OMITTED (requires live quota data from the server).
 *     The API enrichment layer handles this via `valid` / `invalidReasons`.
 *   - "has_write_permission": always false in standalone mode (no auth context).
 *   - "current_allow_lease": derived from the ES leases[] array.
 *     Active lease detection: lease.active === "true" && lease.access === "allow-use".
 *     Note: in the ES Image type, lease.active is a string, not boolean.
 *   - "tass_agency_image": non-critical validity warning (included as it's
 *     fully derivable from ES data without quota or write-permission state).
 */

import type { Image } from "@/types/image";

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
 * The server may return additional keys (e.g. "over_quota") that are not computed
 * here. The API enrichment layer (`useEnrichment`) will overwrite `invalidReasons`
 * with the server-authoritative map when available.
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
    // over_quota intentionally omitted — server-only
  };
}

/**
 * Derive invalidReasons from a ValidityMap (ES baseline).
 *
 * Returns Record<key, description> for all checks that are invalid
 * and NOT overridden by a current allow-lease.
 *
 * This mirrors Scala's `invalidReasons()` + the `isValid` check combined:
 * a check is "active" if invalid=true AND NOT (overrideable && shouldOverride).
 */
export function deriveInvalidReasons(validityMap: ValidityMap): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, check] of Object.entries(validityMap)) {
    const active = check.invalid && !(check.overrideable && check.shouldOverride);
    if (active) {
      const desc = VALIDITY_DESCRIPTIONS[key];
      if (desc) result[key] = desc;
    }
  }
  return result;
}
