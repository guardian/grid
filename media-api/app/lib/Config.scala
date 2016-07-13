package lib

import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import scalaz.syntax.id._

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}


object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val appName = "media-api"

  val properties = Properties.fromPath("/etc/gu/media-api.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStoreBucket: String = properties("auth.keystore.bucket")

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

  val configBucket: String = properties("s3.config.bucket")

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

  val supplierWeights = Map[String, Double](
    "getty" -> properties
      .get("search.weighting.supplier.getty")
      .map(_.toDouble)
      .getOrElse[Double](0.0)
  )
}
