package lib.usagerights

import com.gu.mediaservice.model._
import lib.UsageQuota

trait CostCalculator {
  val defaultCost: Cost = Pay
  val freeSuppliers: List[String]
  val suppliersCollectionExcl: Map[String, List[String]]
  val quotas: UsageQuota

  private def getAgencyCost(agencyUsageRights: Agency): Option[Cost] = {
    val supplier = agencyUsageRights.supplier
    val isFreeFromAgency = isFreeSupplier(supplier) && !agencyUsageRights.suppliersCollection.exists(isExcludedColl(supplier, _))

    if (isFreeFromAgency) {
      if (isOverQuota(agencyUsageRights)) {
        Some(Overquota)
      } else {
        Some(Free)
      }
    } else {
      None
    }
  }

  def isConditional(usageRights: UsageRights): Boolean =
    getCost(usageRights) == Conditional

  def isPay(usageRights: UsageRights): Boolean =
    getCost(usageRights) == Pay

  def isOverQuota(usageRights: UsageRights): Boolean = quotas.isOverQuota(usageRights)

  def getCost(usageRights: UsageRights): Cost = {
    val restricted: Option[Cost] = usageRights.restrictions.map(r => Conditional)
    val categoryCost: Option[Cost] = usageRights.defaultCost
    val supplierCost: Option[Cost] = usageRights match {
      case u: Agency => getAgencyCost(u)
      case _ => None
    }

    restricted
      .orElse(categoryCost)
      .orElse(supplierCost)
      .getOrElse(defaultCost)
  }

  private def isFreeSupplier(supplier: String) = freeSuppliers.contains(supplier)

  private def isExcludedColl(supplier: String, supplierColl: String) =
    suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}
