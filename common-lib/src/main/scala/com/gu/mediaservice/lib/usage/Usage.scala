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
