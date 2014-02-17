package lib

import com.gu.mediaservice.lib.config.Properties
import java.io.File
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config {

  val properties = Properties.fromPath("/etc/gu/cropper.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val imgPublishingBucket = properties("publishing.image.bucket")
  val imgPublishingCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("publishing.aws.id"), properties("publishing.aws.secret"))

  val keyStoreBucket = properties("auth.keystore.bucket")

  val topicArn = properties("sns.topic.arn")

  val mediaApiKey = properties("media.api.key")

  val tempDir: File = new File(properties.getOrElse("crop.output.tmp.dir", "/tmp"))

  val imagingThreadPoolSize = 4

  val cropSizingWidths = List(2000, 1000, 500, 140)
}
