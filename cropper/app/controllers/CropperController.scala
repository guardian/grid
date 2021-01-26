package controllers

import _root_.play.api.Logger
import _root_.play.api.libs.json._
import _root_.play.api.mvc.{BaseController, ControllerComponents}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.{DeleteCrops, PrincipalFilter}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.auth.provider.AuthorisationProvider
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.imaging.ExportResult
import com.gu.mediaservice.lib.logging.RequestLoggingContext
import com.gu.mediaservice.model._
import lib._
import model._
import org.joda.time.DateTime
import play.api.libs.ws.WSClient

import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.util.control.NonFatal


case object InvalidSource extends Exception("Invalid source URI, not a media API URI")
case object ImageNotFound extends Exception("No such image found")
case object ApiRequestFailed extends Exception("Failed to fetch the source")

class CropperController(auth: Authentication, crops: Crops, store: CropStore, notifications: Notifications,
                        config: CropperConfig,
                        override val controllerComponents: ControllerComponents,
                        ws: WSClient, authorisation: AuthorisationProvider)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  // Stupid name clash between Argo and Play
  import com.gu.mediaservice.lib.argo.model.{Action => ArgoAction}

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
      val onBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(user)

      executeRequest(exportRequest, user, onBehalfOfPrincipal).map { case (imageId, export) =>
        val cropJson = Json.toJson(export).as[JsObject]
        val updateImageExports = "update-image-exports"
        val updateMessage = UpdateMessage(subject = updateImageExports, id = Some(imageId), crops = Some(Seq(export)))
        notifications.publish(updateMessage)

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

  private val canDeleteCrops: PrincipalFilter = authorisation.hasPermissionTo(DeleteCrops)

  def getCrops(id: String) = auth.async { httpRequest =>

    store.listCrops(id) map (_.toList) map { crops =>
      val deleteCropsAction =
        ArgoAction("delete-crops", URI.create(s"${config.rootUri}/crops/$id"), "DELETE")

      val links = (for {
        crop <- crops.headOption
        link = Link("image", crop.specification.uri)
      } yield List(link)) getOrElse List()

      if(canDeleteCrops(httpRequest.user) && crops.nonEmpty) {
        respond(crops, links, List(deleteCropsAction))
      } else {
        respond(crops, links)
      }
    }
  }

  def deleteCrops(id: String) = auth.async { httpRequest =>
    if(canDeleteCrops(httpRequest.user)) {
      store.deleteCrops(id).map { _ =>
        val updateMessage = UpdateMessage(subject = "delete-image-exports", id = Some(id))
        notifications.publish(updateMessage)
        Accepted
      } recover {
        case _ => respondError(BadRequest, "deletion-error", "Could not delete crops")
      }
    } else {
      Future.successful(respondError(Unauthorized, "permission-denied", "You cannot delete crops"))
    }
  }

  def executeRequest(exportRequest: ExportRequest, user: Principal, onBehalfOfPrincipal: Authentication.OnBehalfOfPrincipal): Future[(String, Crop)] = {
    implicit val context: RequestLoggingContext = RequestLoggingContext(
      initialMarkers = Map(
        "requestType" -> "executeRequest"
      )
    )

    for {
      _ <- verify(isMediaApiUri(exportRequest.uri), InvalidSource)
      apiImage <- fetchSourceFromApi(exportRequest.uri, onBehalfOfPrincipal)
      _ <- verify(apiImage.valid, InvalidImage)
      // Image should always have dimensions, but we want to safely extract the Option
      dimensions <- ifDefined(apiImage.source.dimensions, InvalidImage)
      cropSpec = ExportRequest.toCropSpec(exportRequest, dimensions)
      _ <- verify(crops.isWithinImage(cropSpec.bounds, dimensions), InvalidCropRequest)
      crop = Crop.createFromCropSource(
        by = Some(Authentication.getIdentity(user)),
        timeRequested = Some(new DateTime()),
        specification = cropSpec
      )
      ExportResult(id, masterSizing, sizings) <- crops.export(apiImage, crop)
      finalCrop = Crop.createFromCrop(crop, masterSizing, sizings)
    } yield (id, finalCrop)
  }

  // TODO: lame, parse into URI object and compare host instead
  def isMediaApiUri(uri: String): Boolean = uri.startsWith(config.apiUri)

  def fetchSourceFromApi(uri: String, onBehalfOfPrincipal: Authentication.OnBehalfOfPrincipal): Future[SourceImage] = {

    case class HttpClientResponse(status: Int, statusText: String, json: JsValue)

    val baseRequest = ws.url(uri)
      .withQueryStringParameters("include" -> "fileMetadata")

    val request = onBehalfOfPrincipal(baseRequest)

    val responseFuture = request.get.map { r =>
      HttpClientResponse(r.status, r.statusText, Json.parse(r.body))
    }

    responseFuture recoverWith {
      case NonFatal(e) =>
        Logger.warn(s"HTTP request to fetch source failed: $e")
        Future.failed(ApiRequestFailed)
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
