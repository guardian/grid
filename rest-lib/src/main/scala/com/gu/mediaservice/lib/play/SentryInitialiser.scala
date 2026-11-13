package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.SentryConfig
import com.typesafe.scalalogging.StrictLogging
import io.sentry.Sentry

import scala.util.control.NonFatal

/**
 * Initialises the Sentry SDK once per application, before any request or error handler can report.
 *
 * All Grid services share a single Sentry project, so every event is tagged with the service name;
 * without that the issue stream cannot be triaged.
 */
object SentryInitialiser extends StrictLogging {

  def init(config: SentryConfig, appName: String, release: String): Unit = config.dsn match {
    case None =>
      logger.info("Sentry reporting is disabled - no DSN configured for this environment")

    case Some(dsn) =>
      try {
        Sentry.init { options =>
          options.setDsn(dsn)
          options.setEnvironment(config.environment)
          options.setRelease(release)
          options.setAttachStacktrace(true)
          options.setTracesSampleRate(config.tracesSampleRate)
          options.setServerName(appName)
          options.setTag("app", appName)
          options.setTag("stage", config.environment)
          // Grid attaches request metadata explicitly; this would add cookies and headers wholesale.
          options.setSendDefaultPii(false)
        }
        logger.info(s"Sentry initialised for $appName at release $release")
      } catch {
        // Reporting is observability, not business function: a failure here must not stop the
        // service starting, but operators need to see that reporting is not working.
        case NonFatal(e) => logger.error(s"Failed to initialise Sentry for $appName - reporting is disabled", e)
      }
  }
}
