package lib

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{Agencies, Agency, UsageRights}
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._

import scala.collection.compat._
import scala.concurrent.{ExecutionContext, Future}

case class SupplierUsageQuota(agency: Agency, count: Int)
object SupplierUsageQuota {
  implicit val writes: Writes[SupplierUsageQuota] = (
    (__ \ "agency").write[String].contramap((a: Agency) => a.supplier) ~
    (__ \ "count").write[Int]
  )(unlift(SupplierUsageQuota.unapply))

  implicit val customReads: Reads[SupplierUsageQuota] = (
    (__ \ "agency").read[String].map(Agency(_)) ~
    (__ \ "count").read[Int]
  )(SupplierUsageQuota.apply _)
}

case class SupplierUsageSummary(agency: Agency, count: Long)
object SupplierUsageSummary {
  implicit val customReads: Reads[SupplierUsageSummary] = (
    (__ \ "Supplier").read[String].map(Agency(_)) ~
    (__ \ "Usage").read[Long]
  )(SupplierUsageSummary.apply _)

  implicit val writes: Writes[SupplierUsageSummary] = (
    (__ \ "agency").write[String].contramap((a: Agency) => a.supplier) ~
    (__ \ "count").write[Long]
  )(unlift(SupplierUsageSummary.unapply))
}

case class UsageStatus(
  exceeded: Boolean,
  fractionOfQuota: Float,
  usage: SupplierUsageSummary,
  quota: Option[SupplierUsageQuota]
)
object UsageStatus {
  implicit val writes: Writes[UsageStatus] = Json.writes[UsageStatus]
}

case class StoreAccess(store: Map[String, UsageStatus], lastUpdated: DateTime)
object StoreAccess {
  import play.api.libs.json.JodaWrites._

  implicit val writes: Writes[StoreAccess] = Json.writes[StoreAccess]
}

object UsageStore extends GridLogging {
}

class UsageStore(
  bucket: String,
  config: MediaApiConfig,
  quotaStore: QuotaStore
)(implicit val ec: ExecutionContext) extends BaseStore[String, UsageStatus](bucket, config) with GridLogging {
  import UsageStore._

  def getUsageStatusForUsageRights(usageRights: UsageRights): Future[UsageStatus] = {
    usageRights match {
      case agency: Agency => Future.successful(store.get().getOrElse(agency.supplier, { throw NoUsageQuota() }))
      case _ => Future.failed(new Exception("Image is not supplied by Agency"))
    }
  }

  def getUsageStatus(): Future[StoreAccess] = {
    //Future.successful(StoreAccess(store.get(), lastUpdated.get()))
    val results: Map[String, UsageStatus] = quotaStore.getQuota.keys.flatMap { supplier: String =>
      val maybeAgency = Agencies.all.get(supplier)
      val x = maybeAgency.map { agency =>
        val supplierUsageSummary: SupplierUsageSummary = SupplierUsageSummary(
          agency = agency, count = 0
        )

        val supplierUsageQuota: SupplierUsageQuota = SupplierUsageQuota(
          agency = agency, count = 1
        )
        val usageStatus = UsageStatus(
          exceeded = false,
          fractionOfQuota = 0.0.toFloat,
          usage = supplierUsageSummary,
          quota = Some(supplierUsageQuota)
        )
        (supplier, usageStatus)
      }
      x
    }.toMap
    Future.successful(StoreAccess(store = results, lastUpdated = DateTime.now()))
  }

  def overQuotaAgencies: List[Agency] = store.get.collect {
    case (_, status) if status.exceeded => status.usage.agency
  }.toList

  def update(): Unit = {
      // TODO reimplement
  }

}


