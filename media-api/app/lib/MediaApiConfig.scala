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

class MediaApiConfig extends CommonConfig {

  final override lazy val appName = "media-api"

  lazy val keyStoreBucket: String = properties("auth.keystore.bucket")

  lazy val configBucket: String = properties("s3.config.bucket")
  lazy val usageMailBucket: String = properties("s3.usagemail.bucket")

  lazy val quotaStoreKey: String = properties("quota.store.key")
  lazy val quotaStoreConfig: StoreConfig = StoreConfig(configBucket, quotaStoreKey)

  // quota updates can only be turned off in DEV
  lazy val quotaUpdateEnabled: Boolean = if (isDev) properties.getOrElse("quota.update.enabled", "false").toBoolean else true

  private lazy val ec2Client: AmazonEC2 = withAWSCredentials(AmazonEC2ClientBuilder.standard()).build()

  val elasticsearchHost: String =
    if (isDev)
      properties.getOrElse("es.host", "localhost")
    else
      findElasticsearchHost(ec2Client, Map(
        "Stage" -> Seq(stage),
        "Stack" -> Seq(elasticsearchStack),
        "App"   -> Seq(elasticsearchApp)
      ))

  lazy val imageBucket: String = properties("s3.image.bucket")
  lazy val thumbBucket: String = properties("s3.thumb.bucket")

  lazy val cloudFrontPrivateKeyLocation: String = "/etc/gu/ssl/private/cloudfront.pem"

  lazy val cloudFrontDomainImageBucket: Option[String] = properties.get("cloudfront.domain.imagebucket")
  lazy val cloudFrontDomainThumbBucket: Option[String] = properties.get("cloudfront.domain.thumbbucket")
  lazy val cloudFrontKeyPairId: Option[String]         = properties.get("cloudfront.keypair.id")

  lazy val topicArn: String = properties("sns.topic.arn")

  lazy val imagesAlias: String = properties("es.index.aliases.read")

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

  lazy val requiredMetadata = List("credit", "description", "usageRights")

  lazy val persistenceIdentifier = properties("persistence.identifier")
  lazy val queriableIdentifiers = Seq(persistenceIdentifier)

  lazy val persistedRootCollections: List[String] = properties.get("persistence.collections") match {
    case Some(collections) => collections.split(',').toList
    case None => List("GNM Archive")
  }

  def convertToInt(s: String): Option[Int] = Try { s.toInt }.toOption
}
