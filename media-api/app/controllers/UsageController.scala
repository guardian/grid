package controllers

import scala.concurrent.Future

import play.api.mvc.Controller
import play.api.mvc.{Results, Result}
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.JsValue

import com.gu.mediaservice.model.Agencies
import com.gu.mediaservice.lib.argo.ArgoHelpers

import lib.elasticsearch.ElasticSearch

import lib._


object UsageController extends Controller with ArgoHelpers {
  val Authenticated = Authed.action
  val numberOfDayInPeriod = 30

  def bySupplier = Authenticated.async { request =>
    Future.sequence(
      Agencies.all.keys.map(ElasticSearch.usageForSupplier(_, numberOfDayInPeriod)))
        .map(_.toList)
        .map((s: List[SupplierUsageSummary]) => respond(s))
        .recover {
          case e => respondError(InternalServerError, "unknown-error", e.toString)
        }
  }

  def forSupplier(id: String) = Authenticated.async { request =>
    ElasticSearch.usageForSupplier(id, numberOfDayInPeriod)
      .map((s: SupplierUsageSummary) => respond(s))
      .recover {
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }

  }

  def quotaForImage(id: String) = Authenticated.async { request =>
    Quotas.usageStatusForImage(id)
      .map((u: UsageStatus) => respond(u))
      .recover {
        case e: ImageNotFound => respondError(NotFound, "image-not-found", e.toString)
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }

  def quotas() = Authenticated.async { request =>
    Quotas.usageStore.getUsageStatus()
      .map((s: StoreAccess) => respond(s))
      .recover {
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }
}
