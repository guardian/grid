package controllers

import java.net.URI

import lib.Config
import play.api.libs.json.Json
import play.api.mvc.{Action, Controller}
import com.gu.mediaservice.lib.auth.{ArgoErrorResponses, PanDomainAuthActions}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth._
import com.gu.pandomainauth.service.GoogleAuthException

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global
import scala.util.{Success, Try, Failure}

object Panda extends Controller
  with PanDomainAuthActions
  with ArgoHelpers
  with ArgoErrorResponses {

  override lazy val authCallbackBaseUri = Config.rootUri
  override lazy val loginUriTemplate    = Config.loginUriTemplate

  import Config.domainRoot

  val Authenticated = new PandaAuthenticated(loginUriTemplate, authCallbackBaseUri)

  def session = Authenticated { request =>
    request.user match {
      case PandaUser(email, firstName, lastName, avatarUrl) =>
        respond(
          Json.obj("user" ->
            Json.obj(
              "name"      -> s"$firstName $lastName",
              "firstName" -> firstName,
              "lastName"  -> lastName,
              "email"     -> email,
              "avatarUrl" -> avatarUrl
            )
          )
        )
      case _ =>
        // Should never get in here
        respondError(BadRequest, "non-user-session", "Unexpected non-user session")
    }
  }


  def isOwnDomainAndSecure(uri: URI): Boolean = {
    uri.getHost.endsWith(domainRoot) && uri.getScheme == "https"
  }
  def isValidDomain(inputUri: String): Boolean = {
    Try(URI.create(inputUri)).filter(isOwnDomainAndSecure).isSuccess
  }


  // Trigger the auth cycle
  // If a redirectUri is provided, redirect the browser there once auth'd,
  // else return a dummy page (e.g. for automatically re-auth'ing in the background)
  // FIXME: validate redirectUri before doing the auth
  def doLogin(redirectUri: Option[String] = None) = AuthAction { req =>
    redirectUri map {
      case uri if isValidDomain(uri) => Redirect(uri)
      case _ => Ok("logged in (not redirecting to external redirectUri)")
    } getOrElse Ok("logged in")
  }

  def oauthCallback = Action.async { implicit request =>
    // We use the `Try` here as the `GoogleAuthException` are thrown before we
    // get to the asynchronicity of the `Future` it returns.
    // We then have to flatten the Future[Future[T]]. Fiddly...
    Future.fromTry(Try(processGoogleCallback)).flatMap(successF => successF).recover {
      // This is when session session args are missing
      case e: GoogleAuthException =>
        respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks)
    }
  }

  def logout = Action { implicit request =>
    processLogout
  }

}
