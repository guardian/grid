package lib

import com.gu.mediaservice.lib.BaseStore
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{Agency, UsageRights}
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
    Future.successful(StoreAccess(store.get(), lastUpdated.get()))
  }

  def overQuotaAgencies: List[Agency] = store.get.collect {
    case (_, status) if status.exceeded => status.usage.agency
  }.toList

  def update(): Unit = {
      // TODO reimplement
  }

}

class QuotaStore(
  quotaFile: String,
  bucket: String,
  config: MediaApiConfig
)(implicit ec: ExecutionContext) extends BaseStore[String, SupplierUsageQuota](bucket, config)(ec) {

  def getQuota: Map[String, SupplierUsageQuota] = store.get()

  def update(): Unit = {
    store.set(fetchQuota)
  }

  private def fetchQuota: Map[String, SupplierUsageQuota] = {
    val quotaFileString = getS3Object(quotaFile).get

    val summary = Json
      .parse(quotaFileString)
      .as[List[SupplierUsageQuota]]

      summary.foldLeft(Map[String,SupplierUsageQuota]())((memo, quota) => {
        memo + (quota.agency.supplier -> quota)
      })
  }
}
