package lib

import akka.actor.{ActorSystem, Scheduler}
import com.gu.mediaservice.lib.FeatureToggle
import com.gu.mediaservice.model.{Image, UsageRights}
import lib.elasticsearch.ElasticSearch

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.util.Try

case class ImageNotFound() extends Exception("Image not found")
case class NoUsageQuota() extends Exception("No usage found for this image")

class UsageQuota(config: MediaApiConfig, elasticSearch: ElasticSearch, scheduler: Scheduler) {
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
    scheduler.schedule(0.seconds, 10.minutes) { quotaStore.update() }
    scheduler.schedule(0.seconds, 10.minutes) { usageStore.update() }
  }

  def isOverQuota(rights: UsageRights, waitMillis: Int = 100) = Try {
    Await.result(
      usageStore.getUsageStatusForUsageRights(rights),
      waitMillis.millis)
  }.toOption.exists(_.exceeded) && FeatureToggle.get("usage-quota-ui")

  def usageStatusForImage(id: String): Future[UsageStatus] = for {
    imageJsonOption <- elasticSearch.getImageById(id)

    imageOption = imageJsonOption
      .flatMap(imageJson => Try { imageJson.as[Image] }.toOption)

    image <- Future { imageOption.get }
      .recover { case _ => throw new ImageNotFound }

    usageStatus <- usageStore.getUsageStatusForUsageRights(image.usageRights)

  } yield usageStatus

}

