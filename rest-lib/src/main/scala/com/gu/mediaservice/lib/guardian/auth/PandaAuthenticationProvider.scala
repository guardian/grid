package com.gu.mediaservice.lib.guardian.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import com.gu.pandomainauth.action.AuthActions
import com.gu.pandomainauth.model.{AuthenticatedUser, User, Authenticated => PandaAuthenticated, Expired => PandaExpired, GracePeriod => PandaGracePeriod, InvalidCookie => PandaInvalidCookie, NotAuthenticated => PandaNotAuthenticated, NotAuthorized => PandaNotAuthorised}
import com.gu.pandomainauth.service.{Google2FAGroupChecker, OAuthException}
import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration
import play.api.http.HeaderNames
import play.api.libs.typedmap.{TypedEntry, TypedKey, TypedMap}
import play.api.libs.ws.{DefaultWSCookie, WSClient, WSRequest}
import play.api.mvc.{ControllerComponents, Cookie, RequestHeader, Result}

import scala.concurrent.duration.{Duration, HOURS}
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class PandaAuthenticationProvider(
  resources: AuthenticationProviderResources,
  providerConfiguration: Configuration
)
  extends UserAuthenticationProvider with AuthActions with StrictLogging with ArgoHelpers with HeaderNames with InstanceForRequest {

  implicit val ec: ExecutionContext = controllerComponents.executionContext

  final override def authCallbackUrl: String = ??? // TODO We're stuck here but will be replacing Panda s"${resources.commonConfig.services.authBaseUri}/oauthCallback"
  override lazy val panDomainSettings: PanDomainAuthSettingsRefresher = buildPandaSettings()
  override def wsClient: WSClient = resources.wsClient
  override def controllerComponents: ControllerComponents = resources.controllerComponents

  override def apiGracePeriod: Long = Duration(24, HOURS).toMillis

  def loginLinks(request: RequestHeader) = List(
    Link("login", resources.commonConfig.services.loginUriTemplate(instanceOf(request)))
  )

  /**
    * Establish the authentication status of the given request header. This can return an authenticated user or a number
    * of reasons why a user is not authenticated.
    *
    * @param request The request header containing cookies and other request headers that can be used to establish the
    *                authentication status of a request.
    * @return An authentication status expressing whether the
    */
  override def authenticateRequest(request: RequestHeader): AuthenticationStatus = {
    val pandaStatus = extractAuth(request)
    val providerStatus = pandaStatus match {
      case PandaNotAuthenticated => NotAuthenticated
      case PandaInvalidCookie(e) => Invalid(s"error checking user's auth, clear cookie and re-auth (${e.getClass.getSimpleName})")
      case PandaExpired(authedUser) => Expired(gridUserFrom(authedUser.user, request))
      case PandaGracePeriod(authedUser) => GracePeriod(gridUserFrom(authedUser.user, request))
      case PandaNotAuthorised(authedUser) => NotAuthorised(s"${authedUser.user.email} not authorised to use application")
      case PandaAuthenticated(authedUser) => Authenticated(gridUserFrom(authedUser.user, request))
    }
    logger.info(s"Authenticating request ${request.uri}. Panda $pandaStatus Provider $providerStatus")
    providerStatus
  }

  /**
    * If this provider supports sending a user that is not authorised to a federated auth provider then it should
    * provide a function here to redirect the user.
    */
  override def sendForAuthentication: Option[RequestHeader => Future[Result]] = Some({ requestHeader: RequestHeader =>
    val maybePrincipal = authenticateRequest(requestHeader) match {
      case Expired(principal) => Some(principal)
      case Authenticated(principal: UserPrincipal) => Some(principal)
      case _ => None
    }
    val email = maybePrincipal.map(_.email)
    sendForAuth(requestHeader, email)
  })

  /**
    * If this provider supports sending a user that is not authorised to a federated auth provider then it should
    * provide an Play action here that deals with the return of a user from a federated provider. This should be
    * used to set a cookie or similar to ensure that a subsequent call to authenticateRequest will succeed. If
    * authentication failed then this should return an appropriate 4xx result.
    */
  override def sendForAuthenticationCallback: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]] =
    Some({ (requestHeader: RequestHeader, maybeUri: Option[RedirectUri]) =>
      // We use the `Try` here as the `GoogleAuthException` are thrown before we
      // get to the asynchronicity of the `Future` it returns.
      // We then have to flatten the Future[Future[T]]. Fiddly...
      Future.fromTry(Try(processOAuthCallback()(requestHeader))).flatten.recover {
        // This is when session session args are missing
        case e: OAuthException => respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks(requestHeader))

        // Class `missing anti forgery token` as a 4XX
        // see https://github.com/guardian/pan-domain-authentication/blob/master/pan-domain-auth-play_2-6/src/main/scala/com/gu/pandomainauth/service/GoogleAuth.scala#L63
        case e: IllegalArgumentException if e.getMessage == "The anti forgery token did not match" => {
          logger.error("Anti-forgery exception encountered", e)
          respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks(requestHeader))
        }
      }.map {
        // not very elegant, but this will override the redirect from panda with any alternative destination
        case overrideRedirect if overrideRedirect.header.headers.contains(LOCATION) && maybeUri.nonEmpty =>
          val uri = maybeUri.get
          Redirect(uri).copy(newCookies = overrideRedirect.newCookies, newSession = overrideRedirect.newSession)
        case other => other
      }
    })

  /**
    * If this provider is able to clear user tokens (i.e. by clearing cookies) then it should provide a function to
    * do that here which will be used to log users out and also if the token is invalid.
    *
    * @return
    */
  override def flushToken: Option[(RequestHeader, Result) => Result] = Some((rh, _) => processLogout(rh))

  val PandaCookieKey: TypedKey[Cookie] = TypedKey[Cookie]("PandaCookie")

  /**
    * A function that allows downstream API calls to be made using the credentials of the inflight request
    *
    * @param request The request header of the inflight call
    * @return A function that adds appropriate data to a WSRequest
    */
  override def onBehalfOf(request: Principal): Either[String, WSRequest => WSRequest] = {
    val cookieName = panDomainSettings.settings.cookieSettings.cookieName
    request.attributes.get(PandaCookieKey) match {
      case Some(cookie) => Right { wsRequest: WSRequest =>
        wsRequest.addCookies(DefaultWSCookie(cookieName, cookie.value))
      }
      case None => Left(s"Pan domain cookie $cookieName is missing in principal.")
    }
  }

  private def gridUserFrom(pandaUser: User, request: RequestHeader): UserPrincipal = {
    val maybePandaCookie: Option[TypedEntry[Cookie]] = request.cookies.get(panDomainSettings.settings.cookieSettings.cookieName).map(TypedEntry[Cookie](PandaCookieKey, _))
    val attributes = TypedMap.empty + (maybePandaCookie.toSeq:_*)
    UserPrincipal(
      firstName = pandaUser.firstName,
      lastName = pandaUser.lastName,
      email = pandaUser.email,
      attributes = attributes
    )
  }

  private def buildPandaSettings() = {
    val domain = resources.commonConfig.domainRoot
    new PanDomainAuthSettingsRefresher(
      domain = domain,
      system = providerConfiguration.getOptional[String]("panda.system").getOrElse("media-service"),
      bucketName = providerConfiguration.getOptional[String]("panda.bucketName").getOrElse("pan-domain-auth-settings"),
      settingsFileKey = providerConfiguration.getOptional[String]("panda.settingsFileKey").getOrElse(s"$domain.settings"),
      s3Client = S3Ops.buildS3Client(resources.commonConfig, localstackAware=resources.commonConfig.useLocalAuth)
    )
  }

  private val userValidationEmailDomain = resources.commonConfig.stringOpt("panda.userDomain").getOrElse("guardian.co.uk")

  final override def validateUser(authedUser: AuthenticatedUser): Boolean = {
    val isValid = PandaAuthenticationProvider.validateUser(authedUser, userValidationEmailDomain, multifactorChecker)

    val hasBasicAccess = resources.authorisation.hasBasicAccess(authedUser.user.email)

    if(!isValid) {
      logger.warn(s"User ${authedUser.user.email} is not valid")
    }
    else if (!hasBasicAccess) {
      logger.warn(s"User ${authedUser.user.email} does not have grid_access permission")
    }

    isValid && hasBasicAccess
  }

  override def showUnauthedMessage(message: String)(implicit request: RequestHeader): Result = {
    super.showUnauthedMessage(message) // this ensures the logging of panda library still occurs
    Forbidden(
      "You do not have permission to access the Grid. " +
        "Please contact Central Production to request the permissions you need."
    )
  }
}

object PandaAuthenticationProvider {
  def validateUser(authedUser: AuthenticatedUser, userValidationEmailDomain: String, multifactorChecker: Option[Google2FAGroupChecker]): Boolean = {
    val isValidDomain = authedUser.user.email.endsWith("@" + userValidationEmailDomain)
    val passesMultifactor = if(multifactorChecker.nonEmpty) { authedUser.multiFactor } else { true }

    isValidDomain && passesMultifactor
  }
}
