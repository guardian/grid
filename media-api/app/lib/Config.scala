package lib

import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import scalaz.syntax.id._
import scala.util.Try

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}

case class UsageStoreConfig(
  storeBucket: String,
  storeKey: String
)

object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val appName = "media-api"

  val properties = Properties.fromPath("/etc/gu/media-api.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val configBucket: String = properties("s3.config.bucket")

  val usageStoreKey: Option[String] = properties.get("usage.store.key")

  val usageStoreConfig: Option[UsageStoreConfig] = for {
    key <- usageStoreKey
  } yield UsageStoreConfig(configBucket, key)

  val ec2Client: AmazonEC2Client =
    new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

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

  private lazy val corsAllowedOrigins = properties.getOrElse("cors.allowed.origins", "").split(",").toList
  lazy val corsAllAllowedOrigins: List[String] =
    services.kahunaBaseUri :: corsAllowedOrigins

  val requiredMetadata = List("credit", "description", "usageRights")

  val persistenceIdentifier = properties("persistence.identifier")
  val queriableIdentifiers = Seq(persistenceIdentifier)
  def convertToInt(s: String): Option[Int] = Try { s.toInt }.toOption

  // Quota Config
  val rexQuotaConfig   = properties.get("usage.quota.rex").flatMap(convertToInt)
  val aapQuotaConfig   = properties.get("usage.quota.aap").flatMap(convertToInt)
  val alamyQuotaConfig = properties.get("usage.quota.alamy").flatMap(convertToInt)
  val gettyQuotaConfig = properties.get("usage.quota.getty").flatMap(convertToInt)

  val quotaConfig = Map[String,Int]() ++
    rexQuotaConfig.map(n => "rex" -> n) ++
    aapQuotaConfig.map(n => "aap" -> n) ++
    alamyQuotaConfig.map(n => "alamy" -> n) ++
    gettyQuotaConfig.map(n => "getty" -> n)
}
