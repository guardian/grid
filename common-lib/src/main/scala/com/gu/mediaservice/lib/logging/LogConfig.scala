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
import scalaz.syntax.id._

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

  private def makeLayout(customFields: String) = new LogstashLayout() <| (_.setCustomFields(customFields))

  private def makeKinesisAppender(layout: LogstashLayout, context: LoggerContext, appenderConfig: KinesisAppenderConfig) =
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

  private def makeLogstashAppender(config: CommonConfig, context: LoggerContext): LogstashTcpSocketAppender = {
    val customFields = makeCustomFields(config)

    new LogstashTcpSocketAppender() <| { appender =>
      appender.setContext(context)
      appender.addDestinations(new InetSocketAddress("localhost", 5000))
      appender.setWriteBufferSize(BUFFER_SIZE)

      appender.setEncoder(new LogstashEncoder() <| { encoder =>
        encoder.setCustomFields(customFields)
        encoder.start()
      })

      appender.start()
    }
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
    if (config.isDev) {
      rootLogger.info("Kinesis logging disabled in DEV")
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
