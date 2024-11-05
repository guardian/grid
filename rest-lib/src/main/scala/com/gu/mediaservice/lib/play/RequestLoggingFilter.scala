package com.gu.mediaservice.lib.play

import org.apache.pekko.stream.Materializer
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.provider.InnerServiceAuthentication
import net.logstash.logback.marker.Markers.appendEntries
import play.api.mvc.{Filter, RequestHeader, Result, WrappedRequest}
import play.api.{Logger, MarkerContext}

import java.util.UUID
import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

object RequestLoggingFilter {
  private val requestIdHeader = "x-grid-request-id"
  def getRequestId[T](req: WrappedRequest[T]): String =
    req.headers.get(requestIdHeader).getOrElse(UUID.randomUUID().toString)
}
class RequestLoggingFilter(override val mat: Materializer)(implicit ec: ExecutionContext) extends Filter {

  private val logger = Logger("request")

  override def apply(next: (RequestHeader) => Future[Result])(request: RequestHeader): Future[Result] = {
    val start = System.currentTimeMillis()
    val withID = request.withHeaders(request.headers.replace(RequestLoggingFilter.requestIdHeader -> UUID.randomUUID().toString))

    val resultFuture = next(withID)

    resultFuture onComplete {
      case Success(response) =>
        val duration = System.currentTimeMillis() - start
        log(withID, Right(response), duration)

      case Failure(err) =>
        val duration = System.currentTimeMillis() - start
        log(withID, Left(err), duration)
    }

    resultFuture
  }

  private def log(request: RequestHeader, outcome: Either[Throwable, Result], duration: Long): Unit = {
    val originIp = request.headers.get("X-Forwarded-For").getOrElse(request.remoteAddress)
    val referer = request.headers.get("Referer").getOrElse("")

    val mandatoryMarkers = Map(
      "origin" -> originIp,
      "referrer" -> referer,
      "method" -> request.method,
      "duration" -> duration
    )

    val markersFromRequestHeaders = List(
      Authentication.originalServiceHeaderName,
      InnerServiceAuthentication.innerServiceIdentityHeaderName,
      InnerServiceAuthentication.innerServiceUUIDHeaderName,
      InnerServiceAuthentication.innerServiceTimestampHeaderName
    ).map { headerName =>
      headerName -> request.headers.get(headerName)
    }

    val optionalMarkers = (markersFromRequestHeaders ++ Map(
      "status" -> outcome.map(_.header.status).toOption,
      "requestId" -> request.headers.get(RequestLoggingFilter.requestIdHeader)
    )).collect{
      case (key, Some(value)) => key -> value
    }

    val markers = MarkerContext(appendEntries((mandatoryMarkers ++ optionalMarkers).asJava))

    outcome.fold(
      throwable => {
        logger.info(s"""$originIp - "${request.method} ${request.uri} ${request.version}" ERROR "$referer" ${duration}ms""")(markers)
        logger.error(s"Error for ${request.method} ${request.uri}", throwable)
      },
      response => {
        val length = response.header.headers.getOrElse("Content-Length", 0)
        val message = s"""$originIp - "${request.method} ${request.uri} ${request.version}" ${response.header.status} $length "$referer" ${duration}ms"""
        if (request.uri == "/management/healthcheck") {
         logger.debug(message)(markers)
        } else {
          logger.info(message)(markers)
        }
      }

    )
  }

}
