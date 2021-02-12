package lib

import com.amazonaws.regions.{Region, RegionUtils}
import com.amazonaws.services.identitymanagement._
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.net.URI.ensureSecure

import scala.util.Try


case class KinesisReaderConfig(streamName: String, arn: String, appName: String)

class UsageConfig(resources: GridConfigResources) extends CommonConfig(resources.configuration) with GridLogging {
  val rootUri: String = services.metadataBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val usageUri: String = services.usageBaseUri
  val apiUri: String = services.apiBaseUri
  val loginUriTemplate: String = services.loginUriTemplate

  val defaultPageSize = 100
  val defaultMaxRetries = 6
  val defaultMaxPrintRequestSizeInKb = 500
  val defaultDateLimit = "2016-01-01T00:00:00+00:00"

  val maxPrintRequestLengthInKb: Int = intDefault("api.setPrint.maxLength", defaultMaxPrintRequestSizeInKb)

  val capiLiveUrl = string("capi.live.url")
  val capiApiKey = string("capi.apiKey")
  val capiPageSize: Int = intDefault("capi.page.size", defaultPageSize)
  val capiMaxRetries: Int = intDefault("capi.maxRetries", defaultMaxRetries)

  val usageDateLimit: String = stringDefault("usage.dateLimit", defaultDateLimit)

  private val composerBaseUrlProperty: String = string("composer.baseUrl")
  private val composerBaseUrl = ensureSecure(composerBaseUrlProperty)

  val composerContentBaseUrl: String = s"$composerBaseUrl/content"

  val usageRecordTable = string("dynamo.tablename.usageRecordTable")

  val dynamoRegion: Region = RegionUtils.getRegion(string("aws.region"))
  val awsRegionName = string("aws.region")

  val crierLiveKinesisStream = Try { string("crier.live.name") }
  val crierPreviewKinesisStream = Try { string("crier.preview.name") }

  val crierLiveArn = Try { string("crier.live.arn") }
  val crierPreviewArn = Try { string("crier.preview.arn") }

  val liveKinesisReaderConfig: Try[KinesisReaderConfig] = for {
    liveStream <- crierLiveKinesisStream
    liveArn <- crierLiveArn
  } yield KinesisReaderConfig(liveStream, liveArn, liveAppName)

  val previewKinesisReaderConfig: Try[KinesisReaderConfig] = for {
    previewStream <- crierPreviewKinesisStream
    previewArn <- crierPreviewArn
  } yield KinesisReaderConfig(previewStream, previewArn, previewAppName)

  private val iamClient: AmazonIdentityManagement = withAWSCredentials(AmazonIdentityManagementClientBuilder.standard()).build()

  val postfix: String = if (isDev) {
    try {
      iamClient.getUser.getUser.getUserName
    } catch {
      case e:com.amazonaws.SdkClientException =>
        logger.warn("Unable to determine current IAM user, probably because you're using temp credentials.  Usage may not be able to determine the live/preview app names", e)
        "tempcredentials"
    }
  } else {
    stage
  }

  val liveAppName = s"media-service-livex-$postfix"
  val previewAppName = s"media-service-previewx-$postfix"

  val apiOnly: Boolean = stringOpt("app.name") match {
    case Some("usage-stream") =>
      logger.info(s"Starting as Stream Reader Usage.")
      false
    case Some("usage") =>
      logger.info(s"Starting as API only Usage.")
      true
    case name =>
      logger.error(s"App name is invalid: $name")
      sys.exit(1)
  }
}
