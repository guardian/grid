package lib

import scala.util.Try
import scala.concurrent.{Future, Await}
import scala.concurrent.duration._

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.model.{Image, Agencies, UsageRights}
import com.gu.mediaservice.lib.FeatureToggle

import lib.elasticsearch.ElasticSearch


case class ImageNotFound() extends Exception("Image not found")
case class NoUsageQuota() extends Exception("No usage found for this image")

trait UsageQuota {
  val quotaStore: QuotaStore
  val usageStore: UsageStore

  def isOverQuota(
                   rights: UsageRights,
                   waitMillis: Int = 100
                 ) = Try {Await.result(
    usageStore.getUsageStatusForUsageRights(rights),
    waitMillis.millis)
  }.toOption
    .map(_.exceeded)
    .getOrElse(false) && FeatureToggle.get("usage-quota-ui")

  def usageStatusForImage(id: String): Future[UsageStatus] = for {
    imageJsonOption <- ElasticSearch.getImageById(id)

    imageOption = imageJsonOption
      .flatMap(imageJson => Try { imageJson.as[Image] }.toOption)

    image <- Future { imageOption.get }
      .recover { case _ => throw new ImageNotFound }

    usageStatus <- usageStore.getUsageStatusForUsageRights(image.usageRights)

  } yield usageStatus

}

