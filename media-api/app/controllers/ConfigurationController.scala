package controllers

import lib.crops.CropOption
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

class ConfigurationController(override val controllerComponents: ControllerComponents) extends BaseController {
    // The contents of this endpoint is not sensitive, so to avoid unnecessary complexity we have not
    // put authentication on this
    def cropVariations = Action { _ => Ok(Json.toJson(CropOption.supported)) }
}
