package lib

import java.io.File

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model._
import play.api.Configuration

class ImageLoaderConfig(override val configuration: Configuration) extends CommonConfig {

  final override lazy val appName = "image-loader"

  val imageBucket: String = properties("s3.image.bucket")

  val thumbnailBucket: String = properties("s3.thumb.bucket")

  val configBucket: String = properties("s3.config.bucket")

  val tempDir: File = new File(properties.getOrElse("upload.tmp.dir", "/tmp"))

  val thumbWidth: Int = 256
  val thumbQuality: Double = 85d // out of 100

  val rootUri: String = services.loaderBaseUri
  val apiUri: String = services.apiBaseUri
  val loginUriTemplate: String = services.loginUriTemplate


  val transcodedMimeTypes = properties.getOrElse("transcoded.mime.types", "").split(",").toList
  val transcodedOptimisedQuality: Double = 10d // out of 100
  val optimiseSpeed: Double = 11d // out of 11
  val supportedMimeTypes = List("image/jpeg", "image/png") ::: transcodedMimeTypes

}
