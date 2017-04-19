package lib

import scala.util.Try
import scala.concurrent.{Future, Await}
import scala.concurrent.duration._

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.model.{Image, Agencies, UsageRights}
import com.gu.mediaservice.lib.usage._
import com.gu.mediaservice.lib.FeatureToggle

import lib.elasticsearch.ElasticSearch


case class ImageNotFound() extends Exception("Image not found")
case class BadQuotaConfig() extends Exception("Bad config for usage quotas")
case class NoUsageQuota() extends Exception("No usage found for this image")

trait UsageQuota {
  val quotaStore: Option[QuotaStore]
  val usageStore: Option[UsageStore]

  def isOverQuota(
    rights: UsageRights,
    waitMillis: Int = 100
  ) = Try {
    Await.result(
      usageStatusForUsageRights(rights),
      waitMillis.millis)
  }.toOption.exists(_.exceeded) && FeatureToggle.get("usage-quota-ui")

  def getStoreAccess(): Future[StoreAccess] = for {
    store <- Future { usageStore.get }.recover {
      case _ => throw new BadQuotaConfig }

    storeAccess <- store.getUsageStatus()
  } yield storeAccess

  def usageStatusForUsageRights(usageRights: UsageRights): Future[UsageStatus] = {
    val usageStatusFutureOption = usageStore
      .map(_.getUsageStatusForUsageRights(usageRights))

    for {
      usageStatusFuture <- Future { usageStatusFutureOption.get }
        .recover { case e: NoSuchElementException => throw new NoUsageQuota }

      usageStatus <- usageStatusFuture
        .recover { case _ => throw new BadQuotaConfig }

    } yield usageStatus
  }

  def usageStatusForImage(id: String): Future[UsageStatus] = for {
      imageJsonOption <- ElasticSearch.getImageById(id)

      imageOption = imageJsonOption
        .flatMap(imageJson => Try { imageJson.as[Image] }.toOption)

      image <- Future { imageOption.get }
        .recover { case _ => throw new ImageNotFound }

      usageStatus <- usageStatusForUsageRights(image.usageRights)

    } yield usageStatus

}


