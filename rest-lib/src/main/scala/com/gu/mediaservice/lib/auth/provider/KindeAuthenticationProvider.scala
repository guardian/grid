package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.UserPrincipal
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration
import play.api.libs.json.{Json, Reads}
import play.api.libs.ws.{WSClient, WSRequest}
import play.api.mvc.Results._
import play.api.mvc.{Cookie, DiscardingCookie, RequestHeader, Result}

import java.util.UUID
import scala.concurrent.{ExecutionContext, Future}

class KindeAuthenticationProvider(
                                   resources: AuthenticationProviderResources,
                                   providerConfiguration: Configuration

                                 ) extends UserAuthenticationProvider with StrictLogging {

  private val wsClient: WSClient = resources.wsClient
  implicit val ec: ExecutionContext = resources.controllerComponents.executionContext

  private val kindeDomain = providerConfiguration.get[String]("domain")
  private val callbackUri = providerConfiguration.get[String]("redirectUri")
  private val clientId = providerConfiguration.get[String]("clientId")
  private val clientSecret = providerConfiguration.get[String]("clientSecret")

  private val loggedInUserCookieName = "loggedInUser"

  val state = UUID.randomUUID().toString // TODO!!!

  /**
   * Establish the authentication status of the given request header. This can return an authenticated user or a number
   * of reasons why a user is not authenticated.
   *
   * @param request The request header containing cookies and other request headers that can be used to establish the
   *                authentication status of a request.
   * @return An authentication status expressing whether the
   */
  override def authenticateRequest(request: RequestHeader): AuthenticationStatus = {
    // Look for our cookie with we set in the auth app
    request.cookies.get(loggedInUserCookieName).map { cookie =>
      val id = cookie.value
      Authenticated(authedUser = UserPrincipal(id, id, id))
    }.getOrElse {
      NotAuthenticated
    }
  }

  /**
   * If this provider supports sending a user that is not authorised to a federated auth provider then it should
   * provide a function here to redirect the user. The function signature takes the the request and returns a result
   * which is likely a redirect to an external authentication system.
   */
  override def sendForAuthentication: Option[RequestHeader => Future[Result]] = Some {
    { requestHeader: RequestHeader =>
      logger.info(s"Requesting Kinde redirect URI with callback uri: $callbackUri")

      val oauthRedirectUrl = kindeDomain +
        s"/oauth2/auth?response_type=code&client_id=$clientId&redirect_uri=$callbackUri&scope=openid%20profile%20email&state=" + state
      logger.info(s"Redirecting to Kinde OAuth URL: $oauthRedirectUrl")
      Future.successful(Redirect(oauthRedirectUrl))
    }
  }

  /**
   * If this provider supports sending a user that is not authorised to a federated auth provider then it should
   * provide a function here that deals with the return of a user from a federated provider. This should be
   * used to set a cookie or similar to ensure that a subsequent call to authenticateRequest will succeed. If
   * authentication failed then this should return an appropriate 4xx result.
   * The function should take the Play request header and the redirect URI that the user should be
   * sent to on successful completion of the authentication.
   */
  override def sendForAuthenticationCallback: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]] = Some {
    { (requestHeader, redirectUri) =>
      logger.info("Got auth callback request header: " + requestHeader)

      val code = requestHeader.getQueryString("code")
      code.map { code =>
        logger.info(s"Got callback code: $code")
        val url = kindeDomain + "/oauth2/token"

        val parameters = Map(
          "client_id" -> clientId,
          "client_secret" -> clientSecret,
          "grant_type" -> "authorization_code",
          "redirect_uri" -> callbackUri,
          "code" -> code,
          "state" -> state,
        )
        wsClient.url(url).post(parameters).flatMap { r =>
          logger.info(s"Got post response from $url: " + r.status + " / " + r.body)

          implicit val trr: Reads[TokenResponse] = Json.reads[TokenResponse]
          val token = Json.parse(r.body).as[TokenResponse]

          val userProfileUrl = kindeDomain + "/oauth2/user_profile"
          wsClient.url(userProfileUrl).withHttpHeaders(("Authorization", "Bearer " + token.access_token)).get().map { r =>
            logger.info("Got user profile response " + r.status + ": " + r.body)
            implicit val upr = Json.reads[UserProfile]
            val userProfile = Json.parse(r.body).as[UserProfile]
            val exitRedirectUri = redirectUri.getOrElse("/")
            Redirect(exitRedirectUri).withNewSession.withCookies(Cookie(loggedInUserCookieName, userProfile.id))
          }
        }

      }.getOrElse {
        Future.successful(BadRequest)
      }
    }
  }

  /**
   * If this provider is able to clear user tokens (i.e. by clearing cookies) then it should provide a function to
   * do that here which will be used to log users out and also if the token is invalid.
   * This function takes the request header and a result to modify and returns the modified result.
   */
  override def flushToken: Option[(RequestHeader, Result) => Result] = Some { (request, _) =>
    // Flush our cookies and session the redirect through Kinde to logout the Kinde session
    val kindeLogoutUrl = kindeDomain + "/logout"  // TODO redirect back when we have a landing site
    Redirect(kindeLogoutUrl).discardingCookies(DiscardingCookie(loggedInUserCookieName, "/")).withNewSession
  }

  /**
   * A function that allows downstream API calls to be made using the credentials of the current principal.
   * It is recommended that any data required for this downstream request enrichment is put into the principal's
   * attribute map when the principal is created in the authenticateRequest call.
   *
   * @param principal The principal for the current request
   * @return Either a function that adds appropriate authentication headers to a WSRequest or an error string explaining
   *         why it wasn't possible to create a function.
   */
  override def onBehalfOf(principal: Authentication.Principal): Either[String, WSRequest => WSRequest] = ???
}

case class TokenResponse(access_token: String)

case class UserProfile(id: String)
