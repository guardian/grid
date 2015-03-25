package com.gu.mediaservice.lib.auth

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.mvc.Security.AuthenticatedRequest

import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import com.gu.pandomainauth.action.UserRequest


sealed trait Principal {
  def name: String
}

case class PandaUser(email: String, firstName: String, lastName: String, avatarUrl: Option[String]) extends Principal {
  def name: String = s"$firstName $lastName"
}

case class AuthenticatedService(name: String) extends Principal



class PandaAuthenticated(loginUri_ : String, authCallbackBaseUri_ : String)
    extends ActionBuilder[({ type R[A] = AuthenticatedRequest[A, Principal] })#R]
    with PanDomainAuthActions {

  val authCallbackBaseUri = authCallbackBaseUri_

  override def invokeBlock[A](request: Request[A], block: AuthenticatedRequest[A, Principal] => Future[Result]): Future[Result] =
    ArgoAuthAction.invokeBlock(request, (request: UserRequest[A]) => {
      block(new AuthenticatedRequest(pandaFromUser(request.user), request))
    })

  def pandaFromUser(user: User) = {
    val User(firstName, lastName, email, avatarUrl) = user
    PandaUser(email, firstName, lastName, avatarUrl)
  }


  object ArgoAuthAction extends AbstractApiAuthAction with ArgoErrorResponses {
    val loginUri = loginUri_
  }

  // FIXME: delete this once it is released as part of the panda lib:
  // https://github.com/guardian/pan-domain-authentication/pull/7
  trait AbstractApiAuthAction extends ActionBuilder[UserRequest] {

    val notAuthenticatedResult: Result
    val invalidCookieResult: Result
    val expiredResult: Result
    val notAuthorizedResult: Result

    import play.api.Logger

    override def invokeBlock[A](request: Request[A], block: (UserRequest[A]) => Future[Result]): Future[Result] = {
      extractAuth(request) match {
        case NotAuthenticated =>
          Logger.debug(s"user not authed against $domain, return 401")
          Future(notAuthenticatedResult)

        case InvalidCookie(e) =>
          Logger.warn("error checking user's auth, clear cookie and return 401", e)
          // remove the invalid cookie data
          Future(invalidCookieResult).map(flushCookie)

        case Expired(authedUser) =>
          Logger.debug(s"user ${authedUser.user.email} login expired, return 419")
          Future(expiredResult)

        case GracePeriod(authedUser) =>
          Logger.debug(s"user ${authedUser.user.email} login expired but is in grace period.")
          val response = block(new UserRequest(authedUser.user, request))
          responseWithSystemCookie(response, authedUser)

        case NotAuthorized(authedUser) =>
          Logger.debug(s"user not authorized, return 403")
          Logger.debug(invalidUserMessage(authedUser))
          Future(notAuthorizedResult)

        case Authenticated(authedUser) =>
          val response = block(new UserRequest(authedUser.user, request))
          responseWithSystemCookie(response, authedUser)
      }
    }

    def responseWithSystemCookie(response: Future[Result], authedUser: AuthenticatedUser): Future[Result] =
      if (authedUser.authenticatedIn(system)) {
        response
      } else {
        Logger.debug(s"user ${authedUser.user.email} from other system valid: adding validity in $system.")
        response.map(includeSystemInCookie(authedUser))
      }
  }

}



case class Authenticated(keyStore: KeyStore, loginUri: String, authCallbackBaseUri: String)
  extends ActionBuilder[({ type R[A] = AuthenticatedRequest[A, Principal] })#R]
  with ArgoErrorResponses {

  type RequestHandler[A] = AuthenticatedRequest[A, Principal] => Future[Result]

  class AuthException extends Exception
  case object NotAuthenticated extends AuthException
  case object InvalidAuth extends AuthException


  // Try to auth by API key, and failing that, with Panda
  override def invokeBlock[A](request: Request[A], block: RequestHandler[A]): Future[Result] =
    authByKey(request, block) recoverWith {
      case NotAuthenticated => authByPanda(request, block)
      case InvalidAuth      => Future.successful(invalidApiKeyResult)
    }


  // API Key authentication

  // Note: this had to be mixed into here, sadly, because of mild type-hell
  // when trying to make it its own ActionBuilder. Play ActionBuilders don't
  // compose very nicely, alas.

  val headerKey = "X-Gu-Media-Key"

  def authByKey[A](request: Request[A], block: RequestHandler[A]): Future[Result] =
    request.headers.get(headerKey) match {
      case Some(key) =>
        keyStore.lookupIdentity(key).flatMap {
          case Some(name) => block(new AuthenticatedRequest(AuthenticatedService(name), request))
          case None => Future.failed(InvalidAuth)
        }
      case None => Future.failed(NotAuthenticated)
    }


  // Panda authentication

  val pandaAuth = new PandaAuthenticated(loginUri, authCallbackBaseUri)

  def authByPanda[A](request: Request[A], block: RequestHandler[A]): Future[Result] =
    pandaAuth.invokeBlock(request, block)
}
