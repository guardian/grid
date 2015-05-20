package controllers

import lib.Config
import play.api.libs.json.Json
import play.api.mvc.{Action, Controller}
import com.gu.mediaservice.lib.auth.{ArgoErrorResponses, PanDomainAuthActions}
import com.gu.pandomainauth.model.AuthenticatedUser
import com.gu.pandomainauth.service.GoogleAuthException

import scala.concurrent.Future
import scala.util.{Success, Try, Failure}

object Panda extends Controller
  with PanDomainAuthActions
  with ArgoErrorResponses {

  override lazy val authCallbackBaseUri = Config.rootUri
  def loginUri: String = Config.loginUri

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
    // We use the `Try` here as the `GoogleAuthException` are thrown before we
    // get to the asynchronicity of the `Future` it returns.
    Try(processGoogleCallback) match {
      case Success(result) => result
      case Failure(error) => Future.successful(error match {
        // This is when session session args are missing
        case e: GoogleAuthException =>
          respondError(BadRequest, "missing-session-parameters", e.getMessage, loginLinks)
      })
    }
  }

  def logout = Action { implicit request =>
    processLogout
  }

}
