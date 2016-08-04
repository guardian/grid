package controllers

import play.api.mvc.Controller
import play.api.mvc.{Results, Result}
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.JsValue

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.usage.{UsageStatus, StoreAccess}

import lib.elasticsearch.ElasticSearch

import lib._


object UsageController extends Controller with ArgoHelpers {
  val Authenticated = Authed.action

  def quotaForImage(id: String) = Authenticated.async { request =>
    UsageQuota.usageStatusForImage(id)
      .map((u: UsageStatus) => respond(u))
      .recover {
        case e: ImageNotFound => respondError(NotFound, "image-not-found", e.toString)
        case e: BadQuotaConfig => respondError(InternalServerError, "bad-quota-config", e.toString)
        case e: NoUsageQuota => respondError(NotFound, "bad-quota-config", e.toString)
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }

  def quotas() = Authenticated.async { request =>
    UsageQuota.getStoreAccess()
      .map((s: StoreAccess) => respond(s))
      .recover {
        case e: BadQuotaConfig => respondError(InternalServerError, "bad-quota-config", e.toString)
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }
}
