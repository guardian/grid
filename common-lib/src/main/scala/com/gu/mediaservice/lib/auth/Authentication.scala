package com.gu.mediaservice.lib.auth

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.mvc.Security.AuthenticatedRequest

import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import com.gu.pandomainauth.action.UserRequest

import com.gu.mediaservice.lib.play.DigestedFile
import java.io.File


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
    // FIXME: for some reason an initialisation order issue causes this to be null if not lazy >:-(
    lazy val loginUri = loginUri_
  }
}

case class AuthenticatedUpload(keyStore: KeyStore, loginUri: String, authCallbackBaseUri: String) extends AuthenticatedBase {

  import com.gu.mediaservice.lib.play.BodyParsers.digestedFile

  def digestedFileAsync(tempDir: String):(AuthenticatedRequest[DigestedFile,Principal] => Future[Result]) => Action[DigestedFile] = {
    AuthenticatedUpload(keyStore, loginUri, authCallbackBaseUri).async(digestedFile(createTempFile(tempDir))) _
  }

   // Try to auth by API key, and failing that, with Panda
  override def invokeBlock[A](request: Request[A], block: RequestHandler[A]): Future[Result] = {
    val DigestedFile(tempFile, id) = request.body
    val result  = super.invokeBlock(request, block)

    result.onComplete(_ => tempFile.delete())
    result
  }

  def createTempFile(dir: String) = File.createTempFile("requestBody", "", new File(dir))
}

case class Authenticated(keyStore: KeyStore, loginUri: String, authCallbackBaseUri: String) extends AuthenticatedBase
trait AuthenticatedBase extends ActionBuilder[({ type R[A] = AuthenticatedRequest[A, Principal] })#R] with ArgoErrorResponses {

  val keyStore: KeyStore
  val loginUri: String
  val authCallbackBaseUri: String

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
