package com.gu.mediaservice.lib.elasticsearch

import com.sksamuel.elastic4s.http._
import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers.appendEntries
import play.api.{Logger, MarkerContext}

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

trait ElasticSearchExecutions {

  def client: ElasticClient

  def executeAndLog[T, U](request: T, message: String)(implicit
                                                       functor: Functor[Future],
                                                       executor: Executor[Future],
                                                       handler: Handler[T, U],
                                                       manifest: Manifest[U],
                                                       executionContext: ExecutionContext,
  ): Future[
    Either[
      ElasticError, Response[U]
    ]
  ] = {
    val start = System.currentTimeMillis()
    val result = client.execute(request).transform {
      case Success(r) =>
        r.isSuccess match {
          case true => Success(Right(r))
          case false => Success(Left(r.error))
        }
      case Failure(f) => Success(Left(ElasticError.fromThrowable(f)))
    }

    result.foreach { completed =>
      val elapsed = System.currentTimeMillis() - start
      val markers = MarkerContext(durationMarker(elapsed))
      completed match {
        case Right(r) => {
          Logger.info(s"$message - query returned successfully in $elapsed ms")(markers)
        }

        case Left(elasticError) => {
          Logger.error(s"$message - query failed after $elapsed ms: ${elasticError.reason} cs: ${elasticError.`type`}")(markers)

        }
      }
    }

    result
  }

  private def durationMarker(elapsed: Long): LogstashMarker = appendEntries(Map("duration" -> elapsed).asJava)

}
