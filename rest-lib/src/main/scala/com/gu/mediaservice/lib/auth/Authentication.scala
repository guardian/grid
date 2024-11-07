package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, MachinePrincipal, OnBehalfOfPrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.config.{CommonConfig, InstanceForRequest}
import com.gu.mediaservice.model.Instance
import play.api.libs.json.{Json, Reads}
import play.api.libs.typedmap.TypedMap
import play.api.libs.ws.{WSClient, WSRequest}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class Authentication(config: CommonConfig,
                     providers: AuthenticationProviders,
                     wsClient: WSClient,
                     override val parser: BodyParser[AnyContent],
                     override val executionContext: ExecutionContext)
  extends ActionBuilder[Authentication.Request, AnyContent] with ArgoHelpers with InstanceForRequest {

  // make the execution context implicit so it will be picked up appropriately
  implicit val ec: ExecutionContext = executionContext

  private val myInstancesEndpoint = config.myInstancesEndpoint

  def loginLinks()(implicit instance: Instance): List[Link] = providers.userProvider.loginLink match {
    case DisableLoginLink => Nil
    case BuiltInAuthService => List(Link("login", config.services.loginUriTemplate(instance)))
    case ExternalLoginLink(link) => List(Link("login", link))
  }

  private def unauthorised(errorMessage: String, throwable: Option[Throwable] = None)(implicit instance: Instance): Future[Result] = {
    logger.info(s"Authentication failure $errorMessage", throwable.orNull)
    Future.successful(respondError(Unauthorized, "authentication-failure", "Authentication failure", loginLinks()))
  }

  def forbidden(errorMessage: String)(implicit instance: Instance): Future[Result] = {
    logger.info(s"User not authorised: $errorMessage")
    Future.successful(respondError(Forbidden, "principal-not-authorised", "Principal not authorised", loginLinks()))
  }

  def expired(user: UserPrincipal)(implicit instance: Instance): Future[Result] = {
    logger.info(s"User token expired for ${user.email}, return 419")
    Future.successful(respondError(new Status(419), errorKey = "authentication-expired", errorMessage = "User authentication token has expired", loginLinks()))
  }

  // gracePeriodCountsAsAuthenticated - if true, then users with valid but recently-expired cookies are considered authenticated, and not required to refresh session for this request
  def authenticationStatus(requestHeader: RequestHeader, gracePeriodCountsAsAuthenticated: Boolean): Either[Future[Result], Principal] = {
    implicit val instance: Instance = instanceOf(requestHeader)
    def flushToken(resultWhenAbsent: Result): Result = {
      providers.userProvider.flushToken.fold(resultWhenAbsent)(_(requestHeader, resultWhenAbsent))
    }

    // Authenticate request. Try with inner service authenticator first, then with API authenticator, and finally with user authenticator
    providers.innerServiceProvider.authenticateRequest(requestHeader) match {
      case Authenticated(authedUser) => Right(authedUser)
      case Invalid(message, throwable) => Left(unauthorised(message, throwable))
      case NotAuthorised(message) => Left(forbidden(s"Principal not authorised: $message")) // TODO: see if we can avoid repetition
      case NotAuthenticated =>
        providers.apiProvider.authenticateRequest(requestHeader) match {
          case Authenticated(authedUser) => Right(authedUser)
          case Invalid(message, throwable) => Left(unauthorised(message, throwable))
          case NotAuthorised(message) => Left(forbidden(s"Principal not authorised: $message"))
          case NotAuthenticated =>
            providers.userProvider.authenticateRequest(requestHeader) match {
              case NotAuthenticated => Left(unauthorised("Not authenticated"))
              case Expired(principal) => Left(expired(principal))
              case GracePeriod(principal) if gracePeriodCountsAsAuthenticated => Right(principal)
              case GracePeriod(principal) => Left(expired(principal))
              case Authenticated(authedUser) => Right(authedUser)
              case Invalid(message, throwable) => Left(unauthorised(message, throwable).map(flushToken))
              case NotAuthorised(message) => Left(forbidden(s"Principal not authorised: $message"))
            }
        }
    }
  }

  override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] = {
    // gracePeriodCountsAsAuthenticated is set to true here, so requests using this block should accept users whose session is in the grace period
    authenticationStatus(request, gracePeriodCountsAsAuthenticated = true) match {
      case Right(principal) => {
        principal match {
          case innerServicePrincipal: InnerServicePrincipal =>
            logger.info("Allowing InnerServicePrincipal request for all instances")
            block(new AuthenticatedRequest(innerServicePrincipal, request))

          case _ =>
            // we have an end user principal, so only process the block if the instance is allowed
            val instance = instanceOf(request)
            logger.info(s"Checking that $principal is allowed to access instance $instance")
            getMyInstances(principal).flatMap { principalsInstances: Seq[Instance] =>
              if (principalsInstances.exists(_.id == instance.id)) {
                logger.debug("Allowing this request!")
                block(new AuthenticatedRequest(principal, request))

              } else {
                logger.warn(s"Blocking request ${request.path} on instance $instance for principal: " + principal)
                Future.successful(Forbidden("You do not have permission to use this instance"))
              }
            }
        }
      }
      // no principal so return a result which will either be an error or a form of redirect
      case Left(result) => result
    }
  }

  def getOnBehalfOfPrincipal(principal: Principal): OnBehalfOfPrincipal = {
    val provider: AuthenticationProvider = principal match {
      case _:MachinePrincipal => providers.apiProvider
      case _:UserPrincipal      => providers.userProvider
      case _:InnerServicePrincipal => providers.innerServiceProvider
    }
    val maybeEnrichFn: Either[String, WSRequest => WSRequest] = provider.onBehalfOf(principal)
    maybeEnrichFn.fold(
      error => throw new IllegalStateException(error),
      // as well as delegating to the provider, tack on the source of this outgoing request
      _.compose(_.addHttpHeaders(Authentication.originalServiceHeaderName -> config.appName))
    )
  }
  /** Use this for originating calls to other Grid services (this will sign the request and the receiving service will extract an `InnerServicePrincipal`)
    * IMPORTANT: Do not use this for simply making ongoing calls to other Grid services - instead use `getOnBehalfOfPrincipal` */
  def innerServiceCall(wsRequest: WSRequest): WSRequest = providers.innerServiceProvider.signRequest(wsRequest)

  private def getMyInstances(principal: Principal): Future[Seq[Instance]] = {
    val onBehalfOfPrincipal = getOnBehalfOfPrincipal(principal)
    principal.attributes.get(ApiKeyAuthenticationProvider.KindeIdKey).map { owner =>
      onBehalfOfPrincipal(wsClient.url(myInstancesEndpoint).withQueryStringParameters("owner" -> owner)).get().map { r =>
          r.status match {
            case 200 =>
              implicit val ir: Reads[Instance] = Json.reads[Instance]
              Json.parse(r.body).as[Seq[Instance]]
            case _ =>
              logger.warn("Got non 200 status for instances call: " + r.status)
              Seq.empty
          }
        }
    }.getOrElse {
      Future.successful(Seq.empty)
    }
  }
}

object Authentication {
  sealed trait Principal {
    def accessor: ApiAccessor
    def attributes: TypedMap
  }
  /** A human user with a name */
  case class UserPrincipal(firstName: String, lastName: String, email: String, attributes: TypedMap = TypedMap.empty) extends Principal {
    def accessor: ApiAccessor = ApiAccessor(identity = email, tier = Internal)

    override def toString: String = s"UserPrincipal(${(firstName, lastName, email)})"
  }
  /** A machine user doing work automatically for its human programmers */
  case class MachinePrincipal(accessor: ApiAccessor, attributes: TypedMap = TypedMap.empty) extends Principal

  /** A different Grid microservice (e.g. a call to media-api originating from thrall) */
  case class InnerServicePrincipal(identity: String, attributes: TypedMap = TypedMap.empty) extends Principal {
    def accessor: ApiAccessor = ApiAccessor(identity, tier = Internal)
  }

  type Request[A] = AuthenticatedRequest[A, Principal]

  type OnBehalfOfPrincipal = WSRequest => WSRequest

  val originalServiceHeaderName = "X-Gu-Original-Service"

  def getIdentity(principal: Principal): String = principal.accessor.identity
}
