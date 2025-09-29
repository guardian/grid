package com.gu.mediaservice.lib.play

import org.apache.pekko.stream.Materializer
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.provider.InnerServiceAuthentication
import com.gu.mediaservice.lib.play.RequestLoggingFilter.{getRequestId, loggablePrincipal, requestPrincipal, requestUuidKey}
import net.logstash.logback.marker.Markers.appendEntries
import play.api.libs.typedmap.TypedKey
import play.api.mvc.{Filter, RequestHeader, Result, WrappedRequest}
import play.api.{Logger, MarkerContext}

import java.util.UUID
import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

object RequestLoggingFilter {
  val requestUuidKey = TypedKey[String]("request-uuid")
  def getRequestId[T](req: WrappedRequest[T]): String = req.attrs.get(requestUuidKey).getOrElse("(unset request id)")
  val requestPrincipal = TypedKey[Principal]("request-principal")

  def loggablePrincipal(principal: Principal): Map[String, String] =
    Map(
      "api-key" -> principal.accessor.identity,
      "api-key-tier" -> principal.accessor.tier.toString
    )
}
class RequestLoggingFilter(override val mat: Materializer)(implicit ec: ExecutionContext) extends Filter {

  private val logger = Logger("request")

  override def apply(next: RequestHeader => Future[Result])(request: RequestHeader): Future[Result] = {
    val start = System.currentTimeMillis()
    val withID = request.addAttr(requestUuidKey, UUID.randomUUID().toString)

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

    val authMarkers = outcome.toOption.flatMap(_.attrs.get(requestPrincipal)).map(loggablePrincipal).getOrElse(Map.empty)

    val mandatoryMarkers = Map(
      "origin" -> originIp,
      "referrer" -> referer,
      "method" -> request.method,
      "duration" -> duration
    ) ++ authMarkers

    val markersFromRequestHeaders = List(
      Authentication.originalServiceHeaderName,
      InnerServiceAuthentication.innerServiceIdentityHeaderName,
      InnerServiceAuthentication.innerServiceUUIDHeaderName,
      InnerServiceAuthentication.innerServiceTimestampHeaderName
    ).map { headerName =>
      headerName -> request.headers.get(headerName)
    }


    val optionalMarkers = (markersFromRequestHeaders  ++ Map(
      "status" -> outcome.map(_.header.status).toOption,
      "requestId" -> request.attrs.get(requestUuidKey),
    )).collect {
      case (key, Some(value)) => key -> value
    }

    val markers = MarkerContext(appendEntries((mandatoryMarkers ++ optionalMarkers).asJava))

    outcome.fold(
      throwable => {
        logger.info(s"""$originIp - "${request.method} ${request.uri} ${request.version}" ERROR "$referer" ${duration}ms""")(markers)
        logger.error(s"Error for ${request.method} ${request.uri}", throwable)(markers)
      },
      response => {
        val length = response.header.headers.getOrElse("Content-Length", 0)
        logger.info(s"""$originIp - "${request.method} ${request.uri} ${request.version}" ${response.header.status} $length "$referer" ${duration}ms""")(markers)
      }

    )
  }

}
