package com.gu.mediaservice.lib.play

import akka.stream.Materializer

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}
import play.api.mvc.{Filter, RequestHeader, Result}
import play.api.Logger
import com.gu.mediaservice.lib.metrics.StopWatch

class RequestLoggingFilter(override val mat: Materializer)(implicit ec: ExecutionContext) extends Filter {

  private val logger = Logger("request")

  override def apply(next: (RequestHeader) => Future[Result])(rh: RequestHeader): Future[Result] = {
    val stopWatch = new StopWatch

    val result = next(rh)

    val originIp = rh.headers.get("X-Forwarded-For").getOrElse(rh.remoteAddress)
    val referer = rh.headers.get("Referer").getOrElse("")
    result onComplete {
      case Success(response) =>
        val length = response.header.headers.getOrElse("Content-Length", 0)
        logger.info(s"""$originIp - "${rh.method} ${rh.uri} ${rh.version}" ${response.header.status} $length "$referer" ${stopWatch.elapsed}ms""")

      case Failure(error) =>
        logger.info(s"""$originIp - "${rh.method} ${rh.uri} ${rh.version}" ERROR "$referer" ${stopWatch.elapsed}ms""")
    }

    result
  }
}
