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
      toMetric(Some(metric))(_ => N.fromInt(1))

    def incrementOnFailure[B](metric: Metric[B])(pfn: PartialFunction[Throwable, Boolean])
                             (implicit B: Numeric[B]): Future[A] = {
      self.failed.foreach(pfn.andThen { b =>
        if (b) metric.runRecordOne(B.fromInt(1))
      })
      self
    }

    def toMetric[B](metric: Option[Metric[B]], dims: Option[Dimension] = None)(f: A => B): Future[A] = {
      self.foreach { case a => metric.foreach(_.runRecordOne(f(a), dims.toList)) }
      self
    }

  }

}

object FutureSyntax extends FutureSyntax
