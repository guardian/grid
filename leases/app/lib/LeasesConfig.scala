package lib

import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources, InstanceForRequest}
import com.gu.mediaservice.model.Instance

import java.net.URI
import scala.util.Try

class LeasesConfig(resources: GridConfigResources) extends CommonConfig(resources) with InstanceForRequest {
  val leasesTable = string("dynamo.tablename.leasesTable")

  def rootUri: Instance => String = services.leasesBaseUri

  private def uri(u: String) = URI.create(u)

  private def leasesUri(implicit instance: Instance) = uri(s"${rootUri(instance)}/leases")

  def leaseUri(leaseId: String)(implicit instance: Instance): Option[URI] = Try { URI.create(s"${leasesUri(instance)}/$leaseId") }.toOption
  def leasesMediaUri(mediaId: String)(implicit instance: Instance) = Try { URI.create(s"${leasesUri(instance)}/media/$mediaId") }.toOption

  private def mediaApiUri(id: String)(implicit instance: Instance) = s"${services.apiBaseUri(instance)}/images/$id"
  def mediaApiLink(id: String)(implicit instance: Instance) = Link("media", mediaApiUri(id))
}
