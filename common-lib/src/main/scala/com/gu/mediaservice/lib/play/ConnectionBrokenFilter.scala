package com.gu.mediaservice.lib.play

import akka.http.scaladsl.model.EntityStreamException
import akka.stream.Materializer
import com.typesafe.scalalogging.StrictLogging
import play.api.mvc.{Filter, RequestHeader, Result, Results}

import scala.concurrent.{ExecutionContext, Future}

class EntityStreamExceptionFilter(override val mat: Materializer)(implicit ec: ExecutionContext)
  extends Filter with Results with StrictLogging {
  override def apply(next: (RequestHeader) => Future[Result])(rh: RequestHeader): Future[Result] = {
    next(rh) recover {
      case _:EntityStreamException =>
        logger.info(s"Upload failed with EntityStreamException. Request = $rh")
        UnprocessableEntity("The upload did not complete")
    }
  }
}
