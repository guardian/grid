import lib.KinesisReaderConfig
import play.api.{Configuration, Logger}

import scala.util.Try

class UsageConfig(config: Configuration) {
  val composerContentBaseUrl = config.get[String]("composer.baseUrl")
  val capiLiveUrl = config.get[String]("capi.live.url")
  val capiApiKey = config.get[String]("capi.apiKey")
  val usageDateLimit = config.get[String]("usage.dateLimit")
  val usageRecordTable = config.get[String]("dynamo.tablename.usageRecordTable")
  val cloudwatchMetricsNamespace = config.get[String]("cloudwatch.metrics.namespace")
  val snsTopicArn = config.get[String]("sns.topic.arn")
  val thrallKinesisStream = config.get[String]("thrall.kinesis.stream")

  val maxPrintRequestLengthInKb: Int = config.get[Int]("api.setPrint.maxLength")

  val apiOnly: Boolean = Try(config.get[String]("app.name")).toOption match {
    case Some("usage-stream") =>
      Logger.info(s"Starting as Stream Reader Usage.")
      false
    case Some("usage") =>
      Logger.info(s"Starting as API only Usage.")
      true
    case name =>
      Logger.error(s"App name is invalid: $name")
      sys.exit(1)
  }

  val liveKinesisReaderConfig: Try[KinesisReaderConfig] = for {
    liveStream <- Try { config.get[String]("crier.live.name") }
    liveArn <- Try { config.get[String]("crier.live.arn") }
    liveAppName <- Try { config.get[String]("crier.live.appName") }
  } yield KinesisReaderConfig(liveStream, liveArn, liveAppName)

  val previewKinesisReaderConfig: Try[KinesisReaderConfig] = for {
    previewStream <- Try { config.get[String]("crier.preview.name") }
    previewArn <- Try { config.get[String]("crier.preview.arn") }
    previewAppName <- Try { config.get[String]("crier.preview.appName") }
  } yield KinesisReaderConfig(previewStream, previewArn, previewAppName)
}
