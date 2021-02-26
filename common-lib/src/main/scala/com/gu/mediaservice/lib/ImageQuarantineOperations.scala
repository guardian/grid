package com.gu.mediaservice.lib

import java.io.File

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.MimeType

import scala.concurrent.Future

class ImageQuarantineOperations(quarantineBucket: String, config: CommonConfig, isVersionedS3: Boolean = false)
  extends S3ImageStorage(config) {

  def storeQuarantineImage(id: String, file: File, mimeType: Option[MimeType], meta: Map[String, String] = Map.empty)
                       (implicit logMarker: LogMarker): Future[S3Object] =
    storeImage(quarantineBucket, ImageIngestOperations.fileKeyFromId(id), file, mimeType, meta)
}



