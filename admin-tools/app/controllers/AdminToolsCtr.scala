package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import lib.AdminToolsConfig
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

}
