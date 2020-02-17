package lib

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, Future}
import scala.util.Try

object OrderedFutureRunner {
  def run[A, B](f: A => Future[B], timeout: Duration)(as: List[A]): List[Try[B]] = {
    as.map { a =>
      Try(Await.result(f(a), timeout))
    }
  }
}
