package com.gu.mediaservice.lib.logging

import java.net.InetSocketAddress

import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.classic.{LoggerContext, Logger => LogbackLogger}
import net.logstash.logback.appender.LogstashTcpSocketAppender
import com.amazonaws.util.EC2MetadataUtils
import com.gu.logback.appender.kinesis.KinesisAppender
import com.gu.mediaservice.lib.config.CommonConfig
import net.logstash.logback.encoder.LogstashEncoder
import net.logstash.logback.layout.LogstashLayout
import org.slf4j.{LoggerFactory, Logger => SLFLogger}
import play.api.ApplicationLoader.Context
import play.api.LoggerConfigurator
import play.api.libs.json._

import scala.util.Try


object LogConfig {

  val rootLogger: LogbackLogger = LoggerFactory.getLogger(SLFLogger.ROOT_LOGGER_NAME).asInstanceOf[LogbackLogger]

  private val BUFFER_SIZE = 1000

  case class KinesisAppenderConfig(stream: String, region: String, roleArn: String, bufferSize: Int)

  private def makeCustomFields(config: CommonConfig): String = {
    val instanceId = Option(EC2MetadataUtils.getInstanceId).getOrElse("unknown")

    Json.toJson(Map(
      "stack" -> config.stackName,
      "stage" -> config.stage.toUpperCase,
      "app"   -> config.appName,
      "sessionId" -> config.sessionId,
      "instanceId" -> instanceId
    )).toString()
  }

  private def makeLayout(customFields: String): LogstashLayout = {
    val layout = new LogstashLayout()
    layout.setCustomFields(customFields)
    layout
  }

  private def makeKinesisAppender(layout: LogstashLayout, context: LoggerContext, appenderConfig: KinesisAppenderConfig): KinesisAppender[ILoggingEvent] = {
    val appender = new KinesisAppender[ILoggingEvent]()

    appender.setStreamName(appenderConfig.stream)
    appender.setRegion(appenderConfig.region)
    appender.setRoleToAssumeArn(appenderConfig.roleArn)
    appender.setBufferSize(appenderConfig.bufferSize)

    appender.setContext(context)
    appender.setLayout(layout)

    layout.start()
    appender.start()

    appender
  }


  private def makeLogstashAppender(config: CommonConfig, context: LoggerContext): LogstashTcpSocketAppender = {
    val customFields = makeCustomFields(config)

    val appender = new LogstashTcpSocketAppender()
    appender.setContext(context)
    appender.addDestinations(new InetSocketAddress("localhost", 5000))
    appender.setWriteBufferSize(BUFFER_SIZE)

    val encoder = new LogstashEncoder()
    encoder.setCustomFields(customFields)
    encoder.start()

    appender.setEncoder(encoder)

    appender.start()

    appender
  }

  def initLocalLogShipping(config: CommonConfig): Unit = {
    if(config.isDev && config.localLogShipping) {
      Try {
        rootLogger.info("Configuring local logstash log shipping")
        val appender = makeLogstashAppender(config, rootLogger.getLoggerContext)
        rootLogger.addAppender(appender)
        rootLogger.info("Local logstash log shipping configured")
      } recover {
        case e => rootLogger.error("LogConfig Failed!", e)
      }
    }
  }

  def initKinesisLogging(config: CommonConfig): Unit = {

    val kinesisLoggingEnabled = config.booleanOpt("logger.kinesis.enabled").getOrElse(true)

    if (config.isDev || !kinesisLoggingEnabled) {
      rootLogger.info("Kinesis logging is disabled by config")
    } else {
      Try {
        rootLogger.info("LogConfig initializing")
        rootLogger.info("Configuring Logback")

        val customFields = makeCustomFields(config)
        val context      = rootLogger.getLoggerContext
        val layout       = makeLayout(customFields)

        val appender     = makeKinesisAppender(layout, context,
          KinesisAppenderConfig(
            config.string("logger.kinesis.stream"),
            config.string("logger.kinesis.region"),
            config.string("logger.kinesis.roleArn"),
            BUFFER_SIZE
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
