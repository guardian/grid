package com.gu.mediaservice.lib

import java.io.File

import com.amazonaws.auth.AWSCredentialsProvider

class ImageIngestOperations(imageBucket: String, thumbnailBucket: String, credentials: AWSCredentialsProvider)
  extends S3ImageStorage(credentials) {

  def storeOriginal(id: String, file: File, mimeType: Option[String], meta: Map[String, String] = Map.empty) =
    storeImage(imageBucket, fileKeyFromId(id), file, mimeType, meta)

  def storeThumbnail(id: String, file: File, mimeType: Option[String]) =
    storeImage(thumbnailBucket, fileKeyFromId(id), file, mimeType)

  def storeOptimisedPng(id: String, file: File) = {
    storeImage(imageBucket, optimisedPngKeyFromId(id), file, Some("image/png"))
  }

  def deleteOriginal(id: String) = deleteImage(imageBucket, fileKeyFromId(id))
  def deleteThumbnail(id: String) = deleteImage(thumbnailBucket, fileKeyFromId(id))
  def deletePng(id: String) = deleteImage(imageBucket, optimisedPngKeyFromId(id))

  def optimisedPngKeyFromId(id: String): String = "optimised/" + fileKeyFromId(id: String)

  def fileKeyFromId(id: String): String = id.take(6).mkString("/") + "/" + id


}
