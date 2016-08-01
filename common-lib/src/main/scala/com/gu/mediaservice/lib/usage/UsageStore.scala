package com.gu.mediaservice.lib.usage

import org.joda.time.DateTime

import play.api.libs.concurrent.Execution.Implicits._

import com.amazonaws.auth.AWSCredentials

import com.gu.mediaservice.lib.BaseStore

import com.gu.mediaservice.model.Agency


case class SupplierUsageQuota(agency: Agency, quota: Int)
case class SupplierUsageSummary(agency: Agency, count: Int)
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
