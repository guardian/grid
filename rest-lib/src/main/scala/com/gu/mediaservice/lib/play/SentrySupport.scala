package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.CommonConfig
import io.sentry.{Sentry, SentryOptions}
import play.api.mvc.{RequestHeader, Result}

import scala.concurrent.Future

object SentrySupport {
  private def isEnabled(config: CommonConfig): Boolean =
    config.sentryEnabled && config.sentryDsn.nonEmpty

  def init(config: CommonConfig): Unit = {
    for {
      dsn <- config.sentryDsn if config.sentryEnabled
    } Sentry.init((options: SentryOptions) => {
      options.setDsn(dsn)
      options.setEnvironment(config.sentryEnvironment)
      options.setServerName(config.appName)
      options.setRelease(sys.env.getOrElse("SENTRY_RELEASE", sys.env.getOrElse("BUILD_VCS_NUMBER", "unknown")))
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
        if (request.rawQueryString.nonEmpty) {
          scope.setExtra("queryString", request.rawQueryString)
        }

        Sentry.captureException(exception)
      }
    }
  }
}

class SentryHttpErrorHandler(delegate: play.api.http.HttpErrorHandler, config: CommonConfig)
  extends play.api.http.HttpErrorHandler {

  override def onClientError(request: RequestHeader, statusCode: Int, message: String): Future[Result] =
    delegate.onClientError(request, statusCode, message)

  override def onServerError(request: RequestHeader, exception: Throwable): Future[Result] = {
    SentrySupport.captureException(config, request, exception)
    delegate.onServerError(request, exception)
  }
}
