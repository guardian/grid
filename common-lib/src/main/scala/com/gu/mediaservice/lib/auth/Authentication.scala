package com.gu.mediaservice.lib.auth

import scala.collection.JavaConverters._
import scala.concurrent.Future
import scala.concurrent.duration._

import akka.actor.Scheduler
import akka.agent.Agent
import play.api.mvc._
import play.api.libs.json.Json
import play.api.libs.concurrent.Execution.Implicits._
import play.api.mvc.Security.AuthenticatedRequest

import com.amazonaws.auth.AWSCredentials
import com.gu.mediaservice.lib.aws.S3
import org.apache.commons.io.IOUtils
import com.amazonaws.AmazonServiceException
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

class KeyStore(bucket: String, credentials: AWSCredentials) {

  val s3 = new S3(credentials)

  def lookupIdentity(key: String): Future[Option[String]] =
    store.future.map(_.get(key))

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  private val store: Agent[Map[String, String]] = Agent(Map.empty)

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def update() {
    store.sendOff(_ => fetchAll)
  }

  private def fetchAll: Map[String, String] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getIdentity(k).map(k -> _)).toMap
  }

  private def getIdentity(key: String): Option[String] = {
    val content = s3.client.getObject(bucket, key)
    val stream = content.getObjectContent
    try
      Some(IOUtils.toString(stream, "utf-8"))
    catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" => None
    }
    finally
      stream.close()
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
