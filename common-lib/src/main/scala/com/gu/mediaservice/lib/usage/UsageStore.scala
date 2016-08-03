package com.gu.mediaservice.lib.usage

import java.io.InputStream
import scala.io.Source
import scala.concurrent.Future

import org.joda.time.DateTime

import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.amazonaws.auth.AWSCredentials

import com.gu.mediaservice.lib.BaseStore

import com.gu.mediaservice.model.{UsageRights, Agency, Agencies, DateFormat}


case class SupplierUsageQuota(agency: Agency, count: Int)
object SupplierUsageQuota {
  implicit val writes: Writes[SupplierUsageQuota] = (
    (__ \ "agency").write[String].contramap((a: Agency) => a.supplier) ~
    (__ \ "count").write[Int]
  )(unlift(SupplierUsageQuota.unapply))

}

case class SupplierUsageSummary(agency: Agency, count: Int)
object SupplierUsageSummary {
  implicit val customReads: Reads[SupplierUsageSummary] = (
    (__ \ "Supplier").read[String].map(Agency(_)) ~
    (__ \ "Usage").read[Int]
  )(SupplierUsageSummary.apply _)

  implicit val writes: Writes[SupplierUsageSummary] = (
    (__ \ "agency").write[String].contramap((a: Agency) => a.supplier) ~
    (__ \ "count").write[Int]
  )(unlift(SupplierUsageSummary.unapply))
}

case class UsageStatus(
  exceeded: Boolean,
  fractionOfQuota: Float,
  usage: SupplierUsageSummary,
  quota: Option[SupplierUsageQuota]
)
object UsageStatus {
  implicit val dateTimeFormat = DateFormat
  implicit val writes: Writes[UsageStatus] = Json.writes[UsageStatus]
}

case class StoreAccess(store: Map[String, UsageStatus], lastUpdated: DateTime)
object StoreAccess {
  implicit val writes: Writes[StoreAccess] = Json.writes[StoreAccess]
}

class UsageStore(
  usageFile: String,
  bucket: String,
  credentials: AWSCredentials,
  supplierQuota: Map[String, SupplierUsageQuota] = Map()
) extends BaseStore[String, UsageStatus](bucket, credentials) {

  def getUsageStatusForUsageRights(usageRights: UsageRights) = {
    val storeFuture = store.future

    val imageSupplierFuture = Future { usageRights match {
      case a: Agency => a
      case _ => throw new Exception("Image is not supplied by Agency")
    }}

    for {
      store <- storeFuture
      imageSupplier <- imageSupplierFuture
      usageReport = store.get(imageSupplier.supplier)

      if !usageReport.isEmpty
    } yield usageReport.get

  }

  def getUsageStatus(): Future[StoreAccess] = for {
      s <- store.future
      l <- lastUpdated.future
    } yield StoreAccess(s,l)

  def update() {
    lastUpdated.sendOff(_ => DateTime.now())
    store.sendOff(_ => fetchUsage)
  }

  private def fetchUsage: Map[String, UsageStatus] = {
    val usageFileString = getS3Object(usageFile).get

    val summary = Json
      .parse(usageFileString)
      .as[List[SupplierUsageSummary]]

    def copyAgency(supplier: SupplierUsageSummary, id: String) = Agencies.all.get(id)
      .map(a => supplier.copy(agency = a))
      .getOrElse(supplier)

    val cleanedSummary = summary
      .map {
        case s if s.agency.supplier.contains("Rex Features") => copyAgency(s, "rex")
        case s if s.agency.supplier.contains("Australian Associated Press") => copyAgency(s, "aap")
        case s if s.agency.supplier.contains("Alamy") => copyAgency(s, "alamy")
        case s => s
      }

    cleanedSummary
      .groupBy(_.agency.supplier)
      .mapValues(_.head)
      .mapValues((summary: SupplierUsageSummary) => {
        val quota = summary.agency.id.flatMap(id => supplierQuota.get(id))
        val exceeded = quota.map(q => summary.count > q.count).getOrElse(false)
        val fractionOfQuota: Float = quota.map(q => summary.count.toFloat / q.count).getOrElse(0F)

        UsageStatus(
          exceeded,
          fractionOfQuota,
          summary,
          quota
        )
      })
  }
}
