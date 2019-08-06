package lib.usagerights

import com.gu.mediaservice.lib.config.UsageRightsStore
import com.gu.mediaservice.model._
import lib.UsageQuota

import scala.concurrent.ExecutionContext

case class CostCalculator(usageRightsStore: UsageRightsStore, quotas: UsageQuota)(implicit val ec: ExecutionContext) {

  val defaultCost = Pay

  def getCost(supplier: String, collection: Option[String]): Option[Cost] = {
    val c = usageRightsStore.get
    val free = c.isFreeSupplier(supplier) && ! collection.exists(c.isExcludedColl(supplier, _))

    if (free) Some(Free) else None
  }

  def isConditional(usageRights: UsageRights): Boolean =
    getCost(usageRights) == Conditional

  def isPay(usageRights: UsageRights): Boolean =
    getCost(usageRights) == Pay

  def getOverQuota(usageRights: UsageRights) =
    if (quotas.isOverQuota(usageRights)) {
      Some(Overquota)
    } else {
      None
    }

  def getCost(usageRights: UsageRights): Cost = {
    val restricted  : Option[Cost] = usageRights.restrictions.map(r => Conditional)
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

}
