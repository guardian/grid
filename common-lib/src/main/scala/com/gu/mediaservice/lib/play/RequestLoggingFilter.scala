package com.gu.mediaservice.lib.play

import akka.stream.Materializer

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}
import play.api.mvc.{Filter, RequestHeader, Result}
import play.api.{Logger, MarkerContext}
import net.logstash.logback.marker.Markers.appendEntries

import scala.collection.JavaConverters._

class RequestLoggingFilter(override val mat: Materializer)(implicit ec: ExecutionContext) extends Filter {

  private val logger = Logger("request")

  override def apply(next: (RequestHeader) => Future[Result])(rh: RequestHeader): Future[Result] = {
    val start = System.currentTimeMillis()
    val result = next(rh)

    val originIp = rh.headers.get("X-Forwarded-For").getOrElse(rh.remoteAddress)
    val referer = rh.headers.get("Referer").getOrElse("")
    result onComplete {
      case Success(response) =>
        val length = response.header.headers.getOrElse("Content-Length", 0)

        val elapsed = System.currentTimeMillis() - start
        val markers = MarkerContext(appendEntries(Map(
          "elapsed_time" -> elapsed
        ).asJava))

        logger.info(s"""$originIp - "${rh.method} ${rh.uri} ${rh.version}" ${response.header.status} $length "$referer" ${elapsed}ms""")(markers)

      case Failure(error) =>
        val elapsed = System.currentTimeMillis() - start
        val markers = MarkerContext(appendEntries(Map(
          "elapsed_time" -> elapsed
        ).asJava))

        logger.info(s"""$originIp - "${rh.method} ${rh.uri} ${rh.version}" ERROR "$referer" ${elapsed}ms""")(markers)
    }

    result
  }
}
