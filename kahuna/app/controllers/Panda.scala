package controllers

import lib.Config
import play.api.libs.json.Json
import play.api.mvc.{Action, Controller}
import com.gu.mediaservice.lib.auth.PanDomainAuthActions

object Panda extends Controller with PanDomainAuthActions {

  override lazy val authCallbackBaseUri = Config.rootUri

  def session = Action { implicit request =>
    readAuthenticatedUser(request).map { authedUser =>
      Ok(Json.obj("data" -> Json.obj("user" ->
        Json.obj(
          "name" -> s"${authedUser.user.firstName} ${authedUser.user.lastName}",
          "firstName" -> s"${authedUser.user.firstName}",
          "lastName" -> s"${authedUser.user.lastName}",
          "email" -> authedUser.user.email
        ))))
    }.getOrElse(Unauthorized)
  }

  // Trigger the auth cycle and return an empty page
  // Typically used for automatically re-auth'ing in the background
  def doLogin = AuthAction { req =>
    NoContent
  }

  def oauthCallback = Action.async { implicit request =>
    processGoogleCallback()
  }

  def logout = Action { implicit request =>
    processLogout
  }

}
