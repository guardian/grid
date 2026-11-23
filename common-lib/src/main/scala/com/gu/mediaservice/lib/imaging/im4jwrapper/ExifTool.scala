package com.gu.mediaservice.lib.imaging.im4jwrapper

import java.util.concurrent.{Executors, TimeUnit, TimeoutException}

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future, blocking}
import scala.jdk.CollectionConverters._
import scala.util.Try
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
   *
   * ExifTool is killed and the future failed with a `TimeoutException` if it runs longer than `timeout`
   */
  def stripMetadataRetaining(file: File, retainedTags: Map[String, String], timeout: FiniteDuration): Future[Unit] = {
    val args = Seq("-all=", "-TagsFromFile", "@", "-icc_profile", "-EXIF:Orientation") ++
      retainedTags.map { case (tag, value) => s"-$tag=$value" } ++
      Seq("-overwrite_original", file.getAbsolutePath)
    Future(blocking(runExiftool(file, args, timeout)))
  }

  /**
   * im4java waits on the exiftool process with no timeout, so a hung process would hold one of the
   * `imagingThreadPoolSize` threads forever - running it directly here.
   */
  private def runExiftool(file: File, args: Seq[String], timeout: FiniteDuration): Unit = {
    // Output goes to a file rather than a pipe, which would need a reader thread to avoid filling up and blocking exiftool.
    val outputLog = Files.createTempFile(file.toPath.toAbsolutePath.getParent, s"${file.getName}-", ".exiftool.log")
    // Where `-overwrite_original` writes the new file before renaming it over the original.
    val exiftoolWorkingFile = new File(s"${file.getAbsolutePath}_exiftool_tmp")
    var process: Option[Process] = None
    try {
      val started = new ProcessBuilder(("exiftool" +: args).asJava)
        .redirectErrorStream(true)
        .redirectOutput(outputLog.toFile)
        .start()
      process = Some(started)

      if (!started.waitFor(timeout.toMillis, TimeUnit.MILLISECONDS)) {
        throw new TimeoutException(s"exiftool did not finish within $timeout processing ${file.getName}, so was killed")
      }
      val exitCode = started.exitValue()
      if (exitCode != 0) {
        val output = new String(Files.readAllBytes(outputLog), StandardCharsets.UTF_8).trim
        throw new RuntimeException(s"exiftool exited with code $exitCode processing ${file.getName}: $output")
      }
    } finally {
      process.filter(_.isAlive).foreach { p =>
        p.destroyForcibly()
        // Make sure it's gone before deleting files it may still be writing.
        Try(p.waitFor(10, TimeUnit.SECONDS))
      }
      Try(Files.deleteIfExists(outputLog))
      Try(Files.deleteIfExists(exiftoolWorkingFile.toPath))
    }
  }
}
