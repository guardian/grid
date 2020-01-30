package com.gu.mediaservice.lib

import java.io.File

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.{MimeType, Png}

object ImageIngestOperations {
  def fileKeyFromId(id: String): String = id.take(6).mkString("/") + "/" + id

  def optimisedPngKeyFromId(id: String): String = "optimised/" + fileKeyFromId(id: String)
}

class ImageIngestOperations(imageBucket: String, thumbnailBucket: String, config: CommonConfig)
  extends S3ImageStorage(config) {

  import ImageIngestOperations.{fileKeyFromId, optimisedPngKeyFromId}

  def storeOriginal(id: String, file: File, mimeType: Option[MimeType], meta: Map[String, String] = Map.empty) =
    storeImage(imageBucket, fileKeyFromId(id), file, mimeType, meta)

  def storeThumbnail(id: String, file: File, mimeType: Option[MimeType]) =
    storeImage(thumbnailBucket, fileKeyFromId(id), file, mimeType)

  def storeOptimisedPng(id: String, file: File) = {
    storeImage(imageBucket, optimisedPngKeyFromId(id), file, Some(Png))
  }

  def deleteOriginal(id: String) = deleteImage(imageBucket, fileKeyFromId(id))
  def deleteThumbnail(id: String) = deleteImage(thumbnailBucket, fileKeyFromId(id))
  def deletePng(id: String) = deleteImage(imageBucket, optimisedPngKeyFromId(id))

}
