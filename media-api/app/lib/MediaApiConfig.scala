package lib

import com.amazonaws.services.ec2.{AmazonEC2, AmazonEC2ClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.elasticsearch.EC2._
import play.api.Configuration

import scala.util.Try

case class StoreConfig(
  storeBucket: String,
  storeKey: String
)

class MediaApiConfig(override val configuration: Configuration) extends CommonConfig {

  final override lazy val appName = "media-api"

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val configBucket: String = properties("s3.config.bucket")
  val usageMailBucket: String = properties("s3.usagemail.bucket")

  val quotaStoreKey: String = properties("quota.store.key")
  val quotaStoreConfig: StoreConfig = StoreConfig(configBucket, quotaStoreKey)

  private lazy val ec2Client: AmazonEC2 = withAWSCredentials(AmazonEC2ClientBuilder.standard()).build()

  val elasticsearchHost: String =
    if (stage == "DEV")
      properties.getOrElse("es.host", "localhost")
    else
      findElasticsearchHost(ec2Client, Map(
        "Stage" -> Seq(stage),
        "Stack" -> Seq(elasticsearchStack),
        "App"   -> Seq(elasticsearchApp)
      ))

  val imageBucket: String = properties("s3.image.bucket")
  val thumbBucket: String = properties("s3.thumb.bucket")

  val cloudFrontPrivateKeyLocation: String = "/etc/gu/ssl/private/cloudfront.pem"

  val cloudFrontDomainImageBucket: Option[String] = properties.get("cloudfront.domain.imagebucket")
  val cloudFrontDomainThumbBucket: Option[String] = properties.get("cloudfront.domain.thumbbucket")
  val cloudFrontKeyPairId: Option[String]         = properties.get("cloudfront.keypair.id")

  val topicArn: String = properties("sns.topic.arn")


  val mixpanelToken: Option[String] = properties.get("mixpanel.token").filterNot(_.isEmpty)

  val imagesAlias: String = properties("es.index.aliases.read")

  // Note: had to make these lazy to avoid init order problems ;_;

  lazy val rootUri: String = services.apiBaseUri
  lazy val kahunaUri: String = services.kahunaBaseUri
  lazy val cropperUri: String = services.cropperBaseUri
  lazy val loaderUri: String = services.loaderBaseUri
  lazy val metadataUri: String = services.metadataBaseUri
  lazy val imgopsUri: String = services.imgopsBaseUri
  lazy val usageUri: String = services.usageBaseUri
  lazy val leasesUri: String = services.leasesBaseUri
  lazy val authUri: String = services.authBaseUri
  lazy val loginUriTemplate: String = services.loginUriTemplate
  lazy val collectionsUri: String = services.collectionsBaseUri

  val requiredMetadata = List("credit", "description", "usageRights")

  val persistenceIdentifier = properties("persistence.identifier")
  val queriableIdentifiers = Seq(persistenceIdentifier)
  def convertToInt(s: String): Option[Int] = Try { s.toInt }.toOption
}
