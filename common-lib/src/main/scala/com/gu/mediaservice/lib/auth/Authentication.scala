package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.{AuthenticatedService, PandaUser}
import com.gu.mediaservice.lib.config.Properties
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import com.gu.pandomainauth.action.{AuthActions, UserRequest}
import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import play.api.libs.ws.WSClient
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class Authentication[A](keyStore: KeyStore, _loginUriTemplate: String, authCallbackBaseUri: String,
                       override val parser: BodyParser[AnyContent],
                       override val wsClient: WSClient,
                       override val controllerComponents: ControllerComponents,
                       override val panDomainSettings: PanDomainAuthSettingsRefresher,
                       override val executionContext: ExecutionContext)

  extends ActionBuilder[Authentication.Request, AnyContent] with AuthActions with ArgoErrorResponses {

  private val headerKey = "X-Gu-Media-Key"
  private val properties = Properties.fromPath("/etc/gu/panda.properties")

  final override def loginUriTemplate: String = _loginUriTemplate
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
    val oauthDomain:String = properties.getOrElse("panda.oauth.domain", "guardian.co.uk")
    val oauthDomainMultiFactorEnabled:Boolean = Try(properties("panda.oauth.multifactor.enable").toBoolean).getOrElse(true)
    // check if the user email domain is the one configured
    val isAuthorized:Boolean = (authedUser.user.emailDomain == oauthDomain)
    // if authorized check if multifactor is to be evaluated
    if (oauthDomainMultiFactorEnabled) isAuthorized && authedUser.multiFactor else isAuthorized
  }
}


object Authentication {
  sealed trait Principal { def name: String }
  case class PandaUser(user: User) extends Principal { def name: String = s"${user.firstName} ${user.lastName}" }
  case class AuthenticatedService(name: String) extends Principal

  type Request[A] = AuthenticatedRequest[A, Principal]
}
