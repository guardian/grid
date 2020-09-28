package com.gu.mediaservice.lib

import java.io.File

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.{MimeType, Png}
import scala.concurrent.Future

object ImageIngestOperations {
  def fileKeyFromId(id: String): String = id.take(6).mkString("/") + "/" + id

  def optimisedPngKeyFromId(id: String): String = "optimised/" + fileKeyFromId(id: String)
}

class ImageIngestOperations(imageBucket: String, thumbnailBucket: String, config: CommonConfig, isVersionedS3: Boolean = false)
  extends S3ImageStorage(config) {

  import ImageIngestOperations.{fileKeyFromId, optimisedPngKeyFromId}

  def storeOriginal(id: String, file: File, mimeType: Option[MimeType], meta: Map[String, String] = Map.empty)
                   (implicit logMarker: LogMarker): Future[S3Object] =
    storeImage(imageBucket, fileKeyFromId(id), file, mimeType, meta)

  def storeThumbnail(id: String, file: File, mimeType: Option[MimeType])
                    (implicit logMarker: LogMarker): Future[S3Object] =
    storeImage(thumbnailBucket, fileKeyFromId(id), file, mimeType)

  def storeOptimisedPng(id: String, file: File)
                       (implicit logMarker: LogMarker): Future[S3Object] =
    storeImage(imageBucket, optimisedPngKeyFromId(id), file, Some(Png))

  def deleteOriginal(id: String): Future[Unit] = if(isVersionedS3) deleteVersionedImage(imageBucket, fileKeyFromId(id)) else deleteImage(imageBucket, fileKeyFromId(id))
  def deleteThumbnail(id: String): Future[Unit] = deleteImage(thumbnailBucket, fileKeyFromId(id))
  def deletePng(id: String): Future[Unit] = deleteImage(imageBucket, optimisedPngKeyFromId(id))
}
