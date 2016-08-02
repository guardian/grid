package controllers

import play.api.mvc.Controller
import play.api.mvc.{Results, Result}
import play.api.libs.concurrent.Execution.Implicits._
import scala.concurrent.Future

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.usage.{UsageStore, StoreAccess}

import lib.{Config, UsageStoreConfig}

object UsageController extends Controller with ArgoHelpers {

  val usageStore = Config.usageStoreConfig.map(c => {
    new UsageStore(
      c.storeBucket,
      c.storeKey,
      Config.awsCredentials)
  })

  val Authenticated = Authed.action

  def quotas() = Authenticated.async { request =>
    val usageStatusAccess = usageStore.map(_.getUsageStatus)

    usageStatusAccess.map(statusAccess => {
      statusAccess
        .map((status: StoreAccess) => respond(status))
    }).getOrElse(
      Future(respondError(InternalServerError, "usage-quotas-badconfig", "Missing config for UsageStore"))
    )
  }
}
