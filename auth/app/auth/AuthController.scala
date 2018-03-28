package auth

import java.net.URI

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.{ArgoErrorResponses, Authentication}
import com.gu.pandomainauth.model.{User => PandaUser}
import com.gu.pandomainauth.service.GoogleAuthException
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class AuthController(auth: Authentication, config: AuthConfig,
                     override val controllerComponents: ControllerComponents,
                     override val loginUriTemplate: String)(implicit ec: ExecutionContext)
  extends BaseController
  with ArgoHelpers
  with ArgoErrorResponses {

  val indexResponse = {
    val indexData = Map("description" -> "This is the Auth API")
    val indexLinks = List(
      Link("root",          config.mediaApiUri),
      Link("login",         loginUriTemplate),
      Link("ui:logout",     s"${config.rootUri}/logout"),
      Link("session",       s"${config.rootUri}/session"),
      Link("permissions",   s"${config.rootUri}/permissions")
    )
    respond(indexData, indexLinks)
  }

  def index = auth.AuthAction { indexResponse }

  def session = auth.AuthAction { request =>
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
    uri.getHost.endsWith(config.domainRoot) && uri.getScheme == "https"
  }
  def isValidDomain(inputUri: String): Boolean = {
    Try(URI.create(inputUri)).filter(isOwnDomainAndSecure).isSuccess
  }


  // Trigger the auth cycle
  // If a redirectUri is provided, redirect the browser there once auth'd,
  // else return a dummy page (e.g. for automatically re-auth'ing in the background)
  // FIXME: validate redirectUri before doing the auth
  def doLogin(redirectUri: Option[String] = None) = auth.AuthAction { req =>
    redirectUri map {
      case uri if isValidDomain(uri) => Redirect(uri)
      case _ => Ok("logged in (not redirecting to external redirectUri)")
    } getOrElse Ok("logged in")
  }

  def oauthCallback = Action.async { implicit request =>
    // We use the `Try` here as the `GoogleAuthException` are thrown before we
    // get to the asynchronicity of the `Future` it returns.
    // We then have to flatten the Future[Future[T]]. Fiddly...
    Future.fromTry(Try(auth.processGoogleCallback)).flatMap(successF => successF).recover {
      // This is when session session args are missing
      case e: GoogleAuthException =>
        respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks)
    }
  }

  def logout = Action { implicit request =>
    auth.processLogout
  }
}
