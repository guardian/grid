package com.gu.mediaservice.lib

import scala.concurrent.{Future, ExecutionContext}
import java.util.concurrent.Executors
import com.gu.mediaservice.lib.aws.S3Object
import java.io.File
import java.net.URI

trait ImageStorage {

  /** Blocking IO work involved in storing the file should be done on this thread pool,
    * assuming that the libraries used do not provide a (decent) non-blocking API.
    */
  protected final implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(8))

  /** Store a copy of the given file and return the URI of that copy.
    * The file can safely be deleted afterwards.
    */
  def storeImage(id: String, file: File, mimeType: Option[String], meta: Map[String, String] = Map.empty): Future[S3Object]

  def storeThumbnail(id: String, file: File, mimeType: Option[String]): Future[S3Object]

  def deleteImage(id: String): Future[Unit]

  def deleteThumbnail(id: String): Future[Unit]

}
