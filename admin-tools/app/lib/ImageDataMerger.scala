package lib

import java.net.URL

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model.Image._
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model.{Collection, Edits, Image}
import okhttp3.{OkHttpClient, Request}
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

class ImageDataMerger(config: AdminToolsConfig)(implicit ec: ExecutionContext) {

  private val httpClient = new OkHttpClient

  def getMergedImageData(mediaId: String): Option[Future[Image]] = {
    val maybeImage: Option[Image] = getImageLoaderProjection(mediaId)
    maybeImage.map(aggregate)
  }

  private def aggregate(image: Image): Future[Image] = {
    val mediaId = image.id
    for {
      collections <- getCollectionsResponse(mediaId)
      edits <- getEdits(mediaId)
      leases <- getLeases(mediaId)
      usages <- getUsages(mediaId)
    } yield image.copy(
      collections = collections,
      userMetadata = edits,
      leases = leases,
      usages = usages
    )
  }

  private def getImageLoaderProjection(mediaId: String): Option[Image] = {
    val url = new URL(s"${config.services.loaderBaseUri}/images/project/$mediaId")
    val res = makeRequest(url)
    if (res.statusCode == 200) Some(res.body.as[Image]) else None
  }

  private def getCollectionsResponse(mediaId: String): Future[List[Collection]] = Future {
    val url = new URL(s"${config.services.collectionsBaseUri}/images/$mediaId")
    val res = makeRequest(url)
    if (res.statusCode != 200) List.empty[Collection] else (res.body \ "data").as[List[Collection]]
  }

  private def getEdits(mediaId: String): Future[Option[Edits]] = Future {
    val url = new URL(s"${config.services.metadataBaseUri}/edits/$mediaId")
    val res = makeRequest(url)
    if (res.statusCode != 200) None else Some((res.body \ "data").as[Edits])
  }

  private def getLeases(mediaId: String): Future[LeasesByMedia] = Future {
    val url = new URL(s"${config.services.leasesBaseUri}/leases/media/$mediaId")
    val res = makeRequest(url)
    if (res.statusCode != 200) LeasesByMedia.empty else (res.body \ "data").as[LeasesByMedia]
  }

  private def getUsages(mediaId: String): Future[List[Usage]] = Future {
    val url = new URL(s"${config.services.usageBaseUri}/usages/media/$mediaId")
    val res = makeRequest(url)
    if (res.statusCode != 200) {
      List.empty[Usage]
    } else {
      def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
        (resBody \ "data").as[JsArray].value
          .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
      }

      val jsonList = unpackUsagesFromEntityResponse(res.body)
      jsonList.map(_.as[Usage])
    }
  }

  case class ResponseWrapper(body: JsValue, statusCode: Int)

  private def makeRequest(url: URL): ResponseWrapper = {
    val request = new Request.Builder().url(url).header(Authentication.apiKeyHeaderName, config.apiKey).build
    val response = httpClient.newCall(request).execute
    response.code
    val json = Json.parse(response.body.string)
    ResponseWrapper(json, response.code)
  }
}
