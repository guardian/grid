package controllers

import com.gu.mediaservice.lib.auth.Authentication
import lib.crops.CropOption
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

class ConfigurationController(override val controllerComponents: ControllerComponents) extends BaseController {
    def cropVariations = Action { _ => Ok(Json.toJson(CropOption.supported)) }
}
