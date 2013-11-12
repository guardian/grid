package controllers

import play.api.mvc.{Controller, Action}


object Application extends Controller {

  def index = Action {
    Ok(views.html.main())
  }

  def healthCheck = Action {
    Ok("OK")
  }

}
