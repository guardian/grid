package lib

import java.io.File

import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration

class ImageLoaderConfig extends CommonConfig {

  final override lazy val appName = "image-loader"

  val topicArn: String = properties("sns.topic.arn")

  val imageBucket: String = properties("s3.image.bucket")

  val thumbnailBucket: String = properties("s3.thumb.bucket")

  val tempDir: File = new File(properties.getOrElse("upload.tmp.dir", "/tmp"))

  val thumbWidth: Int = 256
  val thumbQuality: Double = 85d // out of 100

  val rootUri: String = services.loaderBaseUri
  val apiUri: String = services.apiBaseUri
  val loginUriTemplate: String = services.loginUriTemplate

  val supportedMimeTypes = List("image/jpeg", "image/png")

}
