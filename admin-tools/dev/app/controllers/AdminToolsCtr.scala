package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.model.Image
import com.gu.mediaservice.model.Image._
import com.gu.mediaservice.{ImageDataMerger, ImageDataMergerConfig}
import lib.AdminToolsConfig
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}

class AdminToolsCtr(config: AdminToolsConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  private val cfg = ImageDataMergerConfig(config.apiKey, config.services)

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

  def project(mediaId: String) = Action.async {
    val futureMaybeImage: Future[Option[Image]] = merger.getMergedImageData(mediaId)
    futureMaybeImage.map {
      case Some(img) => Ok(Json.toJson(img)).as(ArgoMediaType)
      case None => NotFound
    }
  }
}
