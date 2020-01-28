package lib

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model.Image
import com.gu.mediaservice.model.Image._
import okhttp3.{OkHttpClient, Request}
import play.api.libs.json.Json

class ImageDataMerger(config: AdminToolsConfig) {
  val client = new OkHttpClient

  def getMergedImageData(mediaId: String): Image = {
    getImageLoaderProjection(mediaId)
  }

  private def getImageLoaderProjection(mediaId: String): Image = {
    val url = s"${config.services.loaderBaseUri}/images/project/${mediaId}"
    val request = new Request.Builder().url(url).header(Authentication.apiKeyHeaderName, config.apiKey).build
    val response = client.newCall(request).execute
    Json.parse(response.body.string).as[Image]
  }
}
