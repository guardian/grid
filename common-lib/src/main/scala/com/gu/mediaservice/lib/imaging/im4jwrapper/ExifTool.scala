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

  /**
   * Strip all embedded metadata from `file` in-place, keeping only the copyright/credit fields:
   * Copyright, Creator, By-line, CopyrightNotice and Rights.
   *
   * Uses ExifTool's lossless metadata rewrite - the compressed pixel data is never decoded or
   * re-encoded. The file is modified in-place via ExifTool's `-overwrite_original` flag.
   */
  def stripMetadataKeepingCopyright(file: File): Future[Unit] = {
    val op = new ETOperation()
    // Wipe all writable metadata, then copy the retained tags back from the original values;
    // `@` means "this same file", which works because ExifTool reads before it writes.
    op.addRawArgs("-all=")
    op.addRawArgs("-TagsFromFile", "@")
    op.addRawArgs("-Copyright")
    op.addRawArgs("-Creator")
    op.addRawArgs("-By-line")
    op.addRawArgs("-CopyrightNotice")
    op.addRawArgs("-Rights")
    op.overwrite_original()
    op.addImage(file.getAbsolutePath)
    Future((new ExiftoolCmd).run(op))
  }
}
