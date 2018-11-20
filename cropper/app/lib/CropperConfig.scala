package lib

import java.io.File

import com.amazonaws.auth.{AWSCredentials, BasicAWSCredentials}
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Configuration


class CropperConfig extends CommonConfig {

  final override lazy val appName = "cropper"

  val imgPublishingBucket = properties("publishing.image.bucket")

  val imgPublishingHost = properties("publishing.image.host")
  // Note: work around CloudFormation not allowing optional parameters
  val imgPublishingSecureHost = properties.get("publishing.image.secure.host").filterNot(_.isEmpty)

  val topicArn = properties("sns.topic.arn")

  val rootUri = services.cropperBaseUri
  val apiUri = services.apiBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate

  val tempDir: File = new File(properties.getOrElse("crop.output.tmp.dir", "/tmp"))

  val landscapeCropSizingWidths = List(2000, 1000, 500, 140)
  val portraitCropSizingHeights = List(2000, 1000, 500)
}
