package com.gu.mediaservice.lib.play

import org.apache.pekko.stream.Materializer
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.provider.InnerServiceAuthentication
import com.gu.mediaservice.lib.play.RequestLoggingFilter.{loggablePrincipal, maxQueryLength, requestPrincipal, requestUuidKey, wafHeaderNames}
import net.logstash.logback.marker.Markers.appendEntries
import play.api.libs.typedmap.TypedKey
import play.api.mvc.{Filter, RequestHeader, Result, WrappedRequest}
import play.api.{Logger, MarkerContext}

import java.util.UUID
import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

object RequestLoggingFilter {
  private val maxQueryLength = 500
  val wafHeaderNames: List[String] = List(
    "x-amzn-waf-admin-protection-rule-set",
    "x-amzn-waf-amazon-ip-reputation-list",
    "x-amzn-waf-anonymous-ip-list",
    "x-amzn-waf-common-rule-set",
    "x-amzn-waf-known-bad-inputs-rule-set",
    "x-amzn-waf-linux-rule-set",
    "x-amzn-waf-unix-rule-set"
  )

  val requestUuidKey = TypedKey[String]("request-uuid")
  def getRequestId[T](req: WrappedRequest[T]): String = req.attrs.get(requestUuidKey).getOrElse("(unset request id)")
  // Set by this filter, so only available to filters that run after it.
  def requestIdFor(req: RequestHeader): Option[String] = req.attrs.get(requestUuidKey)
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
    val clientIp = request.headers.get("X-Forwarded-For")
      .flatMap(_.split(",").headOption.map(_.trim))
      .getOrElse(request.remoteAddress)
    val referer = request.headers.get("Referer").getOrElse("")
    val wafHeaders = wafHeaderNames.flatMap { name =>
      request.headers.get(name).map(name -> _)
    }
    val wafSummary =
      if (wafHeaders.isEmpty) ""
      else wafHeaders.map(_._1.stripPrefix("x-amzn-waf-")).mkString(" WAF match [", ", ", "]")

    val authMarkers = outcome.toOption.flatMap(_.attrs.get(requestPrincipal)).map(loggablePrincipal).getOrElse(Map.empty)

    val mandatoryMarkers = Map(
      "origin" -> originIp,
      "referrer" -> referer,
      "method" -> request.method,
      "duration" -> duration,
      "host" -> request.host,
      "path" -> request.path,
      "query" -> request.rawQueryString.take(maxQueryLength),
      "userAgent" -> request.headers.get("User-Agent").getOrElse(""),
      "clientIp" -> clientIp,
      "cloudfrontId" -> request.headers.get("X-Amz-Cf-Id").getOrElse(""),
      "status" -> outcome.fold[Any](_ => "exception", _.header.status),
      "wafMatched" -> wafHeaders.nonEmpty.toString
    ) ++ authMarkers ++ wafHeaders

    val markersFromRequestHeaders = List(
      Authentication.originalServiceHeaderName,
      InnerServiceAuthentication.innerServiceIdentityHeaderName,
      InnerServiceAuthentication.innerServiceUUIDHeaderName,
      InnerServiceAuthentication.innerServiceTimestampHeaderName
    ).map { headerName =>
      headerName -> request.headers.get(headerName)
    }


    val optionalMarkers = (markersFromRequestHeaders  ++ Map(
      "requestId" -> request.attrs.get(requestUuidKey),
    )).collect {
      case (key, Some(value)) => key -> value
    }

    val markers = MarkerContext(appendEntries((mandatoryMarkers ++ optionalMarkers).asJava))

    outcome.fold(
      throwable => {
        logger.info(s"""$originIp - "${request.method} ${request.uri} ${request.version}" ERROR "$referer" ${duration}ms$wafSummary""")(markers)
        logger.error(s"Error for ${request.method} ${request.uri}", throwable)(markers)
      },
      response => {
        val length = response.header.headers.getOrElse("Content-Length", 0)
        logger.info(s"""$originIp - "${request.method} ${request.uri} ${request.version}" ${response.header.status} $length "$referer" ${duration}ms$wafSummary""")(markers)
      }

    )
  }

}
