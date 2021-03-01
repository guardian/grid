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

  def store(storableImage: StorableImage)
           (implicit logMarker: LogMarker): Future[S3Object] = storableImage match {
    case s:StorableOriginalImage => storeOriginalImage(s)
    case s:StorableThumbImage => storeThumbnailImage(s)
    case s:StorableOptimisedImage => storeOptimisedImage(s)
  }

  private def storeOriginalImage(storableImage: StorableOriginalImage)
                        (implicit logMarker: LogMarker): Future[S3Object] =
    storeImage(imageBucket, fileKeyFromId(storableImage.id), storableImage.file, Some(storableImage.mimeType),
      storableImage.meta, overwrite = false)

  private def storeThumbnailImage(storableImage: StorableThumbImage)
                         (implicit logMarker: LogMarker): Future[S3Object] =
    storeImage(thumbnailBucket, fileKeyFromId(storableImage.id), storableImage.file, Some(storableImage.mimeType),
      overwrite = true)

  private def storeOptimisedImage(storableImage: StorableOptimisedImage)
                       (implicit logMarker: LogMarker): Future[S3Object] =
    storeImage(imageBucket, optimisedPngKeyFromId(storableImage.id), storableImage.file, Some(storableImage.mimeType),
      overwrite = true)

  def deleteOriginal(id: String): Future[Unit] = if(isVersionedS3) deleteVersionedImage(imageBucket, fileKeyFromId(id)) else deleteImage(imageBucket, fileKeyFromId(id))
  def deleteThumbnail(id: String): Future[Unit] = deleteImage(thumbnailBucket, fileKeyFromId(id))
  def deletePng(id: String): Future[Unit] = deleteImage(imageBucket, optimisedPngKeyFromId(id))
}

sealed trait ImageWrapper {
  val id: String
  val file: File
  val mimeType: MimeType
  val meta: Map[String, String]
}
sealed trait StorableImage extends ImageWrapper

case class StorableThumbImage(id: String, file: File, mimeType: MimeType, meta: Map[String, String] = Map.empty) extends StorableImage
case class StorableOriginalImage(id: String, file: File, mimeType: MimeType, meta: Map[String, String] = Map.empty) extends StorableImage
case class StorableOptimisedImage(id: String, file: File, mimeType: MimeType, meta: Map[String, String] = Map.empty) extends StorableImage
case class BrowserViewableImage(id: String, file: File, mimeType: MimeType, meta: Map[String, String] = Map.empty, mustUpload: Boolean = false) extends ImageWrapper {
  def asStorableOptimisedImage = StorableOptimisedImage(id, file, mimeType, meta)
  def asStorableThumbImage = StorableThumbImage(id, file, mimeType, meta)
}

