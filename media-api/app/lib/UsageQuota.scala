package lib

import com.gu.mediaservice.lib.FeatureToggle
import com.gu.mediaservice.model.{Image, UsageRights}
import controllers.Quotas
import lib.elasticsearch.ElasticSearch

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.util.Try

import scala.concurrent.ExecutionContext.Implicits.global

case class ImageNotFound() extends Exception("Image not found")
case class NoUsageQuota() extends Exception("No usage found for this image")

class UsageQuota(config: MediaApiConfig, elasticSearch: ElasticSearch) extends Quotas(config) {

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

