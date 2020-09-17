package com.gu.mediaservice.lib.auth

import akka.actor.ActorSystem
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{Request => _, _}
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import com.gu.pandomainauth.action.{UserRequest, AuthActions => PandaAuthActions}
import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import com.gu.pandomainauth.service.{Google2FAGroupChecker, OAuthException}
import play.api.Logger
import play.api.libs.ws.{DefaultWSCookie, WSClient, WSCookie}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

trait UserAuthenticationSPI extends ActionBuilder[Authentication.Request, AnyContent] with ArgoHelpers {
  // optional, required for OAuth flows TODO MRB: pull this out entirely and get the SPI to mount additional routes?
  def handleOAuthCallback(request: RequestHeader): Future[Result] =
    Future.successful(respondError(BadRequest, "oauth-not-supported", "This instance does not support OAuth"))

  def logout(request: RequestHeader): Result
}

class PandaUserAuthentication(config: CommonConfig,
                              override val parser: BodyParser[AnyContent],
                              override val wsClient: WSClient,
                              override val controllerComponents: ControllerComponents)
                              (implicit val executionContext: ExecutionContext)

  extends UserAuthenticationSPI with PandaAuthActions {

  override lazy val panDomainSettings = buildPandaSettings()
  private val userValidationEmailDomain = config.stringOpt("panda.userDomain").getOrElse("guardian.co.uk")

  val loginLinks = List(
    Link("login", config.services.loginUriTemplate)
  )

  final override def authCallbackUrl: String = s"${config.services.authBaseUri}/oauthCallback"

  final override def validateUser(authedUser: AuthenticatedUser): Boolean = {
    PandaUserAuthentication.validateUser(authedUser, userValidationEmailDomain, multifactorChecker)
  }

  final override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] = {
    APIAuthAction.invokeBlock(request, (userRequest: UserRequest[A]) => {
      val gridUser = GridUser(userRequest.user.email, userRequest.user.firstName, userRequest.user.lastName, userRequest.user.avatarUrl)
      block(new AuthenticatedRequest(gridUser, request))
    })
  }

  final override def handleOAuthCallback(request: RequestHeader): Future[Result] = {
    // We use the `Try` here as the `GoogleAuthException` are thrown before we
    // get to the asynchronicity of the `Future` it returns.
    // We then have to flatten the Future[Future[T]]. Fiddly...
    Future.fromTry(Try(processOAuthCallback()(request))).flatten.recover {
      // This is when session session args are missing
      case e: OAuthException => respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks)

      // Class `missing anti forgery token` as a 4XX
      // see https://github.com/guardian/pan-domain-authentication/blob/master/pan-domain-auth-play_2-6/src/main/scala/com/gu/pandomainauth/service/GoogleAuth.scala#L63
      case e: IllegalArgumentException if e.getMessage == "The anti forgery token did not match" => {
        Logger.error(e.getMessage)
        respondError(BadRequest, "google-auth-exception", e.getMessage, loginLinks)
      }
    }
  }

  final override def logout(request: RequestHeader): Result = {
    processLogout(request)
  }

  private def buildPandaSettings() = {
    new PanDomainAuthSettingsRefresher(
      domain = config.services.domainRoot,
      system = config.stringOpt("panda.system").getOrElse("media-service"),
      bucketName = config.stringOpt("panda.bucketName").getOrElse("pan-domain-auth-settings"),
      settingsFileKey = config.stringOpt("panda.settingsFileKey").getOrElse(s"${config.services.domainRoot}.settings"),
      s3Client = S3Ops.buildS3Client(config, config.useLocalAuth)
    )
  }
}

object PandaUserAuthentication {
  def validateUser(authedUser: AuthenticatedUser, userValidationEmailDomain: String, multifactorChecker: Option[Google2FAGroupChecker]): Boolean = {
    val isValidDomain = authedUser.user.email.endsWith("@" + userValidationEmailDomain)
    val passesMultifactor = if(multifactorChecker.nonEmpty) { authedUser.multiFactor } else { true }

    isValidDomain && passesMultifactor
  }
}

class Authentication(config: CommonConfig, actorSystem: ActorSystem, userAuthentication: UserAuthenticationSPI,
                     override val parser: BodyParser[AnyContent])
                    (implicit val executionContext: ExecutionContext)

  extends ActionBuilder[Authentication.Request, AnyContent] with ArgoHelpers {

  // API key errors
  val invalidApiKeyResult = respondError(Unauthorized, "invalid-api-key", "Invalid API key provided")

  val keyStore = new KeyStore(config.authKeyStoreBucket, config)

  keyStore.scheduleUpdates(actorSystem.scheduler)

  override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] = {
    // Try to auth by API key, and failing that, with Panda
    request.headers.get(Authentication.apiKeyHeaderName) match {
      case Some(key) =>
        keyStore.lookupIdentity(key) match {
          case Some(apiKey) =>
            GridLogger.info(s"Using api key with name ${apiKey.identity} and tier ${apiKey.tier}", apiKey)
            if (ApiAccessor.hasAccess(apiKey, request, config.services))
              block(new AuthenticatedRequest(ApiKeyAccessor(apiKey), request))
            else
              Future.successful(ApiAccessor.unauthorizedResult)
          case None => Future.successful(invalidApiKeyResult)
        }
      case None =>
        userAuthentication.invokeBlock(request, block)
    }
  }

  def getOnBehalfOfPrincipal(principal: Principal, originalRequest: Request[_]): OnBehalfOfPrincipal = principal match {
    case service: ApiKeyAccessor =>
      OnBehalfOfApiKey(service)

    case user: GridUser =>
      // TODO MRB: support forwarding other credentials, not just Panda
      val cookieName = "gutoolsAuth-assym"

      originalRequest.cookies.get(cookieName) match {
        case Some(cookie) => OnBehalfOfUser(user, DefaultWSCookie(cookieName, cookie.value))
        case None => throw new IllegalStateException(s"Unable to generate cookie header on behalf of ${principal.accessor}. Missing original cookie $cookieName")
      }
  }
}

object Authentication {
  sealed trait Principal {
    def accessor: ApiAccessor
  }
  case class GridUser(email: String, firstName: String, lastName: String, avatarUrl: Option[String]) extends Principal {
    def accessor: ApiAccessor = ApiAccessor(identity = email, tier = Internal)
  }
  case class ApiKeyAccessor(accessor: ApiAccessor) extends Principal

  type Request[A] = AuthenticatedRequest[A, Principal]

  sealed trait OnBehalfOfPrincipal { def principal: Principal }
  case class OnBehalfOfUser(override val principal: GridUser, cookie: WSCookie) extends OnBehalfOfPrincipal
  case class OnBehalfOfApiKey(override val principal: ApiKeyAccessor) extends OnBehalfOfPrincipal

  val apiKeyHeaderName = "X-Gu-Media-Key"
  val originalServiceHeaderName = "X-Gu-Original-Service"

  def getIdentity(principal: Principal): String = principal.accessor.identity
}
