package lib

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.regions.{RegionUtils, Region}
import com.amazonaws.services.identitymanagement._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{AWSCredentialsProviderChain, BasicAWSCredentials, AWSCredentials}
import com.amazonaws.regions.Regions

import scala.util.Try

case class KinesisReaderConfig(streamName: String, arn: String, appName: String)

object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "usage"

  val properties = Properties.fromPath("/etc/gu/usage.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStoreBucket = properties("auth.keystore.bucket")

  lazy val rootUri = services.metadataBaseUri
  lazy val kahunaUri = services.kahunaBaseUri
  lazy val usageUri = services.usageBaseUri
  lazy val apiUri = services.apiBaseUri
  lazy val loginUriTemplate = services.loginUriTemplate

  val defaultPageSize = 100
  val defaultMaxRetries = 6
  val defaultMaxPrintRequestSizeInKb = 500

  val maxPrintRequestLengthInKb = Try(properties("api.setPrint.maxLength").toInt)
    .getOrElse[Int](defaultMaxPrintRequestSizeInKb)

  val capiLiveUrl = properties("capi.live.url")
  val capiApiKey = properties("capi.apiKey")
  val capiPreviewUrl = properties("capi.preview.url")
  val capiPreviewUser = properties("capi.preview.user")
  val capiPreviewPassword = properties("capi.preview.password")
  val capiPageSize = Try(properties("capi.page.size").toInt).getOrElse[Int](defaultPageSize)
  val capiMaxRetries = Try(properties("capi.maxRetries").toInt).getOrElse[Int](defaultMaxRetries)

  val topicArn = properties("sns.topic.arn")
  val composerBaseUrl = properties("composer.baseUrl")

  val usageRecordTable = properties("dynamo.tablename.usageRecordTable")

  val dynamoRegion: Region = RegionUtils.getRegion(properties("aws.region"))
  val awsRegionName = properties("aws.region")

  val corsAllAllowedOrigins = List(services.kahunaBaseUri)

  val crierLiveKinesisStream = Try { properties("crier.live.name") }
  val crierPreviewKinesisStream = Try {properties("crier.preview.name") }

  val crierLiveArn = Try { properties("crier.live.arn") }
  val crierPreviewArn = Try { properties("crier.preview.arn") }

  val liveAppName = s"media-service-livex-${stage}"
  val previewAppName = s"media-service-previewx-${stage}"

  val liveKinesisReaderConfig: Try[KinesisReaderConfig] = for {
    liveStream <- crierLiveKinesisStream
    liveArn <- crierLiveArn
  } yield KinesisReaderConfig(liveStream, liveArn, liveAppName)

  val previewKinesisReaderConfig: Try[KinesisReaderConfig] = for {
    previewStream <- crierPreviewKinesisStream
    previewArn <- crierPreviewArn
  } yield KinesisReaderConfig(previewStream, previewArn, previewAppName)

  val credentialsProvider = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service")
  )

  private val iamClient: AmazonIdentityManagement =
    new AmazonIdentityManagementClient(credentialsProvider)
      .withRegion(Regions.EU_WEST_1)

  val postfix = if (stage == "DEV") {

    iamClient.getUser().getUser().getUserName()

  } else {
    stage
  }

}
