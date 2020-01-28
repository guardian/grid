package lib

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model.Image
import com.gu.mediaservice.model.Image._
import okhttp3.{OkHttpClient, Request}
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}

class ImageDataMerger(config: AdminToolsConfig)(implicit ec: ExecutionContext) {
  val client = new OkHttpClient

  def getMergedImageData(mediaId: String): Future[Image] = {
    for {
      image <- getImageLoaderProjection(mediaId)
    } yield image
  }

  private def getImageLoaderProjection(mediaId: String): Future[Image] = Future{
    val url = s"${config.services.loaderBaseUri}/images/project/${mediaId}"
    val request = new Request.Builder().url(url).header(Authentication.apiKeyHeaderName, config.apiKey).build
    val response = client.newCall(request).execute
    Json.parse(response.body.string).as[Image]
  }
}
