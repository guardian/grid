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
   * `-all=` removes everything, including anything personally identifying (GPS, camera serial
   * numbers, PersonInImage, captions, dates). Retention is a strict allowlist, so any tag the caller
   * does not name is removed - new metadata appearing in source images is dropped by default rather
   * than needing to be blocked.
   *
   * Only the ICC profile and EXIF orientation are carried over from the file itself, since without
   * them the image would render with the wrong colours or rotation. Everything else is written from
   * values supplied by the caller, so metadata edited in Grid is reflected rather than whatever the
   * image happened to be uploaded with.
   *
   * Knowingly NOT retained: C2PA / Content Credentials manifests (JPEG APP11/JUMBF, PNG `caBX`
   * chunk, TIFF tag 0xCD41) are destroyed, so a downloaded file no longer satisfies `C2paDetector`
   * even though Grid indexes and exposes `c2paMetadataAvailable` for search. This is consistent with
   * the cropper's existing `FullExport` (full-frame crop) route, which already emits a visually
   * unchanged export with its manifest stripped - see `ExportRequest.toCropSpec`. Keeping the
   * manifest would not fix it anyway: C2PA's hash binding covers the EXIF/XMP being removed here, so
   * a retained manifest would validate as tampered - strictly worse than none. Restoring provenance
   * properly would mean signing a new manifest citing the original as an ingredient, which needs a
   * signing certificate and a C2PA-aware tool. The archived original in S3 is unaffected; this
   * applies only to the downloaded copy.
   *
   * Uses ExifTool's lossless metadata rewrite - the compressed pixel data is never decoded or
   * re-encoded. The file is modified in-place via ExifTool's `-overwrite_original` flag.
   */
  def stripMetadataRetaining(file: File, retainedTags: Map[String, String]): Future[Unit] = {
    val op = new ETOperation()
    op.addRawArgs("-all=")
    // `@` means "this same file", which works because ExifTool reads before it writes.
    op.addRawArgs("-TagsFromFile", "@")
    // Must be the block tag `-icc_profile`; the group form `-icc_profile:all` silently copies nothing.
    op.addRawArgs("-icc_profile")
    op.addRawArgs("-EXIF:Orientation")
    retainedTags.foreach { case (tag, value) => op.addRawArgs(s"-$tag=$value") }
    op.overwrite_original()
    op.addImage(file.getAbsolutePath)
    Future((new ExiftoolCmd).run(op))
  }
}
