package controllers

import play.api.mvc.{Action, Controller}
import lib.Config

object Application extends Controller {

  def index(ignored: String) = Action { req =>
    val okPath = routes.Application.ok.url
    // If the auth is successful, we redirect to the kahuna domain so the iframe
    // is on the same domain and can be read by the JS
    val returnUri = Config.rootUri + okPath
    Ok(views.html.main(
      Config.mediaApiUri,
      Config.authUri,
      s"${Config.authUri}/login?redirectUri=$returnUri",
      Config.watUri,
      Config.sentryDsn,
      Config.sessionId))
  }

  def ok = Action { implicit request =>
    Ok("ok")
  }
}
