package com.gu.mediaservice.lib.auth

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.json.Json
import play.api.libs.concurrent.Execution.Implicits._
import play.api.mvc.Security.AuthenticatedRequest

import com.gu.mediaservice.syntax._
import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import com.gu.pandomainauth.action.UserRequest


sealed trait Principal {
  def name: String
}

case class PandaUser(email: String, firstName: String, lastName: String, avatarUrl: Option[String]) extends Principal {
  def name: String = s"$firstName $lastName"
}

case class AuthenticatedService(name: String) extends Principal



class PandaAuthenticated(authCallbackBaseUri_ : String)
    extends ActionBuilder[({ type R[A] = AuthenticatedRequest[A, Principal] })#R]
    with PanDomainAuthActions {

  val authCallbackBaseUri = authCallbackBaseUri_

  override def invokeBlock[A](request: Request[A], block: AuthenticatedRequest[A, Principal] => Future[Result]): Future[Result] =
    APIAuthAction.invokeBlock(request, (request: UserRequest[A]) => {
      block(new AuthenticatedRequest(pandaFromUser(request.user), request))
    })

  def pandaFromUser(user: User) = {
    val User(firstName, lastName, email, avatarUrl) = user
    PandaUser(email, firstName, lastName, avatarUrl)
  }
}



case class Authenticated(keyStore: KeyStore, authCallbackBaseUri: String)
  extends ActionBuilder[({ type R[A] = AuthenticatedRequest[A, Principal] })#R] {

  type RequestHandler[A] = AuthenticatedRequest[A, Principal] => Future[Result]

  class AuthException extends Exception
  case object NotAuthenticated extends AuthException


  // Try to auth by API key, and failing that, with Panda
  override def invokeBlock[A](request: Request[A], block: RequestHandler[A]): Future[Result] =
    authByKey(request, block) recoverWith { case _: AuthException => authByPanda(request, block) }


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
          case None => Future.failed(NotAuthenticated)
        }
      case None => Future.failed(NotAuthenticated)
    }


  // Panda authentication

  val pandaAuth = new PandaAuthenticated(authCallbackBaseUri)

  def authByPanda[A](request: Request[A], block: RequestHandler[A]): Future[Result] =
    pandaAuth.invokeBlock(request, block)
}
