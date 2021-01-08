package auth

import java.net.URI
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{ApiKeyAccessor, GridUser}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProviders
import com.gu.mediaservice.lib.auth.{Authentication, Permissions, PermissionsHandler}
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

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
      case GridUser(firstName, lastName, email, _) =>

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
      case ApiKeyAccessor(accessor, _) => respond(
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
    Try(URI.create(inputUri)).filter(isOwnDomainAndSecure).isSuccess
  }

  // Trigger the auth cycle
  // If a redirectUri is provided, redirect the browser there once auth'd,
  // else return a dummy page (e.g. for automatically re-auth'ing in the background)
  // FIXME: validate redirectUri before doing the auth
  def doLogin(redirectUri: Option[String] = None) = auth { req =>
    redirectUri map {
      case uri if isValidDomain(uri) => Redirect(uri)
      case _ => Ok("logged in (not redirecting to external redirectUri)")
    } getOrElse Ok("logged in")
  }

  def oauthCallback = Action.async { implicit request =>
    providers.userProvider.processAuthentication match {
      case Some(callback) => callback(request)
      case None => Future.successful(InternalServerError("No callback for configured authentication provider"))
    }
  }

  def logout = Action { implicit request =>
    providers.userProvider.flushToken match {
      case Some(callback) => callback(request)
      case None => InternalServerError("Logout not supported by configured authentication provider")
    }
  }
}
