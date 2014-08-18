package controllers

import play.api.mvc.{Result, RequestHeader, Controller}
import lib.Config
import com.gu.mediaservice.lib.auth._


object Application extends Controller {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)

  def index(ignored: String) = Authenticated(keyStore)(redirectToLogin) { req =>
    Ok(views.html.main(mediaApiUri = Config.mediaApiUri, principal = req.user))
  }

  def redirectToLogin(request: RequestHeader): Result =
    Redirect(routes.Login.loginForm).withSession {
      request.session + ("loginFromUrl", request.uri)
    }

}
