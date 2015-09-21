package lib.usagerights

import com.gu.mediaservice.lib.config.UsageRightsConfig
import com.gu.mediaservice.model._


object CostCalculator {
  import UsageRightsConfig.{freeSuppliers, suppliersCollectionExcl}
  import DeprecatedConfig.guardianCredits

  val defaultCost = Pay

  // HACK: This is until we decide what to do with Guardian credits
  // We've also added the restrictions here as that needs to override `Free`
  // but I didn't want to pollute the "pure" cost calculations
  def getCost(credit: Option[String], restrictions: Option[String]): Option[Cost] =
    if (restrictions.nonEmpty) Some(Conditional)
    else if (credit.exists(guardianCredits.contains)) Some(Free) else None

  def getCost(supplier: String, collection: Option[String]): Option[Cost] = {
      val free = isFreeSupplier(supplier) && ! collection.exists(isExcludedColl(supplier, _))
      if (free) Some(Free) else None
  }

  def getCost(usageRights: UsageRights): Option[Cost] = {
      val restricted  : Option[Cost] = usageRights.restrictions.map(r => Conditional)
      val categoryCost: Option[Cost] = usageRights.defaultCost
      val supplierCost: Option[Cost] = usageRights match {
        case u: Agency => getCost(u.supplier, u.suppliersCollection)
        case _ => None
      }

      restricted
        .orElse(categoryCost)
        .orElse(supplierCost)
  }

  def getCost(usageRights: UsageRights, credit: Option[String]): Cost = {
    getCost(credit, usageRights.restrictions)
      .orElse(getCost(usageRights))
      .getOrElse(defaultCost)
  }

  private def isFreeSupplier(supplier: String) = freeSuppliers.contains(supplier)

  private def isExcludedColl(supplier: String, supplierColl: String) =
    suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}
