package lib.usagerights

import com.gu.mediaservice.model._
import lib.UsageQuota

class CostCalculator(
  val freeSuppliers: Seq[String],
  val suppliersCollectionExcl: Map[String, Seq[String]],
  val usageQuota: UsageQuota,
) {
  final val defaultCost: Cost = Pay

  def getCost(supplier: String, collection: Option[String]): Option[Cost] = {
    val free = isFreeSupplier(supplier) && !collection.exists(isExcludedColl(supplier, _))
    if (free) Some(Free) else None
  }

  def isConditional(usageRights: UsageRights): Boolean =
    getCost(usageRights) == Conditional

  def isPay(usageRights: UsageRights): Boolean =
    getCost(usageRights) == Pay

  def getOverQuota(usageRights: UsageRights): Option[Cost] = {
    if (usageQuota.isOverQuota(usageRights)) {
      Some(Overquota)
    } else {
      None
    }
  }

  def getCost(usageRights: UsageRights): Cost = {
    val restricted: Option[Cost] = usageRights.restrictions.map(r => Conditional)
    val categoryCost: Option[Cost] = usageRights.defaultCost
    val overQuota: Option[Cost] = getOverQuota(usageRights)
    val supplierCost: Option[Cost] = usageRights match {
      case u: Agency => getCost(u.supplier, u.suppliersCollection)
      case _ => None
    }

    restricted
      .orElse(overQuota)
      .orElse(categoryCost)
      .orElse(supplierCost)
      .getOrElse(defaultCost)
  }

  private def isFreeSupplier(supplier: String) = freeSuppliers.contains(supplier)

  private def isExcludedColl(supplier: String, supplierColl: String) =
    suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}
