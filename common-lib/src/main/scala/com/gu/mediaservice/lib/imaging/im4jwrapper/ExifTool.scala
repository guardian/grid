package com.gu.mediaservice.lib.imaging.im4jwrapper

import java.util.concurrent.Executors

import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{ETOperation, ExiftoolCmd}


object ExifTool {
  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def tagSource(source: File): ETOperation = {
    val op = new ETOperation()
    op.addImage(source.getAbsolutePath)
    op
  }

  def setTags(ops: ETOperation)(tags: Map[String, String]): ETOperation =  {
    tags.foldLeft(ops) { case (ops, (key, value)) =>
      ops.setTags(s"$key=$value")
    }
  }

  def overwriteOriginal(ops: ETOperation): ETOperation = {
    ops.overwrite_original()
    ops
  }

  def runExiftoolCmd(ops: ETOperation): Future[Unit] = {
    // Set overwrite original to ensure temporary file deletion
    overwriteOriginal(ops)
    Future((new ExiftoolCmd).run(ops))
  }
}
