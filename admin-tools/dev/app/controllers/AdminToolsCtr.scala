package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.model.Image._
import com.gu.mediaservice.{FullImageProjectionFailed, FullImageProjectionSuccess, ImageDataMerger, ImageDataMergerConfig}
import lib.AdminToolsConfig
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext}

class AdminToolsCtr(config: AdminToolsConfig, override val controllerComponents: ControllerComponents, messageSender: ThrallMessageSender)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private val cfg = ImageDataMergerConfig(apiKey = config.apiKey, domainRoot = config.domainRoot, imageLoaderEndpointOpt = None)

  private val merger = new ImageDataMerger(cfg)

  private val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is Admin tools API"
    )
    val indexLinks = List(
      Link("image-projection", s"${config.rootUri}/images/projection/{id}")
    )
    respond(indexData, indexLinks)
  }

  def index = Action {
    indexResponse
  }

  def project(mediaId: String) = Action {
    val result = merger.getMergedImageData(mediaId)
    result match {
      case FullImageProjectionSuccess(mayBeImage) =>
        mayBeImage match {
          case Some(img) =>
            Ok(Json.toJson(img)).as(ArgoMediaType)
          case _ =>
            respondError(NotFound, "not-found", s"image with mediaId: $mediaId not found")
        }
      case FullImageProjectionFailed(expMessage, downstreamMessage) =>
        respondError(InternalServerError, "image-projection-failed", Json.obj(
          "errorMessage" -> expMessage,
          "downstreamErrorMessage" -> downstreamMessage
        ).toString)
    }
  }

  def reindex(mediaId: String) = Action {
     merger.getMergedImageData(mediaId) match {
      case FullImageProjectionSuccess(Some(image)) =>
        val message = UpdateMessage(subject = "reindex-image", image = Some(image))
        messageSender.publish(message)
        NoContent
      case FullImageProjectionSuccess(None) =>
        NotFound
      case FullImageProjectionFailed(error, downstreamError) =>
         InternalServerError(Json.obj(
           "error" -> s"Error projecting image: ${error} – ${downstreamError}"
         ))
    }
  }
}
