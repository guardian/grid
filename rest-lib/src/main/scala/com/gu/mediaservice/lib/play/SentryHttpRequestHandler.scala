package com.gu.mediaservice.lib.play

import play.api.http.HttpRequestHandler
import play.api.mvc.{Handler, RequestHeader}

/** Creates shared tracing state before Play retains a request for server-error recovery. */
class SentryHttpRequestHandler(delegate: HttpRequestHandler) extends HttpRequestHandler {
  override def handlerForRequest(request: RequestHeader): (RequestHeader, Handler) =
    delegate.handlerForRequest(SentryTracingFilter.withTransactionContext(request))
}
