package lib

import java.net.URI

import scala.util.Try

import play.api.mvc.Security.AuthenticatedRequest

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, Principal, KeyStore}
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.model.MediaLease


case class InvalidPrinciple(message: String) extends Throwable
object ControllerHelper extends ArgoHelpers {

  import lib.Config._

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  val leasesUri = uri(s"$rootUri/leases")

  private def uri(u: String) = URI.create(u)

  def requestingUser(implicit request: AuthenticatedRequest[_, Principal]) =
    request.user match {
      case PandaUser(email, _, _, _) => Some(email)
      case AuthenticatedService(name) => Some(name)
      case _ => None
    }

  private def leaseUri(leaseId: String): Option[URI] = {
    Try { URI.create(s"${leasesUri}/${leaseId}") }.toOption
  }

  private def wrapLease(lease: MediaLease): EntityReponse[MediaLease] = {
    EntityReponse(
      uri = lease.id.map(leaseUri).get,
      data = lease
    )
  }

  private def mediaApiUri(id: String) = s"${services.apiBaseUri}/images/${id}"

}
