package controllers

import play.api.mvc.{Controller, Action}
import lib.Config

object Application extends Controller {

  def index = Action {
    Ok(views.html.main(mediaApiUri=Config.mediaApiUri))
  }

  def healthCheck = Action {
    Ok("OK")
  }

}
