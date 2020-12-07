package com.gu.mediaservice.lib.play

import akka.http.scaladsl.model.EntityStreamException
import akka.stream.Materializer
import com.typesafe.scalalogging.StrictLogging
import play.api.mvc.{Filter, RequestHeader, Result, Results}

import scala.concurrent.{ExecutionContext, Future}

/**
  * When the GRID is reloaded during an upload, or the network is throttled / flaky
  * an attempt to POST a large file will result in an EntityStreamException being thrown
  * on attempt to read the input stream.
  * This is, by default, logged as a server error (5XX) but cannot be usefully addressed
  * and effectively pollutes the logs.
  *
  * This file expressly converts this to a 422 Unprocessable Entity response.
  *
  * The client is almost certainly ignoring the response anyway.
  */
class ConnectionBrokenFilter(override val mat: Materializer)(implicit ec: ExecutionContext)
  extends Filter with Results with StrictLogging {
  override def apply(next: (RequestHeader) => Future[Result])(rh: RequestHeader): Future[Result] = {
    next(rh) recover {
      case _:EntityStreamException =>
        logger.info(s"Upload failed with EntityStreamException. Request = $rh")
        UnprocessableEntity("The upload did not complete")
    }
  }
}
