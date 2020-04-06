package com.gu.mediaservice.lib

import java.util.concurrent.Executors
import java.io.File

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration._
import scala.language.postfixOps
import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.MimeType

object ImageStorageProps {
  val cacheDuration: Duration = 365 days
  val cacheForever: String = s"max-age=${cacheDuration.toSeconds}"
}

trait ImageStorage {

  // Images can be cached "forever" as they never should change
  val cacheDuration: Duration = ImageStorageProps.cacheDuration
  val cacheForever: String = ImageStorageProps.cacheForever

  /** Blocking IO work involved in storing the file should be done on this thread pool,
    * assuming that the libraries used do not provide a (decent) non-blocking API.
    */
  protected final implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(8))

  /** Store a copy of the given file and return the URI of that copy.
    * The file can safely be deleted afterwards.
    */
  def storeImage(bucket: String, id: String, file: File, mimeType: Option[MimeType], meta: Map[String, String] = Map.empty)
                (implicit logMarker: LogMarker): Future[S3Object]

  def deleteImage(bucket: String, id: String): Future[Unit]
}
