/**
 * Guardian cost configuration types.
 *
 * These types describe the vendored snapshot in guardian-config.json,
 * sourced from common-lib's GuardianUsageRightsConfig.scala (snapshot 7 May 2026).
 *
 * See calculate-cost.ts for usage.
 */

import type { Cost } from "@/dal/grid-api/types";

/**
 * Maps UsageRights category string → default Cost (null = no default, falls through).
 * The default when no category matches is "pay" (CostCalculator.defaultCost = Pay).
 */
export type CategoryDefaultCostMap = Record<string, Cost | null>;

export interface GuardianCostConfig {
  /**
   * Agency suppliers whose images are free to use (if not in a pay collection).
   * Source: GuardianUsageRightsConfig.scala freeSuppliers (line 637).
   */
  freeSuppliers: string[];

  /**
   * Supplier → collections within that supplier that are pay (not free).
   * Source: GuardianUsageRightsConfig.scala suppliersCollectionExcl (line 651).
   * Currently only "Getty Images" → payGettySourceList.
   */
  suppliersCollectionExcl: Record<string, string[]>;

  /**
   * UsageRights category → default Cost.
   * Null means the category provides no cost signal (falls through to supplier check or default).
   * Source: each UsageRightsSpec.defaultCost in UsageRights.scala.
   */
  categoryDefaultCost: CategoryDefaultCostMap;
}
