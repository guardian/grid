package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.model.Image._
import lib.{AdminToolsConfig, ImageDataMerger}
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}
class AdminToolsCtr(config: AdminToolsConfig, override val controllerComponents: ControllerComponents) extends BaseController with ArgoHelpers {

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

  def project(mediaId: String) = Action {
    val image = merger.getMergedImageData(mediaId)
    Ok(Json.toJson(image)).as(ArgoMediaType)
  }
}
