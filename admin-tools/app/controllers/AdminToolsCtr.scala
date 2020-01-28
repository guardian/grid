package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

class AdminToolsCtr(auth: Authentication, override val controllerComponents: ControllerComponents) extends BaseController with ArgoHelpers {

  private val indexResponse = {
    val indexData = Json.obj(
      "description" -> "This is Admin tools API"
    )
    val indexLinks = Nil
    respond(indexData, indexLinks)
  }

  def index = auth {
    indexResponse
  }

}
