package com.gu.mediaservice.lib.config

import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration

import java.net.URI
import scala.util.Try

/** What Grid tells Sentry about who was affected by an event. */
case class SentryUserIdentity(id: Option[String] = None, email: Option[String] = None)

/**
 * Resolved Sentry settings shared by every Grid service and passed through to the browser.
 *
 * Built by [[SentryConfig.apply]], which is the only place enablement and validation are decided.
 * The release identifier is deliberately absent: it comes from the build (`BuildInfo.gitCommitId`),
 * not from configuration, and is supplied at each point of use.
 */
case class SentryConfig(
  dsn: Option[String],
  environment: String,
  tracesSampleRate: Double,
  consoleCaptureLevels: Seq[String]
) {
  val enabled: Boolean = dsn.isDefined

  /** Origin of the ingest endpoint, so kahuna's CSP `connect-src` documents its own dependency. */
  val ingestOrigin: Option[String] = dsn.flatMap(SentryConfig.originOf)

  val tracingEnabled: Boolean = enabled && tracesSampleRate > 0

  /**
   * Describes who an event affected. Sentry is approved to receive signed-in users' email addresses.
   *
   * @param identity        the principal's identity - an email for a user, an accessor name for a machine or service
   * @param isPersonalData  true for user principals, false for machine and inner-service principals
   */
  def userIdentity(identity: String, isPersonalData: Boolean): Option[SentryUserIdentity] = {
    if (!enabled || identity.isEmpty) None
    else if (isPersonalData) Some(SentryUserIdentity(email = Some(identity)))
    else Some(SentryUserIdentity(id = Some(identity)))
  }
}

object SentryConfig extends StrictLogging {

  private val DefaultConsoleCaptureLevels = Seq("error")

  def apply(configuration: Configuration, stage: String): SentryConfig = {
    val configuredDsn = configuration.getOptional[String]("sentry.dsn").map(_.trim).filter(_.nonEmpty)

    // A developer with a DSN in ~/.grid must opt in explicitly, so local work never reaches the shared project.
    val localOptIn = configuration.getOptional[Boolean]("sentry.localOptIn").getOrElse(false)
    val dsn = for {
      configured <- configuredDsn
      if stage != "DEV" || localOptIn
      if hasValidOrigin(configured)
    } yield configured

    val config = SentryConfig(
      dsn = dsn,
      environment = stage,
      tracesSampleRate = sampleRate(configuration, "sentry.tracesSampleRate"),
      consoleCaptureLevels = consoleCaptureLevels(configuration)
    )

    if (config.enabled) {
      logger.info(
        s"Sentry reporting enabled for environment=${config.environment} " +
          s"tracesSampleRate=${config.tracesSampleRate}"
      )
    }

    config
  }

  /**
   * Out-of-range rates fail startup: unlike a missing DSN, they are a typo that would otherwise
   * silently change sampling behaviour, and Grid's existing config policy is to fail fast.
   */
  private def sampleRate(configuration: Configuration, key: String): Double = {
    val value = configuration.getOptional[Double](key).getOrElse(0d)
    if (!java.lang.Double.isFinite(value) || value < 0d || value > 1d)
      sys.error(s"Invalid $key: $value. Must be between 0 and 1 inclusive.")
    value
  }

  private def consoleCaptureLevels(configuration: Configuration): Seq[String] =
    configuration.getOptional[Seq[String]]("sentry.console.levels")
      .map(_.map(_.trim.toLowerCase).filter(_.nonEmpty))
      .getOrElse(DefaultConsoleCaptureLevels)

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
