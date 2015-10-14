package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppProperties, CommonPlayAppConfig}
import java.io.File
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "cropper"

  val properties = Properties.fromPath("/etc/gu/cropper.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val configBucket: String = properties("s3.config.bucket")

  val imgPublishingBucket = properties("publishing.image.bucket")
  val imgPublishingCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("publishing.aws.id"), properties("publishing.aws.secret"))

  val imgPublishingHost = properties("publishing.image.host")
  // Note: work around CloudFormation not allowing optional parameters
  val imgPublishingSecureHost = properties.get("publishing.image.secure.host").filterNot(_.isEmpty)

  val keyStoreBucket = properties("auth.keystore.bucket")

  val topicArn = properties("sns.topic.arn")

  val rootUri = services.cropperBaseUri
  val apiUri = services.apiBaseUri
  val kahunaUri = services.kahunaBaseUri
  val loginUriTemplate = services.loginUriTemplate

  val corsAllAllowedOrigins = List(services.kahunaBaseUri)

  val tempDir: File = new File(properties.getOrElse("crop.output.tmp.dir", "/tmp"))

  val landscapeCropSizingWidths = List(2000, 1000, 500, 140)
  val portraitCropSizingHeights = List(2000, 1000, 500)
}
