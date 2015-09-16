package lib

import java.io.File

import ch.qos.logback.classic.{Logger => LogbackLogger, LoggerContext}
import ch.qos.logback.core.util.Duration
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.{FileAppender, ConsoleAppender}

import net.logstash.logback.layout.LogstashLayout
import org.slf4j.{Logger => SLFLogger, LoggerFactory}

import com.gu.mediaservice.lib.config.CommonPlayAppConfig
import com.gu.logback.appender.kinesis.KinesisAppender

import play.api.{ Logger, LoggerLike }
import play.api.LoggerLike
import play.api.libs.json._

import scalaz.syntax.id._


object LogConfig {

  val rootLogger = LoggerFactory.getLogger(SLFLogger.ROOT_LOGGER_NAME).asInstanceOf[LogbackLogger]

  case class KinesisAppenderConfig(stream: String, region: String, roleArn: String, bufferSize: Int)

  def makeCustomFields(config: CommonPlayAppConfig) = Json.toJson(Map(
    "stack" -> config.stackName,
    "stage" -> config.stage.toUpperCase,
    "app"   -> config.appName
  )).toString()

  def makeLayout(customFields: String) = (new LogstashLayout()) <| (_.setCustomFields(customFields))

  def makeKinesisAppender(layout: LogstashLayout, context: LoggerContext, appenderConfig: KinesisAppenderConfig) = (new KinesisAppender()) <| { a =>
    a.setStreamName(appenderConfig.stream)
    a.setRegion(appenderConfig.region)
    a.setRoleToAssumeArn(appenderConfig.roleArn)
    a.setBufferSize(appenderConfig.bufferSize)

    a.setContext(context)
    a.setLayout(layout)

    layout.start()
    a.start()
  }

  def init(config: CommonPlayAppConfig) = config.stage match {
    case "DEV" =>  rootLogger.info("Logging disabled in DEV")
    case _  => {
      rootLogger.info("LogConfig initializing")
      rootLogger.info("Configuring Logback")

      val customFields = makeCustomFields(config)
      val context      = rootLogger.getLoggerContext
      val layout       = makeLayout(customFields)
      val bufferSize   = 1000;

      val appender     = makeKinesisAppender(layout, context,
        KinesisAppenderConfig(
          config.properties("logger.kinesis.stream"),
          config.properties("logger.kinesis.region"),
          config.properties("logger.kinesis.roleArn"),
          bufferSize
        )
      )

      rootLogger.addAppender(appender)
      rootLogger.info("Configured Logback")
    }
  }
}
