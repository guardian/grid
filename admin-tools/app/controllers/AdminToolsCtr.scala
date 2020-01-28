package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.model.Image._
import lib.{AdminToolsConfig, ImageDataMerger}
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class AdminToolsCtr(config: AdminToolsConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext) extends BaseController with ArgoHelpers {

  private val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is Admin tools API"
    )
    val indexLinks = Nil
    respond(indexData, indexLinks)
  }

  def index = Action {
    indexResponse
  }
  val merger = new ImageDataMerger(config)

  def project(mediaId: String) = Action.async {
    merger.getMergedImageData(mediaId).map(i => Ok(Json.toJson(i)).as(ArgoMediaType))
  }
}
