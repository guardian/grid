package controllers

import play.api.mvc.Controller
import lib.Config
import com.gu.mediaservice.lib.auth.PanDomainAuthActions

// TODO: retire Panda entirely from kahuna, let the JS app and the APIs manage auth

object Application extends Controller with PanDomainAuthActions {

  override lazy val authCallbackBaseUri = Config.rootUri

  def index(ignored: String) = AuthAction { req =>
    Ok(views.html.main(mediaApiUri = Config.mediaApiUri))
  }

}
