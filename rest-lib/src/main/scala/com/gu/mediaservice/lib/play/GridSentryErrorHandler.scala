package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.SentryConfig
import com.typesafe.scalalogging.StrictLogging
import io.sentry.{Hint, Sentry, SentryEvent, SentryLevel}
import io.sentry.protocol.{Request => SentryRequest}
import play.api.http.DefaultHttpErrorHandler
import play.api.mvc.{RequestHeader, Result}
import play.api.routing.Router
import play.api.{Configuration, Environment}
import play.core.SourceMapper

import scala.concurrent.Future
import scala.jdk.CollectionConverters._
import scala.util.control.NonFatal

/**
 * Reports uncaught server exceptions to Sentry, then defers entirely to Play's normal behaviour.
 *
 * Capture is best effort: a Sentry outage, a malformed event or a failure to enrich must never
 * change the response the caller receives.
 */
class GridSentryErrorHandler(
  environment: Environment,
  configuration: Configuration,
  sourceMapper: Option[SourceMapper],
  router: => Option[Router],
  sentryConfig: SentryConfig
) extends DefaultHttpErrorHandler(environment, configuration, sourceMapper, router) with StrictLogging {

  override def onServerError(request: RequestHeader, exception: Throwable): Future[Result] = {
    capture(request, exception)
    super.onServerError(request, exception)
  }

  private def capture(request: RequestHeader, exception: Throwable): Unit =
    if (sentryConfig.enabled) {
      try {
        val event = new SentryEvent(exception)
        event.setLevel(SentryLevel.ERROR)
        event.setRequest(requestMetadata(request))

        RequestLoggingFilter.requestIdFor(request).foreach(event.setTag("request_id", _))

        // Links the error to its request transaction where tracing is on. Read from the request
        // attribute rather than Sentry's scope, which is not reliable across async boundaries.
        SentryTracingFilter.transactionFor(request).foreach { transaction =>
          event.getContexts.setTrace(transaction.getSpanContext)
        }

        Sentry.captureEvent(event, new Hint())
      } catch {
        case NonFatal(e) => logger.warn("Failed to report an error to Sentry", e)
      }
    }

  /**
   * Deliberately narrow. Headers, cookies and bodies are not attached: they routinely carry
   * authorisation tokens and image metadata, and Sentry is a third-party processor.
   */
  private def requestMetadata(request: RequestHeader): SentryRequest = {
    val metadata = new SentryRequest()
    metadata.setMethod(request.method)

    // The route pattern, not the concrete path, so ids do not fragment grouping.
    val route = request.attrs.get(Router.Attrs.HandlerDef).map(_.path).getOrElse(request.path)
    metadata.setUrl(s"${request.host}$route")

    metadata.setHeaders(Map(
      "User-Agent" -> request.headers.get("User-Agent").getOrElse("")
    ).filter { case (_, value) => value.nonEmpty }.asJava)

    metadata
  }
}
