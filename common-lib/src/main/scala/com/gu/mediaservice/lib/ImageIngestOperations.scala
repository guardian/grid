package com.gu.mediaservice.lib

import java.io.File

import com.gu.mediaservice.lib.config.CommonConfig

class ImageIngestOperations(imageBucket: String, thumbnailBucket: String, config: CommonConfig)
  extends S3ImageStorage(config) {

  def storeOriginal(id: String, file: File, mimeType: Option[String], meta: Map[String, String] = Map.empty) =
    storeImage(imageBucket, id, file, mimeType, meta)

  def storeThumbnail(id: String, file: File, mimeType: Option[String]) =
    storeImage(thumbnailBucket, id, file, mimeType)

  def storeOptimisedPng(id: String, file: File) = {
    storeImage(imageBucket, optimisedPngKeyFromId(id), file, Some("image/png"))
  }

  def deleteOriginal(id: String) = deleteImage(imageBucket, id)
  def deleteThumbnail(id: String) = deleteImage(thumbnailBucket, id)
  def deletePng(id: String) = deleteImage(imageBucket, optimisedPngKeyFromId(id))

  private def optimisedPngKeyFromId(id: String): String = "optimised/" + id

}
