package lib.usagerights

import com.gu.mediaservice.lib.config.UsageRightsConfig
import com.gu.mediaservice.model._


object CostCalculator {
  import DeprecatedConfig.{freeCreditList, freeSourceList}
  import UsageRightsConfig.{freeSuppliers, payGettySourceList, suppliersCollectionExcl}

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

  private def isFreeSupplier(supplier: String) = freeSuppliers.contains(supplier)

  private def isExcludedColl(supplier: String, supplierColl: String) =
    suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))


  // Deprecated (remove after reindex)
  private def deprecatedGetCost(overrides: Option[UsageRights]): Option[Cost] = overrides.flatMap {
    // If we have overridden with NoRights, make it pay.
    case _:NoRights.type => Some(Pay)
    case _ => None
  }

  private def deprecatedGetCost(credit: Option[String], source: Option[String],
                                supplier: Option[String]): Option[Cost] = {

    val freeCredit      = credit.exists(isFreeCredit)
    val freeSource      = source.exists(isFreeSource)
    val payingSource    = source.exists(isPaySource)

    val freeCreditOrSource = (freeCredit || freeSource) && ! payingSource

    if (freeCreditOrSource) Some(Free) else None
  }

  private def isFreeCredit(credit: String) = freeCreditList.contains(credit)
  private def isFreeSource(source: String) = freeSourceList.contains(source)
  private def isPaySource(source: String)  = payGettySourceList.contains(source)


  // This function is just used until we have deprecated the old model completely
  def getCost(usageRights: UsageRights,
              usageRightsOverride: Option[UsageRights],
              credit: Option[String], source: Option[String],
              supplier: Option[String]): Cost = {

    getCost(usageRightsOverride.getOrElse(usageRights))
      .orElse(deprecatedGetCost(usageRightsOverride))
      .orElse(deprecatedGetCost(credit, source, supplier))
      .getOrElse(Pay)
  }
}
