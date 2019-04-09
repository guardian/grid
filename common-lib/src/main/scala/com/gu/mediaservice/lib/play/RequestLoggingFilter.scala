package com.gu.mediaservice.lib.play

import akka.stream.Materializer
import com.gu.mediaservice.lib.auth.Authentication
import net.logstash.logback.marker.Markers.appendEntries
import play.api.mvc.{Filter, RequestHeader, Result}
import play.api.{Logger, MarkerContext}

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

class RequestLoggingFilter(override val mat: Materializer)(implicit ec: ExecutionContext) extends Filter {

  private val logger = Logger("request")

  override def apply(next: (RequestHeader) => Future[Result])(rh: RequestHeader): Future[Result] = {
    val start = System.currentTimeMillis()
    val result = next(rh)

    result onComplete {
      case Success(response) =>
        val duration = System.currentTimeMillis() - start
        logSuccess(rh, response, duration)

      case Failure(err) =>
        val duration = System.currentTimeMillis() - start
        logFailure(rh, err, duration)
    }

    result
  }

  private def logSuccess(request: RequestHeader, response: Result, duration: Long): Unit = {
    val originIp = request.headers.get("X-Forwarded-For").getOrElse(request.remoteAddress)
    val referer = request.headers.get("Referer").getOrElse("")
    val originalService = request.headers.get(Authentication.originalServiceHeaderName)
    val length = response.header.headers.getOrElse("Content-Length", 0)

    val mandatoryMarkers = Map(
      "origin" -> originIp,
      "referrer" -> referer,
      "method" -> request.method,
      "status" -> response.header.status,
      "duration" -> duration
    )

    val optionalMarkers = originalService
      .map { s => Map(Authentication.originalServiceHeaderName -> s ) }
      .getOrElse(Map.empty)

    val markers = MarkerContext(appendEntries((mandatoryMarkers ++ optionalMarkers).asJava))
    logger.info(s"""$originIp - "${request.method} ${request.uri} ${request.version}" ${response.header.status} $length "$referer" ${duration}ms""")(markers)
  }

  private def logFailure(request: RequestHeader, throwable: Throwable, duration: Long): Unit = {
    val originIp = request.headers.get("X-Forwarded-For").getOrElse(request.remoteAddress)
    val referer = request.headers.get("Referer").getOrElse("")
    val originalService = request.headers.get(Authentication.originalServiceHeaderName)

    val mandatoryMarkers = Map(
      "origin" -> originIp,
      "referrer" -> referer,
      "method" -> request.method,
      "duration" -> duration
    )

    val optionalMarkers = originalService
      .map { s => Map(Authentication.originalServiceHeaderName -> s ) }
      .getOrElse(Map.empty)

    val markers = MarkerContext(appendEntries((mandatoryMarkers ++ optionalMarkers).asJava))
    logger.info(s"""$originIp - "${request.method} ${request.uri} ${request.version}" ERROR "$referer" ${duration}ms""")(markers)
    logger.error(s"Error for ${request.method} ${request.uri}", throwable)
  }
}
