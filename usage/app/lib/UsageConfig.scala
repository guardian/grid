package lib

import com.amazonaws.auth.AWSCredentialsProviderChain
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.regions.{Region, RegionUtils, Regions}
import com.amazonaws.services.identitymanagement._
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.{Configuration, Logger}

import scala.util.Try


case class KinesisReaderConfig(streamName: String, arn: String, appName: String)

class UsageConfig(override val configuration: Configuration) extends CommonConfig {

  final override lazy val appName = "usage"
  lazy val appTag = Try { properties("app.name") }

  val keyStoreBucket = properties("auth.keystore.bucket")

  lazy val rootUri: String = services.metadataBaseUri
  lazy val kahunaUri: String = services.kahunaBaseUri
  lazy val usageUri: String = services.usageBaseUri
  lazy val apiUri: String = services.apiBaseUri
  lazy val loginUriTemplate: String = services.loginUriTemplate

  val defaultPageSize = 100
  val defaultMaxRetries = 6
  val defaultMaxPrintRequestSizeInKb = 500
  val defaultDateLimit = "2016-01-01T00:00:00+00:00"

  val maxPrintRequestLengthInKb: Int = Try(properties("api.setPrint.maxLength").toInt).getOrElse[Int](defaultMaxPrintRequestSizeInKb)

  val capiLiveUrl = properties("capi.live.url")
  val capiApiKey = properties("capi.apiKey")
  val capiPageSize: Int = Try(properties("capi.page.size").toInt).getOrElse[Int](defaultPageSize)
  val capiMaxRetries: Int = Try(properties("capi.maxRetries").toInt).getOrElse[Int](defaultMaxRetries)

  val usageDateLimit: String = Try(properties("usage.dateLimit")).getOrElse(defaultDateLimit)

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

  private val iamClient: AmazonIdentityManagement = AmazonIdentityManagementClientBuilder.standard.withCredentials(credentialsProvider).build()

  val postfix: String = if (stage == "DEV") {
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

  val liveAppName = s"media-service-livex-$postfix"
  val previewAppName = s"media-service-previewx-$postfix"

  val appTagBasedConfig: Map[String, Boolean] = appTag.getOrElse("usage") match {
    case "usage-stream" =>
      Logger.info(s"Starting as Stream Reader Usage.")
      Map("apiOnly" -> false)
    case _ =>
      Logger.info(s"Starting as API only Usage.")
      Map("apiOnly" -> true)
  }
}
