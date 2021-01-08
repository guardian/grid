package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{ApiKeyAccessor, GridUser, OnBehalfOfPrincipal, Principal}
import com.gu.mediaservice.lib.auth.provider.{Authenticated, AuthenticationProvider, AuthenticationProviders, Expired, GracePeriod, Invalid, NotAuthenticated, NotAuthorised}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.pandomainauth.model.AuthenticatedUser
import com.gu.pandomainauth.service.Google2FAGroupChecker
import play.api.libs.typedmap.TypedMap
import play.api.libs.ws.WSRequest
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class Authentication(config: CommonConfig,
                     providers: AuthenticationProviders,
                     override val parser: BodyParser[AnyContent],
                     override val executionContext: ExecutionContext)
  extends ActionBuilder[Authentication.Request, AnyContent] with ArgoHelpers {

  // make the execution context implicit so it will be picked up appropriately
  implicit val ec: ExecutionContext = executionContext

  // TODO: SAH / Evaluate MB's suggestion that this moves to the provider
  val loginLinks = List(
    Link("login", config.services.loginUriTemplate)
  )

  def unauthorised(errorMessage: String, throwable: Option[Throwable] = None): Future[Result] = {
    logger.info(s"Authentication failure $errorMessage", throwable.orNull)
    Future.successful(respondError(Unauthorized, "authentication-failure", "Authentication failure", loginLinks))
  }

  def forbidden(errorMessage: String): Future[Result] = {
    logger.info(s"User not authorised: $errorMessage")
    Future.successful(respondError(Forbidden, "principal-not-authorised", "Principal not authorised", loginLinks))
  }

  def authenticationStatus(requestHeader: RequestHeader, providers: AuthenticationProviders) = {
    def sendForAuth(maybePrincipal: Option[Principal]): Future[Result] = {
      providers.userProvider.sendForAuthentication.fold(unauthorised("No path to authenticate user"))(_(requestHeader, maybePrincipal))
    }

    def flushToken(resultWhenAbsent: Result): Result = {
      providers.userProvider.flushToken.fold(resultWhenAbsent)(_(requestHeader))
    }

    providers.apiProvider.authenticateRequest(requestHeader) match {
      case Authenticated(authedUser) => Right(authedUser)
      case Invalid(message, throwable) => Left(unauthorised(message, throwable))
      case NotAuthorised(message) => Left(forbidden(s"Principal not authorised: $message"))
      case NotAuthenticated =>
        providers.userProvider.authenticateRequest(requestHeader) match {
          case NotAuthenticated => Left(sendForAuth(None))
          case Expired(principal) => Left(sendForAuth(Some(principal)))
          case GracePeriod(authedUser) => Right(authedUser)
          case Authenticated(authedUser) => Right(authedUser)
          case Invalid(message, throwable) => Left(unauthorised(message, throwable).map(flushToken))
          case NotAuthorised(message) => Left(forbidden(s"Principal not authorised: $message"))
        }
    }
  }

  override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] = {
    // Authenticate request. Try with API authenticator first and then with user authenticator
    authenticationStatus(request, providers) match {
      // we have a principal, so process the block
      case Right(principal) => block(new AuthenticatedRequest(principal, request))
      // no principal so return a result which will either be an error or a form of redirect
      case Left(result) => result
    }
  }

  def getOnBehalfOfPrincipal(principal: Principal): OnBehalfOfPrincipal = {
    val provider: AuthenticationProvider = principal match {
      case _:ApiKeyAccessor => providers.apiProvider
      case _:GridUser      => providers.userProvider
    }
    val maybeEnrichFn: Either[String, WSRequest => WSRequest] = provider.onBehalfOf(principal)
    maybeEnrichFn.fold(error => throw new IllegalStateException(error), identity)
  }
}

object Authentication {
  sealed trait Principal {
    def accessor: ApiAccessor
    def attributes: TypedMap
  }
  case class GridUser(firstName: String, lastName: String, email: String, attributes: TypedMap = TypedMap.empty) extends Principal {
    def accessor: ApiAccessor = ApiAccessor(identity = email, tier = Internal)
  }
  case class ApiKeyAccessor(accessor: ApiAccessor, attributes: TypedMap = TypedMap.empty) extends Principal
  type Request[A] = AuthenticatedRequest[A, Principal]

  type OnBehalfOfPrincipal = WSRequest => WSRequest

  val originalServiceHeaderName = "X-Gu-Original-Service"

  def getIdentity(principal: Principal): String = principal.accessor.identity

  def validateUser(authedUser: AuthenticatedUser, userValidationEmailDomain: String, multifactorChecker: Option[Google2FAGroupChecker]): Boolean = {
    val isValidDomain = authedUser.user.email.endsWith("@" + userValidationEmailDomain)
    val passesMultifactor = if(multifactorChecker.nonEmpty) { authedUser.multiFactor } else { true }

    isValidDomain && passesMultifactor
  }
}
