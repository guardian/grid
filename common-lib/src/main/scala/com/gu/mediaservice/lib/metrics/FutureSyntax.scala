package com.gu.mediaservice.lib.metrics

import com.amazonaws.services.cloudwatch.model.Dimension

import scala.concurrent.{ExecutionContext, Future}

/** Convenience methods for attaching metrics to Scala Futures
  */
trait FutureSyntax {

  implicit class FutureOps[A](self: Future[A])(implicit ex: ExecutionContext) {

    def thenIncrement[M, N](onSuccess: Metric[M], onFailure: Metric[N])
                           (implicit M: Numeric[M], N: Numeric[N]): Future[A] = {
      incrementOnSuccess(onSuccess)
      incrementOnFailure(onFailure) { case _ => true }
    }

    def incrementOnSuccess[N](metric: Metric[N])(implicit N: Numeric[N]): Future[A] =
      toMetric(metric)(_ => N.fromInt(1))

    def incrementOnFailure[B](metric: Metric[B])(pfn: PartialFunction[Throwable, Boolean])
                             (implicit B: Numeric[B]): Future[A] = {
      self.failed.foreach(pfn.andThen { b =>
        if (b) metric.runRecordOne(B.fromInt(1))
      })
      self
    }

    def toMetric[B](metric: Metric[B], dims: List[Dimension] = List())(f: A => B): Future[A] = {
      self.foreach { case a => metric.runRecordOne(f(a), dims) }
      self
    }

  }

}

object FutureSyntax extends FutureSyntax
