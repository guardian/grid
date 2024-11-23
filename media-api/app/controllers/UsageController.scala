package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.model.{Agencies, Instance}
import lib._
import lib.elasticsearch.ElasticSearch
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}


class UsageController(auth: Authentication, config: MediaApiConfig, elasticSearch: ElasticSearch, usageQuota: UsageQuota,
                      override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers with InstanceForRequest {

  val numberOfDayInPeriod = 30

  def bySupplier = auth.async { request =>
    implicit val instance: Instance = instanceOf(request)

    Future.sequence(
      Agencies.all.keys.map(elasticSearch.usageForSupplier(_, numberOfDayInPeriod)))
        .map(_.toList)
        .map((s: List[SupplierUsageSummary]) => respond(s))
        .recover {
          case e => respondError(InternalServerError, "unknown-error", e.toString)
        }
  }

  def forSupplier(id: String) = auth.async { request =>
    implicit val instance: Instance = instanceOf(request)

    elasticSearch.usageForSupplier(id, numberOfDayInPeriod)
      .map((s: SupplierUsageSummary) => respond(s))
      .recover {
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }

  }

  def usageStatusForImage(id: String)(implicit instance: Instance): Future[UsageStatus] = for {
    imageOption <- elasticSearch.getImageById(id)

    image <- Future { imageOption.get }
      .recover { case _ => throw new ImageNotFound }

    usageStatus <- usageQuota.usageStore.getUsageStatusForUsageRights(image.usageRights)

  } yield usageStatus


  def quotaForImage(id: String) = auth.async { request =>
    implicit val instance: Instance = instanceOf(request)

    usageStatusForImage(id)
      .map((u: UsageStatus) => respond(u))
      .recover {
        case e: ImageNotFound => respondError(NotFound, "image-not-found", e.toString)
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }

  def quotas = auth.async { request =>
    usageQuota.usageStore.getUsageStatus()
      .map((s: StoreAccess) => respond(s))
      .recover {
        case e =>
          logger.error("quota access failed", e)
          respondError(InternalServerError, "unknown-error", e.toString)
      }
  }
}
