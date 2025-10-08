package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.logging.GridLogging
import org.apache.pekko.event.LoggingAdapter
import org.apache.pekko.http.{DefaultParsingErrorHandler, ParsingErrorHandler}
import org.apache.pekko.http.scaladsl.model.{ErrorInfo, HttpResponse, StatusCode, StatusCodes}
import org.apache.pekko.http.scaladsl.settings.ServerSettings

import scala.annotation.unused

/*
  Coerces responses from Pekko in response to unknown HTTP methods from 501 to 400.
  Technically HTTP spec requires 501s in this case, but this allows external parties
  to spam our 5xx alarms with silly requests. We're comfortable treating these as "Bad
  requests" instead.
 */
@unused
object UnknownMethodParsingErrorHandler extends ParsingErrorHandler with GridLogging {
  override def handle(
    status: StatusCode,
    error: ErrorInfo,
    log: LoggingAdapter,
    settings: ServerSettings
  ): HttpResponse = {
    if (status == StatusCodes.NotImplemented && error.summary == "Unsupported HTTP method") {
      logger.warn(s"Client attempted to use unknown HTTP method '${error.detail}'. Returning 400 instead of 501.")
      HttpResponse(StatusCodes.BadRequest)
    } else {
      DefaultParsingErrorHandler.handle(status, error, log, settings)
    }
  }
}
