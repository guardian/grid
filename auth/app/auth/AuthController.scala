package auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, MachinePrincipal, UserPrincipal}
import com.gu.mediaservice.lib.auth.Permissions.{DeleteImage, ShowPaid, UploadImages}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProviders
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, Internal}
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.lib.guardian.auth.PandaAuthenticationProvider
import com.gu.mediaservice.model.Instance
import play.api.libs.json.Json
import play.api.mvc.{AnyContent, BaseController, ControllerComponents, Request, Result}

import java.net.URI
import java.util.Date
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class AuthController(auth: Authentication, providers: AuthenticationProviders, val config: AuthConfig,
                     override val controllerComponents: ControllerComponents,
                     authorisation: Authorisation)(implicit ec: ExecutionContext)
  extends BaseController
  with ArgoHelpers with InstanceForRequest {

  def indexResponse()(implicit instance: Instance) = {
    val indexData = Map("description" -> "This is the Auth API")
    val indexLinks = List(
      Link("root",          config.mediaApiUri(instance)),
      Link("login",         config.services.loginUriTemplate(instance)),
      Link("ui:logout",     s"${config.rootUri(instance)}/logout"),
      Link("session",       s"${config.rootUri(instance)}/session")
    )
    respond(indexData, indexLinks)
  }

  def cookieMonster = auth { request =>
    providers.userProvider match {
      case panda: PandaAuthenticationProvider =>{
        val cookieBatter = panda.readAuthenticatedUser(request).map(user => panda.generateCookie(user.copy(expires = new Date().getTime)))
        cookieBatter.fold(respond("Me want cookie."))(cookie => respond("Cookies are a sometimes food.").withCookies(cookie))
      }
      case _ => respond("Me want cookie.")
    }
  }

  def index = auth { request =>
    implicit val instance: Instance = instanceOf(request)
    indexResponse()
  }

  def session = auth { request =>
    val showPaid = authorisation.hasPermissionTo(ShowPaid)(request.user)
    val canUpload = authorisation.hasPermissionTo(UploadImages)(request.user)
    val canDelete = authorisation.hasPermissionTo(DeleteImage)(request.user)
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
                  "showPaid" -> showPaid,
                  "canUpload" -> canUpload,
                  "canDelete" -> canDelete,
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
                "showPaid" -> showPaid,
                "canUpload" -> (accessor.tier == Internal)
              )
          )
        )
      )
      case InnerServicePrincipal(identity, attributes) => respond(
        Json.obj( "inner-service" ->
          Json.obj(
            "identity" -> identity,
            providers.innerServiceProvider.uuidKey.toString -> attributes.get(providers.innerServiceProvider.uuidKey),
            providers.innerServiceProvider.timestampKey.toString -> attributes.get(providers.innerServiceProvider.timestampKey),
            providers.innerServiceProvider.signatureKey.toString -> attributes.get(providers.innerServiceProvider.signatureKey),
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
