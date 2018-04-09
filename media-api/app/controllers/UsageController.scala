package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model.Agencies
import lib._
import lib.elasticsearch.ElasticSearch
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}


class UsageController(auth: Authentication, config: MediaApiConfig, notifications: Notifications, elasticSearch: ElasticSearch, usageQuota: UsageQuota,
                      override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  val numberOfDayInPeriod = 30

  def bySupplier = auth.async { request =>
    Future.sequence(
      Agencies.all.keys.map(elasticSearch.usageForSupplier(_, numberOfDayInPeriod)))
        .map(_.toList)
        .map((s: List[SupplierUsageSummary]) => respond(s))
        .recover {
          case e => respondError(InternalServerError, "unknown-error", e.toString)
        }
  }

  def forSupplier(id: String) = auth.async { request =>
    elasticSearch.usageForSupplier(id, numberOfDayInPeriod)
      .map((s: SupplierUsageSummary) => respond(s))
      .recover {
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }

  }

  def quotaForImage(id: String) = auth.async { request =>
    usageQuota.usageStatusForImage(id)
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
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }
}
