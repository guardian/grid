package lib

import com.gu.mediaservice.lib.logging.GridLogging

import play.api.http.{DefaultHttpErrorHandler, HttpErrorConfig}
import play.api.mvc._
import play.api.mvc.Results._
import play.api.routing.Router
import play.core.SourceMapper

import scala.concurrent._

class CustomHttpErrorHandler (
  config: HttpErrorConfig = HttpErrorConfig(),
  sourceMapper: Option[SourceMapper] = None,
  router: => Option[Router] = None
) extends DefaultHttpErrorHandler(config, sourceMapper, router) with GridLogging {

  override def onClientError(request: RequestHeader, statusCode: Int, message: String): Future[Result] = {
    if (statusCode >= 400 && statusCode < 500) {
      logger.error(s"[Client error]: $statusCode - ${request.method} ${request.uri} $message")
      Future.successful(Status(statusCode)("A client error occurred: " + message))
    } else {
      throw new IllegalArgumentException(
        s"onClientError invoked with non client error status code $statusCode: $message"
      )
    }
  }
}
