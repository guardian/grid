package com.gu.mediaservice.lib.bbc.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.{GridUser, Principal}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.bbc.components.BBCValidEmailsStore
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import com.gu.pandomainauth.action.AuthActions
import com.gu.pandomainauth.model.{AuthenticatedUser, User, Authenticated => PandaAuthenticated, Expired => PandaExpired, GracePeriod => PandaGracePeriod, InvalidCookie => PandaInvalidCookie, NotAuthenticated => PandaNotAuthenticated, NotAuthorized => PandaNotAuthorised}
import com.gu.pandomainauth.service.OAuthException
import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration
import play.api.http.HeaderNames
import play.api.libs.typedmap.{TypedEntry, TypedKey, TypedMap}
import play.api.libs.ws.{DefaultWSCookie, WSClient, WSRequest}
import play.api.mvc.{ControllerComponents, Cookie, RequestHeader, Result}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class BBCAuthenticationProvider(resources: AuthenticationProviderResources, providerConfiguration: Configuration)
  extends UserAuthenticationProvider with AuthActions with StrictLogging with ArgoHelpers with HeaderNames {

  implicit val ec: ExecutionContext = controllerComponents.executionContext

  final override def authCallbackUrl: String = s"${resources.commonConfig.services.authBaseUri}/oauthCallback"
  override lazy val panDomainSettings: PanDomainAuthSettingsRefresher = buildPandaSettings()
  override def wsClient: WSClient = resources.wsClient
  override def controllerComponents: ControllerComponents = resources.controllerComponents
  override def cacheValidation: Boolean = true  //dont call 'validateUser' every api request if user has a valid session
  override def showUnauthedMessage(message: String)(implicit request: RequestHeader): Result = {
    logger.info(message)
    Forbidden("You are not authorised to access The Grid, to get authorisation please email The Grid support team")
  }


  val validEmailsStore = new BBCValidEmailsStore(resources.commonConfig.permissionsBucket, resources.commonConfig)

  validEmailsStore.scheduleUpdates(resources.actorSystem.scheduler)

  private val usePermissionsValidation = resources.commonConfig.stringOpt("panda.usePermissionsValidation").getOrElse("false").toBoolean


  val loginLinks = List(
    Link("login", resources.commonConfig.services.loginUriTemplate)
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
      case PandaInvalidCookie(e) => Invalid("error checking user's auth, clear cookie and re-auth", Some(e))
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
      case GracePeriod(principal) => Some(principal)
      case Authenticated(principal: GridUser) => Some(principal)
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
  override def processAuthentication: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]] =
    Some({ (requestHeader: RequestHeader, maybeUri: Option[RedirectUri]) =>
      // We use the `Try` here as the `GoogleAuthException` are thrown before we
      // get to the asynchronicity of the `Future` it returns.
      // We then have to flatten the Future[Future[T]]. Fiddly...
      Future.fromTry(Try(processOAuthCallback()(requestHeader))).flatten.recover {
        // This is when session session args are missing
        case e: OAuthException => respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks)

        // Class `missing anti forgery token` as a 4XX
        // see https://github.com/guardian/pan-domain-authentication/blob/master/pan-domain-auth-play_2-6/src/main/scala/com/gu/pandomainauth/service/GoogleAuth.scala#L63
        case e: IllegalArgumentException if e.getMessage == "The anti forgery token did not match" => {
          logger.error("Anti-forgery exception encountered", e)
          respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks)
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
  override def flushToken: Option[RequestHeader => Result] = Some(processLogout(_))

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

  private def gridUserFrom(pandaUser: User, request: RequestHeader): GridUser = {
    val maybePandaCookie: Option[TypedEntry[Cookie]] = request.cookies.get(panDomainSettings.settings.cookieSettings.cookieName).map(TypedEntry[Cookie](PandaCookieKey, _))
    val attributes = TypedMap.empty + (maybePandaCookie.toSeq:_*)
    GridUser(
      firstName = pandaUser.firstName,
      lastName = pandaUser.lastName,
      email = pandaUser.email,
      attributes = attributes
    )
  }

  private def buildPandaSettings() = {
    new PanDomainAuthSettingsRefresher(
      domain = resources.commonConfig.services.domainRoot,
      system = providerConfiguration.getOptional[String]("panda.system").getOrElse("media-service"),
      bucketName = providerConfiguration.getOptional[String]("panda.bucketName").getOrElse("pan-domain-auth-settings"),
      settingsFileKey = providerConfiguration.getOptional[String]("panda.settingsFileKey").getOrElse(s"${resources.commonConfig.services.domainRoot}.settings"),
      s3Client = S3Ops.buildS3Client(resources.commonConfig, localstackAware=resources.commonConfig.useLocalAuth)
    )
  }

  private val userValidationEmailDomain = resources.commonConfig.stringOpt("panda.userDomain").getOrElse("guardian.co.uk")

  final override def validateUser(authedUser: AuthenticatedUser): Boolean = {
    val validEmails = validEmailsStore.getValidEmails
    val isValidEmail = validEmails match {
      case Some(emails) => emails.contains(authedUser.user.email.toLowerCase)
      case _ => false
    }
    val isValidDomain = authedUser.user.email.endsWith("@" + userValidationEmailDomain)
    val passesMultifactor = if(multifactorChecker.nonEmpty) { authedUser.multiFactor } else { true }

    val inAccessGroup = authedUser.permissions.exists(_.toLowerCase.contains("grid access"))

    val isValid = ((usePermissionsValidation && inAccessGroup) || (!usePermissionsValidation && isValidEmail)) && isValidDomain && passesMultifactor

    logger.info(s"Validated user ${authedUser.user.email} as ${if(isValid) "valid" else "invalid"} using " +
      s"${if(usePermissionsValidation) "permissions" else "white list"} validation")
    isValid
  }

}
