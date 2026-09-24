package com.gu.mediaservice.lib.config

import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration

import java.net.URI
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import scala.util.Try

/** What Grid tells Sentry about who was affected by an event. */
case class SentryUserIdentity(id: Option[String] = None, email: Option[String] = None)

/** How much identifying information about the signed-in user is attached to Sentry events. */
sealed abstract class SentryUserMode(val name: String)

object SentryUserMode {

  /** A salted, non-reversible identifier. Distinguishes one user from many without telling Sentry who they are. */
  case object Anonymous extends SentryUserMode("anonymous")

  /**
   * The user's email address. This sends staff personal data to Sentry, which for Grid is a US-region
   * third party. Enabling it is a data-protection decision requiring sign-off, not a routine config change.
   */
  case object Email extends SentryUserMode("email")

  val all: Seq[SentryUserMode] = Seq(Anonymous, Email)

  def parse(value: String): Option[SentryUserMode] = all.find(_.name == value.trim.toLowerCase)
}

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
  replayOnErrorSampleRate: Double,
  consoleCaptureLevels: Seq[String],
  userMode: SentryUserMode,
  userSalt: Option[String]
) {
  val enabled: Boolean = dsn.isDefined

  /** Origin of the ingest endpoint, so kahuna's CSP `connect-src` documents its own dependency. */
  val ingestOrigin: Option[String] = dsn.flatMap(SentryConfig.originOf)

  val tracingEnabled: Boolean = enabled && tracesSampleRate > 0

  /**
   * An unsalted hash of an email is trivially reversible for a known domain, so without a salt we
   * send no user identifier at all rather than a misleadingly "anonymous" one.
   */
  val canIdentifyUserAnonymously: Boolean = userSalt.exists(_.nonEmpty)

  /**
   * Describes who an event affected, without sending more than the configured mode allows.
   *
   * @param identity        the principal's identity - an email for a person, a service name for a machine
   * @param isPersonalData  false for machine and inner-service callers, whose identity is not personal data
   */
  def userIdentity(identity: String, isPersonalData: Boolean): Option[SentryUserIdentity] = {
    if (!enabled || identity.isEmpty) None
    else if (!isPersonalData) Some(SentryUserIdentity(id = Some(identity)))
    else userMode match {
      case SentryUserMode.Email => Some(SentryUserIdentity(email = Some(identity)))
      case SentryUserMode.Anonymous =>
        userSalt.filter(_.nonEmpty).map(salt => SentryUserIdentity(id = Some(SentryConfig.anonymise(salt, identity))))
    }
  }
}

object SentryConfig extends StrictLogging {

  private val DefaultConsoleCaptureLevels = Seq("error")

  def apply(configuration: Configuration, stage: String, isDev: Boolean): SentryConfig = {
    val configuredDsn = configuration.getOptional[String]("sentry.dsn").map(_.trim).filter(_.nonEmpty)

    // A developer with a DSN in ~/.grid must opt in explicitly, so local work never reaches the shared project.
    val localOptIn = configuration.getOptional[Boolean]("sentry.localOptIn").getOrElse(false)
    val permittedInThisEnvironment = !isDev || localOptIn

    val dsn = configuredDsn.filter(_ => permittedInThisEnvironment).flatMap { configured =>
      // Reporting is observability, not business function: an unusable DSN disables it rather than
      // failing startup. Never log the value itself.
      if (originOf(configured).isDefined) Some(configured)
      else {
        logger.error("sentry.dsn could not be parsed as a URI - Sentry reporting is disabled")
        None
      }
    }

    val userMode = configuration.getOptional[String]("sentry.user.mode")
      .map { configured =>
        SentryUserMode.parse(configured).getOrElse(
          sys.error(s"Invalid sentry.user.mode '$configured'. Valid values: ${SentryUserMode.all.map(_.name).mkString(", ")}")
        )
      }
      .getOrElse(SentryUserMode.Anonymous)

    val userSalt = configuration.getOptional[String]("sentry.user.salt").map(_.trim).filter(_.nonEmpty)

    if (userMode == SentryUserMode.Anonymous && dsn.isDefined && userSalt.isEmpty) {
      logger.warn("sentry.user.salt is not set - Sentry events will carry no user identifier")
    }

    val config = SentryConfig(
      dsn = dsn,
      environment = stage,
      tracesSampleRate = sampleRate(configuration, "sentry.tracesSampleRate"),
      replayOnErrorSampleRate = sampleRate(configuration, "sentry.replay.onErrorSampleRate"),
      consoleCaptureLevels = consoleCaptureLevels(configuration),
      userMode = userMode,
      userSalt = userSalt
    )

    if (config.enabled) {
      logger.info(
        s"Sentry reporting enabled for environment=${config.environment} " +
          s"tracesSampleRate=${config.tracesSampleRate} userMode=${config.userMode.name}"
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
    if (value < 0d || value > 1d) sys.error(s"Invalid $key: $value. Must be between 0 and 1 inclusive.")
    value
  }

  private def consoleCaptureLevels(configuration: Configuration): Seq[String] =
    configuration.getOptional[Seq[String]]("sentry.console.levels")
      .map(_.map(_.trim.toLowerCase).filter(_.nonEmpty))
      .getOrElse(DefaultConsoleCaptureLevels)

  private[config] def originOf(dsn: String): Option[String] = Try {
    val uri = new URI(dsn)
    val port = if (uri.getPort == -1) "" else s":${uri.getPort}"
    (Option(uri.getScheme), Option(uri.getHost)) match {
      case (Some(scheme), Some(host)) => Some(s"$scheme://$host$port")
      case _ => None
    }
  }.toOption.flatten

  /**
   * HMAC rather than a plain digest: staff emails are drawn from a small, enumerable space, so an
   * unsalted hash of one is reversible by brute force and would not be anonymous at all.
   */
  private[config] def anonymise(salt: String, identity: String): String = {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(new SecretKeySpec(salt.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
    mac.doFinal(identity.getBytes(StandardCharsets.UTF_8)).take(8).map(b => f"$b%02x").mkString
  }
}
