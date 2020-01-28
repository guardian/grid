package lib

import java.net.URL

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model.{Collection, Image}
import com.gu.mediaservice.model.Image._
import okhttp3.{OkHttpClient, Request}
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

class ImageDataMerger(config: AdminToolsConfig)(implicit ec: ExecutionContext) {
  val client = new OkHttpClient

  def getMergedImageData(mediaId: String): Future[Image] = {
    for {
      image <- getImageLoaderProjection(mediaId)
      collections <- getCollectionsResponse(mediaId)
    } yield image.copy(
      collections = collections
    )
  }

  private def makeRequest (url: URL): JsValue = {
    val request = new Request.Builder().url(url).header(Authentication.apiKeyHeaderName, config.apiKey).build
    val response = client.newCall(request).execute
    Json.parse(response.body.string)
  }

  private def getImageLoaderProjection(mediaId: String): Future[Image] = Future{
    val url = new URL(s"${config.services.loaderBaseUri}/images/project/${mediaId}")
    makeRequest(url).as[Image]
  }

  private def getCollectionsResponse(mediaId: String): Future[List[Collection]] = Future{
    val url = new URL(s"${config.services.collectionsBaseUri}/images/${mediaId}")
    (makeRequest(url) \ "data").as[List[Collection]]
  }
}
