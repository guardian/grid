package lib

import scala.util.Try
import scala.concurrent.{Future, Await}
import scala.concurrent.duration._

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.model.{Image, Agencies, UsageRights}
import com.gu.mediaservice.lib.FeatureToggle

import lib.elasticsearch.ElasticSearch


case class ImageNotFound() extends Exception("Image not found")
case class BadQuotaConfig(cause: Throwable) extends Exception("Bad config for usage quotas", cause)

trait UsageQuota {
  val quotaStore: Option[QuotaStore]
  val usageStore: UsageStore

  def isOverQuota(
    rights: UsageRights,
    waitMillis: Int = 100
  ) = Try {
    Await.result(
      usageStatusForUsageRights(rights),
      waitMillis.millis)
  }.toOption.exists(_.exceeded) && FeatureToggle.get("usage-quota-ui")


  def getStoreAccess(): Future[StoreAccess] = {
    usageStore.getUsageStatus()
  }

  def usageStatusForUsageRights(usageRights: UsageRights): Future[UsageStatus] = {
    usageStore.getUsageStatusForUsageRights(usageRights).recover {
      case e =>
        throw BadQuotaConfig(e)
    }
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


