package com.gu.mediaservice.lib

import scala.concurrent.duration._

import scalaz.concurrent.Task
import scalaz.stream.{Process, process1, Process1, Wye}
import scalaz.stream.Process._
import scalaz.stream.io
import scalaz.stream.ReceiveY.{ReceiveL, ReceiveR, HaltL, HaltR}


object Processes {

  def resource1[R, O](acquire: Task[R])(release: R => Task[Unit])(step: R => Task[O]): Process[Task, O] =
    io.resource(acquire)(release)(step).take(1)

  def unchunk[O]: Process1[Seq[O], O] =
    process1.id[Seq[O]].flatMap(emitAll)

  /* Repeat the process continually, even if it terminates with an error. */
  def retryContinually[A](duration: Duration)(process: => Process[Task, A]): Process[Task, A] =
    process.orElse(sleep(duration) fby process)

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

}

