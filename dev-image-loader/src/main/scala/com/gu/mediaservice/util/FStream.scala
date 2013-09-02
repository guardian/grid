package com.gu.mediaservice.util

import scala.concurrent.{ExecutionContext, Future}


/** A Future-branching stream of As
  */
case class FStream[A](run: Future[(A, FStream[A])])(implicit ex: ExecutionContext) {

  def map[B](f: A => B): FStream[B] =
    FStream(for ((a, as) <- run) yield (f(a), as.map(f)))

  def foreach(f: A => Unit): Unit =
    for ((a, as) <- run) { f(a); as.foreach(f) }

  def unfold[B](f: A => Future[B]): FStream[B] =
    FStream(for ((a, as) <- run; b <- f(a)) yield (b, as.unfold(f)))

  /** Interleave two streams, taking values from either as soon as they are available.
    */
  def nonDeterministicInterleave(that: FStream[A]): FStream[A] = {
    def f(lefts: FStream[Either[A, A]], rights: FStream[Either[A, A]]): FStream[Either[A, A]] =
      FStream(Future.firstCompletedOf(Seq(lefts.run, rights.run)) map {
        case (left @ Left(_), ls)  => (left, ls.nonDeterministicInterleave(rights))
        case (right @ Right(_), rs) => (right, rs.nonDeterministicInterleave(lefts))
      })
    f(this map Left.apply, that map Right.apply) map (_.merge)
  }
}
