package lib

import com.gu.mediaservice.lib.logging.GridLogging
import org.apache.pekko.actor.{Cancellable, Scheduler}

import java.nio.file.{Files, Path}
import java.time.Instant
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._
import scala.jdk.CollectionConverters._
import scala.util.control.NonFatal
import scala.util.{Failure, Success, Try, Using}

/**
 * Temp files backing metadata-stripped downloads, kept in a dedicated directory so they can be swept by age.
 *
 * Requests delete their own file once the response has been streamed, or on failure. But a response that is
 * never streamed - e.g. because the client disconnected while the file was being prepared - is dropped by the
 * server without running its stream, so its file is only removed by `sweep`. Files left by a restart are too.
 */
class DownloadTempFiles(val directory: Path, minFreeBytes: Long, maxAge: FiniteDuration) extends GridLogging {

  /** Whether there's room to prepare a download of `sourceBytes` while leaving `minFreeBytes` free. */
  def hasSpaceFor(sourceBytes: Long): Boolean = {
    // ExifTool writes a complete copy beside the original before renaming it into place.
    val requiredBytes = 2 * sourceBytes + minFreeBytes
    Files.getFileStore(ensureDirectory()).getUsableSpace >= requiredBytes
  }

  def create(): Path = Files.createTempFile(ensureDirectory(), "grid-download-", ".tmp")

  def delete(path: Path): Unit = Try(Files.deleteIfExists(path)) match {
    case Failure(e) => logger.warn(s"Failed to delete download temp file $path", e)
    case Success(_) =>
  }

  /** Delete files last modified more than `maxAge` ago, returning how many were deleted. */
  def sweep(now: Instant = Instant.now()): Int = {
    val cutoff = now.minusMillis(maxAge.toMillis)
    val stale = Using.resource(Files.list(ensureDirectory())) { files =>
      files.iterator.asScala.filter { path =>
        Try(Files.isRegularFile(path) && Files.getLastModifiedTime(path).toInstant.isBefore(cutoff)).getOrElse(false)
      }.toList
    }
    stale.foreach(delete)
    stale.count(path => !Files.exists(path))
  }

  /** Sweep now, to clear anything left by a previous run, then every `interval`. */
  def scheduleSweeps(scheduler: Scheduler, interval: FiniteDuration)(implicit ec: ExecutionContext): Cancellable =
    scheduler.scheduleAtFixedRate(0.seconds, interval) { () =>
      try {
        val deleted = sweep()
        if (deleted > 0) logger.warn(s"Swept $deleted download temp file(s) older than $maxAge from $directory")
      } catch {
        case NonFatal(e) => logger.error(s"Failed to sweep download temp files from $directory", e)
      }
    }

  // Recreated on use in case it has been removed since startup, e.g. by someone clearing /tmp.
  private def ensureDirectory(): Path = Files.createDirectories(directory)
}
