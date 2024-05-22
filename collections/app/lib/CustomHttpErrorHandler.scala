package lib

import com.gu.mediaservice.lib.logging.GridLogging
import play.api.http.{DefaultHttpErrorHandler, HttpErrorConfig}
import play.api.mvc._
import play.api.routing.Router
import play.core.SourceMapper

import scala.concurrent._

class CustomHttpErrorHandler (
  config: HttpErrorConfig = HttpErrorConfig(),
  sourceMapper: Option[SourceMapper] = None,
  router: => Option[Router] = None
) extends DefaultHttpErrorHandler(config, sourceMapper, router) with GridLogging {

  override def onClientError(request: RequestHeader, statusCode: Int, message: String): Future[Result] = {
    logger.error(s"[CLIENT ERROR] $statusCode - ${request.method} ${request.uri} $message")
    super.onClientError(request, statusCode, message)
  }

  override def onServerError(request: RequestHeader, exception: Throwable): Future[Result] = {
    logger.error(s"[SERVER ERROR] ${request.method} ${request.uri} ${exception.getMessage}")
    super.onServerError(request, exception)
  }
}
