package controllers

import play.api.mvc.Controller
import play.api.mvc.{Results, Result}
import play.api.libs.concurrent.Execution.Implicits._
import scala.concurrent.{Future, Await}

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.usage.{UsageStatus, UsageStore, StoreAccess}

import com.gu.mediaservice.model.Image
import lib.elasticsearch.ElasticSearch

import lib.{Config, UsageStoreConfig}

object UsageController extends Controller with ArgoHelpers {

  val usageStore = Config.usageStoreConfig.map(c => {
    new UsageStore(
      c.storeKey,
      c.storeBucket,
      Config.awsCredentials)
  })

  val Authenticated = Authed.action

  val badConfigError = Future(
    respondError(InternalServerError, "usage-quotas-badconfig", "Missing config for UsageStore"))

  def quotaForImage(id: String) = Authenticated.async { request =>
    ElasticSearch.getImageById(id) map {
      case Some(source) => {
        val image = source.as[Image]
        val usageStatus: Option[Future[UsageStatus]] = usageStore.map(_.getUsageStatusForImage(image))

        import scala.concurrent.duration._

        // TODO: REMOVE FUTUREWANG
        val futureWang = usageStatus.map((statusFuture: Future[UsageStatus]) => {
          statusFuture
            .map((status: UsageStatus) => respond(status))
            .recover {
              case e: NoSuchElementException =>
                respondError(NotFound, "quota-not-found", "No usage quota found for this image")
              case e =>
                respondError(InternalServerError, "error-getting-quota", e.toString)
            }
        }).getOrElse(badConfigError)

        Await.result(futureWang, 30.seconds)
      }
      case _ => respondError(NotFound, "image-not-found", "No image found with the given id")
    }
  }

  def quotas() = Authenticated.async { request =>
    val usageStatusAccess = usageStore.map(_.getUsageStatus)

    usageStatusAccess.map(statusAccess => {
      statusAccess
        .map((status: StoreAccess) => respond(status))
    }).getOrElse(badConfigError)
  }
}
