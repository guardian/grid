package com.gu.mediaservice.lib

import scala.concurrent.duration._

import scalaz.concurrent.Task
import scalaz.stream.{Process, process1, Process1, Wye}
import scalaz.stream.Process._
import scalaz.stream.io
import scalaz.stream.ReceiveY.{ReceiveL, ReceiveR, HaltL, HaltR}


object Processes {

  def unchunk[O]: Process1[Seq[O], O] =
    process1.id[Seq[O]].flatMap(emitAll)

  def sleepIfEmpty[A](duration: Duration)(p: Process[Task, Seq[A]]): Process[Task, Seq[A]] =
    p.flatMap(xs => if (xs.isEmpty) sleep(duration) else emit(xs))

  implicit class SourceSyntax[O](self: Process[Task, O]) {

    /**
     * Emits a chunk whenever `maxSize` elements have accumulated, or at every
     * `maxAge` time when elements are buffered, whichever is sooner.
     */
    def chunkTimed(maxAge: Duration, maxSize: Int): Process[Task, Vector[O]] = {
      def go(buf: Vector[O], lastEmit: Duration): Wye[Duration, O, Vector[O]] =
        awaitBoth[Duration, O].flatMap {
          case ReceiveL(t) =>
            if (buf.nonEmpty) emit(buf) fby go(Vector(), t)
            else go(buf, lastEmit)
          case ReceiveR(o) =>
            if (buf.size >= (maxSize - 1)) emit(buf :+ o) fby go(Vector(), lastEmit)
            else go(buf :+ o, lastEmit)
          case HaltL(e) => Halt(e)
          case HaltR(e) => Halt(e)
        }
      awakeEvery(maxAge).wye(self)(go(Vector(), 0.millis))
    }
  }

  import scalaz.syntax.std.map._

  /** Only emits an element once it has been seen `n` times. */
  def emitEveryNth[A](n: Int): Process1[A, A] = {
    def go(acc: Map[A, Int]): Process1[A, A] =
      await1[A].flatMap { case a =>
        val newAcc = acc.insertWith(a, 1)(_ + _)
        if (newAcc(a) >= n)
          emit(a) fby go(acc - a)
        else
          go(newAcc)
      }
    go(Map.empty)
  }

}
