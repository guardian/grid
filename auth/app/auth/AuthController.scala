package auth

import java.net.URI
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProviders
import com.gu.mediaservice.lib.auth.{Authentication, Permissions, PermissionsHandler}
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents, Result}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class AuthController(auth: Authentication, providers: AuthenticationProviders, val config: AuthConfig,
                     override val controllerComponents: ControllerComponents)(implicit ec: ExecutionContext)
  extends BaseController
  with ArgoHelpers
  with PermissionsHandler {

  val indexResponse = {
    val indexData = Map("description" -> "This is the Auth API")
    val indexLinks = List(
      Link("root",          config.mediaApiUri),
      Link("login",         config.services.loginUriTemplate),
      Link("ui:logout",     s"${config.rootUri}/logout"),
      Link("session",       s"${config.rootUri}/session")
    )
    respond(indexData, indexLinks)
  }

  def index = auth { indexResponse }

  def session = auth { request =>
    val showPaid = hasPermission(request.user, Permissions.ShowPaid)
    request.user match {
      case UserPrincipal(firstName, lastName, email, _) =>

        respond(
          Json.obj("user" ->
            Json.obj(
              "name" -> s"$firstName $lastName",
              "firstName" -> firstName,
              "lastName" -> lastName,
              "email" -> email,
              "permissions" ->
                Json.obj(
                  "showPaid" -> showPaid
                )
            )
          )
        )
      case MachinePrincipal(accessor, _) => respond(
        Json.obj("api-key" ->
          Json.obj(
            "name" -> accessor.identity,
            "tier" -> accessor.tier.toString,
            "permissions" ->
              Json.obj(
                "showPaid" -> showPaid
              )
          )
        )
      )
    }
  }


  def isOwnDomainAndSecure(uri: URI): Boolean = {
    uri.getHost.endsWith(config.domainRoot) && uri.getScheme == "https"
  }
  def isValidDomain(inputUri: String): Boolean = {
    val success = Try(URI.create(inputUri)).filter(isOwnDomainAndSecure).isSuccess
    if (!success) logger.warn(s"Provided login redirect URI is invalid: $inputUri")
    success
  }

  // Play session key used to store the URI to redirect to during login
  val REDIRECT_SESSION_KEY = "gridRedirectUri"

  // Trigger the auth cycle
  // If a redirectUri is provided, redirect the browser there once auth'd,
  // else return a dummy page (e.g. for automatically re-auth'ing in the background)
  def doLogin(redirectUri: Option[String] = None) = Action.async { implicit req =>
    val checkedRedirectUri = redirectUri collect {
      case uri if isValidDomain(uri) => uri
    }
    providers.userProvider.sendForAuthentication match {
      case Some(authCallback) =>
        authCallback(req).map(_.addingToSession(checkedRedirectUri.map(REDIRECT_SESSION_KEY -> _).toSeq:_*))
      case None =>
        Future.successful(InternalServerError("Login not supported by configured authentication provider"))
    }
  }

  def oauthCallback = Action.async { implicit request =>
    providers.userProvider.sendForAuthenticationCallback match {
      case Some(callback) =>
        val maybeRedirectUri = request.session.get(REDIRECT_SESSION_KEY)
        callback(request, maybeRedirectUri).map(_.removingFromSession(REDIRECT_SESSION_KEY))
      case None =>
        Future.successful(InternalServerError("No callback for configured authentication provider"))
    }
  }

  def logout = Action { implicit request =>
    val result: Result = providers.userProvider.flushToken match {
      case Some(callback) => callback(request, Ok("Logged out"))
      case None => InternalServerError("Logout not supported by configured authentication provider")
    }
    result.withNewSession
  }
}
