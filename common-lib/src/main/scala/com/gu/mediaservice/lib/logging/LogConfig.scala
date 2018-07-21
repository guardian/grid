package com.gu.mediaservice.lib.logging

import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.classic.{LoggerContext, Logger => LogbackLogger}
import com.gu.logback.appender.kinesis.KinesisAppender
import com.gu.mediaservice.lib.config.CommonConfig
import net.logstash.logback.layout.LogstashLayout
import org.slf4j.{LoggerFactory, Logger => SLFLogger}
import play.api.ApplicationLoader.Context
import play.api.LoggerConfigurator
import play.api.libs.json._
import scalaz.syntax.id._
import scala.util.Try


object LogConfig {

  val rootLogger: LogbackLogger = LoggerFactory.getLogger(SLFLogger.ROOT_LOGGER_NAME).asInstanceOf[LogbackLogger]

  case class KinesisAppenderConfig(stream: String, region: String, roleArn: String, bufferSize: Int)

  def makeCustomFields(config: CommonConfig): String = {
    Json.toJson(Map(
      "stack" -> config.stackName,
      "stage" -> config.stage.toUpperCase,
      "app"   -> config.appName,
      "sessionId" -> config.sessionId
    )).toString()
  }

  def makeLayout(customFields: String) = new LogstashLayout() <| (_.setCustomFields(customFields))

  def makeKinesisAppender(layout: LogstashLayout, context: LoggerContext, appenderConfig: KinesisAppenderConfig) =
    new KinesisAppender[ILoggingEvent]() <| { a =>
      a.setStreamName(appenderConfig.stream)
      a.setRegion(appenderConfig.region)
      a.setRoleToAssumeArn(appenderConfig.roleArn)
      a.setBufferSize(appenderConfig.bufferSize)

      a.setContext(context)
      a.setLayout(layout)

      layout.start()
      a.start()
  }

  def initKinesisLogging(config: CommonConfig): Unit = {
    if (config.isDev) {
      rootLogger.info("Kinesis logging disabled in DEV")
    } else {
      Try {
        rootLogger.info("LogConfig initializing")
        rootLogger.info("Configuring Logback")

        val customFields = makeCustomFields(config)
        val context      = rootLogger.getLoggerContext
        val layout       = makeLayout(customFields)
        val bufferSize   = 1000

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
      } recover {
        case e => rootLogger.error("LogConfig Failed!", e)
      }
    }
  }

  def initPlayLogging(context: Context): Unit = {
    LoggerConfigurator(context.environment.classLoader).foreach {
      _.configure(context.environment, context.initialConfiguration, Map.empty)
    }
  }
}
