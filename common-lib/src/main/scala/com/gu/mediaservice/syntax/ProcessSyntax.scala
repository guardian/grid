package com.gu.mediaservice.syntax

import com.gu.mediaservice.lib.Processes
import scalaz.stream.{Process, Process1, process1, Writer}

// TODO MRB: check - can we move this into play-common-lib or particular apps
trait ProcessSyntax {

  implicit class WriterOps[F[_], W, O](self: Writer[F, W, O]) {
    def pipeW[W1](p: Process1[W, W1]): Writer[F, W1, O] =
      self.pipe(process1.liftL(p))
  }

  implicit class ChunkedProcessOps[F[_], O](self: Process[F, Seq[O]]) {
    def unchunk: Process[F, O] = self.pipe(Processes.unchunk)
  }

}

object ProcessSyntax extends ProcessSyntax
