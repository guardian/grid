package lib

import java.net.URI

import play.api.libs.json.{Json, JsObject, Writes}

import scala.util.Try

import play.api.mvc.Security.AuthenticatedRequest

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, Principal, KeyStore}
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.model.{LeaseByMedia, DateFormat, MediaLease}


case class InvalidPrinciple(message: String) extends Throwable
trait ControllerHelper extends ArgoHelpers {

  import lib.Config._

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

  def requestingUser(implicit request: AuthenticatedRequest[_, Principal]) =
    request.user match {
      case PandaUser(email, _, _, _) => Some(email)
      case AuthenticatedService(name) => Some(name)
      case _ => None
    }


  def wrapLease(lease: MediaLease): EntityResponse[MediaLease] = {
    EntityResponse(
      uri = lease.id.map(leaseUri).get,
      data = lease
    )
  }

  implicit val dateTimeFormat = DateFormat
  implicit val writer = new Writes[LeaseByMedia] {
    def writes(leaseByMedia: LeaseByMedia) = {
      LeaseByMedia.toJson(
        Json.toJson(leaseByMedia.leases.map(wrapLease)),
        Json.toJson(leaseByMedia.current.map(wrapLease)),
        Json.toJson(leaseByMedia.lastModified.map(lm => Json.toJson(lm)))
      )
    }
  }

  private def uri(u: String) = URI.create(u)

  val leasesUri = uri(s"$rootUri/leases")
  def mediaApiUri(id: String) = s"${services.apiBaseUri}/images/${id}"
  def mediaApiLink(id: String) = Link("media", mediaApiUri(id))

  def leaseUri(leaseId: String): Option[URI] =
    Try { URI.create(s"${leasesUri}/${leaseId}") }.toOption

  def leasesMediaUri(mediaId: String) =
    Try { URI.create(s"${leasesUri}/media/${mediaId}") }.toOption

}
