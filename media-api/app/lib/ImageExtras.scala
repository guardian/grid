package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model.{Cost, Pay, Free, Image, UsageRights}


object ImageExtras {
  def isValid(metadata: JsValue): Boolean =
    Config.requiredMetadata.forall(field => (metadata \ field).asOpt[String].isDefined)

  def getCost(credit: Option[String], source: Option[String], supplier: Option[String], supplierColl: Option[String],
              usageRights: Option[UsageRights]): Cost = {
    val freeCredit      = credit.exists(isFreeCredit)
    val freeSource      = source.exists(isFreeSource)
    val payingSource    = source.exists(isPaySource)
    val freeCreditOrSource = (freeCredit || freeSource) && ! payingSource

    val freeSupplier    = supplier.exists { suppl =>
      isFreeSupplier(suppl) && ! supplierColl.exists(isExcludedColl(suppl, _))
    }

    usageRights.map(_.cost).getOrElse {
      if (freeCreditOrSource || freeSupplier) Free
      else Pay
    }
  }

  private def isFreeCredit(credit: String) = Config.freeCreditList.contains(credit)
  private def isFreeSource(source: String) = Config.freeSourceList.contains(source)
  private def isPaySource(source: String)  = Config.payGettySourceList.contains(source)

  private def isFreeSupplier(supplier: String) = Config.freeSuppliers.contains(supplier)
  private def isExcludedColl(supplier: String, supplierColl: String) =
    Config.suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}
