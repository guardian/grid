package com.gu.mediaservice.lib.usage

import java.io.InputStream
import scala.io.Source

import org.joda.time.DateTime

import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json._

import com.amazonaws.auth.AWSCredentials

import com.gu.mediaservice.lib.BaseStore

import com.gu.mediaservice.model.Agency


case class SupplierUsageQuota(agency: Agency, quota: Int)
case class SupplierUsageSummary(agency: Agency, count: Int)
object SupplierUsageSummary {
  implicit val reads: Reads[SupplierUsageSummary] = Json.reads[SupplierUsageSummary]
}
case class UsageStatus(
  exceeded: Boolean,
  percentOfQuota: Float,
  usage: SupplierUsageSummary,
  quota: SupplierUsageQuota
)

class UsageStore(usageFile: String, bucket: String, credentials: AWSCredentials) extends BaseStore[String, UsageStatus](bucket, credentials) {
  def update() {
    lastUpdated.sendOff(_ => DateTime.now())
    store.sendOff(_ => fetchUsage)
  }

  private def fetchUsage: Map[String, UsageStatus] = {
    val inputStream = s3.client
      .getObject(bucket, usageFile)
      .getObjectContent

    val usageFileString = Source
      .fromInputStream(inputStream).mkString

    val usageStatus = Json
      .parse(usageFileString)
      .as[List[SupplierUsageSummary]]

    Map("test" -> UsageStatus(
      true,
      120,
      SupplierUsageSummary(
        Agency("Test"),
        120
      ),
      SupplierUsageQuota(
        Agency("Test"),
        100
      )
    ))
  }
}
