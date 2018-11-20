package controllers

import java.net.URI

import _root_.play.api.Logger
import _root_.play.api.libs.json._
import _root_.play.api.mvc.{BaseController, ControllerComponents}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.{Authentication, PermissionDeniedError, Permissions, PermissionsHandler}
import com.gu.mediaservice.lib.imaging.ExportResult
import com.gu.mediaservice.model._
import lib._
import model._
import org.joda.time.DateTime

import scala.concurrent.{ExecutionContext, Future}
import scala.util.control.NonFatal


case object InvalidSource extends Exception("Invalid source URI, not a media API URI")
case object ImageNotFound extends Exception("No such image found")
case object ApiRequestFailed extends Exception("Failed to fetch the source")

class CropperController(auth: Authentication, crops: Crops, store: CropStore, notifications: Notifications,
                        override val config: CropperConfig,
                        override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers with PermissionsHandler {

  // Stupid name clash between Argo and Play
  import com.gu.mediaservice.lib.argo.model.{Action => ArgoAction}

  val mediaApiKey = auth.keyStore.findKey("cropper").getOrElse(throw new Error("Missing cropper API key in key bucket"))


  val indexResponse = {
    val indexData = Map("description" -> "This is the Cropper Service")
    val indexLinks = List(
      Link("crop", s"${config.rootUri}/crops")
    )
    respond(indexData, indexLinks)
  }

  def index = auth { indexResponse }

  def export = auth.async(parse.json) { httpRequest =>
    httpRequest.body.validate[ExportRequest] map { exportRequest =>
      val user = httpRequest.user

      executeRequest(exportRequest, user).map { case (imageId, export) =>
        val cropJson = Json.toJson(export).as[JsObject]
        val exports = Json.obj(
          "id" -> imageId,
          "data" -> Json.arr(cropJson)
        )

        notifications.publish(exports, "update-image-exports")
        Ok(cropJson).as(ArgoMediaType)
      } recover {
        case InvalidSource => respondError(BadRequest, "invalid-source", InvalidSource.getMessage)
        case ImageNotFound => respondError(BadRequest, "image-not-found", ImageNotFound.getMessage)
        case InvalidImage => respondError(BadRequest, "invalid-image", InvalidImage.getMessage)
        case MissingSecureSourceUrl => respondError(BadRequest, "no-source-image", MissingSecureSourceUrl.getMessage)
        case InvalidCropRequest => respondError(BadRequest, "invalid-crop", InvalidCropRequest.getMessage)
        case ApiRequestFailed => respondError(BadGateway, "api-failed", ApiRequestFailed.getMessage)
      }
    } recoverTotal {
      case e =>
        val validationErrors = for {
          (_, errors)  <- e.errors
          errorDetails <- errors
        } yield errorDetails.message
        val errorMessage = validationErrors.headOption getOrElse "Invalid export request"
        Future.successful(respondError(BadRequest, "bad-request", errorMessage))
    }
  }

  def getCrops(id: String) = auth.async { httpRequest =>

    store.listCrops(id) map (_.toList) flatMap { crops =>
      val deleteCropsAction =
        ArgoAction("delete-crops", URI.create(s"${config.rootUri}/crops/$id"), "DELETE")

      val links = (for {
        crop <- crops.headOption
        link = Link("image", crop.specification.uri)
      } yield List(link)) getOrElse List()

      hasPermission(httpRequest.user, Permissions.DeleteCrops) map {
        case true if crops.nonEmpty => respond(crops, links, List(deleteCropsAction))
        case _ => respond(crops, links)
      }
    }
  }

  def deleteCrops(id: String) = auth.async { httpRequest =>

    hasPermission(httpRequest.user, Permissions.DeleteCrops) flatMap { _ =>
      store.deleteCrops(id).map { _ =>
        notifications.publish(Json.obj("id" -> id), "delete-image-exports")
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
      _          <- verify(isMediaApiUri(exportRequest.uri), InvalidSource)
      apiImage   <- fetchSourceFromApi(exportRequest.uri)
      _          <- verify(apiImage.valid, InvalidImage)
      // Image should always have dimensions, but we want to safely extract the Option
      dimensions <- ifDefined(apiImage.source.dimensions, InvalidImage)
      cropSpec    = ExportRequest.toCropSpec(exportRequest, dimensions)
      _          <- verify(crops.isWithinImage(cropSpec.bounds, dimensions), InvalidCropRequest)
      crop        = Crop.createFromCropSource(
        by            = Some(Authentication.getEmail(user)),
        timeRequested = Some(new DateTime()),
        specification = cropSpec
      )
      ExportResult(id, masterSizing, sizings) <- crops.export(apiImage, crop)
      finalCrop   = Crop.createFromCrop(crop, masterSizing, sizings)
    } yield (id, finalCrop)

  // TODO: lame, parse into URI object and compare host instead
  def isMediaApiUri(uri: String): Boolean = uri.startsWith(config.apiUri)

  import org.apache.http.client.methods.HttpGet
  import org.apache.http.client.utils.URIBuilder
  import org.apache.http.impl.client.HttpClients

  import scala.io.Source

  def fetchSourceFromApi(uri: String): Future[SourceImage] = {

    case class HttpClientResponse(status: Int, statusText: String, json: JsValue)

    val uriWithParams = new URIBuilder(uri)
      .setParameter("include", "fileMetadata")
      .build

    // MUTANT!
    val httpGet = new HttpGet(uriWithParams)
    httpGet.addHeader("X-Gu-Media-Key", mediaApiKey)

    val httpClientResponse = HttpClients.createDefault()
      .execute(httpGet)

    val responseFuture = Future {
      val statusLine = httpClientResponse.getStatusLine()
      val httpEntity = httpClientResponse.getEntity()

      val status         = statusLine.getStatusCode
      val statusText     = statusLine.getReasonPhrase

      val entityAsString = Source.fromInputStream(httpEntity.getContent).mkString
      val json           = Json.parse(entityAsString)

      HttpClientResponse(status, statusText, json)
    }

    responseFuture recoverWith {
      case NonFatal(e) =>
          Logger.warn(s"HTTP request to fetch source failed: $e")
          Future.failed(ApiRequestFailed)
    }

    responseFuture onComplete {
      case _ => httpClientResponse.close()
    }

    for (resp <- responseFuture)
    yield {
      if (resp.status == 404) {
        throw ImageNotFound
      } else if (resp.status != 200) {
        Logger.warn(s"HTTP status ${resp.status} ${resp.statusText} from $uri")
        throw ApiRequestFailed
      } else {
        resp.json.as[SourceImage]
      }
    }
  }

  def verify(cond: => Boolean, error: Throwable): Future[Unit] =
    if (cond) Future.successful(()) else Future.failed(error)

  def ifDefined[T](cond: => Option[T], error: Throwable): Future[T] =
    cond map Future.successful getOrElse Future.failed(error)

}
