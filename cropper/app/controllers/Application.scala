package controllers

import java.net.URI

import scala.concurrent.Future

import _root_.play.api.mvc.Controller
import _root_.play.api.libs.json._
import _root_.play.api.libs.concurrent.Execution.Implicits._
import _root_.play.api.libs.ws.WS
import _root_.play.api.Logger
import _root_.play.api.Play.current

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.{Action, Link}
import com.gu.mediaservice.lib.imaging.ExportResult
import com.gu.mediaservice.model._

import org.joda.time.DateTime

import lib._
import model._


object Application extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUriTemplate, kahunaUri}
  import Permissions.{validateUserCanDeleteCrops, canUserDeleteCrops}

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  val mediaApiKey = keyStore.findKey("cropper").getOrElse(throw new Error("Missing cropper API key in key bucket"))


  val indexResponse = {
    val indexData = Map("description" -> "This is the Cropper Service")
    val indexLinks = List(
      Link("crop", s"$rootUri/crops")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }

  def export = Authenticated.async(parse.json[ExportRequest]) { httpRequest =>
    val exportRequest = httpRequest.body
    val user = httpRequest.user

    executeRequest(exportRequest, user).map { case (imageId, export) =>
      val cropJson = Json.toJson(export).as[JsObject]
      val exports  = Json.obj(
        "id" -> imageId,
        "data" -> Json.arr(cropJson)
      )

      Notifications.publish(exports, "update-image-exports")
      Ok(cropJson).as(ArgoMediaType)
    } recover {
      case InvalidImage => respondError(BadRequest, "invalid-image", InvalidImage.getMessage)
      case MissingSecureSourceUrl => respondError(BadRequest, "no-source-image", MissingSecureSourceUrl.getMessage)
      case InvalidCropRequest => respondError(BadRequest, "invalid-crop", InvalidCropRequest.getMessage)
    }
  }

  def getCrops(id: String) = Authenticated.async { httpRequest =>

    CropStore.listCrops(id) map (_.toList) flatMap { crops =>
      val deleteCropsAction =
        Action("delete-crops", URI.create(s"${Config.rootUri}/crops/$id"), "DELETE")

      val links = (for {
        crop <- crops.headOption
        link = Link("image", crop.specification.uri)
      } yield List(link)) getOrElse List()

      canUserDeleteCrops(httpRequest.user) map {
        case true if crops.nonEmpty => respond(crops, links, List(deleteCropsAction))
        case _ => respond(crops, links)
      }
    }
  }

  def deleteCrops(id: String) = Authenticated.async { httpRequest =>
    validateUserCanDeleteCrops(httpRequest.user) flatMap { user =>
      Crops.deleteCrops(id).map { _ =>
        Notifications.publish(Json.obj("id" -> id), "delete-image-exports")
        Accepted
      } recover {
        case _ => respondError(BadRequest, "deletion-error", "Could not delete crops")
      }
    } recover {
      case PermissionDeniedError => respondError(Unauthorized, "permission-denied", "You cannot delete crops")
    }
  }


  def executeRequest(exportRequest: ExportRequest, user: Principal): Future[(String, Crop)] =
    for {
      apiImage   <- fetchSourceFromApi(exportRequest.uri)
      _          <- verify(apiImage.valid, InvalidImage)
      // Image should always have dimensions, but we want to safely extract the Option
      dimensions <- ifDefined(apiImage.source.dimensions, InvalidImage)
      cropSpec    = ExportRequest.toCropSpec(exportRequest, dimensions)
      _          <- verify(Crops.isWithinImage(cropSpec.bounds, dimensions), InvalidCropRequest)
      crop        = Crop.createFromCropSource(
        by            = extractAuthor(user),
        timeRequested = Some(new DateTime()),
        specification = cropSpec
      )
      ExportResult(id, masterSizing, sizings) <- Crops.export(apiImage, crop)
      finalCrop   = Crop.createFromCrop(crop, masterSizing, sizings)
    } yield (id, finalCrop)

  def extractAuthor(user: Principal) = user match {
    case u: AuthenticatedService => Some(u.name)
    case u: PandaUser => Some(u.email)
  }

  def fetchSourceFromApi(uri: String): Future[SourceImage] = {
    val imageRequest = WS.url(uri).
      withHeaders("X-Gu-Media-Key" -> mediaApiKey).
      withQueryString("include" -> "fileMetadata")
    for (resp <- imageRequest.get)
    yield {
      if (resp.status != 200) Logger.warn(s"HTTP status ${resp.status} ${resp.statusText} from $uri")
      resp.json.as[SourceImage]
    }
  }

  def verify(cond: => Boolean, error: Throwable): Future[Unit] =
    if (cond) Future.successful(()) else Future.failed(error)

  def ifDefined[T](cond: => Option[T], error: Throwable): Future[T] =
    cond map Future.successful getOrElse Future.failed(error)

}
