package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.logging._
import com.sksamuel.elastic4s._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

trait ElasticSearchExecutions extends GridLogging {

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
      logger.info(combineMarkers(logMarkers, elapsed), s"$message - query returned successfully in ${elapsed.toMillis} ms")
    }

    result.failed.foreach { e =>
      val elapsed = stopwatch.elapsed
      e match {
        case ElasticNotFoundException => logger.error(
          combineMarkers(logMarkers, elapsed, MarkerMap(Map("reason" -> "ElasticNotFoundException"))),
          s"$message - query failed: Document not Found"
        )
        case ElasticSearchException(error, marker) =>
          logger.error(combineMarkers(logMarkers, elapsed, marker), s"$message - query failed", e)
        case _ =>
          logger.error(
            combineMarkers(logMarkers, elapsed, MarkerMap(Map("reason" -> "unknown es error"))),
          s"$message - query failed",
            e
          )
      }
    }
    result
  }


}
