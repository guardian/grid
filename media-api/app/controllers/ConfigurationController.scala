package controllers

import com.gu.mediaservice.lib.auth.Authentication
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

class ConfigurationController(auth: Authentication, override val controllerComponents: ControllerComponents) extends BaseController {
    def index = auth { _ => Ok(Json.obj("hello" -> "world")) }
}
