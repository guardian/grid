package controllers

import lib.Config
import play.api.mvc.{Action, Controller}
import com.gu.mediaservice.lib.auth.PanDomainAuthActions
import play.api.libs.json.Json

object Panda extends Controller with PanDomainAuthActions {

  override lazy val authCallbackBaseUri = Config.rootUri

  def index = Action { implicit request =>
    readAuthenticatedUser(request).map { authedUser =>
      Ok(Json.obj("data" -> Json.obj("user" -> Json.obj("fullName" ->
          s"${authedUser.user.firstName} ${authedUser.user.lastName}"))))
    }.getOrElse(Unauthorized)
  }

  def doLogin = Action.async { implicit request =>
    sendForAuth
  }

  def oauthCallback = Action.async { implicit request =>
    processGoogleCallback()
  }

  def logout = Action { implicit request =>
    processLogout
  }

}
