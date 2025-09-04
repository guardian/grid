package com.gu.mediaservice.lib

import com.amazonaws.services.s3.model.{DeleteObjectsRequest, MultiObjectDeleteException}

import java.io.File
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.aws.{Bedrock, S3Object}
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.{MimeType, Png}
import org.joda.time.DateTime

import scala.concurrent.Future
import scala.jdk.CollectionConverters._

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

  private def bulkDelete(bucket: String, keys: List[String]): Future[Map[String, Boolean]] = keys match {
    case Nil => Future.successful(Map.empty)
    case _ => Future {
      try {
        client.deleteObjects(
          new DeleteObjectsRequest(bucket).withKeys(keys: _*)
        )
        keys.map { key =>
          key -> true
        }.toMap
      } catch {
        case partialFailure: MultiObjectDeleteException =>
          logger.warn(s"Partial failure when deleting images from $bucket: ${partialFailure.getMessage} ${partialFailure.getErrors}")
          val errorKeys = partialFailure.getErrors.asScala.map(_.getKey).toSet
          keys.map { key =>
            key -> !errorKeys.contains(key)
          }.toMap
      }
    }
  }

  def deleteOriginal(id: String)(implicit logMarker: LogMarker): Future[Unit] = if(isVersionedS3) deleteVersionedImage(imageBucket, fileKeyFromId(id)) else deleteImage(imageBucket, fileKeyFromId(id))
  def deleteOriginals(ids: Set[String]) = bulkDelete(imageBucket, ids.map(fileKeyFromId).toList)
  def deleteThumbnail(id: String)(implicit logMarker: LogMarker): Future[Unit] = deleteImage(thumbnailBucket, fileKeyFromId(id))
  def deleteThumbnails(ids: Set[String]) = bulkDelete(thumbnailBucket, ids.map(fileKeyFromId).toList)
  def deletePNG(id: String)(implicit logMarker: LogMarker): Future[Unit] = deleteImage(imageBucket, optimisedPngKeyFromId(id))
  def deletePNGs(ids: Set[String]) = bulkDelete(imageBucket, ids.map(optimisedPngKeyFromId).toList)

  def doesOriginalExist(id: String): Boolean =
    client.doesObjectExist(imageBucket, fileKeyFromId(id))
}

sealed trait ImageWrapper {
  val id: String
  val file: File
  val mimeType: MimeType
  val meta: Map[String, String]
}
sealed trait StorableImage extends ImageWrapper {
  def toProjectedS3Object(thumbBucket: String): S3Object = S3Object(
    thumbBucket,
    ImageIngestOperations.fileKeyFromId(id),
    file,
    Some(mimeType),
    lastModified = None,
    meta
  )
}

case class StorableThumbImage(id: String, file: File, mimeType: MimeType, meta: Map[String, String] = Map.empty) extends StorableImage
case class StorableOriginalImage(id: String, file: File, mimeType: MimeType, lastModified: DateTime, meta: Map[String, String] = Map.empty) extends StorableImage {
  override def toProjectedS3Object(thumbBucket: String): S3Object = S3Object(
    thumbBucket,
    ImageIngestOperations.fileKeyFromId(id),
    file,
    Some(mimeType),
    lastModified = Some(lastModified),
    meta
  )
}
case class StorableOptimisedImage(id: String, file: File, mimeType: MimeType, meta: Map[String, String] = Map.empty) extends StorableImage {
  override def toProjectedS3Object(thumbBucket: String): S3Object = S3Object(
    thumbBucket,
    ImageIngestOperations.optimisedPngKeyFromId(id),
    file,
    Some(mimeType),
    lastModified = None,
    meta = meta
  )
}

/**
  * @param id
  * @param file
  * @param mimeType
  * @param meta
  * @param isTransformedFromSource a hint as to whether the Grid has transcoded this image earlier in the pipeline.
  *                                Can be used in order to skip e.g. the stripping of incorrect colour profiles,
  *                                as in this case we have already inferred the profile upstream.
  */
case class BrowserViewableImage(id: String, file: File, mimeType: MimeType, meta: Map[String, String] = Map.empty, isTransformedFromSource: Boolean = false) extends ImageWrapper {
  def asStorableOptimisedImage = StorableOptimisedImage(id, file, mimeType, meta)
  def asStorableThumbImage = StorableThumbImage(id, file, mimeType, meta)
}

