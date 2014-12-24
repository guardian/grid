package controllers

import play.api.mvc.Controller
import play.api.Logger
import lib.Config
import com.gu.mediaservice.lib.auth.PanDomainAuthActions
import com.gu.pandomainauth.model.User

// TODO: retire Panda entirely from kahuna, let the JS app and the APIs manage auth

object Application extends Controller with PanDomainAuthActions {

  override lazy val authCallbackBaseUri = Config.rootUri

  def index(ignored: String) = AuthAction { req =>
    logUnsupportedBrowsers(req.headers.get("User-Agent"), req.user)
    Ok(views.html.main(Config.mediaApiUri, Config.mixpanelToken))
  }

}
