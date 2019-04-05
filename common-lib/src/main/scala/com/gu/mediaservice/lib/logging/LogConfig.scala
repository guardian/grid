package com.gu.mediaservice.lib.logging

import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.classic.{LoggerContext, Logger => LogbackLogger}
import com.gu.logback.appender.kinesis.KinesisAppender
import net.logstash.logback.layout.LogstashLayout
import org.slf4j.{LoggerFactory, Logger => SLFLogger}
import play.api.ApplicationLoader.Context
import play.api.libs.json._
import play.api.{Configuration, LoggerConfigurator}
import scalaz.syntax.id._

case class LogConfig(stream: String, region: String, roleArn: String, stack: String, stage: String, app: String)

object LogConfig {

  val rootLogger: LogbackLogger = LoggerFactory.getLogger(SLFLogger.ROOT_LOGGER_NAME).asInstanceOf[LogbackLogger]

  def makeCustomFields(config: LogConfig): String = {
    Json.toJson(Map(
      "stack" -> config.stack,
      "stage" -> config.stage.toUpperCase,
      "app"   -> config.app
    )).toString()
  }

  def makeLayout(customFields: String) = new LogstashLayout() <| (_.setCustomFields(customFields))

  def makeKinesisAppender(layout: LogstashLayout, context: LoggerContext, appenderConfig: LogConfig) =
    new KinesisAppender[ILoggingEvent]() <| { a =>
      a.setStreamName(appenderConfig.stream)
      a.setRegion(appenderConfig.region)
      a.setRoleToAssumeArn(appenderConfig.roleArn)
      a.setBufferSize(100)

      a.setContext(context)
      a.setLayout(layout)

      layout.start()
      a.start()
  }

  def parseConfig(config: Configuration): Option[LogConfig] = for {
    stream <- config.getOptional[String]("logger.kinesis.stream")
    region <- config.getOptional[String]("logger.kinesis.region")
    roleArn <- config.getOptional[String]("logger.kinesis.roleArn")
    stack <- config.getOptional[String]("logger.kinesis.stack")
    stage <- config.getOptional[String]("logger.kinesis.stage")
    app <- config.getOptional[String]("logger.kinesis.app")
  } yield {
    LogConfig(stream, region, roleArn, stack, stage, app)
  }

  def initKinesisLogging(rawConfig: Configuration): Unit = {
    parseConfig(rawConfig) match {
      case Some(config) =>
        rootLogger.info("Configuring Kinesis logging")

        val customFields = makeCustomFields(config)
        val context      = rootLogger.getLoggerContext
        val layout       = makeLayout(customFields)

        val appender     = makeKinesisAppender(layout, context, config)

        rootLogger.addAppender(appender)
        rootLogger.info("Kinesis logging enabled")

      case None =>
        rootLogger.info("Kinesis logging disabled")
    }
  }

  def initPlayLogging(context: Context): Unit = {
    LoggerConfigurator(context.environment.classLoader).foreach {
      _.configure(context.environment, context.initialConfiguration, Map.empty)
    }
  }
}
