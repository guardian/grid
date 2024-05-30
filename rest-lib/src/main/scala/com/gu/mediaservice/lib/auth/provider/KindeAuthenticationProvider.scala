package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.gu.mediaservice.model.Instance
import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration
import play.api.libs.crypto.CookieSigner
import play.api.libs.json.{Json, Reads}
import play.api.libs.typedmap.{TypedEntry, TypedKey, TypedMap}
import play.api.libs.ws.{DefaultWSCookie, WSClient, WSRequest}
import play.api.mvc.Results._
import play.api.mvc.{Cookie, DiscardingCookie, RequestHeader, Result, UrlEncodedCookieDataCodec}

import java.util.UUID
import scala.concurrent.{Await, ExecutionContext, Future}
import org.scanamo.generic.auto.genericDerivedFormat
import org.scanamo.syntax._
import org.scanamo.{DynamoReadError, ScanamoAsync, Table}
import software.amazon.awssdk.services.dynamodb.{DynamoDbAsyncClient, DynamoDbAsyncClientBuilder}

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.{Duration, SECONDS}

class KindeAuthenticationProvider(
                                   resources: AuthenticationProviderResources,
                                   providerConfiguration: Configuration
                                 ) extends UserAuthenticationProvider with StrictLogging with UrlEncodedCookieDataCodec {

  private val wsClient: WSClient = resources.wsClient
  implicit val ec: ExecutionContext = resources.controllerComponents.executionContext

  private val asyncClient = dynamoDBAsyncV2Builder().build()
  private val instancesTable = Table[Instance]("eelpie-grid-instances")

  private val kindeDomain = providerConfiguration.get[String]("domain")
  private val callbackUri = providerConfiguration.get[String]("redirectUri")
  private val clientId = providerConfiguration.get[String]("clientId")
  private val clientSecret = providerConfiguration.get[String]("clientSecret")

  private val loggedInUserCookieName = "loggedInUser"

  val loginCookieDomain = "griddev.eelpieconsulting.co.uk" // Seem to have to explicitly set this for the cookie to be sent to subdomains.

  private val loggedInUserCookieKey: TypedKey[Cookie] = TypedKey[Cookie]("loggedInUserCookie")

  private val stateSessionAttributeName = "kindeState"

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
    request.cookies.get(loggedInUserCookieName).flatMap { cookie =>
      val userData = decode(cookie.value)
      userData.get("id").map { id =>
        val userProfile = UserProfile(
          id = id,
          first_name = userData.get("first_name"),
          last_name = userData.get("first_name"),
          preferred_email = userData.get("preferred_email")
        )
        Authenticated(authedUser = gridUserFrom(userProfile, request))
      }
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

      val state = UUID.randomUUID().toString

      val oauthRedirectUrl = kindeDomain +
        s"/oauth2/auth?response_type=code&client_id=$clientId&redirect_uri=$callbackUri&scope=openid%20profile%20email&state=" + state
      logger.info(s"Redirecting to Kinde OAuth URL: $oauthRedirectUrl")
      Future.successful(Redirect(oauthRedirectUrl).addingToSession((stateSessionAttributeName, state))(requestHeader))
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
      requestHeader.session.get(stateSessionAttributeName).flatMap { state =>
        requestHeader.getQueryString("code").map { code =>
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

              // Look up users allowed instances
              val eventualInstances = ScanamoAsync(asyncClient).exec(instancesTable.index("owner-index").query("owner" === userProfile.id)).map { r: Seq[Either[DynamoReadError, Instance]] =>
                r.flatMap(_.toOption)
              }.map { r => r.sortBy(_.id) }
              val instances: Seq[Instance] = Await.result(eventualInstances, Duration(5, SECONDS))  // TODO Await
              logger.info("Authenticated user has instances: " + instances)

              val cookieData = Seq(
                Some("id" -> userProfile.id),
                userProfile.first_name.map("first_name" -> _),
                userProfile.last_name.map("last_name" -> _),
                userProfile.preferred_email.map("preferred_email" -> _),
                Some("instances" -> instances.map(_.id).mkString)
              ).flatten.toMap
              logger.info("Encoding logged in user cookie data: " + cookieData)
              val cookieContents = encode(cookieData)
              logger.info("User profile encoded to signed cookie: " + cookieContents)
              val loggedInUserCookie = Cookie(name = loggedInUserCookieName, value = cookieContents, domain = Some(loginCookieDomain))

              val exitRedirectUri = redirectUri.getOrElse("/")
              Redirect(exitRedirectUri).withNewSession.withCookies(loggedInUserCookie)
            }
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
    val kindeLogoutUrl = kindeDomain + "/logout?redirect=https://" + loginCookieDomain
    Redirect(kindeLogoutUrl).discardingCookies(DiscardingCookie(loggedInUserCookieName, "/", domain = Some(loginCookieDomain))).withNewSession
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

  override def onBehalfOf(request: Principal): Either[String, WSRequest => WSRequest] = {
    request.attributes.get(loggedInUserCookieKey) match {
      case Some(cookie) => Right { wsRequest: WSRequest =>
        wsRequest.addCookies(DefaultWSCookie(loggedInUserCookieName, cookie.value))
      }
      case None => Left(s"Login cookie $loggedInUserCookieName is missing in principal.")
    }
  }

  private def gridUserFrom(userProfile: UserProfile, request: RequestHeader): UserPrincipal = {
    val maybeLoggedInUserCookie: Option[TypedEntry[Cookie]] = request.cookies.get(loggedInUserCookieName).map(TypedEntry[Cookie](loggedInUserCookieKey, _))
    val attributes = TypedMap.empty + (maybeLoggedInUserCookie.toSeq: _*)
    UserPrincipal(
      firstName = userProfile.first_name.getOrElse(""),
      lastName = userProfile.last_name.getOrElse(""),
      email = userProfile.preferred_email.getOrElse(userProfile.id),
      attributes = attributes
    )
  }

  private def dynamoDBAsyncV2Builder(): DynamoDbAsyncClientBuilder = {
    val e = software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider.create()
    DynamoDbAsyncClient.builder().region(software.amazon.awssdk.regions.Region.EU_WEST_1).credentialsProvider(e)
  }

  override def cookieSigner: CookieSigner = resources.cookieSigner

  override def isSigned: Boolean = true
}

case class TokenResponse(access_token: String)

case class UserProfile(id: String, first_name: Option[String], last_name: Option[String], preferred_email: Option[String])
