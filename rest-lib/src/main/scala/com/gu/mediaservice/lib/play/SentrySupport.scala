package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.CommonConfig
import io.sentry.{Sentry, SentryOptions}
import play.api.http.DefaultHttpErrorHandler
import play.api.mvc.{RequestHeader, Result}
import play.api.routing.Router
import play.api.{Configuration, Environment}
import play.core.SourceMapper

import scala.concurrent.Future

object SentrySupport {
  private def isEnabled(config: CommonConfig): Boolean =
    config.sentryEnabled && config.sentryDsn.nonEmpty

  def init(config: CommonConfig, release: String): Unit = {
    for {
      dsn <- config.sentryDsn if config.sentryEnabled
    } Sentry.init((options: SentryOptions) => {
      options.setDsn(dsn)
      options.setEnvironment(config.sentryEnvironment)
      options.setServerName(config.appName)
      options.setRelease(release)
      options.setTag("app", config.appName)
      options.setTag("stage", config.stage)
    })
  }

  def shutdown(config: CommonConfig): Future[Unit] = Future.successful {
    if (isEnabled(config)) {
      Sentry.close()
    }
  }

  def captureException(config: CommonConfig, request: RequestHeader, exception: Throwable): Unit = {
    if (isEnabled(config)) {
      Sentry.withScope { scope =>
        scope.setTag("method", request.method)
        scope.setTag("path", request.path)
        request.attrs.get(RequestLoggingFilter.requestUuidKey).foreach(scope.setTag("requestId", _))
        // Deliberately NOT attaching the raw query string. Grid query strings can contain
        // search terms and, occasionally, sensitive tokens, so sending them to Sentry risks
        // leaking PII. `path` + `requestId` are enough to correlate an event with the request
        // logs (which already record the query string) without that risk.
        Sentry.captureException(exception)
      }
    }
  }
}

class SentryHttpErrorHandler(
  environment: Environment,
  configuration: Configuration,
  sourceMapper: Option[SourceMapper],
  router: => Option[Router],
  config: CommonConfig
) extends DefaultHttpErrorHandler(environment, configuration, sourceMapper, router) {

  // Client (4xx) errors are handled by the default implementation. We only intercept
  // server (5xx) errors to report them to Sentry, then defer to the default rendering.
  override def onServerError(request: RequestHeader, exception: Throwable): Future[Result] = {
    SentrySupport.captureException(config, request, exception)
    super.onServerError(request, exception)
  }
}
