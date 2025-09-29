package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.lib.play.RequestLoggingFilter
import com.gu.mediaservice.model.Agencies
import lib._
import lib.elasticsearch.ElasticSearch
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}


class UsageController(auth: Authentication, config: MediaApiConfig, elasticSearch: ElasticSearch, usageQuota: UsageQuota,
                      override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  val numberOfDayInPeriod = 30

  def bySupplier = auth.async { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "usage-by-supplier",
      "requestId" -> RequestLoggingFilter.getRequestId(request)
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    Future.sequence(
      Agencies.all.keys.map(elasticSearch.usageForSupplier(_, numberOfDayInPeriod)))
        .map(_.toList)
        .map((s: List[SupplierUsageSummary]) => respond(s))
        .recover {
          case e => respondError(InternalServerError, "unknown-error", e.toString)
        }
  }

  def forSupplier(id: String) = auth.async { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "usage-for-supplier",
      "requestId" -> RequestLoggingFilter.getRequestId(request),
      "imageId" -> id,
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    elasticSearch.usageForSupplier(id, numberOfDayInPeriod)
      .map((s: SupplierUsageSummary) => respond(s))
      .recover {
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }

  }

  def usageStatusForImage(id: String)(implicit logMarker: LogMarker): Future[UsageStatus] = for {
    imageOption <- elasticSearch.getImageById(id)

    image <- Future { imageOption.get }
      .recover { case _ => throw new ImageNotFound }

    usageStatus <- usageQuota.usageStore.getUsageStatusForUsageRights(image.usageRights)

  } yield usageStatus


  def quotaForImage(id: String) = auth.async { request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "quota-for-image",
      "requestId" -> RequestLoggingFilter.getRequestId(request),
      "imageId" -> id,
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    usageStatusForImage(id)
      .map((u: UsageStatus) => respond(u))
      .recover {
        case e: ImageNotFound => respondError(NotFound, "image-not-found", e.toString)
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }

  def quotas = auth.async { request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "quotas",
      "requestId" -> RequestLoggingFilter.getRequestId(request)
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    usageQuota.usageStore.getUsageStatus()
      .map((s: StoreAccess) => respond(s))
      .recover {
        case e =>
          logger.error(logMarker, "quota access failed", e)
          respondError(InternalServerError, "unknown-error", e.toString)
      }
  }
}
