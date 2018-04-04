package com.gu.mediaservice.lib.auth

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{AuthenticatedService, PandaUser}
import com.gu.mediaservice.lib.config.{CommonConfig, Properties}
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import com.gu.pandomainauth.action.{AuthActions, UserRequest}
import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import play.api.libs.ws.WSClient
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class Authentication(val loginUriTemplate: String, authCallbackBaseUri: String, config: CommonConfig, actorSystem: ActorSystem,
                     override val parser: BodyParser[AnyContent],
                     override val wsClient: WSClient,
                     override val controllerComponents: ControllerComponents,
                     override val executionContext: ExecutionContext)

  extends ActionBuilder[Authentication.Request, AnyContent] with AuthActions with ArgoHelpers {

  implicit val ec: ExecutionContext = executionContext

  val loginLinks = List(
    Link("login", loginUriTemplate)
  )

  // Panda errors
  val notAuthenticatedResult = respondError(Unauthorized, "unauthorized", "Not authenticated", loginLinks)
  val invalidCookieResult    = notAuthenticatedResult
  val expiredResult          = respondError(new Status(419), "session-expired", "Session expired, required to log in again", loginLinks)
  val notAuthorizedResult    = respondError(Forbidden, "forbidden", "Not authorized", loginLinks)

  // API key errors
  val invalidApiKeyResult    = respondError(Unauthorized, "invalid-api-key", "Invalid API key provided", loginLinks)

  private val headerKey = "X-Gu-Media-Key"
  private val properties = Properties.fromPath("/etc/gu/panda.properties")

  private val keyStoreBucket: String = config.properties("auth.keystore.bucket")
  val keyStore = new KeyStore(keyStoreBucket, config)

  // TODO MRB: not all applications need the key store
  keyStore.scheduleUpdates(actorSystem.scheduler)

  private lazy val pandaProperties = Properties.fromPath("/etc/gu/panda.properties")
  override lazy val panDomainSettings = buildPandaSettings()

  final override def authCallbackUrl: String = s"$authCallbackBaseUri/oauthCallback"

  override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] = {
    // Try to auth by API key, and failing that, with Panda
    request.headers.get(headerKey) match {
      case Some(key) =>
        keyStore.lookupIdentity(key) match {
          case Some(name) => block(new AuthenticatedRequest(AuthenticatedService(name), request))
          case None => Future.successful(invalidApiKeyResult)
        }
      case None =>
        APIAuthAction.invokeBlock(request, (userRequest: UserRequest[A]) => {
          block(new AuthenticatedRequest(PandaUser(userRequest.user), request))
        })
    }
  }

  final override def validateUser(authedUser: AuthenticatedUser): Boolean = {
    val oauthDomain:String = pandaProperties.getOrElse("panda.oauth.domain", "guardian.co.uk")
    val oauthDomainMultiFactorEnabled:Boolean = Try(pandaProperties("panda.oauth.multifactor.enable").toBoolean).getOrElse(true)
    // check if the user email domain is the one configured
    val isAuthorized:Boolean = authedUser.user.emailDomain == oauthDomain
    // if authorized check if multifactor is to be evaluated
    if (oauthDomainMultiFactorEnabled) isAuthorized && authedUser.multiFactor else isAuthorized
  }

  private def buildPandaSettings() = {
    new PanDomainAuthSettingsRefresher(
      domain = pandaProperties("panda.domain"),
      system = "media-service",
      actorSystem = actorSystem,
      awsCredentialsProvider = config.awsCredentials
    )
  }
}


object Authentication {
  sealed trait Principal { def name: String }
  case class PandaUser(user: User) extends Principal { def name: String = s"${user.firstName} ${user.lastName}" }
  case class AuthenticatedService(name: String) extends Principal

  type Request[A] = AuthenticatedRequest[A, Principal]

  def getEmail(principal: Principal): String = principal match {
    case PandaUser(User(email, _, _, _)) => email
    case _ => principal.name
  }
}
