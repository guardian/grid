package controllers

import play.api.mvc.{Action, Controller}

object Application extends Controller {

  def index = Action {
    Ok("This is the Crop Service.\n")
  }

}
