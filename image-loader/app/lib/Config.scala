package lib

import java.io.File

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.gu.mediaservice.lib.config.{CommonPlayAppConfig, CommonPlayAppProperties, Properties}


object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "image-loader"

  val properties = Properties.fromPath("/etc/gu/image-loader.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val topicArn: String = properties("sns.topic.arn")

  val imageBucket: String = properties("s3.image.bucket")

  val thumbnailBucket: String = properties("s3.thumb.bucket")

  val pngImageOpsBucket: String = properties("s3.png.bucket")

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val tempDir: File = new File(properties.getOrElse("upload.tmp.dir", "/tmp"))

  val thumbWidth: Int = 256
  val thumbQuality: Double = 85d // out of 100

  val imagickThreadPoolSize = 4

  val rootUri = services.loaderBaseUri
  val apiUri = services.apiBaseUri
  val loginUriTemplate = services.loginUriTemplate

  lazy val corsAllAllowedOrigins: List[String] = List(services.kahunaBaseUri)


  val supportedMimeTypes = List("image/jpeg", "image/png")

}
