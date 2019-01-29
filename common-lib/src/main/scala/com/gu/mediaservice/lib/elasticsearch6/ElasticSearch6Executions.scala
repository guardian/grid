package com.gu.mediaservice.lib.elasticsearch6

import com.sksamuel.elastic4s.http._
import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers.appendEntries
import play.api.{Logger, MarkerContext}

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

trait ElasticSearch6Executions {

  def client: ElasticClient

  def executeAndLog[T, U](request: T, message: String)(implicit
                                                       functor: Functor[Future],
                                                       executor: Executor[Future],
                                                       handler: Handler[T, U],
                                                       manifest: Manifest[U],
                                                       executionContext: ExecutionContext): Future[Response[U]] = {
    val start = System.currentTimeMillis()

    val result = client.execute(request).transform {
      case Success(r) =>
        r.isSuccess match {
          case true => Success(r)
          case false => Failure(new RuntimeException("query response was not successful: " + r.error.reason))
        }
      case Failure(f) => Failure(f)
    }

    result.foreach { r =>
      val elapsed = System.currentTimeMillis() - start
      val markers = MarkerContext(durationMarker(elapsed))
      Logger.info(s"$message - query returned successfully in $elapsed ms")(markers)
    }

    result.failed.foreach { e =>
      val elapsed = System.currentTimeMillis() - start
      val markers = MarkerContext(durationMarker(elapsed))
      Logger.error(s"$message - query failed after $elapsed ms: ${e.getMessage} cs: ${e.getCause}")(markers)
    }

    result
  }

  private def durationMarker(elapsed: Long): LogstashMarker = appendEntries(Map("duration" -> elapsed).asJava)

}
