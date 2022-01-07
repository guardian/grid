package lib


import akka.actor.ActorSystem
import akka.pattern.{after, retry}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap, combineMarkers}
import play.api.{Logger, MarkerContext}

import scala.concurrent.{ExecutionContext, Future, TimeoutException}
import scala.concurrent.duration.FiniteDuration
import scala.util.{Failure, Success}

object RetryHandler extends GridLogging {
  type WithMarkers[T] = (LogMarker) => Future[T]

  def handleWithRetryAndTimeout[T](f: WithMarkers[T],
                                   retries: Int,
                                   timeout: FiniteDuration,
                                   delay: FiniteDuration,
                                   marker: LogMarker
                                  )(implicit actorSystem: ActorSystem,
                                    executionContext: ExecutionContext,
                                  ): Future[T] = {
    def logFailures[T](f: WithMarkers[T]):WithMarkers[T]  = {
      (marker: LogMarker) => {
        f(marker).transform {
          case Success(x) => Success(x)
          case Failure(t: TimeoutException) => {
            logger.error(marker, "Failed with timeout. Will retry")
            Failure(t)
          }
          case Failure(exception) => {
            logger.error(marker, "Failed with exception.", exception)
            Failure(exception)
          }
        }
      }
    }

    def handleWithTimeout[T](f: WithMarkers[T], attemptTimeout: FiniteDuration): WithMarkers[T] = ( marker ) => {
      val timeout = after(attemptTimeout, using = actorSystem.scheduler)(Future.failed(
        new TimeoutException(s"Timeout of $attemptTimeout reached.")
      ))
      Future.firstCompletedOf(Seq(timeout, f(marker)))
    }

    def handleWithRetry[T](f: WithMarkers[T], retries: Int, delay: FiniteDuration): WithMarkers[T] = (marker) => {
      implicit val scheduler = actorSystem.scheduler
      var count = 0

      def attempt = () => {
        count = count + 1
        val markerWithRetry = combineMarkers(marker, MarkerMap("retryCount" -> count))
        logger.info(markerWithRetry, s"Attempt $count of $retries")

        f(markerWithRetry)
      }
      retry(attempt, retries, delay)
    }
    handleWithRetry(handleWithTimeout(logFailures(f), timeout), retries, delay)(marker)
  }
}
