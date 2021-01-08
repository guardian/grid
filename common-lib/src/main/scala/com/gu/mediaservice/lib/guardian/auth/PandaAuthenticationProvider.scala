package com.gu.mediaservice.lib.guardian.auth

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.{GridUser, Principal}
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import com.gu.pandomainauth.action.AuthActions
import com.gu.pandomainauth.model.{AuthenticatedUser, User, Authenticated => PandaAuthenticated, Expired => PandaExpired, GracePeriod => PandaGracePeriod, InvalidCookie => PandaInvalidCookie, NotAuthenticated => PandaNotAuthenticated, NotAuthorized => PandaNotAuthorised}
import com.gu.pandomainauth.service.OAuthException
import play.api.libs.typedmap.{TypedEntry, TypedKey, TypedMap}
import play.api.libs.ws.{DefaultWSCookie, WSClient, WSRequest}
import play.api.mvc.{ControllerComponents, Cookie, RequestHeader, Result}

import scala.concurrent.Future
import scala.util.Try

class PandaAuthenticationProvider(resources: AuthenticationProviderResources) extends UserAuthenticationProvider with AuthActions {

  final override def authCallbackUrl: String = s"${resources.commonConfig.services.authBaseUri}/oauthCallback"
  override lazy val panDomainSettings: PanDomainAuthSettingsRefresher = buildPandaSettings()
  override def wsClient: WSClient = resources.wsClient
  override def controllerComponents: ControllerComponents = resources.controllerComponents

  /**
    * Establish the authentication status of the given request header. This can return an authenticated user or a number
    * of reasons why a user is not authenticated.
    *
    * @param request The request header containing cookies and other request headers that can be used to establish the
    *                authentication status of a request.
    * @return An authentication status expressing whether the
    */
  override def authenticateRequest(request: RequestHeader): AuthenticationStatus = {
    extractAuth(request) match {
      case PandaNotAuthenticated => NotAuthenticated
      case PandaInvalidCookie(e) => Invalid("error checking user's auth, clear cookie and re-auth", Some(e))
      case PandaExpired(authedUser) => Expired(gridUserFrom(authedUser.user, request))
      case PandaGracePeriod(authedUser) => GracePeriod(gridUserFrom(authedUser.user, request))
      case PandaNotAuthorised(authedUser) => NotAuthorised(s"${authedUser.user.email} not authorised to use application")
      case PandaAuthenticated(authedUser) => Authenticated(gridUserFrom(authedUser.user, request))
    }
  }

  /**
    * If this provider supports sending a user that is not authorised to a federated auth provider then it should
    * provide a function here to redirect the user.
    */
  override def sendForAuthentication: Option[(RequestHeader, Option[Principal]) => Future[Result]] = Some(
    { (requestHeader: RequestHeader, principal: Option[Principal]) =>
      val email = principal.collect{
        case GridUser(_, _, email, _) => email
      }
      sendForAuth(requestHeader, email)
    }
  )

  /**
    * If this provider supports sending a user that is not authorised to a federated auth provider then it should
    * provide an Play action here that deals with the return of a user from a federated provider. This should be
    * used to set a cookie or similar to ensure that a subsequent call to authenticateRequest will succeed. If
    * authentication failed then this should return an appropriate 4xx result.
    */
  override def processAuthentication: Option[RequestHeader => Future[Result]] = Some(
    // TODO: note from the previous implementation
    // We use the `Try` here as the `GoogleAuthException` are thrown before we
    // get to the asynchronicity of the `Future` it returns.
    // We then have to flatten the Future[Future[T]]. Fiddly...
//    Future.fromTry(Try(auth.processOAuthCallback())).flatten.recover {
//      // This is when session session args are missing
//      case e: OAuthException => respondError(BadRequest, "google-auth-exception", e.getMessage, auth.loginLinks)
//
//      // Class `missing anti forgery token` as a 4XX
//      // see https://github.com/guardian/pan-domain-authentication/blob/master/pan-domain-auth-play_2-6/src/main/scala/com/gu/pandomainauth/service/GoogleAuth.scala#L63
//      case e: IllegalArgumentException if e.getMessage == "The anti forgery token did not match" => {
//        logger.error(e.getMessage)
//        respondError(BadRequest, "google-auth-exception", e.getMessage, auth.loginLinks)
//      }
//    }
    processOAuthCallback()(_)
  )

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
      system = resources.commonConfig.stringOpt("panda.system").getOrElse("media-service"),
      bucketName = resources.commonConfig.stringOpt("panda.bucketName").getOrElse("pan-domain-auth-settings"),
      settingsFileKey = resources.commonConfig.stringOpt("panda.settingsFileKey").getOrElse(s"${resources.commonConfig.services.domainRoot}.settings"),
      s3Client = S3Ops.buildS3Client(resources.commonConfig, localstackAware=resources.commonConfig.useLocalAuth)
    )
  }

  private val userValidationEmailDomain = resources.commonConfig.stringOpt("panda.userDomain").getOrElse("guardian.co.uk")

  final override def validateUser(authedUser: AuthenticatedUser): Boolean = {
    Authentication.validateUser(authedUser, userValidationEmailDomain, multifactorChecker)
  }

}
