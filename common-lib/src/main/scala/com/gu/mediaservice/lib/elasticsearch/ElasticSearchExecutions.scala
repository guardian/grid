package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.logging._
import com.sksamuel.elastic4s._
import play.api.Logger

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

trait ElasticSearchExecutions  {

  def client: ElasticClient

  def executeAndLog[T, U](request: T, message: String)(implicit
                                                       functor: Functor[Future],
                                                       executor: Executor[Future],
                                                       handler: Handler[T, U],
                                                       manifest: Manifest[U],
                                                       executionContext: ExecutionContext,
                                                       logMarkers: LogMarker
  ): Future[Response[U]] = {
    val stopwatch = Stopwatch.start

    val result = client.execute(request).transform {
      case Success(r) =>
        r.isSuccess match {
          case true => Success(r)
          case false => r.status match {
            case 404 => Failure(ElasticNotFoundException)
            case _ => Failure(ElasticSearchException(r.error))
          }
        }
      case Failure(f) => Failure(f)
    }

    result.foreach { r =>
      val elapsed = stopwatch.elapsed
      Logger.info(s"$message - query returned successfully in ${elapsed.toMillis} ms")(combineMarkers(logMarkers, elapsed))
    }

    result.failed.foreach { e =>
      val elapsed = stopwatch.elapsed
      e match {
        case ElasticNotFoundException => Logger.error(s"$message - query failed: Document not Found")(
          combineMarkers(logMarkers, elapsed, MarkerMap(Map("reason" -> "ElasticNotFoundException"))))
        case ElasticSearchException(error, marker) =>
          Logger.error(s"$message - query failed: ${e.getMessage}")(combineMarkers(logMarkers, elapsed, marker))
        case _ => Logger.error(s"$message - query failed: ${e.getMessage} cs: ${e.getCause}")(
          combineMarkers(logMarkers, elapsed, MarkerMap(Map("reason" -> "unknown es error"))))
      }
    }
    result
  }


}
