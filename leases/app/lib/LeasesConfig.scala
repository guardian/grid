package lib

import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}

import java.net.URI
import scala.util.Try

class LeasesConfig(resources: GridConfigResources) extends CommonConfig(resources) {
  val leasesTable = string("dynamo.tablename.leasesTable")

  val rootUri: String = services.leasesBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val loginUriTemplate: String = services.loginUriTemplate

  private def uri(u: String) = URI.create(u)

  private val leasesUri = uri(s"$rootUri/leases")

  def leaseUri(leaseId: String): Option[URI] = Try { URI.create(s"$leasesUri/$leaseId") }.toOption
  def leasesMediaUri(mediaId: String) = Try { URI.create(s"$leasesUri/media/$mediaId") }.toOption

  private def mediaApiUri(id: String) = s"${services.apiBaseUri}/images/$id"
  def mediaApiLink(id: String) = Link("media", mediaApiUri(id))
}
