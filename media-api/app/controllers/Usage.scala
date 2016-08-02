package controllers

import play.api.mvc.Controller
import play.api.libs.concurrent.Execution.Implicits._
import scala.concurrent.Future

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.usage.UsageStore

import lib.Config

object UsageController extends Controller with ArgoHelpers {

  val usageStore = new UsageStore(
    Config.usageStoreBucket,
    Config.usageStoreKey,
    Config.awsCredentials)

  val Authenticated = Authed.action

  def quotas() = Authenticated.async { request =>
    val foo = usageStore.getUsageStatus


    Future { Ok }
  }

}
