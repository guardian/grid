package com.gu.mediaservice.lib

import scala.concurrent.duration._

import scalaz.concurrent.Task
import scalaz.stream.{process1, These, Process}
import scalaz.stream.These.{That, This}
import scalaz.stream.{Process1, Wye}
import scalaz.stream.Process.{emit, emitAll, awaitBoth, awakeEvery, sleep}
import scalaz.stream.io.resource


object Processes {

  def resource1[R, O](acquire: Task[R])(release: R => Task[Unit])(step: R => Task[O]): Process[Task, O] =
    resource(acquire)(release)(step).take(1)

  def unchunk[O]: Process1[Seq[O], O] =
    process1.id[Seq[O]].flatMap(emitAll)

  def sleepIfEmpty[A](duration: Duration)(input: Seq[A]): Process[Task, Seq[A]] =
    if (input.nonEmpty) emit(input) else sleep(duration)

  implicit class SourceSyntax[O](self: Process[Task, O]) {

    /**
     * Emits a chunk whenever `maxSize` elements have accumulated, or at every
     * `maxAge` time when elements are buffered, whichever is sooner.
     */
    def chunkTimed(maxAge: Duration, maxSize: Int): Process[Task, Vector[O]] = {
      def go(buf: Vector[O], lastEmit: Duration): Wye[Duration, O, Vector[O]] =
        awaitBoth[Duration, O].flatMap {
          case These(t, o) =>
            emit(buf :+ o)
          case This(t) =>
            if (buf.nonEmpty) emit(buf)
            else go(buf, lastEmit)
          case That(o) =>
            if (buf.size >= (maxSize - 1)) emit(buf :+ o)
            else go(buf :+ o, lastEmit)
        }
      awakeEvery(maxAge).wye(self)(go(Vector(), 0.millis)).repeat
    }
  }

}
