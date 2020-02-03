package lib


import akka.actor.ActorSystem
import akka.pattern.{after, retry}
import play.api.{Logger, MarkerContext}

import scala.concurrent.{ExecutionContext, Future, TimeoutException}
import scala.concurrent.duration.FiniteDuration
import scala.util.{Failure, Success}

object RetryHandler {
  def handleWithRetryAndTimeout[T](f: () => Future[T],
                                   retries: Int,
                                   timeout: FiniteDuration,
                                   delay: FiniteDuration
                                  )(implicit actorSystem: ActorSystem,
                                    executionContext: ExecutionContext,
                                    mc: MarkerContext
                                  ): () => Future[T] = {
    def logFailures[T](f: () => Future[T])(
      implicit executionContext: ExecutionContext, mc: MarkerContext
    ): () => Future[T] = {
      () => {
        f().transform {
          case Success(x) => Success(x)
          case Failure(t: TimeoutException) => {
            Logger.error("Failed with timeout. Will retry")
            Failure(t)
          }
          case Failure(exception) => {
            Logger.error("Failed with exception.", exception)
            Failure(exception)
          }
        }
      }
    }

    def handleWithTimeout[T](f: () => Future[T], attemptTimeout: FiniteDuration): () => Future[T] = () => {
      val timeout = after(attemptTimeout, using = actorSystem.scheduler)(Future.failed(
        new TimeoutException(s"Timeout of $attemptTimeout reached.")
      ))
      Future.firstCompletedOf(Seq(timeout, f()))
    }

    def handleWithRetry[T](f: () => Future[T], retries: Int, delay: FiniteDuration): () => Future[T] = () => {
      implicit val scheduler = actorSystem.scheduler
      var count = 0

      def attempt = () => {
        count = count + 1
        Logger.info(s"Attempt $count of $retries")
        f()
      }
      retry(attempt, retries, delay)
    }

    handleWithRetry(handleWithTimeout(logFailures(f), timeout), retries, delay)
  }
}
