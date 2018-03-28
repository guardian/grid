package lib

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.regions.{RegionUtils, Region}
import com.amazonaws.services.identitymanagement._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{AWSCredentialsProviderChain, BasicAWSCredentials, AWSCredentials}
import com.amazonaws.regions.Regions

import scala.util.Try

import play.api.Logger


case class KinesisReaderConfig(streamName: String, arn: String, appName: String)

object Config extends CommonPlayAppProperties with CommonPlayAppConfig {

  val appName = "usage"
  lazy val appTag = Try { properties("app.name") }

  val properties = Properties.fromPath("/etc/gu/usage.properties")

  val keyStoreBucket = properties("auth.keystore.bucket")

  lazy val rootUri = services.metadataBaseUri
  lazy val kahunaUri = services.kahunaBaseUri
  lazy val usageUri = services.usageBaseUri
  lazy val apiUri = services.apiBaseUri
  lazy val loginUriTemplate = services.loginUriTemplate

  val defaultPageSize = 100
  val defaultMaxRetries = 6
  val defaultMaxPrintRequestSizeInKb = 500
  val defaultDateLimit = "2016-01-01T00:00:00+00:00"

  val maxPrintRequestLengthInKb = Try(properties("api.setPrint.maxLength").toInt)
    .getOrElse[Int](defaultMaxPrintRequestSizeInKb)

  val capiLiveUrl = properties("capi.live.url")
  val capiApiKey = properties("capi.apiKey")
  val capiPageSize = Try(properties("capi.page.size").toInt).getOrElse[Int](defaultPageSize)
  val capiMaxRetries = Try(properties("capi.maxRetries").toInt).getOrElse[Int](defaultMaxRetries)

  val usageDateLimit = Try(properties("usage.dateLimit")).getOrElse(defaultDateLimit)

  val topicArn = properties("sns.topic.arn")

  private val composerDomain = properties("composer.domain")
  val composerContentBaseUrl: String = s"https://$composerDomain/content"

  val usageRecordTable = properties("dynamo.tablename.usageRecordTable")

  val dynamoRegion: Region = RegionUtils.getRegion(properties("aws.region"))
  val awsRegionName = properties("aws.region")

  val crierLiveKinesisStream = Try { properties("crier.live.name") }
  val crierPreviewKinesisStream = Try {properties("crier.preview.name") }

  val crierLiveArn = Try { properties("crier.live.arn") }
  val crierPreviewArn = Try { properties("crier.preview.arn") }

  lazy val liveKinesisReaderConfig: Try[KinesisReaderConfig] = for {
    liveStream <- crierLiveKinesisStream
    liveArn <- crierLiveArn
  } yield KinesisReaderConfig(liveStream, liveArn, liveAppName)

  lazy val previewKinesisReaderConfig: Try[KinesisReaderConfig] = for {
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
    try {
      iamClient.getUser().getUser().getUserName()
    } catch {
      case e:com.amazonaws.AmazonServiceException=>
        Logger.warn("Unable to determine current IAM user, probably because you're using temp credentials.  Usage may not be able to determine the live/preview app names")
        "tempcredentials"
    }
  } else {
    stage
  }

  val liveAppName = s"media-service-livex-${postfix}"
  val previewAppName = s"media-service-previewx-${postfix}"

  val appTagBasedConfig: Map[String, Boolean] = appTag.getOrElse("usage") match {
    case "usage-stream" => {
      Logger.info(s"Starting as Stream Reader Usage.")
      Map("apiOnly" -> false)
    }
    case _ => {
      Logger.info(s"Starting as API only Usage.")
      Map("apiOnly" -> true)
    }
  }
}
