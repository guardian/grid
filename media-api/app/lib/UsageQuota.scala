package lib

import akka.actor.Scheduler
import com.gu.mediaservice.lib.FeatureToggle
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.model.UsageRights
import lib.elasticsearch.ElasticSearchVersion
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.util.Try

case class ImageNotFound() extends Exception("Image not found")
case class NoUsageQuota() extends Exception("No usage found for this image")

class UsageQuota(quotaStore: QuotaStore, usageStore: UsageStore, elasticSearch: ElasticSearchVersion, scheduler: Scheduler) {
  def scheduleUpdates(): Unit = {
    quotaStore.scheduleUpdates(scheduler)
    usageStore.scheduleUpdates(scheduler)
  }

  def isOverQuota(rights: UsageRights, waitMillis: Int = 100) = Try {
    Await.result(
      usageStore.getUsageStatusForUsageRights(rights),
      waitMillis.millis)
  }.toOption.exists(_.exceeded) && FeatureToggle.get("usage-quota-ui")

  def usageStatusForImage(id: String)(implicit request: AuthenticatedRequest[AnyContent, Principal]): Future[UsageStatus] = for {
    imageOption <- elasticSearch.getImageById(id)

    image <- Future { imageOption.get }
      .recover { case _ => throw new ImageNotFound }

    usageStatus <- usageStore.getUsageStatusForUsageRights(image.usageRights)

  } yield usageStatus

}

