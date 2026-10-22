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
   * Strip all embedded metadata from `file` in-place, then write back `retainedTags` (a map of
   * ExifTool tag name to value) along with the ICC profile and EXIF orientation.
   *
   * Knowingly NOT retained: C2PA / Content Credentials manifests (JPEG APP11/JUMBF, PNG `caBX`
   * chunk, TIFF tag 0xCD41) are destroyed, so a downloaded file no longer satisfies `C2paDetector`
   * even though Grid indexes and exposes `c2paMetadataAvailable` for search.
   */
  def stripMetadataRetaining(file: File, retainedTags: Map[String, String]): Future[Unit] = {
    val op = new ETOperation()
    op.addRawArgs("-all=")
    op.addRawArgs("-TagsFromFile", "@")
    op.addRawArgs("-icc_profile")
    op.addRawArgs("-EXIF:Orientation")
    retainedTags.foreach { case (tag, value) => op.addRawArgs(s"-$tag=$value") }
    op.overwrite_original()
    op.addImage(file.getAbsolutePath)
    Future((new ExiftoolCmd).run(op))
  }
}
