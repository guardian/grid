package com.gu.mediaservice.lib.usage

import java.io.InputStream
import scala.io.Source
import scala.concurrent.Future

import org.joda.time.DateTime

import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._

import com.amazonaws.auth.AWSCredentials

import com.gu.mediaservice.lib.BaseStore

import com.gu.mediaservice.model.Agency


case class SupplierUsageQuota(agency: Agency, count: Int)
object SupplierUsageQuota {
  implicit val writes: Writes[SupplierUsageQuota] = Json.writes[SupplierUsageQuota]
}

case class SupplierUsageSummary(agency: Agency, count: Int)
object SupplierUsageSummary {
  implicit val reads: Reads[SupplierUsageSummary] = Json.reads[SupplierUsageSummary]
  implicit val writes: Writes[SupplierUsageSummary] = Json.writes[SupplierUsageSummary]
}

case class UsageStatus(
  exceeded: Boolean,
  percentOfQuota: Float,
  usage: SupplierUsageSummary,
  quota: Option[SupplierUsageQuota]
)
object UsageStatus {
  implicit val writes: Writes[UsageStatus] = Json.writes[UsageStatus]
}

case class StoreAccess(store: Map[String, UsageStatus], lastUpdated: DateTime)
object StoreAccess {
  implicit val writes: Writes[StoreAccess] = Json.writes[StoreAccess]
}

class UsageStore(
  usageFile: String,
  bucket: String,
  credentials: AWSCredentials
) extends BaseStore[String, UsageStatus](bucket, credentials) {

  def getUsageStatus(): Future[StoreAccess] = for {
      s <- store.future
      l <- lastUpdated.future
    } yield StoreAccess(s,l)

  def update() {
    lastUpdated.sendOff(_ => DateTime.now())
    store.sendOff(_ => fetchUsage)
  }

  val supplierQuota = Map(
    "test" -> SupplierUsageQuota(Agency("test"), 1)
  )

  private def fetchUsage: Map[String, UsageStatus] = {
    val usageFileString = getS3Object(usageFile).get

    val usageStatus = Json
      .parse(usageFileString)
      .as[List[SupplierUsageSummary]]

    usageStatus
      .groupBy(_.agency.toString)
      .mapValues(_.head)
      .mapValues((summary: SupplierUsageSummary) => {
        val quota = supplierQuota.get(summary.agency.toString)
        val exceeded = quota.map(q => summary.count > q.count).getOrElse(false)
        val percentOfQuota: Float = quota.map(q => q.count.toFloat / summary.count).getOrElse(0F)

        UsageStatus(
          exceeded,
          percentOfQuota,
          summary,
          quota
        )
      })
  }
}
