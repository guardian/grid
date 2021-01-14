package lib

import akka.actor.Scheduler
import com.gu.mediaservice.lib.FeatureToggle
import com.gu.mediaservice.model.UsageRights

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.util.Try

case class ImageNotFound() extends Exception("Image not found")
case class NoUsageQuota() extends Exception("No usage found for this image")

class UsageQuota(config: MediaApiConfig, scheduler: Scheduler) {
  val quotaStore = new QuotaStore(
    config.quotaStoreConfig.storeKey,
    config.quotaStoreConfig.storeBucket,
    config
  )

  val usageStore = new UsageStore(
    config.usageMailBucket,
    config,
    quotaStore
  )

  def scheduleUpdates(): Unit = {
    quotaStore.scheduleUpdates(scheduler)
    usageStore.scheduleUpdates(scheduler)
  }

  def stopUpdates(): Unit = {
    quotaStore.stopUpdates()
    usageStore.stopUpdates()
  }

  def isOverQuota(rights: UsageRights, waitMillis: Int = 100): Boolean = Try {
    Await.result(
      usageStore.getUsageStatusForUsageRights(rights),
      waitMillis.millis)
  }.toOption.exists(_.exceeded) && FeatureToggle.get("usage-quota-ui")
}

