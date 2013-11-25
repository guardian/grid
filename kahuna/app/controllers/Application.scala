package controllers

import play.api.mvc.{SimpleResult, RequestHeader, Controller}
import lib.Config
import com.gu.mediaservice.lib.auth._


object Application extends Controller {

  def index(ignored: String) = Authenticated(redirectToLogin) { req =>
    Ok(views.html.main(mediaApiUri = Config.mediaApiUri, principal = req.user))
  }

  def redirectToLogin(request: RequestHeader): SimpleResult =
    Redirect(routes.Login.loginForm).withSession {
      request.session + ("loginFromUrl", request.uri)
    }

}
