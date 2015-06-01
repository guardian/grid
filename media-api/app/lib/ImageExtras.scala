package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._


object ImageExtras {
  def isValid(metadata: JsValue): Boolean =
    Config.requiredMetadata.forall(field => (metadata \ field).asOpt[String].isDefined)

  def getCost(credit: Option[String], source: Option[String], supplier: Option[String], supplierColl: Option[String],
              usageRights: Option[UsageRights], usageRightsCategory: Option[UsageRightsCategory]): Cost = {

    // Old model
    val freeCredit      = credit.exists(isFreeCredit)
    val freeSource      = source.exists(isFreeSource)
    val payingSource    = source.exists(isPaySource)
    val freeCreditOrSource = (freeCredit || freeSource) && ! payingSource

    // New model
    val freeUsageRightsCategory = usageRightsCategory.exists(isFreeUsageRightsCategory)
    val freeSupplier    = supplier.exists { suppl =>
      isFreeSupplier(suppl) && ! supplierColl.exists(isExcludedColl(suppl, _))
    }

    // TODO: Deprecate this once we remove cost from `UsageRights`
    usageRights.flatMap(_.cost).getOrElse {
      if (freeCreditOrSource || freeSupplier || freeUsageRightsCategory) Free
      else Pay
    }
  }

  private def isFreeCredit(credit: String) = Config.freeCreditList.contains(credit)
  private def isFreeSource(source: String) = Config.freeSourceList.contains(source)
  private def isPaySource(source: String)  = Config.payGettySourceList.contains(source)
  private def isFreeUsageRightsCategory(usageRightsCategory: UsageRightsCategory) = Config.freeUsageRightsCategories.contains(usageRightsCategory)

  private def isFreeSupplier(supplier: String) = Config.freeSuppliers.contains(supplier)
  private def isExcludedColl(supplier: String, supplierColl: String) =
    Config.suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}
