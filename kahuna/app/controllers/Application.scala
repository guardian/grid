package controllers

import play.api.mvc.{Controller, Action}


object Application extends Controller {

  def index = Action {
    Ok("This is Kahuna.\n")
  }

  def healthCheck = Action {
    Ok("OK")
  }

}
