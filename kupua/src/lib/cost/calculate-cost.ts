/**
 * CostCalculator — TypeScript port of media-api's CostCalculator.scala.
 *
 * Computes the standalone-mode cost for an image from its UsageRights.
 * This is the ES-baseline computation. The API enrichment layer (`useEnrichment`)
 * will overwrite this with the server-authoritative value when available,
 * including the "overquota" state that requires live quota data.
 *
 * Source: media-api/app/lib/usagerights/CostCalculator.scala
 * Priority chain (mirrors Scala exactly):
 *   restrictions? → Conditional
 *   categoryCost? → categoryCost
 *   supplierCost? → Free (for free agency suppliers not in excluded collection)
 *   default        → Pay
 *
 * NOTE: "overquota" can be returned here when quota data has been fetched at
 * startup via quota-store.ts. If quota data is unavailable (dev, network error),
 * free images stay "free" — quota absence is graceful.
 *
 * Vendored config source: guardian-config.json (snapshot 2026-05-07).
 * Refresh from: common-lib/src/main/scala/com/gu/mediaservice/lib/guardian/
 *   GuardianUsageRightsConfig.scala
 */

import type { Cost } from "@/dal/grid-api/types";
import type { GuardianCostConfig } from "./types";
import type { UsageRights } from "@/types/image";
import { isSupplierOverQuota } from "./quota-store";

/**
 * Compute the cost for an image's usage rights against the Guardian config.
 *
 * Returns null if usageRights is absent (empty object or undefined).
 * Callers should treat null as "cost unknown" and show a neutral state.
 */
export function calculateCost(
  usageRights: UsageRights | undefined | null,
  config: GuardianCostConfig,
): Cost {
  // No usage rights at all — falls through to default (Pay).
  // Empty object (NoRights) has category "" → categoryDefaultCost[""] = null → falls through.
  if (!usageRights) return "pay";

  const category = usageRights.category ?? "";

  // 1. Restrictions present → always Conditional
  if (usageRights.restrictions) return "conditional";

  // 2. Category default cost (if defined for this category)
  const categoryCostEntry = config.categoryDefaultCost;
  if (Object.prototype.hasOwnProperty.call(categoryCostEntry, category)) {
    const categoryCost = categoryCostEntry[category];
    if (categoryCost !== null && categoryCost !== undefined) {
      return categoryCost;
    }
    // categoryCost === null means "no cost from category, continue"
  }

  // 3. Supplier cost — only applies to Agency (category === "agency")
  if (category === "agency") {
    const supplier = usageRights.supplier;
    if (supplier && isFreeSupplier(supplier, config)) {
      const suppliersCollection = usageRights.suppliersCollection;
      if (!isExcludedCollection(supplier, suppliersCollection, config)) {
        // Free agency supplier, not in a pay collection → Free (or Overquota if exceeded).
        return isSupplierOverQuota(supplier) ? "overquota" : "free";
      }
    }
  }

  // 4. Default: Pay
  return "pay";
}

function isFreeSupplier(supplier: string, config: GuardianCostConfig): boolean {
  return config.freeSuppliers.includes(supplier);
}

function isExcludedCollection(
  supplier: string,
  suppliersCollection: string | undefined,
  config: GuardianCostConfig,
): boolean {
  if (!suppliersCollection) return false;
  const excluded = config.suppliersCollectionExcl[supplier];
  return excluded ? excluded.includes(suppliersCollection) : false;
}
