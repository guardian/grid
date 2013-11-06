package com.gu.mediaservice.lib.metrics

import scala.concurrent.{ExecutionContext, Future}

/** Convenience methods for attaching metrics to Scala Futures
  */
trait FutureSyntax {

  implicit class FutureOps[A](self: Future[A])(implicit ex: ExecutionContext) {

    def thenIncrement[M, N](onSuccess: Metric[M], onFailure: Metric[N])
                           (implicit M: Numeric[M], N: Numeric[N]): Future[A] = {
      incrementOnSuccess(onSuccess)
      incrementOnFailure(onFailure)
    }

    def incrementOnSuccess[N](metric: Metric[N])(implicit N: Numeric[N]): Future[A] = {
      self.onSuccess { case _ => metric.recordOne(N.fromInt(1)) }
      self
    }

    def incrementOnFailure[N](metric: Metric[N])(implicit N: Numeric[N]): Future[A] = {
      self.onFailure { case _ => metric.recordOne(N.fromInt(1)) }
      self
    }

    def toMetric[B](metric: Metric[B])(f: A => B): Future[A] = {
      self.onSuccess { case a => metric.recordOne(f(a)) }
      self
    }

  }

}

object FutureSyntax extends FutureSyntax
