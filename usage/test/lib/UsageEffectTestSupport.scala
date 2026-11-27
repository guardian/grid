package lib

import rx.lang.scala.Observable

import java.util.concurrent.atomic.AtomicInteger
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

object UsageEffectTestSupport {
  trait Support[F[_]] {
    def successful[A](value: A): F[A]
    def failureThenSuccess[A](failure: Throwable, value: A, attempts: AtomicInteger): F[A]
    def await[A](effect: F[A]): A
  }

  implicit val observableSupport: Support[Observable] = new Support[Observable] {
    override def successful[A](value: A): Observable[A] = Observable.just(value)

    override def failureThenSuccess[A](
      failure: Throwable,
      value: A,
      attempts: AtomicInteger
    ): Observable[A] = Observable.defer {
      if (attempts.getAndIncrement() == 0) Observable.error(failure)
      else Observable.just(value)
    }

    override def await[A](effect: Observable[A]): A = effect.toBlocking.single
  }

  implicit val futureSupport: Support[Future] = new Support[Future] {
    override def successful[A](value: A): Future[A] = Future.successful(value)

    override def failureThenSuccess[A](
      failure: Throwable,
      value: A,
      attempts: AtomicInteger
    ): Future[A] =
      if (attempts.getAndIncrement() == 0) Future.failed(failure)
      else Future.successful(value)

    override def await[A](effect: Future[A]): A = Await.result(effect, 5.seconds)
  }

  def successful[F[_], A](value: A)(implicit support: Support[F]): F[A] =
    support.successful(value)

  def failureThenSuccess[F[_], A](
    failure: Throwable,
    value: A,
    attempts: AtomicInteger
  )(implicit support: Support[F]): F[A] =
    support.failureThenSuccess(failure, value, attempts)

  def await[F[_], A](effect: F[A])(implicit support: Support[F]): A =
    support.await(effect)
}
