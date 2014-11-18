package controllers

import lib.Config
import play.api.libs.json.Json
import play.api.mvc.{Action, Controller}
import com.gu.mediaservice.lib.auth.PanDomainAuthActions
import com.gu.pandomainauth.model.AuthenticatedUser

object Panda extends Controller with PanDomainAuthActions {

  override lazy val authCallbackBaseUri = Config.rootUri

  def session = Action { implicit request =>
    readAuthenticatedUser(request).map { case AuthenticatedUser(user, _, _, _, _) =>
      Ok(Json.obj("data" -> Json.obj("user" ->
        Json.obj(
          "name"      -> s"${user.firstName} ${user.lastName}",
          "firstName" -> user.firstName,
          "lastName"  -> user.lastName,
          "email"     -> user.email,
          "avatarUrl" -> user.avatarUrl
        ))))
    }.getOrElse(Unauthorized)
  }

  // Trigger the auth cycle and return a dummy page
  // Typically used for automatically re-auth'ing in the background
  def doLogin = AuthAction { req =>
    // Note: returning NoContent as iframe content seems to make browsers unhappy
    Ok("logged in")
  }

  def oauthCallback = Action.async { implicit request =>
    processGoogleCallback()
  }

  def logout = Action { implicit request =>
    processLogout
  }

}
