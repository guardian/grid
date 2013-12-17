package lib

import com.gu.mediaservice.lib.config.Properties
import java.io.File
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}


object Config {

  val properties = Properties.fromPath("/etc/gu/cropper.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val cropBucket = properties("s3.crop.bucket")
  val keyStoreBucket = properties("auth.keystore.bucket")

  val mediaApiKey = properties("media.api.key")

  val tempDir: File = new File(properties.getOrElse("crop.output.tmp.dir", "/tmp"))

  val imagickThreadPoolSize = 4
}
