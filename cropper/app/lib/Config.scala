package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppProperties}
import java.io.File
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config extends CommonPlayAppProperties {

  val properties = Properties.fromPath("/etc/gu/cropper.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val imgPublishingBucket = properties("publishing.image.bucket")
  val imgPublishingCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("publishing.aws.id"), properties("publishing.aws.secret"))

  val imgPublishingHost = properties("publishing.image.host")
  // Note: work around CloudFormation not allowing optional parameters
  val imgPublishingSecureHost = properties.get("publishing.image.secure.host").filterNot(_.isEmpty)

  val keyStoreBucket = properties("auth.keystore.bucket")

  val topicArn = properties("sns.topic.arn")

  val rootUri = services.cropperBaseUri
  val kahunaUri = services.kahunaBaseUri

  val corsAllowedOrigin = services.kahunaBaseUri

  val tempDir: File = new File(properties.getOrElse("crop.output.tmp.dir", "/tmp"))

  val imagingThreadPoolSize = 4

  val landscapeCropSizingWidths = List(2000, 1000, 500, 140)
  val portraitCropSizingHeights = List(2000, 1000, 500)
}
