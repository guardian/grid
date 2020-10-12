package lib

import java.io.File

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model._
import play.api.Configuration

class ImageLoaderConfig(playAppConfiguration: Configuration) extends CommonConfig(playAppConfiguration) {
  val imageBucket: String = string("s3.image.bucket")

  val thumbnailBucket: String = string("s3.thumb.bucket")

  val tempDir: File = new File(stringDefault("upload.tmp.dir", "/tmp"))

  val thumbWidth: Int = 256
  val thumbQuality: Double = 85d // out of 100

  val rootUri: String = services.loaderBaseUri
  val apiUri: String = services.apiBaseUri
  val loginUriTemplate: String = services.loginUriTemplate

  val transcodedMimeTypes: List[MimeType] = getStringSet("transcoded.mime.types").toList.map(MimeType(_))
  val supportedMimeTypes: List[MimeType] = List(Jpeg, Png) ::: transcodedMimeTypes

}
