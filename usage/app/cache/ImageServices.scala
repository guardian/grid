package cache

import lib.UsageConfig
import play.api.http.Status.{NOT_FOUND, OK, UNAUTHORIZED}
import play.api.libs.ws.WSClient

import java.net.URI
import java.util.UUID
import scala.concurrent.Future

sealed trait DecacheResult
case object Cleared extends DecacheResult
case class NotCleared(originUri: URI) extends DecacheResult
case class UnexpectedResponse(status: Int, originUri: URI) extends DecacheResult

case class ImageDecacheResult(
    decacheResults: List[DecacheResult]
    ) {

  val errors = decacheResults.collect({ case UnexpectedResponse(status, originUri) => UnexpectedResponse(status, originUri)})
  val cleared = decacheResults.collect({ case Cleared => Cleared})
  val uncleared = decacheResults.collect({ case NotCleared(originUri) => NotCleared(originUri)})
  val hasErrors = errors.nonEmpty
  val hasUncleared = uncleared.nonEmpty
  val allUrlsCleared = cleared.size == decacheResults.size
}

class ImageServices(config: UsageConfig, WSClient: WSClient)(implicit val ec: scala.concurrent.ExecutionContext) {

  // none of the stuff here is a state secret.
  // it is all authenticated
  private val fastlyIOService = "5CSDV7WcKwnIIHipZzt3po"

  private val fastlyOriginCdns = Map(
    "static.guim.co.uk" -> "5qHts5Ev0rFxzm1DhCkmyA",
    "media.guim.co.uk" -> "1NLDlK1ywahkZzRZrmWIYw",
    "uploads.guim.co.uk" -> "2TmfkSoyUoNo8aFNe6Htjs",
    "sport.guim.co.uk" -> "1C2vPr3E26cRb4NXa0wMf3",
  )

  // clear both the origin CDN and Fastly IO service (either i.guim.co.uk or i.guimcode.co.uk)
  private def fastlyServiceIdsforOrigin(host: String): Seq[String] = Seq(fastlyOriginCdns(host), fastlyIOService)

  def clearFastly(originUri: URI): Future[Unit] = {
    Future.successful(())

    //    fastlyServiceIdsforOrigin(originUri.getHost).foreach { serviceId =>
    //      // This works because the "path" is set as a Surrogate Key for images in i.guim.co.uk
    //      // https://www.fastly.com/blog/surrogate-keys-part-1/
    //      wsClient
    //        .url(s"https://api.fastly.com/service/$serviceId/purge/${originUri.getPath}")
    //        .withHttpHeaders("Fastly-Key" -> config.fastlyKey)
    //        .post("")
    //    }
  }

  def validateDecache(originUri: URI): Future[DecacheResult] = {
    val cacheBust = UUID.randomUUID()
    WSClient.url(s"$originUri?cachebust=$cacheBust").get().map(_.status).map {
      case NOT_FOUND | UNAUTHORIZED => Cleared
      case OK => NotCleared(originUri)
      case status => UnexpectedResponse(status, originUri)
    }
  }

}
