package lib.usagerights

import com.gu.mediaservice.lib.config.UsageRightsConfig
import com.gu.mediaservice.model._


object CostCalculator {
  import DeprecatedConfig.{freeCreditList, freeSourceList}
  import Config.{freeSuppliers, payGettySourceList, suppliersCollectionExcl}
  import UsageRightsConfig.categoryCosts

  def getCost(category: Option[UsageRightsCategory]): Option[Cost] =
    categoryCosts.get(category)

  def getCost(supplier: Option[String], collection: Option[String]): Option[Cost] =
    supplier.flatMap { suppl =>
      val free = isFreeSupplier(suppl) && ! collection.exists(isExcludedColl(suppl, _))
      if (free) Some(Free) else None
    }

  def getCost(usageRights: ImageUsageRights): Option[Cost] = {
      val restricted  : Option[Cost] = usageRights.restrictions.map(r => Conditional)
      val categoryCost: Option[Cost] = usageRights.category.flatMap(cat => getCost(Some(cat)))
      val supplierCost: Option[Cost] = getCost(usageRights.supplier, usageRights.suppliersCollection)

      restricted
        .orElse(categoryCost)
        .orElse(supplierCost)
  }

  def getCategoriesOfCost(costs: List[Cost]): List[Option[UsageRightsCategory]] =
    categoryCosts.filter { case (_, cost) => costs.contains(cost) }.keys.toList

  private def isFreeSupplier(supplier: String) = freeSuppliers.contains(supplier)

  private def isExcludedColl(supplier: String, supplierColl: String) =
    suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))


  // Deprecated
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
  def getCost(usageRights: ImageUsageRights,
              credit: Option[String], source: Option[String],
              supplier: Option[String]): Cost = {

    getCost(usageRights)
      .orElse(deprecatedGetCost(credit, source, supplier))
      .getOrElse(Pay)
  }
}
