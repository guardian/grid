package com.gu.mediaservice.lib.auth

import scala.concurrent.Future

import play.api.mvc._
import play.api.libs.json.Json
import play.api.libs.concurrent.Execution.Implicits._
import play.api.mvc.SimpleResult
import play.api.mvc.Security.AuthenticatedRequest

import com.amazonaws.auth.AWSCredentials
import com.gu.mediaservice.lib.aws.S3
import org.apache.commons.io.IOUtils
import com.amazonaws.AmazonServiceException
import com.gu.mediaservice.syntax._

object Authenticated {
  def apply(keyStore: KeyStore)(onUnauthorized: RequestHeader => SimpleResult): AuthenticatedBuilder[Principal] =
    new AuthenticatedBuilder(Principal.fromRequest(keyStore), onUnauthorized)
}

sealed trait Principal {
  def name: String
}

case class User(openid: String, email: String, firstName: String, lastName: String) extends Principal {
  def name: String = s"$firstName $lastName"
  def emailDomain = email.split("@").last
}

object User {
  val KEY = "identity"
  implicit val formats = Json.format[User]
  def readJson(json: String): Option[User] = Json.fromJson[User](Json.parse(json)).asOpt
  def writeJson(id: User) = Json.stringify(Json.toJson(id))

  import scalaz.syntax.std.boolean._

  /** Assumes that all traffic not from the ELB (i.e. without the X-Forwarded-Proto header) is trusted */
  def fromRequest(request: RequestHeader): Option[User] =
    request.forwardedProtocol.forall(_ == "https")
      .option(request.session.get(KEY).flatMap(User.readJson))
      .flatten
}

case class ServicePeer(name: String) extends Principal

object ServicePeer {

  val headerKey = "X-Gu-Media-Key"

  def fromRequest(keyStore: KeyStore, request: RequestHeader): Future[Option[ServicePeer]] =
    request.headers.get(headerKey) match {
      case Some(key) => keyStore.getIdentity(key).map(_.map(ServicePeer(_)))
      case None => Future.successful(None)
    }

}

object Principal {

  def fromRequest(keyStore: KeyStore)(request: RequestHeader): Future[Option[Principal]] =
    User.fromRequest(request) match {
      case u @ Some(_) => Future.successful(u)
      case None        => ServicePeer.fromRequest(keyStore, request)
    }
}

class KeyStore(bucket: String, credentials: AWSCredentials) {

  val s3 = new S3(credentials)

  def getIdentity(key: String): Future[Option[String]] =
    Future {
      for (content <- Option(s3.client.getObject(bucket, key))) yield {
        val stream = content.getObjectContent
        try IOUtils.toString(stream, "utf-8")
        finally stream.close()
      }
    }.recover {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" => None
    }
}

/** A variant of Play's AuthenticatedBuilder which permits the user info to be retrieved in a Future,
  * rather than immediately (/blocking)
  */
class AuthenticatedBuilder[U](userinfo: RequestHeader => Future[Option[U]],
                              onUnauthorized: RequestHeader => SimpleResult)
  extends ActionBuilder[({ type R[A] = AuthenticatedRequest[A, U] })#R] {

  def invokeBlock[A](request: Request[A], block: AuthenticatedRequest[A, U] => Future[SimpleResult]) =
    authenticate(request, block)

  def authenticate[A](request: Request[A], block: AuthenticatedRequest[A, U] => Future[SimpleResult]) =
    userinfo(request).flatMap { maybeUser =>
      maybeUser
        .map(user => block(new AuthenticatedRequest(user, request)))
        .getOrElse(Future.successful(onUnauthorized(request)))
  }

}
