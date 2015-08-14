package lib

import java.io.File

import ch.qos.logback.classic.{Logger => LogbackLogger, LoggerContext}
import ch.qos.logback.core.util.Duration
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.{FileAppender, ConsoleAppender}

import net.logstash.logback.encoder.LogstashEncoder
import org.slf4j.{Logger => SLFLogger, LoggerFactory}

import com.gu.mediaservice.lib.config.CommonPlayAppConfig
import com.gu.logstash.appender.kinesis.KinesisAppender

import play.api.Logger
import play.api.{Logger => PlayLogger, LoggerLike}
import play.api.libs.json._

object LogConfig {

  val rootLogger = LoggerFactory.getLogger(SLFLogger.ROOT_LOGGER_NAME).asInstanceOf[LogbackLogger]
  lazy val loggingContext = LoggerFactory.getILoggerFactory.asInstanceOf[LoggerContext]

  def asLogBack(l: LoggerLike): Option[LogbackLogger] = l.logger match {
    case l: LogbackLogger => Some(l)
    case _ => None
  }

  def makeCustomFields(config: CommonPlayAppConfig) = Json.toJson(Map(
    "stack" -> config.stackName,
    "stage" -> config.stage.toUpperCase,
    "app"   -> config.string("app.name")
  )).toString()

  def makeEncoder(context: LoggerContext, customFields: String) = {
    val e = new LogstashEncoder()
    e.setContext(context)
    e.setCustomFields(customFields)
    e.start()
    e
  }

  def makeKinesisAppender(context: LoggerContext, encoder: LogstashEncoder) = {
    val a = new KinesisAppender()
    a.setContext(context)
    a.setEncoder(encoder)
    // TODO: Properly configure appender from properties!
    a.start()
    a
  }

  def init(config: CommonPlayAppConfig) = {
    if(config.stage != "DEV") {
      PlayLogger.info("LogConfig initializing")
      asLogBack(PlayLogger).map { lb =>
        lb.info("Configuring Logback")

        val context = lb.getLoggerContext

        val customFields = makeCustomFields(config)
        val encoder = makeEncoder(context, customFields)
        val appender = makeKinesisAppender(context, encoder)

        lb.addAppender(makeKinesisAppender(context))

        lb.info("Configured Logback")
      } getOrElse( Logger.info("not running using logback") )
    } else {
      PlayLogger.info("Logging disabled in DEV")
    }
  }
}
