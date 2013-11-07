package com.gu.mediaservice.lib

import scalaz.concurrent.Task
import scalaz.stream.{process1, These, Process}
import scalaz.stream.These.{That, This}
import scalaz.stream.{Channel, Process1, Wye}
import scalaz.stream.Process.{emit, emitAll, eval, awaitBoth, awakeEvery}
import scalaz.stream.io.resource


object Processes {

  def resource1[R, O](acquire: Task[R])(release: R => Task[Unit])(step: R => Task[O]): Process[Task, O] =
    resource(acquire)(release)(step).take(1)

  def unchunk[O]: Process1[Seq[O], O] =
    process1.id[Seq[O]].flatMap(emitAll)

  def sleepIfEmpty[A](millis: Int)(input: Seq[A]): Process[Task, Seq[A]] =
    emit(input) ++ (if (input.isEmpty) sleep(millis) else Process())

  def sleep(millis: Long): Process[Task, Nothing] =
    eval(Task.delay(Thread.sleep(millis))).drain

  import scala.concurrent.duration._

  implicit class SourceSyntax[O](self: Process[Task, O]) {

    /**
     * Emits a chunk whenever `maxSize` elements have accumulated, or at every
     * `maxAge` time when elements are buffered, whichever is sooner.
     */
    def chunkTimed[O2](maxAge: Duration, maxSize: Int)(chan: Channel[Task, Seq[O], O2]): Process[Task, O2] = {
      def go(buf: Vector[O], lastEmit: Duration): Wye[Duration, O, Vector[O]] =
        awaitBoth[Duration, O].flatMap {
          case These(t, o) =>
            emit(buf :+ o) fby go(Vector(), t)
          case This(t) =>
            if (buf.nonEmpty) emit(buf) fby go(Vector(), t)
            else go(buf, lastEmit)
          case That(o) =>
            if (buf.size >= (maxSize - 1)) emit(buf :+ o)
            else go(buf :+ o, lastEmit)
        }
      awakeEvery(maxAge).wye(self)(go(Vector(), 0.millis)).repeat.through(chan)
    }
  }

}
