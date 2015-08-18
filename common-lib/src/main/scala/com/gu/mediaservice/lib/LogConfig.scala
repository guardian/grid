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

import play.api.Logger
import play.api.{Logger => PlayLogger, LoggerLike}
import play.api.libs.json._

import scalaz.syntax.id._


object LogConfig {

  case class KinesisAppenderConfig(stream: String, region: String, roleArn: String)

  def asLogBack(l: LoggerLike): Option[LogbackLogger] = l.logger match {
    case l: LogbackLogger => Some(l)
    case _ => None
  }

  def makeCustomFields(config: CommonPlayAppConfig) = Json.toJson(Map(
    "stack" -> config.stackName,
    "stage" -> config.stage.toUpperCase,
    "app"   -> config.appName
  )).toString()

  def makeLayout(customFields: String) = (new LogstashLayout()) <| (_.setCustomFields(customFields))

  def makeKinesisAppender(layout: LogstashLayout, context: LoggerContext, appenderConfig: KinesisAppenderConfig) = (new KinesisAppender()) <| { a =>
    a.setLayout(layout)
    a.setContext(context)

    a.setStreamName(appenderConfig.stream)
    a.setRegion(appenderConfig.region)
    a.setRoleToAssumeArn(appenderConfig.roleArn)

    a.start()
  }

  def init(config: CommonPlayAppConfig) = config.stage match {
    case "DEV" =>  PlayLogger.info("Logging disabled in DEV")
    case _  => {
      PlayLogger.info("LogConfig initializing")
      asLogBack(PlayLogger).map { lb =>
        lb.info("Configuring Logback")

        val customFields = makeCustomFields(config)
        val context      = lb.getLoggerContext
        val layout       = makeLayout(customFields)

        val appender     = makeKinesisAppender(layout, context,
          KinesisAppenderConfig(
            config.properties("logger.kinesis.stream"),
            config.properties("logger.kinesis.region"),
            config.properties("logger.kinesis.roleArn")
          )
        )

        lb.addAppender(appender)

        lb.info("Configured Logback")
      } getOrElse( Logger.info("not running using logback") )
    }
  }
}
