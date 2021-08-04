package lib

import scala.concurrent.{ExecutionContext, Future}

/**
  * Optionally executes an asynchronous function if param is a Some, wrapping the result back into a Some.
  * If the param is empty, runner completes with a successful empty future.
  */
object OptionalFutureRunner {
  def run[A, B](f: A => Future[B])(param: Option[A])(implicit ex: ExecutionContext): Future[Option[B]] = {
    param match {
      case Some(value) => f(value).map(Some(_))
      case None => Future.successful(None)
    }
  }
}
