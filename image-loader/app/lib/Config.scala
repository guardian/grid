package lib

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.gu.mediaservice.lib.config.{CommonPlayAppProperties, Properties}


object Config extends CommonPlayAppProperties {

  val properties = Properties.fromPath("/etc/gu/image-loader.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val topicArn: String = properties("sns.topic.arn")

  val imageBucket: String = properties("s3.image.bucket")

  val thumbnailBucket: String = properties("s3.thumb.bucket")

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val tempDir: String = properties.getOrElse("upload.tmp.dir", "/tmp")

  val thumbWidth: Int = 256

  val imagickThreadPoolSize = 4

  val rootUri = services.loaderBaseUri
  val apiUri = services.apiBaseUri

  lazy val corsAllAllowedOrigins: List[String] = List(services.kahunaBaseUri)


  val supportedMimeTypes = List("image/jpeg")

  // TODO: Move this list into an admin-managed repository
  val guardianStaff = List(
    "Christopher Thomond",
    "Sean Smith",
    "David Levene",
    "David Sillitoe",
    "Eamonn Mccabe",
    "Felicity Cloake",
    "Frank Baron",
    "Graeme Robertson",
    "Graham Turner",
    "Linda Nylind",
    "Martin Argles",
    "Martin Godwin",
    "Mike Bowers",
    "Murdo Macleod",
    "Sarah Lee",
    "Tom Jenkins",
    "Tristram Kenton"
  )

  val observerStaff = List(
    "Andy Hall",
    "Antonio Olmos",
    "Catherine Shaw",
    "Gary Calton",
    "Karen Robinson",
    "Katherine Anne Rose",
    "Sophia Evans",
    "Suki Dhanda"
  )

}
