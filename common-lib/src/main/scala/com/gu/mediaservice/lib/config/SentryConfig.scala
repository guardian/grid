package com.gu.mediaservice.lib.config

import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration

import java.net.URI
import scala.util.Try

case class SentryConfig(
  dsn: Option[String],
  environment: String,
  consoleCaptureLevels: Seq[String]
) {
  val enabled: Boolean = dsn.isDefined
  val ingestOrigin: Option[String] = dsn.flatMap(SentryConfig.originOf)
}

object SentryConfig extends StrictLogging {

  def apply(configuration: Configuration, stage: String, isDev: Boolean): SentryConfig = {
    val configuredDsn = configuration.getOptional[String]("sentry.dsn").map(_.trim).filter(_.nonEmpty)
    val localOptIn = configuration.getOptional[Boolean]("sentry.localOptIn").getOrElse(false)
    val dsn = configuredDsn.filter(_ => !isDev || localOptIn).flatMap { configured =>
      if (originOf(configured).isDefined) Some(configured)
      else {
        logger.error("sentry.dsn could not be parsed as a URI - Sentry reporting is disabled")
        None
      }
    }

    SentryConfig(
      dsn = dsn,
      environment = stage,
      consoleCaptureLevels = configuration.getOptional[Seq[String]]("sentry.console.levels")
        .map(_.map(_.trim.toLowerCase).filter(_.nonEmpty))
        .getOrElse(Seq("error"))
    )
  }

  private[config] def originOf(dsn: String): Option[String] = Try {
    val uri = new URI(dsn)
    val port = if (uri.getPort == -1) "" else s":${uri.getPort}"
    (Option(uri.getScheme), Option(uri.getHost)) match {
      case (Some(scheme), Some(host)) => Some(s"$scheme://$host$port")
      case _ => None
    }
  }.toOption.flatten
}
