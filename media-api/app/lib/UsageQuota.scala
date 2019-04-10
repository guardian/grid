package lib

import akka.actor.Scheduler
import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib.FeatureToggle
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.model.UsageRights
import lib.elasticsearch.ElasticSearchVersion
import play.api.{Configuration, Logger}
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.util.Try

case class ImageNotFound() extends Exception("Image not found")
case class NoUsageQuota() extends Exception("No usage found for this image")

trait UsageQuota {
  def usageStore: UsageStore
  def quotaStore: QuotaStore

  def isOverQuota(rights: UsageRights): Boolean
  def usageStatusForImage(id: String)(implicit request: AuthenticatedRequest[AnyContent, Principal]): Future[UsageStatus]
}

object UsageQuota {
  def build(config: Configuration, elasticSearch: ElasticSearchVersion, s3Client: AmazonS3, scheduler: Scheduler): UsageQuota = {
    val maybeConfigBucket = config.getOptional[String]("s3.config.bucket")
    val maybeUsageMailBucket = config.getOptional[String]("s3.usagemail.bucket")
    val maybeQuotaStoreKey = config.getOptional[String]("quota.store.key")

    (maybeConfigBucket, maybeUsageMailBucket, maybeQuotaStoreKey) match {
      case (Some(configBucket), Some(usageMailBucket), Some(quotaStoreKey)) =>
        val quotaStore = new QuotaStore(quotaStoreKey, configBucket, s3Client)
        val usageStore = new UsageStore(usageMailBucket, s3Client, quotaStore)

        val usageQuota = new GuardianUsageQuota(quotaStore, usageStore, elasticSearch, scheduler)
        usageQuota.scheduleUpdates()

        usageQuota

      case _ =>
        Logger.info("Running without usage or quotas")
        ???
    }
  }
}

class GuardianUsageQuota(override val quotaStore: QuotaStore, override val usageStore: UsageStore, elasticSearch: ElasticSearchVersion,
                         scheduler: Scheduler, waitMillis: Int = 100) extends UsageQuota {

  def scheduleUpdates(): Unit = {
    quotaStore.scheduleUpdates(scheduler)
    usageStore.scheduleUpdates(scheduler)
  }

  override def isOverQuota(rights: UsageRights): Boolean = Try {
    Await.result(
      usageStore.getUsageStatusForUsageRights(rights),
      waitMillis.millis)
  }.toOption.exists(_.exceeded) && FeatureToggle.get("usage-quota-ui")

  override def usageStatusForImage(id: String)(implicit request: AuthenticatedRequest[AnyContent, Principal]): Future[UsageStatus] = for {
    imageOption <- elasticSearch.getImageById(id)

    image <- Future { imageOption.get }
      .recover { case _ => throw new ImageNotFound }

    usageStatus <- usageStore.getUsageStatusForUsageRights(image.usageRights)

  } yield usageStatus

}

