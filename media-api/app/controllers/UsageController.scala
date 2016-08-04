package controllers

import play.api.mvc.Controller
import play.api.mvc.{Results, Result}
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.JsValue

import scala.concurrent.{Future, Await}
import scala.util.Try

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.usage.{UsageStatus, UsageStore, StoreAccess, SupplierUsageQuota}

import com.gu.mediaservice.model.{Image, Agencies, UsageRights}
import lib.elasticsearch.ElasticSearch

import lib.{Config, UsageStoreConfig}

case class ImageNotFound() extends Exception("Image not found")
case class BadQuotaConfig() extends Exception("Bad config for usage quotas")
case class NoUsageQuota() extends Exception("No usage found for this image")

object UsageHelper {
  val supplierQuota = Config.quotaConfig.map {
    case (k,v) => k -> SupplierUsageQuota(Agencies.get(k), v)}

  val usageStore = Config.usageStoreConfig.map(c => {
    new UsageStore(
      c.storeKey,
      c.storeBucket,
      Config.awsCredentials,
      supplierQuota
    )
  })

  def getStoreAccess(): Future[StoreAccess] = for {
    store <- Future { usageStore.get }.recover {
      case _ => throw new BadQuotaConfig }

    storeAccess <- store.getUsageStatus()
  } yield storeAccess

  def usageStatusForUsageRights(usageRights: UsageRights): Future[UsageStatus] = {
    val usageStatusFutureOption = usageStore
      .map(_.getUsageStatusForUsageRights(usageRights))

    for {
      usageStatusFuture <- Future { usageStatusFutureOption.get }
        .recover { case e: NoSuchElementException => throw new NoUsageQuota }

      usageStatus <- usageStatusFuture
        .recover { case _ => throw new BadQuotaConfig }

    } yield usageStatus
  }

  def usageStatusForImage(id: String): Future[UsageStatus] = for {
      imageJsonOption <- ElasticSearch.getImageById(id)

      imageOption = imageJsonOption
        .flatMap(imageJson => Try { imageJson.as[Image] }.toOption)

      image <- Future { imageOption.get }
        .recover { case _ => throw new ImageNotFound }

      usageStatus <- usageStatusForUsageRights(image.usageRights)

    } yield usageStatus

}

object UsageController extends Controller with ArgoHelpers {
  val Authenticated = Authed.action

  def quotaForImage(id: String) = Authenticated.async { request =>
    UsageHelper.usageStatusForImage(id)
      .map((u: UsageStatus) => respond(u))
      .recover {
        case e: ImageNotFound => respondError(NotFound, "image-not-found", e.toString)
        case e: BadQuotaConfig => respondError(InternalServerError, "bad-quota-config", e.toString)
        case e: NoUsageQuota => respondError(NotFound, "bad-quota-config", e.toString)
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }

  def quotas() = Authenticated.async { request =>
    UsageHelper.getStoreAccess()
      .map((s: StoreAccess) => respond(s))
      .recover {
        case e: BadQuotaConfig => respondError(InternalServerError, "bad-quota-config", e.toString)
        case e => respondError(InternalServerError, "unknown-error", e.toString)
      }
  }
}
