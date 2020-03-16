package com.gu.mediaservice.lib.elasticsearch

import com.sksamuel.elastic4s.{ElasticClient, ElasticError, Executor, Functor, Handler, Response}
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
                                                       executionContext: ExecutionContext): Future[Response[U]] = {
    val start = System.currentTimeMillis()

    val result = client.execute(request).transform {
      case Success(r) =>
        r.isSuccess match {
          case true => Success(r)
          case false => r.status match {
            case 404 => Failure(ElasticNotFoundException)
            case _ => Failure(ElasticException(r.error))
          }
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
      e match {
        case ElasticNotFoundException => Logger.error(s"$message - query failed: Document not Found")(markers)
        case ElasticException(error) => error match {
          case ElasticError(t, r, _, _, _, Seq(), _, _, _, _) => // No root causes provided.
            Logger.error(s"$message - query failed because: $r type: $t")(markers)
          case ElasticError(t, r, _, _, _, s, _, _, _, _) =>
            Logger.error(
              s"$message - query failed because: $r type: $t; root cause ${s.mkString(", ")}"
            )(markers)
        }
        case _ => Logger.error(s"$message - query failed: ${e.getMessage} cs: ${e.getCause}")(markers)
      }
    }

    result
  }

  private def durationMarker(elapsed: Long): LogstashMarker = appendEntries(Map("duration" -> elapsed).asJava)

}

case class ElasticException(error: ElasticError) extends Exception(s"Elastic Search Error ${error.`type`} ${error.reason}")
case object ElasticNotFoundException  extends Exception(s"Elastic Search Document Not Found")
