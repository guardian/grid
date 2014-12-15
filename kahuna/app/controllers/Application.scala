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


  // Temporary (lol) hack to dump a warning in the logs when
  // we see users with unsupported browser versions
  val SupportedFirefoxVersion = 31
  val SupportedChromeVersion  = 37
  val UaFirefox = """.* Firefox/(\d+).*""".r
  val UaChrome  = """.* Chrome/(\d+).*""".r
  def logUnsupportedBrowsers(userAgent: Option[String], user: User) = userAgent foreach {
    case UaFirefox(version) if version.toInt < SupportedFirefoxVersion =>
      Logger.warn(s"Seen user ${user.email} with unsupported browser: Firefox v$version")
    case UaChrome(version)  if version.toInt < SupportedChromeVersion =>
      Logger.warn(s"Seen user ${user.email} with unsupported browser: Chrome v$version")

    case UaFirefox(_) | UaChrome(_) =>
      // Ok, supported version of FF or Chrome

    case ua =>
      Logger.warn(s"Seen user ${user.email} with unsupported browser: $ua")
  }

}
