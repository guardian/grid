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

  def apply(configuration: Configuration, stage: String): SentryConfig = {
    val configuredDsn = configuration.getOptional[String]("sentry.dsn").map(_.trim).filter(_.nonEmpty)
    val localOptIn = configuration.getOptional[Boolean]("sentry.localOptIn").getOrElse(false)
    val dsn = for {
      configured <- configuredDsn
      if stage != "DEV" || localOptIn
      if hasValidOrigin(configured)
    } yield configured

    SentryConfig(
      dsn = dsn,
      environment = stage,
      consoleCaptureLevels = configuration.getOptional[Seq[String]]("sentry.console.levels")
        .map(_.map(_.trim.toLowerCase).filter(_.nonEmpty))
        .getOrElse(Seq("error"))
    )
  }

  private def hasValidOrigin(dsn: String): Boolean = {
    val valid = originOf(dsn).isDefined
    if (!valid) logger.error("sentry.dsn could not be parsed as a URI - Sentry reporting is disabled")
    valid
  }

  private[config] def originOf(dsn: String): Option[String] = Try {
    val uri = new URI(dsn)
    val port = if (uri.getPort == -1) "" else s":${uri.getPort}"
    for {
      scheme <- Option(uri.getScheme)
      host <- Option(uri.getHost)
    } yield s"$scheme://$host$port"
  }.toOption.flatten
}
