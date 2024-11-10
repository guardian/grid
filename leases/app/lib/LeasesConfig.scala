package lib

import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources, InstanceForRequest}
import play.api.mvc.{AnyContent, Request}

import java.net.URI
import scala.util.Try

class LeasesConfig(resources: GridConfigResources) extends CommonConfig(resources) with InstanceForRequest {
  val leasesTable = string("dynamo.tablename.leasesTable")

  val rootUri: String = services.leasesBaseUri

  private def uri(u: String) = URI.create(u)

  private val leasesUri = uri(s"$rootUri/leases")

  def leaseUri(leaseId: String): Option[URI] = Try { URI.create(s"$leasesUri/$leaseId") }.toOption
  def leasesMediaUri(mediaId: String) = Try { URI.create(s"$leasesUri/media/$mediaId") }.toOption

  private def mediaApiUri(id: String)(implicit r: Request[AnyContent]) = s"${services.apiBaseUri(instanceOf(r))}/images/$id"
  def mediaApiLink(id: String)(implicit r: Request[AnyContent]) = Link("media", mediaApiUri(id))
}
