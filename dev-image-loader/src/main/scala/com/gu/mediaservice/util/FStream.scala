package com.gu.mediaservice.util

import scala.concurrent.{ExecutionContext, Future}


/** A Future-branching stream of As
  */
case class FStream[A](run: Future[(A, FStream[A])])(implicit ex: ExecutionContext) {

  def map[B](f: A => B): FStream[B] =
    FStream(for ((a, as) <- run) yield (f(a), as.map(f)))

  def foreach(f: A => Unit): Unit =
    for ((a, as) <- run) { f(a); as.foreach(f) }

  def filter(p: A => Boolean): FStream[A] =
    FStream {
      for {
        (a, as) <- run
        cont <- if (p(a)) Future.successful((a, as.filter(p))) else as.filter(p).run
      } yield cont
    }

  def unfold[B](f: A => Future[B]): FStream[B] =
    FStream(for ((a, as) <- run; b <- f(a)) yield (b, as.unfold(f)))

  def +:(fa: Future[A]): FStream[A] =
    FStream(for (a1 <- fa) yield (a1, this))

  def chunk(n: Int): FStream[List[A]] = {
    def f(stream: FStream[List[A]], n: Int): FStream[List[A]] =
      if (n > 0)
        FStream(for (((a1, a2), _) <- stream.pair.run; (_, as) <- stream.run) yield (a1 ::: a2, f(as, n-1)))
      else
        stream
    f(map(List(_)), n)
  }

  def pair: FStream[(A, A)] =
    FStream(for ((a1, a1s) <- run; (a2, a2s) <- a1s.run) yield ((a1, a2), a2s.pair))

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

object FStream {

  implicit class ChunkedFStreamSyntax[A](self: FStream[List[A]])(implicit ex: ExecutionContext) {
    def deChunk: FStream[A] =
      FStream {
        for {
          (chunk, chunks) <- self.run
          rest <- chunk.foldRight(chunks.deChunk)({ case (a, as) => Future.successful(a) +: as }).run
        }
        yield rest
      }

  }

}
