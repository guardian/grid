package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.lib.play.RequestLoggingFilter
import com.gu.mediaservice.model.Agencies
import com.gu.mediaservice.model.usage.Usage
import lib._
import lib.elasticsearch.{ElasticSearch, InvalidUriParams, SearchParams}
import lib.elasticsearch.SearchParams.parseIntFromQuery
import lib.querysyntax.Parser
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}


class UsageController(auth: Authentication, config: MediaApiConfig, elasticSearch: ElasticSearch, usageQuota: UsageQuota,
                      override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  def bySupplier = auth.async { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "usage-by-supplier",
      "requestId" -> RequestLoggingFilter.getRequestId(request)
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    Future.sequence(
      Agencies.all.keys.map(elasticSearch.usageForSupplier(_, UsageStore.countPeriodInDays)))
        .map(_.toList)
        .map((s: List[SupplierQuotaCount]) => respond(s))
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

    elasticSearch.usageForSupplier(id, UsageStore.countPeriodInDays)
      .map((s: SupplierQuotaCount) => respond(s))
      .recover {
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }

  }

  def quotaCountForSupplier(id: String) = auth.async { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "quota-count-for-supplier",
      "requestId" -> RequestLoggingFilter.getRequestId(request),
      "supplierId" -> id,
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    elasticSearch.quotaCountBySupplier(id, UsageStore.countPeriodInDays)
      .map((s: SupplierUsageQuota) => respond(s))
      .recover {
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }

  def usageStatusForImage(id: String)(implicit logMarker: LogMarker): Future[SupplierUsageStatus] = for {
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
      .map((u: SupplierUsageStatus) => respond(u))
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

  def imageUsagesBySupplier(id: String) = auth.async { implicit request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "images-by-supplier",
      "requestId" -> RequestLoggingFilter.getRequestId(request),
      "supplierId" -> id,
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    val structuredQuery = request.getQueryString("q").map(Parser.run).getOrElse(List.empty)
    val searchParams = SearchParams(request)

    SearchParams.validate(searchParams) match {
      case Left(errors) =>
        Future.successful(respondError(BadRequest, InvalidUriParams.errorKey, errors.map(_.message).mkString(", ")))
      case Right(_) =>
        elasticSearch.imageUsagesBySupplier(id, structuredQuery, searchParams.offset, searchParams.length)
          .map { result =>
            respondCollection(result.images, Some(searchParams.offset.toLong), Some(result.total))
          }
          .recover {
            case e: IllegalArgumentException => respondError(BadRequest, InvalidUriParams.errorKey, e.getMessage)
            case e => respondError(InternalServerError, "unknown-error", e.toString)
          }
    }
  }
}
