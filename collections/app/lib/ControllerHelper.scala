package lib

import play.api.mvc.Security.AuthenticatedRequest

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, Principal, KeyStore}

import lib.Config._

case class InvalidPrinciple(message: String) extends Throwable
object ControllerHelper {

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  def getUserFromReq(req: AuthenticatedRequest[_, Principal]) = req.user match {
    case PandaUser(email, _, _, _) => email
    case AuthenticatedService(name) => name
    // We should never get here
    case user => throw new InvalidPrinciple(s"Invalid user ${user.name}")
  }

}
