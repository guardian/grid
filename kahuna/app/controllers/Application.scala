package controllers

import play.api.mvc.{Controller, Action}
import lib.Config

object Application extends Controller {

  def index(ignored: String) = Authenticated { req =>
    Ok(views.html.main(mediaApiUri = Config.mediaApiUri, user = req.user))
  }

}
