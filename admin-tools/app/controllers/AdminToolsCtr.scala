package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.model.Image
import com.gu.mediaservice.model.Image._
import lib.{AdminToolsConfig, ImageDataMerger}
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}

class AdminToolsCtr(config: AdminToolsConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is Admin tools API"
    )
    val indexLinks = List(
      Link("image-projection", s"${config.rootUri}/images/{id}/project")
    )
    respond(indexData, indexLinks)
  }

  def index = Action {
    indexResponse
  }

  val merger = new ImageDataMerger(config)

  def project(mediaId: String) = Action.async {
    val maybeImageFuture: Option[Future[Image]] = merger.getMergedImageData(mediaId)
    maybeImageFuture match {
      case Some(imageFuture) =>
        imageFuture.map { image =>
          Ok(Json.toJson(image)).as(ArgoMediaType)
        }
      case None => Future(NotFound)
    }
  }
}
