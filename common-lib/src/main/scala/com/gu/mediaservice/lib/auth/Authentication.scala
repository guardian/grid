package com.gu.mediaservice.lib.auth

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.json.Json
import play.api.libs.concurrent.Execution.Implicits._
import play.api.mvc.Security.AuthenticatedRequest

import com.gu.mediaservice.syntax._
import com.gu.pandomainauth.model.{AuthenticatedUser, User}


object Authenticated {
  def apply(keyStore: KeyStore)(onUnauthorized: RequestHeader => Result): AuthenticatedBuilder[Principal] =
    new AuthenticatedBuilder(Principal.fromRequest(keyStore), (req) => Future.successful(onUnauthorized(req)))

  def async(keyStore: KeyStore)(onUnauthorized: RequestHeader => Future[Result]): AuthenticatedBuilder[Principal] =
    new AuthenticatedBuilder(Principal.fromRequest(keyStore), onUnauthorized)
}

sealed trait Principal {
  def name: String
}

case class PandaUser(email: String, firstName: String, lastName: String, avatarUrl: Option[String]) extends Principal {
  def name: String = s"$firstName $lastName"
  def emailDomain = email.split("@").last
}


object PandaUser {
  val KEY = "identity"
  implicit val formats = Json.format[PandaUser]
  def readJson(json: String): Option[PandaUser] = Json.fromJson[PandaUser](Json.parse(json)).asOpt
  def writeJson(id: PandaUser) = Json.stringify(Json.toJson(id))

  def fromRequest(request: RequestHeader): Option[Principal] = PandaAuth.get(request) map {
    case AuthenticatedUser(User(firstName, lastName, email, avatarUrl), _, _, _, _) =>
      PandaUser(email, firstName, lastName, avatarUrl)
  }
}

case class AuthenticatedService(name: String) extends Principal

case object AnonymousService extends Principal {
  val name = "Anonymous Service"

  import scalaz.syntax.std.boolean._

  /** Assumes all non-HTTPS traffic is from trusted services */
  def fromRequest(request: RequestHeader): Option[Principal] =
    request.forwardedProtocol.forall(_ == "http").option(AnonymousService)
}

object AuthenticatedService {

  val headerKey = "X-Gu-Media-Key"

  def fromRequest(keyStore: KeyStore, request: RequestHeader): Future[Option[AuthenticatedService]] =
    request.headers.get(headerKey) match {
      case Some(key) => keyStore.lookupIdentity(key).map(_.map(AuthenticatedService(_)))
      case None => Future.successful(None)
    }

}

object Principal {

  def fromRequest(keyStore: KeyStore)(request: RequestHeader): Future[Option[Principal]] =
    AnonymousService.fromRequest(request) orElse PandaUser.fromRequest(request) match {
      case x @ Some(_) => Future.successful(x)
      case None        => AuthenticatedService.fromRequest(keyStore, request)
    }
}


/** A variant of Play's AuthenticatedBuilder which permits the user info to be retrieved in a Future,
  * rather than immediately (/blocking)
  */
class AuthenticatedBuilder[U](userinfo: RequestHeader => Future[Option[U]],
                              onUnauthorized: RequestHeader => Future[Result])
  extends ActionBuilder[({ type R[A] = AuthenticatedRequest[A, U] })#R] {

  def invokeBlock[A](request: Request[A], block: AuthenticatedRequest[A, U] => Future[Result]) =
    authenticate(request, block)

  def authenticate[A](request: Request[A], block: AuthenticatedRequest[A, U] => Future[Result]) =
    userinfo(request).flatMap { maybeUser =>
      maybeUser
        .map(user => block(new AuthenticatedRequest(user, request)))
        .getOrElse(onUnauthorized(request))
    }

}
